export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  
  if (!GEMINI_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY yok" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const topic = String(body.topic || "").trim();
    const lang = String(body.lang || "tr");

    if (!topic) return res.status(400).json({ error: "topic empty" });

    const randomSeed = Math.floor(Math.random() * 10000);

    const prompt = `"${topic}" konusu için viral sosyal medya başlığı yaz.

SADECE 2 SATIR:
1. Başlık (max 60 karakter, emoji ekle)
2. Hashtag (3-4 adet)

Örnek:
${topic} ile 7 Günde Başarı! 🔥
#${topic.toLowerCase().replace(/ /g,'')} #viral #keşfet

Seed: ${randomSeed}`;

    const model = "gemini-1.5-flash-latest";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 150
        }
      })
    });

    const txt = await r.text();
    let data = {};
    try { data = JSON.parse(txt); } catch {}

    if (!r.ok) {
      return res.status(500).json({ 
        error: "Gemini API hatası", 
        detail: data?.error?.message || txt.slice(0, 200) 
      });
    }

    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    if (!out) {
      return res.status(500).json({ error: "Boş yanıt" });
    }

    const lines = out.split('\n').filter(l => l.trim());
    let title = lines[0] || out.slice(0, 60);
    let tags = lines[1] || "#viral #trending";

    if (title.includes('#')) {
      const idx = title.indexOf('#');
      tags = title.slice(idx);
      title = title.slice(0, idx).trim();
    }

    return res.status(200).json({ text: `${title}\n${tags}` });

  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e) });
  }
}
