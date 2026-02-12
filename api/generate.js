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
    
    if (!topic) return res.status(400).json({ error: "topic empty" });

    const randomSeed = Math.floor(Math.random() * 1000);

    // --- PROMPT AYARLARI ---
    // Başlıkların yarım kalmaması için AI'ya "40 karakter" sınırı veriyoruz (Kodda 49'da keseceğiz).
    // Böylece AI baştan kısa yazar, biz de kesmek zorunda kalmayız.
    const prompt =
`Sen viral sosyal medya içerik uzmanısın. 

GÖREV: İnternette "${topic}" konusundaki EN GÜNCEL gelişmeleri araştır ve buna göre içerik üret.

⚠️ KRİTİK KURAL: CÜMLELER ASLA YARIM KALMAMALI. ÇOK KISA VE ÖZ YAZ.

SADECE 2 SATIR YAZ:

1. SATIR (BAŞLIK):
- "${topic}" ile ilgili güncel, vurucu bir başlık.
- MAKSİMUM 45 KARAKTER OLSUN (Çok kısa tut).
- Sayı ve 1 emoji kullan.
- Asla yarım bırakma.

2. SATIR (HASHTAG):
- Konuyla ilgili 3-4 popüler hashtag.
- MAKSİMUM 45 KARAKTER.

Random Seed: ${randomSeed}

ŞİMDİ YAZ (SADECE 2 SATIR):`;

    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // --- İNTERNET BAĞLANTISI ---
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.8, // Daha tutarlı olması için düşürdük
          topP: 0.95,
          topK: 40
        }
      })
    });

    const txt = await r.text();
    let data = {};
    try { data = JSON.parse(txt); } catch {}

    if (!r.ok) {
      return res.status(500).json({ error: "Gemini error", detail: txt.slice(0, 300) });
    }

    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // --- 49/50 KURALINA GÖRE DÜZENLEME ---
    const fixed = enforceStrictLimits(out);

    return res.status(200).json({ text: fixed });

  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e) });
  }
}

function enforceStrictLimits(text) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  let title = lines[0] || "";
  let tags = lines[1] || "";

  // Eğer hashtag yoksa ve başlıkta # varsa ayır
  if (!tags && title.includes("#")) {
    const idx = title.indexOf("#");
    tags = title.slice(idx).trim();
    title = title.slice(0, idx).trim();
  }

  // --- KESİN LİMİTLER ---
  // Başlık: Max 49 Karakter (Kelime bölmeden)
  title = smartTrim(title, 49);
  
  // Hashtag: Max 50 Karakter
  tags = normalizeTags(tags);
  tags = smartTrim(tags, 50);

  // Hashtag boşsa doldur
  if (!tags) tags = "#shorts #viral";

  return `${title}\n${tags}`;
}

function normalizeTags(s) {
  let t = String(s || "").trim();
  if (!t) return "";
  if (!t.startsWith("#")) t = "#" + t;
  t = t.replace(/[，,;]+/g, " ").replace(/\s+/g, " ").trim();
  return t;
}

// Akıllı Kesme Fonksiyonu: Kelimeyi ortadan bölmez
function smartTrim(str, maxLen) {
  let trimmed = String(str || "").trim();
  
  if (trimmed.length <= maxLen) return trimmed;

  // Max uzunluktan kes
  trimmed = trimmed.substring(0, maxLen);

  // Son karakter bir boşluk değilse, kelime ortasındayız demektir.
  // Geriye doğru gidip ilk boşluğu bulalım.
  const lastSpace = trimmed.lastIndexOf(" ");

  if (lastSpace > 0) {
    trimmed = trimmed.substring(0, lastSpace);
  }
  
  // Eğer hiç boşluk yoksa (tek uzun kelimeyse) mecbur harften kesecek.
  return trimmed.trim();
}
