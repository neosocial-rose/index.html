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

    if (!topic) return res.status(400).json({ error: "topic empty" });

    const prompt = `"${topic}" konusu için viral sosyal medya başlığı yaz.

SADECE 2 SATIR:
1. Başlık (max 60 karakter, emoji ekle)
2. Hashtag (3-4 adet)`;

    // V1 API KULLAN (beta değil)
    const model = "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${GEMINI_KEY}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const txt = await r.text();
    let data = {};
    try { data = JSON.parse(txt); } catch {}

    if (!r.ok) {
      return res.status(500).json({ 
        error: "Gemini hatası", 
        detail: txt.slice(0, 300) 
      });
    }

    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    if (!out) {
      return res.status(500).json({ error: "Boş yanıt" });
    }

    const lines = out.split('\n').filter(l => l.trim());
    let title = lines[0] || out.slice(0, 60);
    let tags = lines[1] || "#viral";

    if (title.includes('#')) {
      const idx = title.indexOf('#');
      tags = title.slice(idx);
      title = title.slice(0, idx).trim();
    }

    return res.status(200).json({ text: `${title}\n${tags}` });

  } catch (e) {
    return res.status(500).json({ error: "error", detail: String(e) });
  }
}
