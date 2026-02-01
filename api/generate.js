// api/generate.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const YT_KEY = process.env.YOUTUBE_API_KEY; // Kanal analizi için
  const MODEL = "gemini-2.5-flash";

  if (!GEMINI_KEY) return res.status(500).json({ error: "GEMINI_API_KEY yok" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const mode = (body.mode || "produce").toString();

    // ---------- KANAL ANALİZ (GERÇEK VERİ) ----------
    if (mode === "analysis") {
      if (!YT_KEY) return res.status(500).json({ error: "YOUTUBE_API_KEY yok" });

      const url = String(body.url || "").trim();
      if (!url) return res.status(400).json({ error: "url empty" });

      const parsed = parseYouTubeChannel(url);
      if (!parsed.ok) return res.status(400).json({ error: "link format desteklenmiyor (channel/UC.. veya @handle)" });

      const channelData = await fetchChannelData({ YT_KEY, ...parsed });

      // Gemini'ye yalnızca GERÇEK çektiğimiz veriyi veriyoruz (uydurma yok)
      const prompt =
`AŞAĞIDAKİ VERİLER DIŞINA ÇIKMA. UYDURMA YOK. Emin değilsen "veri yok" de.
YouTube kanal analizi yap. Kısa ve net yaz.
1) Genel durum (iyi/kötü değil; veriyle konuş)
2) Güçlü yanlar (veriye dayanarak)
3) Eksikler / riskler (veriye dayanarak)
4) 5 maddelik net aksiyon listesi

KANAL VERİSİ (JSON):
${JSON.stringify(channelData)}`;

      const out = await callGemini({ GEMINI_KEY, MODEL, prompt });
      return res.status(200).json({ text: out });
    }

    // ---------- ÜRETİM (49 başlık + 50 hashtag) ----------
    const lang = String(body.lang || "tr");
    const platform = String(body.platform || "youtube");
    const type = String(body.type || "üretim");
    const topic = String(body.topic || "").trim();
    if (!topic) return res.status(400).json({ error: "topic empty" });

    const prompt =
`Sohbet etme. Açıklama yapma. SADECE 2 SATIR ÇIKTI VER.
1. satır: TAM 49 karakterlik başlık (emoji dahil). Ne eksik ne fazla.
2. satır: TAM 50 karakterlik hashtag satırı (boşluk dahil). Sadece # ile başlasın.

Kurallar:
- Dil: ${lang}
- Platform: ${platform}
- Tür: ${type}
- Konu: ${topic}

ÇIKTI FORMAT:
<49 karakter başlık>
<50 karakter hashtag>`;

    const rawText = await callGemini({ GEMINI_KEY, MODEL, prompt });
    const fixed = enforceTwoLines(rawText);

    return res.status(200).json({ text: fixed });
  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e) });
  }
}

async function callGemini({ GEMINI_KEY, MODEL, prompt }) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text;
}

// 49/50 kesin kilit
function enforceTwoLines(text) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  let title = lines[0] || "";
  let tags = lines[1] || "";

  // fallback: tek satır geldiyse ayır
  if (!tags && title.includes("#")) {
    const idx = title.indexOf("#");
    tags = title.slice(idx);
    title = title.slice(0, idx).trim();
  }

  title = fixLen(title, 49);
  tags = fixLen(tags.startsWith("#") ? tags : ("#" + tags), 50);

  return `${title}\n${tags}`;
}

function fixLen(str, len) {
  const s = Array.from(String(str || "")); // emoji dahil doğru sayım
  if (s.length > len) return s.slice(0, len).join("");
  if (s.length < len) return s.concat(Array(len - s.length).fill(" ")).join("");
  return s.join("");
}

// Yalın parse: /channel/UC... veya @handle
function parseYouTubeChannel(url) {
  const u = url.trim();

  const mId = u.match(/\/channel\/(UC[a-zA-Z0-9_-]{20,})/);
  if (mId) return { ok: true, kind: "id", id: mId[1] };

  const mHandle = u.match(/\/@([a-zA-Z0-9._-]+)/);
  if (mHandle) return { ok: true, kind: "handle", handle: mHandle[1] };

  // direk @handle yazdıysa
  const mHandle2 = u.match(/^@([a-zA-Z0-9._-]+)$/);
  if (mHandle2) return { ok: true, kind: "handle", handle: mHandle2[1] };

  return { ok: false };
}

async function fetchChannelData({ YT_KEY, kind, id, handle }) {
  // channels endpoint
  let chUrl = "";
  if (kind === "id") {
    chUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${encodeURIComponent(id)}&key=${encodeURIComponent(YT_KEY)}`;
  } else {
    // forHandle destekli (handle -> kanal)
    chUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&forHandle=${encodeURIComponent(handle)}&key=${encodeURIComponent(YT_KEY)}`;
  }

  const chRes = await fetch(chUrl);
  const chJson = await chRes.json();
  const item = chJson?.items?.[0];
  if (!item) return { error: "kanal bulunamadı", raw: chJson };

  const uploadsId = item?.contentDetails?.relatedPlaylists?.uploads;

  // son 10 video
  let videos = [];
  if (uploadsId) {
    const plUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=10&playlistId=${encodeURIComponent(uploadsId)}&key=${encodeURIComponent(YT_KEY)}`;
    const plRes = await fetch(plUrl);
    const plJson = await plRes.json();
    videos = (plJson?.items || []).map(x => ({
      title: x?.snippet?.title || "",
      publishedAt: x?.contentDetails?.videoPublishedAt || x?.snippet?.publishedAt || "",
      videoId: x?.contentDetails?.videoId || ""
    }));
  }

  return {
    channel: {
      title: item?.snippet?.title || "",
      description: item?.snippet?.description || "",
      country: item?.snippet?.country || "",
      publishedAt: item?.snippet?.publishedAt || "",
      thumbnails: item?.snippet?.thumbnails || {},
      stats: item?.statistics || {}
    },
    latestVideos: videos
  };
}
