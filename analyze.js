export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: "GEMINI_API_KEY eksik" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const messages = body.messages || [];
    const lang = String(body.lang || "tr");

    if (!messages.length) return res.status(400).json({ error: "messages boş" });

    // ============================================================
    // MESAJLARI GEMINI FORMATINA ÇEVİR
    // ============================================================
    const geminiParts = [];

    for (const msg of messages) {
      if (typeof msg.content === "string") {
        geminiParts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "text") {
            geminiParts.push({ text: part.text });
          } else if (part.type === "image") {
            // Base64 görsel
            geminiParts.push({
              inlineData: {
                mimeType: part.source?.media_type || "image/jpeg",
                data: part.source?.data || ""
              }
            });
          }
        }
      }
    }

    // ============================================================
    // GEMINI İSTEĞİ
    // ============================================================
    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

    const geminiBody = {
      contents: [{ parts: geminiParts }],
      generationConfig: {
        temperature: 0.3,
        topP: 0.90,
        topK: 40,
        maxOutputTokens: 1000
      }
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody)
    });

    const txt = await r.text();
    let data = {};
    try { data = JSON.parse(txt); } catch {}

    if (!r.ok) {
      console.error("Gemini error:", txt.slice(0, 500));
      return res.status(500).json({ error: "Gemini hatası", detail: txt.slice(0, 300) });
    }

    const outputText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Anthropic formatında döndür (frontend bunu bekliyor)
    return res.status(200).json({
      content: [{ type: "text", text: outputText }]
    });

  } catch (e) {
    console.error("Server error:", e);
    return res.status(500).json({ error: "Sunucu hatası", detail: String(e) });
  }
}
