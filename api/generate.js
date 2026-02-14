export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: "API Key eksik" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const topic = String(body.topic || "").trim();
    const lang = String(body.lang || "tr");
    const platform = String(body.platform || "youtube");

    if (!topic) return res.status(400).json({ error: "Konu boş" });

    // --- PROFESYONEL KRİPTO ANALİZ MODU ---
    if (platform === 'crypto' || platform === 'finance') {
        
        // 1. Coin Sembolünü bul (Örn: "eth yorum" -> "ETH")
        const symbol = extractCoinSymbol(topic); 
        
        // 2. Binance'den MUM (CANDLE) verisi çek (Son 30 Dk)
        const candle = await getBinanceCandle(symbol);

        let finalPrompt = "";

        if (candle) {
            // Mum verilerini yorumla
            const isGreen = candle.close > candle.open; // Yeşil mum mu?
            const percent = ((candle.close - candle.open) / candle.open) * 100;
            const volatility = Math.abs(percent).toFixed(2);
            const direction = isGreen ? "YUKARI (BULLISH)" : "AŞAĞI (BEARISH)";
            
            finalPrompt = `
            ROL: Sen 20 yıllık tecrübeli, sert mizaçlı bir Teknik Analistsin. Asla çocukça konuşma.
            
            CANLI 30 DAKİKALIK MUM VERİSİ:
            - Coin: ${candle.symbol}
            - Şu Anki Fiyat: $${candle.close}
            - Mum Açılışı: $${candle.open}
            - En Yüksek (Direnç): $${candle.high}
            - En Düşük (Destek): $${candle.low}
            - Son 30dk Değişim: %${volatility}
            - Yön: ${direction}
            
            GÖREV:
            Bu verilere bakarak yatırımcıya TEK CÜMLELİK, teknik terimler içeren, profesyonel bir analiz yaz.
            
            KESİN KURALLAR:
            1. ASLA "yükseldi" veya "düştü" gibi basit kelimeler kullanma.
            2. Şunları kullan: "Test ediyor", "Kırdı", "Red yedi", "Hacimli mum", "Destek çalıştı", "Dirençte zorlanıyor".
            3. Mutlaka Fiyatı ($${candle.close}) cümlenin içinde geçir.
            4. Eğer yön YUKARI ise: "Direnci zorluyor", "Alıcılar iştahlı", "Kırılım geldi" de.
            5. Eğer yön AŞAĞI ise: "Satış baskısı", "Desteğe çekiliyor", "Kâr realizasyonu" de.
            6. Max 100 karakter. Hashtag YOK.
            
            ÖRNEK (Bunlar gibi yaz):
            - "ETH 2.950$ direncinden red yedi, 2.920$ desteğine geri çekiliyor! 📉"
            - "BTC 98.000$ üzerinde kalıcı olmaya çalışıyor, alıcılar devrede! 🚀"
            `;
        } else {
            // Veri yoksa
            finalPrompt = `Konu: ${topic}. Kripto piyasası hakkında "Volatilite yüksek, işlem hacimlerine dikkat!" minvalinde profesyonel, tek cümlelik bir uyarı yap.`;
        }

        const txt = await callGemini(GEMINI_KEY, finalPrompt);
        return res.status(200).json({ text: txt.replace(/#/g, '').trim() });
    }

    // --- DİĞER PLATFORMLAR (ESKİ SİSTEM) ---
    // (YouTube vb. için standart viral başlık)
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

// 1. Coin Sembolü Çıkarıcı
function extractCoinSymbol(text) {
    const t = text.toUpperCase().split(' ')[0].replace(/[^A-Z0-9]/g, '');
    return t.length < 2 ? "BTC" : t;
}

// 2. Binance MUM Verisi (30 Dakikalık)
async function getBinanceCandle(symbol) {
    try {
        let s = symbol;
        if (!s.endsWith("USDT") && !s.endsWith("TRY")) s += "USDT";
        
        // interval=30m (30 dakika), limit=1 (son mum)
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${s}&interval=30m&limit=1`);
        if (!res.ok) return null;

        const data = await res.json();
        const k = data[0]; // İlk ve tek mum
        
        return {
            symbol: s.replace("USDT", ""),
            open: parseFloat(k[1]).toFixed(2),  // Açılış
            high: parseFloat(k[2]).toFixed(2),  // En Yüksek
            low: parseFloat(k[3]).toFixed(2),   // En Düşük
            close: parseFloat(k[4]).toFixed(2)  // Kapanış (Şu anki fiyat)
        };
    } catch (e) { return null; }
}

// 3. Gemini Fonksiyonu
async function callGemini(key, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5 } }) // Sıcaklık 0.5 (Daha ciddi)
    });
    if (!r.ok) throw new Error("AI Error");
    const json = await r.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// 4. Standart Formatlayıcı (YouTube vb. için)
function enforceTwoLinesMax(text) {
  const lines = String(text || "").split("\n").map(s => s.trim()).filter(Boolean);
  return `${lines[0] || ""}\n${lines[1] || "#shorts"}`;
}
