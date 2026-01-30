export default async function handler(req, res) {
    // CORS Ayarları (Önemli)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // OPTIONS isteğini hemen yanıtla
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) return res.status(500).json({ error: 'Server Config Error: Missing Gemini Key' });

    try {
        const { topic, type, platform, lang } = req.body;
        
        // Dil Haritası
        const langs = {
            'tr': 'Turkish', 'en': 'English', 'de': 'German', 
            'fr': 'French', 'es': 'Spanish', 'pt': 'Portuguese'
        };
        const language = langs[lang] || 'Turkish';

        let prompt = "";
        
        if (type === 'title') {
            prompt = `Act as a viral content strategist for ${platform}. 
            Task: Generate a single high-engagement title about "${topic}".
            Language: ${language}.
            Strict Constraints: 
            1. Title MUST be EXACTLY 40 characters long (including spaces). 
            2. Pad with spaces if short, or trim if long.
            3. No clickbait, policy compliant.
            4. Output ONLY the raw title text.`;
        } else {
            prompt = `Act as a viral content strategist for ${platform}.
            Task: Generate a set of popular hashtags for "${topic}".
            Language: ${language}.
            Strict Constraints: 
            1. Total length MUST NOT exceed 59 characters.
            2. Space separated.
            3. Output ONLY the hashtags.`;
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error?.message || 'Gemini API Error');
        }

        let resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Üretim başarısız";
        
        // Temizlik
        resultText = resultText.replace(/\n/g, ' ').replace(/['"]/g, '').trim();

        return res.status(200).json({ result: resultText });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
