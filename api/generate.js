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

    const randomSeed = Math.floor(Math.random() * 1000);

    // --- 1. KRİPTO/FİNANS İÇİN ÖZEL AKIŞ (HASHTAG YOK, SAF ANALİZ) ---
    if (platform === 'crypto' || platform === 'finance') {
        const symbol = topic.split(' ')[0].toUpperCase();
        const coinData = await getBinancePrice(symbol);

        let cryptoPrompt = "";

        if (coinData) {
            // GERÇEK VERİ VARSA
            const trendText = parseFloat(coinData.change) > 0 ? "YÜKSELİŞTE" : "DÜŞÜŞTE";
            cryptoPrompt = `
            Rol: Kripto Analisti. Dil: ${lang}.
            Veri: ${coinData.symbol} Fiyat: $${coinData.price}, Değişim: %${coinData.change} (${trendText}).
            
            GÖREV:
            Yatırımcıya durumu özetleyen TEK BİR CÜMLE yaz.
            
            KURALLAR:
            1. ASLA HASHTAG KULLANMA (# YOK).
            2. Fiyatı ve Değişim oranını cümlenin içine yedir.
            3. "Yükseliş mi düşüş mü" diye sorma, veriye bakarak "Fırladı" veya "Çakıldı" diye yorum yap.
            4. Maksimum 100 karakter olsun.
            
            ÖRNEK:
            BTC 98.500$ seviyesini kırdı, %5 yükselişle boğalar piyasaya geri döndü! 🚀
            `;
        } else {
            // VERİ YOKSA (Coin bulunamadıysa)
            cryptoPrompt = `
            Konu: ${topic}. Kripto para piyasası hakkında TEK BİR CÜMLELİK, hashtagsiz, 100 karakteri geçmeyen viral bir analiz yaz.
            Dil: ${lang}.
            `;
        }

        // Gemini'ye sor (Kripto için)
        const txt = await callGemini(GEMINI_KEY, cryptoPrompt);
        
        // Çıktıyı temizle (Hashtag varsa sil, 100 karaktere kırp)
        const cleanText = txt.replace(/#/g, '').trim(); 
        const finalText = smartTrim(cleanText, 100);

        return res.status(200).json({ text: finalText });
    }

    // --- 2. DİĞER PLATFORMLAR İÇİN STANDART AKIŞ (YOUTUBE, INSTA VS.) ---
    // (Burada hala Başlık + Hashtag yapısı korunuyor)
    let prompt =
`Sen viral içerik uzmanısın. Konu: "${topic}".
SADECE 2 SATIR YAZ.
1. Satır: Başlık (Max 60 karakter, sayı ve emoji kullan).
2. Satır: 3-5 Hashtag.
Dil: ${lang}. Seed: ${randomSeed}`;

    const txt = await callGemini(GEMINI_KEY, prompt);
    const fixed = enforceTwoLinesMax(txt); // Eski formatlayıcıyı kullan

    return res.status(200).json({ text: fixed });

  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e) });
  }
}

// --- GEMINI API ÇAĞRISI (Tekrarı önlemek için fonksiyona aldım) ---
async function callGemini(key, prompt) {
    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, topK: 40 }
      })
    });

    if (!r.ok) throw new Error("Gemini API Error");
    const json = await r.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// --- BİNANCE FİYAT ÇEKME ---
async function getBinancePrice(symbolInput) {
    try {
        let s = symbolInput.replace(/[^A-Z0-9]/g, '');
        if (!s) s = "BTC";
        if (!s.endsWith("USDT") && !s.endsWith("TRY")) s += "USDT";

        const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`);
        if (!res.ok) return null;

        const d = await res.json();
        return {
            symbol: s.replace("USDT", ""),
            price: parseFloat(d.lastPrice) < 1 ? parseFloat(d.lastPrice).toPrecision(4) : parseFloat(d.lastPrice).toFixed(2),
            change: parseFloat(d.priceChangePercent).toFixed(2)
        };
    } catch (e) { return null; }
}

// --- FORMATLAMA (DİĞER PLATFORMLAR İÇİN) ---
function enforceTwoLinesMax(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map(s => s.trim()).filter(Boolean);
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
  if (!tags) tags = "#shorts"; // Sadece YouTube/Insta için varsayılan tag

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
