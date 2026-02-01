export default async function handler(req, res) {
  const API_KEY = process.env.GEMINI_API_KEY;
  const MODEL = "gemini-2.5-flash";

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: req.body.prompt }] }
          ]
        })
      }
    );

    const data = await r.json();
    res.status(200).json(data);

  } catch (e) {
    res.status(500).json({ error: "Gemini hata" });
  }
}
