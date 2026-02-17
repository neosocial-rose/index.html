export default async function handler(req, res) {
  // 1. CORS ve Başlıklar
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  // 2. Metod Kontrolü
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  // 3. API Key Kontrolü
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: "GEMINI_API_KEY eksik" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const topic = String(body.topic || "").trim();
    const platform = String(body.platform || "youtube");

    if (!topic) return res.status(400).json({ error: "Topic boş" });

    let prompt = "";
    // Varsayılan sıcaklık (Yaratıcılık). Kriptoda 0.1 (Robot), Sosyal medyada 0.5 (Yazar)
    let generationTemp = 0.5; 

    // ============================================================
    // MODÜL 1: KRİPTO & FİNANS (STRICT MODE - KATI KURALLAR)
    // ============================================================
    if (platform === 'crypto' || platform === 'finance') {
        generationTemp = 0.1; // Halüsinasyonu engellemek için minimum yaratıcılık

        // Sembolü ilk kelimeden al (Örn: "ETH 15dk" -> "ETH")
        let rawSymbol = topic.split(' ')[0].toUpperCase();
        
        // Zaman dilimini algıla
        const timeFrame = detectTimeFrame(topic);
        
        // --- VERİ ÇEKME ---
        console.log(`Veri isteniyor: Sembol=${rawSymbol}, Aralık=${timeFrame ? timeFrame.int : '24h'}`);
        const coinData = await getBinancePrice(rawSymbol, timeFrame);

        if (coinData) {
            const periodLabel = timeFrame ? timeFrame.label : "son 24 saat";
            // Pozitif değişimler için "+" işareti ekle
            const changeSign = parseFloat(coinData.change) > 0 ? "+" : ""; 
            
            // AI PROMPT: Yazar değil, şablon doldurucu.
            prompt = `
            GÖREV: Sen bir veritabanı botusun. Yorum yapma. Sohbet etme. Aşağıdaki verileri şablona yerleştir.
            
            VERİLER:
            SYMBOL: ${coinData.symbol}
            SÜRE: ${periodLabel}
            DEĞİŞİM: ${changeSign}%${coinData.change}
            FİYAT: $${coinData.price}
            
            ŞABLON:
            "${coinData.symbol}, [SÜRE] içinde [DEĞİŞİM] ile [FİYAT] oldu. Kısa vadeli veriler yüksek oynaklık içerir; yatırım kararı için tek başına yeterli değildir, dikkatli olun."

            KURALLAR:
            1. Köşeli parantezleri VERİLER ile doldur.
            2. ASLA yorum, emoji, hashtag ekleme.
            3. Maksimum 160 karakter.
            `;
        } else {
            // Veri çekilemediyse kullanıcıya net bilgi ver
            prompt = `GÖREV: Sadece şunu yaz: "${rawSymbol} için borsa verisi alınamadı. Sembolü veya ağ bağlantısını kontrol edin."`;
        }

    } else {
        // ============================================================
        // MODÜL 2: SOSYAL MEDYA (VİRAL MOD)
        // ============================================================
        const randomSeed = Math.floor(Math.random() * 1000);
        prompt =
`Sen viral sosyal medya içerik uzmanısın. İNTERNETTEN "${topic}" konusundaki EN GÜNCEL trendleri araştır.
SADECE 2 SATIR YAZ.

KURAL 1 - BAŞLIK: "${topic}" ile ilgili güncel gelişme, Sayı (3,5,10), 1 Emoji. Max 60 karakter.
KURAL 2 - HASHTAG: 3-5 kısa hashtag. Max 40 karakter.
Random Seed: ${randomSeed}
`;
    }

    // --- GEMINI API İSTEĞİ ---
    const model = "gemini-2.5-flash"; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // Kripto modunda Google Search KAPALI (Veriyi biz verdik), diğerlerinde AÇIK
        tools: (platform === 'crypto' || platform === 'finance') ? [] : [{ google_search: {} }],
        generationConfig: {
          temperature: generationTemp,
          maxOutputTokens: 150, // Token tasarrufu
        }
      })
    });

    if (!r.ok) {
        const errText = await r.text();
        console.error("Gemini API Hatası:", errText);
        return res.status(500).json({ error: "AI Error", detail: errText.slice(0, 200) });
    }

    const txt = await r.text();
    let data = {};
    try { data = JSON.parse(txt); } catch {}
    
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // --- ÇIKTI FORMATLAMA ---
    let finalOutput = "";
    
    if (platform === 'crypto' || platform === 'finance') {
        // Kripto Temizliği
        finalOutput = formatCryptoAnalysis(out);
        // SMS Limiti (Kesin)
        if (finalOutput.length > 160) finalOutput = finalOutput.slice(0, 157) + "...";
    } else {
        // Sosyal Medya Temizliği
        finalOutput = enforceTwoLinesMax(out);
    }

    return res.status(200).json({ text: finalOutput });

  } catch (e) {
    console.error("Sunucu Hatası:", e);
    return res.status(500).json({ error: "Server Error", detail: String(e) });
  }
}

// ============================================================
// YARDIMCI FONKSİYONLAR
// ============================================================

// 1. ZAMAN ALGISI
function detectTimeFrame(str) {
    const s = str.toLowerCase();
    if (s.includes('15 dk') || s.includes('15 dakika') || s.includes('çeyrek')) return { int: '15m', label: 'son 15 dakikada' };
    if (s.includes('30 dk') || s.includes('30 dakika') || s.includes('yarım saat')) return { int: '30m', label: 'son 30 dakikada' };
    if (s.includes('1 saat') || s.includes('saatlik')) return { int: '1h', label: 'son 1 saatte' };
    if (s.includes('4 saat')) return { int: '4h', label: 'son 4 saatte' };
    // Varsayılan null (Bu durumda 24h ticker çalışır)
    return null; 
}

// 2. BİNANCE VERİ ÇEKME (DÜZELTİLMİŞ)
async function getBinancePrice(symbolInput, timeFrame) {
    try {
        // Sembol Temizliği: " ETH " -> "ETH"
        let s = symbolInput.replace(/[^A-Z0-9]/g, '').trim();
        if (s.length < 2) return null;

        // "BTC" girdiyse "BTCUSDT" yap. Ama zaten "BTCUSDT" girdiyse dokunma.
        // Ayrıca TRY paritelerine izin ver.
        if (!s.endsWith("USDT") && !s.endsWith("TRY") && !s.endsWith("BTC") && !s.endsWith("BNB") && !s.endsWith("FDUSD")) {
            s += "USDT";
        }

        // Görünen sembol (Kullanıcıya gösterilecek)
        const displaySymbol = s.replace("USDT", "").replace("TRY", "");

        // KRİTİK DÜZELTME: "api.binance.com" YERİNE "data-api.binance.vision" KULLANIYORUZ.
        // Bu endpoint bulut sunucularından gelen isteklere daha az blok koyar.
        const BASE_URL = "https://data-api.binance.vision"; 
        
        let url = "";
        let isKline = false;

        if (timeFrame) {
            // Mum Verisi (Kline)
            // limit=1 -> En son (güncel) mumu getirir.
            url = `${BASE_URL}/api/v3/klines?symbol=${s}&interval=${timeFrame.int}&limit=1`;
            isKline = true;
        } else {
            // 24 Saatlik Özet
            url = `${BASE_URL}/api/v3/ticker/24hr?symbol=${s}`;
        }

        console.log("Binance İstek:", url); // Hata ayıklama için log

        const res = await fetch(url);
        
        if (!res.ok) {
            // Hata detayını logla
            const errBody = await res.text();
            console.error(`Binance Fetch Hatası (${res.status}):`, errBody);
            return null; 
        }

        const data = await res.json();
        let price = 0;
        let change = 0;

        if (isKline) {
            // data formatı: [[open_time, open, high, low, close, volume, ...], ...]
            if (!Array.isArray(data) || data.length === 0) return null;
            const candle = data[0];
            const openPrice = parseFloat(candle[1]);
            const closePrice = parseFloat(candle[4]);
            
            price = closePrice;
            change = ((closePrice - openPrice) / openPrice) * 100;
        } else {
            // data formatı: { symbol: "...", priceChangePercent: "...", lastPrice: "..." }
            if (!data.lastPrice) return null;
            price = parseFloat(data.lastPrice);
            change = parseFloat(data.priceChangePercent);
        }

        return {
            symbol: displaySymbol,
            price: formatPrice(price),
            change: change.toFixed(2)
        };

    } catch (e) {
        console.error("Binance catch bloğu:", e);
        return null;
    }
}

// 3. FİYAT FORMATLAMA
function formatPrice(val) {
    if (val < 1) return val.toPrecision(4);  // Örn: 0.004532
    if (val < 10) return val.toFixed(3);     // Örn: 5.123
    return val.toFixed(2);                   // Örn: 65000.50
}

// 4. METİN TEMİZLEME (KRİPTO)
function formatCryptoAnalysis(text) {
    let clean = String(text || "")
        .replace(/["*]/g, "") // Tırnak ve yıldızları temizle
        .replace(/\r/g, "")
        .replace(/\n/g, " ")
        .trim();
    
    // AI bazen "Şablon:" kelimesini de çıktının başına ekleyebilir, silelim.
    if (clean.toLowerCase().startsWith("şablon:")) {
        clean = clean.substring(7).trim();
    }
    return clean;
}

// 5. SOSYAL MEDYA FORMATI (Değişmedi)
function enforceTwoLinesMax(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map(s => s.trim()).filter(Boolean);
  let title = lines[0] || "";
  let tags = lines[1] || "";
  if (!tags && title.includes("#")) {
    const idx = title.indexOf("#");
    tags = title.slice(idx).trim();
    title = title.slice(0, idx).trim();
  }
  return `${title.slice(0, 65)}\n${tags.slice(0, 40) || "#shorts"}`;
}
