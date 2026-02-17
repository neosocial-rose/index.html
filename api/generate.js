export default async function handler(req, res) {
  // 1. HTTP Başlıkları ve Metod Kontrolü
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Sadece POST isteği kabul edilir." });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: "Sunucu hatası: API anahtarı eksik." });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const topic = String(body.topic || "").trim();
    const platform = String(body.platform || "youtube");

    if (!topic) return res.status(400).json({ error: "Konu (topic) boş olamaz." });

    let prompt = "";
    // Varsayılan sıcaklık. Kripto için 0 (Robot), Sosyal medya için 0.6 (Yaratıcı)
    let generationTemp = 0.6; 
    let maxTokens = 1000; // Kesilmemesi için yüksek, sonra biz kırpacağız.

    // ============================================================
    // MODÜL 1: KRİPTO & FİNANS (ASKERİ DİSİPLİN MODU)
    // ============================================================
    if (platform === 'crypto' || platform === 'finance') {
        generationTemp = 0.0; // SIFIR ESNEKLİK.

        // 1. Sembol Ayrıştırma ve Temizleme
        let rawSymbol = topic.split(' ')[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
        
        // 2. Zaman Dilimi Algılama
        const timeFrame = detectTimeFrame(topic);
        const periodLabel = timeFrame ? timeFrame.label : "son 24 saat";

        // 3. Veri Çekme (Binance Public API)
        console.log(`Veri İsteği: ${rawSymbol} (${periodLabel})`);
        const coinData = await getBinancePrice(rawSymbol, timeFrame);

        if (coinData) {
            const changeSign = parseFloat(coinData.change) > 0 ? "+" : ""; 
            
            // --- ASKERİ DİSİPLİN PROMPT (KATI EMİR) ---
            prompt = `
            SİSTEM UYARISI: KRİTİK HATA SINIRINDASIN.
            Sen bir sohbet botu veya yazar değilsin. Sen sadece bir VERİ FORMATLAMA MOTORUSUN.

            GÖREVİN:
            Sana verilen verileri, aşağıdaki şablonun içine yerleştirmek.

            GİRDİ VERİLERİ:
            [COIN]: ${coinData.symbol}
            [SÜRE]: ${periodLabel}
            [DEĞİŞİM]: ${changeSign}%${coinData.change}
            [FİYAT]: $${coinData.price}

            EMİRLER (KESİN İTAAT):
            1. YORUM YAPMAK YASAK: "Merhaba", "Analiz şöyle" gibi tek bir kelime ekleme.
            2. DEĞİŞTİRMEK YASAK: Şablon metnini değiştirme.
            3. HASHTAG YASAK: Asla # kullanma.
            4. Sadece doldurulmuş şablonu ver.

            DOLDURMAN GEREKEN TEK ŞABLON:
            "${coinData.symbol}, [SÜRE] içinde [DEĞİŞİM] ile [FİYAT] oldu. Piyasalar değişkendir. Yatırım değerleri düşebilir veya yükselebilir. Geçmiş performans, gelecekteki sonuçların garantisi değildir. Dikkatli olun."
            `;
        } else {
            // Veri alınamadıysa AI'ya hiç gitme, direkt hata mesajı şablonu oluştur.
            // Bu sayede AI masrafı ve halüsinasyon riski sıfıra iner.
            const safeMessage = `${rawSymbol} için anlık borsa verisine ulaşılamadı. Sembolü kontrol ediniz.`;
            return res.status(200).json({ text: safeMessage });
        }

    } else {
        // ============================================================
        // MODÜL 2: SOSYAL MEDYA (VİRAL MOD - ESNEK)
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

    // Kripto için Google Search KAPALI (Veriyi biz veriyoruz).
    const tools = (platform === 'crypto' || platform === 'finance') ? [] : [{ google_search: {} }];

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: tools,
        generationConfig: {
          temperature: generationTemp,
          maxOutputTokens: maxTokens,
          topP: 0.8,
          topK: 10
        }
      })
    });

    if (!r.ok) {
        const errText = await r.text();
        console.error("Gemini API Hatası:", errText);
        return res.status(500).json({ error: "AI Servis Hatası", detail: errText.slice(0, 200) });
    }

    const txt = await r.text();
    let data = {};
    try { data = JSON.parse(txt); } catch {}
    
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // --- ÇIKTI FORMATLAMA & GÜVENLİK KONTROLÜ ---
    let finalOutput = "";
    
    if (platform === 'crypto' || platform === 'finance') {
        // 1. Temizlik
        finalOutput = out
            .replace(/["*]/g, "") // Tırnak ve markdown temizle
            .replace(/#/g, "")    // Hashtag temizle (Yasaklı karakter)
            .replace(/\n/g, " ")  // Tek satıra indir
            .trim();

        // 2. Şablon Kontrolü (Ekstra Güvenlik)
        // Eğer AI saçmaladıysa ve çok uzun yazdıysa kes.
        if (finalOutput.length > 250) {
            finalOutput = finalOutput.slice(0, 247) + "...";
        }
    } else {
        // Sosyal Medya için satır koruma
        finalOutput = enforceTwoLinesMax(out);
    }

    return res.status(200).json({ text: finalOutput });

  } catch (e) {
    console.error("Handler Hatası:", e);
    return res.status(500).json({ error: "Sunucu içi hata", detail: String(e) });
  }
}

// ============================================================
// YARDIMCI FONKSİYONLAR
// ============================================================

// 1. ZAMAN DİLİMİ TESPİTİ
function detectTimeFrame(str) {
    const s = str.toLowerCase();
    // Sıralama önemli: Önce özeller, sonra genel ifadeler.
    if (s.includes('15 dk') || s.includes('15 dakika') || s.includes('çeyrek')) return { int: '15m', label: 'son 15 dakikada' };
    if (s.includes('30 dk') || s.includes('30 dakika') || s.includes('yarım saat')) return { int: '30m', label: 'son 30 dakikada' };
    if (s.includes('1 saat') || s.includes('saatlik')) return { int: '1h', label: 'son 1 saatte' };
    if (s.includes('4 saat')) return { int: '4h', label: 'son 4 saatte' };
    
    // Varsayılan (null dönerse 24h ticker kullanılır)
    return null; 
}

// 2. BİNANCE VERİ ÇEKME (Data API Vision Kullanarak)
async function getBinancePrice(symbolInput, timeFrame) {
    try {
        // Sembol Validasyonu
        let s = symbolInput.trim();
        if (s.length < 2) return null;

        // USDT/TRY Ekleme Mantığı
        // Eğer zaten geçerli bir çift ile bitmiyorsa USDT ekle.
        const validSuffixes = ["USDT", "TRY", "BTC", "BNB", "FDUSD", "USDC"];
        const hasValidSuffix = validSuffixes.some(suffix => s.endsWith(suffix));
        
        if (!hasValidSuffix) {
            s += "USDT";
        }

        const displaySymbol = s.replace("USDT", "").replace("TRY", "");

        // --- PUBLIC DATA API KULLANIMI (IP BAN ÖNLEME) ---
        const BASE_URL = "https://data-api.binance.vision"; 
        let url = "";
        let isKline = false;

        if (timeFrame) {
            // Kline (Mum) Verisi
            // Interval parametresi kesinlikle doğru formatta olmalı (15m, 1h vs.)
            url = `${BASE_URL}/api/v3/klines?symbol=${s}&interval=${timeFrame.int}&limit=1`;
            isKline = true;
        } else {
            // 24 Saatlik Özet
            url = `${BASE_URL}/api/v3/ticker/24hr?symbol=${s}`;
        }

        // Fetch İşlemi
        const res = await fetch(url);
        
        if (!res.ok) {
            // Hata durumunda (400, 403, 404) null dön ki üst fonksiyon bunu işlesin.
            const errBody = await res.text();
            console.error(`Binance Error (${res.status}): ${url} -> ${errBody}`);
            return null; 
        }

        const data = await res.json();
        let price = 0;
        let change = 0;

        if (isKline) {
            // Kline Formatı: [[time, open, high, low, close, ...]]
            if (!Array.isArray(data) || data.length === 0) return null;
            const candle = data[0];
            const openPrice = parseFloat(candle[1]);
            const closePrice = parseFloat(candle[4]);
            
            price = closePrice;
            change = ((closePrice - openPrice) / openPrice) * 100;
        } else {
            // Ticker Formatı: { lastPrice, priceChangePercent }
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
        console.error("GetBinancePrice Exception:", e);
        return null;
    }
}

// 3. FİYAT FORMATLAMA
function formatPrice(val) {
    if (val < 1) return val.toPrecision(4);  
    if (val < 10) return val.toFixed(3);     
    return val.toFixed(2);                   
}

// 4. SOSYAL MEDYA FORMATLAYICI
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
