export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  // Sadece POST isteği
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: "API Key eksik" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const topic = String(body.topic || "").trim();
    const lang = String(body.lang || "tr");
    const platform = String(body.platform || "youtube");

    if (!topic) return res.status(400).json({ error: "Konu boş" });

    // --- KRİPTO ANALİZ BÖLÜMÜ ---
    if (platform === 'crypto' || platform === 'finance') {
        
        // 1. Sembolü Yakala (eth -> ETHUSDT)
        let symbol = extractCoinSymbol(topic);
        
        // 2. Binance'den Veri Çek (GARANTİLİ YÖNTEM)
        const coinData = await getBinanceData(symbol);

        let finalPrompt = "";

        if (coinData) {
            // --- SENARYO A: VERİ BAŞARIYLA ÇEKİLDİ ---
            const trend = parseFloat(coinData.change) > 0 ? "YÜKSELİŞ (ALICILI)" : "DÜŞÜŞ (SATICILI)";
            
            finalPrompt = `
            ROL: Wall Street Teknik Analisti.
            DİL: ${lang} (Türkçe ise Borsa İstanbul ağzıyla konuş).
            
            CANLI VERİ:
            - Coin: ${coinData.symbol}
            - Fiyat: $${coinData.price}
            - 24s Değişim: %${coinData.change}
            - Yön: ${trend}
            
            GÖREV:
            Yatırımcıya TEK CÜMLELİK, net teknik analiz ver.
            
            KURALLAR:
            1. FİYATI ($${coinData.price}) MUTLAKA YAZ.
            2. ASLA "ben yapay zekayım", "verim yok" deme.
            3. "Yükseldi/Düştü" deme. Şunları de: "Direnci test ediyor", "Desteğe çekildi", "Hacimli kırdı".
            4. Max 100 karakter. Hashtag YOK.
            
            ÖRNEK:
            ${coinData.symbol} $${coinData.price} direncini zorluyor, boğalar iştahlı! 🚀
            `;
        } else {
            // --- SENARYO B: VERİ ÇEKİLEMEDİ (YAPAY ZEKA SUSTURUCU) ---
            // Burası çalışırsa AI "Ben bilmiyorum" diyemez, genel konuşur.
            finalPrompt = `
            Konu: ${topic} (Kripto Para).
            GÖREV: Şu an bu coin için anlık veriye ulaşamadın ama profesyonel görünmelisin.
            Yatırımcıya "Piyasadaki volatilite yüksek, destek seviyelerine dikkat edin" minvalinde,
            TEK CÜMLELİK, RAKAMSIZ, genel geçer bir borsa uyarısı yap.
            ASLA "Ben yapay zekayım", "Bilmiyorum" DEME. Sanki piyasayı izliyormuş gibi konuş.
            `;
        }

        const txt = await callGemini(GEMINI_KEY, finalPrompt);
        return res.status(200).json({ text: txt.replace(/#/g, '').trim() });
    }

    // --- DİĞER PLATFORMLAR (YouTube vb.) ---
    const prompt = `Konu: "${topic}". Platform: ${platform}. Dil: ${lang}.
    Viral Başlık (Max 60 karakter) ve 3 Hashtag yaz. 2 satır olsun.`;

    const txt = await callGemini(GEMINI_KEY, prompt);
    return res.status(200).json({ text: enforceTwoLinesMax(txt) });

  } catch (e) {
    return res.status(500).json({ error: "Server hatası", detail: String(e) });
  }
}

// --- YARDIMCI FONKSİYONLAR ---

// 1. Sembol Bulucu (Geliştirilmiş)
function extractCoinSymbol(text) {
    const t = text.toUpperCase();
    // Yaygın coinleri elle düzelt
    if (t.includes("BITCOIN")) return "BTCUSDT";
    if (t.includes("ETHEREUM")) return "ETHUSDT";
    if (t.includes("AVAX")) return "AVAXUSDT";
    if (t.includes("SOLANA")) return "SOLUSDT";
    if (t.includes("RIPPLE")) return "XRPUSDT";
    
    // Kelimeyi al, USDT ekle
    let clean = t.split(' ')[0].replace(/[^A-Z0-9]/g, '');
    if (clean.length < 2) return "BTCUSDT"; // Boşsa BTC getir
    if (!clean.endsWith("USDT") && !clean.endsWith("TRY")) clean += "USDT";
    return clean;
}

// 2. Binance Veri Çekici (Hata Korumalı)
async function getBinanceData(symbol) {
    try {
        // Binance API bazen timeout yer, o yüzden 2 saniye bekleriz max.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) return null; // Coin yoksa null dön

        const d = await res.json();
        return {
            symbol: symbol.replace("USDT", ""),
            price: parseFloat(d.lastPrice) < 1 ? parseFloat(d.lastPrice).toPrecision(4) : parseFloat(d.lastPrice).toFixed(2),
            change: parseFloat(d.priceChangePercent).toFixed(2)
        };
    } catch (e) {
        console.log("Binance Error:", e);
        return null; // Hata olursa null dön (Yedek senaryoya geç)
    }
}

// 3. Gemini Çağırıcı
async function callGemini(key, prompt) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const j = await r.json();
    return j?.candidates?.[0]?.content?.parts?.[0]?.text || "Analiz hazırlanıyor...";
}

// 4. Formatlayıcı
function enforceTwoLinesMax(text) {
  const l = String(text || "").split("\n").map(s => s.trim()).filter(Boolean);
  return `${l[0] || ""}\n${l[1] || "#shorts"}`;
}
