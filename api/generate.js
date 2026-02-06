export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: "GEMINI_API_KEY yok" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const topic = String(body.topic || "").trim();
    const lang = String(body.lang || "tr");
    const platform = String(body.platform || "youtube");

    if (!topic) return res.status(400).json({ error: "topic empty" });

    const prompt =
`Sen viral sosyal medya içerik uzmanısın. "${topic}" konusu için başlık yaz.

SADECE 2 SATIR YAZ. HİÇBİR AÇIKLAMA YAPMA.

KURAL 1 - BAŞLIK (1. satır):
- "${topic}" konusuna DOĞRUDAN değin
- Sayı kullan: 3, 5, 7, 10
- Güçlü kelime: Sır, Taktik, Yöntem, Teknik, Strateji, Püf Noktası
- 1-2 emoji
- Max 60 karakter

KURAL 2 - HASHTAG (2. satır):
- "${topic}" ile alakalı
- 3-5 kısa hashtag
- Boşlukla ayır
- Max 40 karakter

ÖRNEKLER (SADECE İLHAM AL, KOPYALAMA):
- Video montaj: "Video Montajda 7 Profesyonel Teknik 🎬✨"
- Yemek: "Pasta Yapımında 5 Şef Sırrı 🍰👨‍🍳"
- Fitness: "Evde Kilo Vermek İçin 3 Etkili Yöntem 💪🔥"
- Oyun: "Valorant'ta Rank Atlamak İçin 5 Strateji 🎮⚡"

YASAK KELİMELER:
❌ "Kimse bilmiyor"
❌ "Şok"
❌ "Gerçek"  
❌ "Hata"
❌ "Bitiriyor"
❌ Konu dışı içerik

ŞİMDİ "${topic}" İÇİN YAZ (SADECE 2 SATIR):

1. satır: Başlık
2. satır: Hashtag`;

    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const txt = await r.text();
    let data = {};
    try { data = JSON.parse(txt); } catch {}

    if (!r.ok) {
      return res.status(500).json({ error: "Gemini error", detail: txt.slice(0, 300) });
    }

    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const fixed = enforceTwoLinesMax(out);

    return res.status(200).json({ text: fixed });

  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e) });
  }
}

function enforceTwoLinesMax(text) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  let title = lines[0] || "";
  let tags = lines[1] || "";

  if (!tags && title.includes("#")) {
    const idx = title.indexOf("#");
    tags = title.slice(idx).trim();
    title = title.slice(0, idx).trim();
  }

  title = smartTrim(title, 60);
  tags = normalizeTags(tags);
  tags = smartTrim(tags, 40);
  if (!tags) tags = "#shorts";

  const total = Array.from(title).length + Array.from(tags).length + 1;
  if (total > 100) {
    const maxTagLen = 100 - Array.from(title).length - 1;
    if (maxTagLen > 10) {
      tags = smartTrim(tags, maxTagLen);
    } else {
      title = smartTrim(title, 50);
      tags = smartTrim(tags, 49);
    }
  }

  return `${title}\n${tags}`;
}

function normalizeTags(s) {
  let t = String(s || "").trim();
  if (!t) return "";
  if (!t.startsWith("#")) t = "#" + t;
  t = t.replace(/[，,;]+/g, " ").replace(/\s+/g, " ").trim();
  return t;
}

function smartTrim(str, maxLen) {
  const arr = Array.from(String(str || ""));
  if (arr.length <= maxLen) return arr.join("").trim();
  const cut = arr.slice(0, maxLen).join("");
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > 0) return cut.slice(0, lastSpace).trim();
  return cut.trim();
}
