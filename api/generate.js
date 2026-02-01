export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  const MODEL = "gemini-2.5-flash";

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const prompt = (body.prompt || "").trim();
    if (!prompt) return res.status(400).json({ error: "empty prompt" });

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Sohbet etme. Kısa, net ve üretim odaklı yaz. Açıklama yapma. Sadece sonuç ver.\n\nKonu: ${prompt}`
                }
              ]
            }
          ]
        })
      }
    );

    const data = await r.json();

    const text =
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text
        ? data.candidates[0].content.parts[0].text
        : "";

    return res.status(200).json({ text });
  } catch {
    return res.status(500).json({ error: "server error" });
  }
}
