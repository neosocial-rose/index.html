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
`Sohbet etme. Açıklama yapma. SADECE 2 SATIR.

1) Başlık: EN FAZLA 60 karakter (emoji dahil). 60'ı GEÇME.
2) Hashtag: EN FAZLA 40 karakter (boşluk dahil). 40'ı GEÇME.

TOPLAM: Başlık + Hashtag = MAKSIMUM 100 KARAKTER

- Kelime bölme yok. Yarım kelime yok.
- Hashtag satırı sadece # ile başlayan etiketler + tek boşluk.

SEO KURALLARI:
- Jenerik başlık YASAK
- MUTLAKA kullan: ŞOK / 7 HATA / 3 TAKTİK / 5 SIR / KİMSE BİLMİYOR / GERÇEK
- Sayı kullan (3, 5, 7, 10)
- 1-2 emoji
- Güçlü anahtar kelimeler
- Merak uyandır ama clickbait yapma

HASHTAG KURALLARI:
- 3-5 kısa hashtag
- Platform için özel (#FYP, #Keşfet vb YASAK)
- Niche + güçlü hashtag'ler

ÇOCUK İŞİ BAŞLIK YASAK:
❌ "Bu videoda"
❌ "İzle ve öğren"
❌ "Mutlaka izle"
❌ Basit cümleler

Dil: ${lang}
Platform: ${platform}
Konu: ${topic}

FORMAT (2 SATIR):
Başlık buraya (max 60 karakter)
#hashtag1 #hashtag2 #hashtag3 (max 40 karakter)`;

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

  // TOPLAM 100 KARAKTER KONTROLÜ
  const total = Array.from(title).length + Array.from(tags).length + 1; // +1 için \n
  if (total > 100) {
    // Eğer 100'ü geçiyorsa hashtag'leri kısalt
    const maxTagLen = 100 - Array.from(title).length - 1;
    if (maxTagLen > 10) {
      tags = smartTrim(tags, maxTagLen);
    } else {
      // Başlık çok uzunsa onu da kısalt
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
