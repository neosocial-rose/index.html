export default async function handler(req, res) {
  // Cevap formatı JSON ve UTF-8 (Türkçe karakter sorunu olmasın)
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Sadece POST isteği kabul edilir" });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: "API Key eksik" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const topic = String(body.topic || "").trim(); // Kullanıcı ne yazdı? "eth de durum ne"
    const lang = String(body.lang || "tr");
    const platform = String(body.platform || "youtube");

    if (!topic) return res.status(400).json({ error: "Konu boş olamaz" });

    // --- KRİPTO ANALİZ MODU (SERT VE NET) ---
    if (platform === 'crypto' || platform === 'finance') {
        
        // 1. Cümlenin içinden Coin Sembolünü bul (Örn: "avax ne olur" -> "AVAX")
        const symbol = extractCoinSymbol(topic); 
        
        // 2. Binance'den CANLI veriyi çek
        const coinData = await getBinancePrice(symbol);

        let finalPrompt = "";

        if (coinData) {
            // VERİ VAR: Gemini'ye kesin emir veriyoruz
            const trend = parseFloat(coinData.change) > 0 ? "YÜKSELİŞTE 🟢" : "DÜŞÜŞTE 🔴";
            
            finalPrompt = `
            GÖREV: Sen bir Kripto Para Teknik Analistisin. Edebiyat yapma, net konuş.
            
            CANLI VERİ:
            - Coin: ${coinData.symbol}
            - Fiyat: $${coinData.price}
            - Değişim: %${coinData.change}
            - Yön: ${trend}
            
            KOMUT:
            Bu verileri kullanarak yatırımcıya TEK BİR CÜMLELİK net bir durum raporu ver.
            
            KESİN KURALLAR:
            1. Asla "fırsatlar dünyası", "riskler kesişimi" gibi boş laflar etme.
            2. Cümlende MUTLAKA Fiyatı ($${coinData.price}) ve Değişimi (%${coinData.change}) geçir.
            3. Yön ${trend} olduğu için buna uygun (Destek/Direnç/Fırlama/Çakılma) kelimeleri kullan.
            4. Max 100 karakter. Hashtag kullanma.
            
            ÖRNEK ÇIKTI:
            ETH $2.950 direncini zorluyor, %4 yükselişle boğalar piyasaya hakim! 🚀
            `;
        } else {
            // VERİ YOKSA (Coin bulunamadıysa):
            finalPrompt = `
            Konu: ${topic}.
            Kripto para hakkında kısa, net ve 100 karakteri geçmeyen bir piyasa yorumu yap.
            Asla şiirsel konuşma, finansal terimler kullan. Hashtag kullanma.
            `;
        }

        // Gemini'ye gönder
        const txt = await callGemini(GEMINI_KEY, finalPrompt);
        const cleanText = txt.replace(/#/g, '').trim(); // Hashtag varsa sil
        return res.status(200).json({ text: cleanText });
    }

    // --- DİĞER PLATFORMLAR (YouTube, Instagram vs.) ---
    // (Burası değişmedi, eski usül çalışır)
    const prompt = `Sen viral içerik uzmanısın. Konu: "${topic}". Platform: ${platform}. Dil: ${lang}.
    SADECE 2 SATIR YAZ:
    1. Satır: Başlık (Max 60 karakter, sayı ve emoji kullan).
    2. Satır: 3-5 Hashtag.`;

    const txt = await callGemini(GEMINI_KEY, prompt);
    const fixed = enforceTwoLinesMax(txt);

    return res.status(200).json({ text: fixed });

  } catch (e) {
    return res.status(500).json({ error: "Sunucu hatası", detail: String(e) });
  }
}

// --- YARDIMCI FONKSİYONLAR ---

// 1. Cümlenin içinden Coin Bulucu
function extractCoinSymbol(text) {
    // Yaygın coinleri elle kontrol et (Kullanıcı "ethereum" yazarsa "ETH" anlasın)
    const mapping = {
        "bitcoin": "BTC", "ethereum": "ETH", "ripple": "XRP", "avalanche": "AVAX", 
        "solana": "SOL", "doge": "DOGE", "shiba": "SHIB", "pepe": "PEPE"
    };
    
    const lowerText = text.toLowerCase();
    for (const [key, val] of Object.entries(mapping)) {
        if (lowerText.includes(key)) return val;
    }
    
    // Eşleşme yoksa ilk kelimeyi al (Örn: "ARB coin" -> "ARB")
    return text.split(' ')[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// 2. Binance Fiyat Çekici
async function getBinancePrice(symbol) {
    try {
        let s = symbol;
        if (!s) s = "BTC";
        // USDT eklemesi (BTC -> BTCUSDT)
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

// 3. Gemini Çağırıcı
async function callGemini(key, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 } // Daha tutarlı olması için sıcaklığı düşürdüm
      })
    });
    if (!r.ok) throw new Error("Gemini Error");
    const json = await r.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// 4. Formatlayıcı (Diğer platformlar için)
function enforceTwoLinesMax(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map(s => s.trim()).filter(Boolean);
  return `${lines[0] || ""}\n${lines[1] || "#shorts"}`;
}
