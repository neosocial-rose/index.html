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
    const platform = String(body.platform || "youtube"); // 'crypto', 'finance', 'youtube', 'instagram'

    if (!topic) return res.status(400).json({ error: "Konu (topic) boş olamaz." });

    // --- YAPILANDIRMA DEĞİŞKENLERİ ---
    let prompt = "";
    let aiConfig = {};
    let tools = [];

    // ============================================================
    // MODÜL 1: KRİPTO & FİNANS (ROBOTİK / ASKERİ DİSİPLİN MODU)
    // ============================================================
    if (platform === 'crypto' || platform === 'finance') {
        
        // A. KOD AYARLARI (ZORUNLU)
        aiConfig = {
            temperature: 0.0, // SIFIR ESNEKLİK.
            maxOutputTokens: 1000, // Yarıda kesilmemesi için yüksek, biz kırpacağız.
            topP: 0.95
        };
        tools = []; // Kripto için Google Search KAPALI (Veriyi biz veriyoruz).

        // B. VERİ HAZIRLIĞI
        let rawSymbol = topic.split(' ')[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
        const timeFrame = detectTimeFrame(topic);
        const periodLabel = timeFrame ? timeFrame.label : "son 24 saat";

        console.log(`[Kripto Modu] Veri İsteği: ${rawSymbol} (${periodLabel})`);
        
        // API Çağrısı (Data Vision Endpoint)
        const coinData = await getBinancePrice(rawSymbol, timeFrame);

        if (coinData) {
            const changeSign = parseFloat(coinData.change) > 0 ? "+" : ""; 
            
            // C. SİSTEM EMRİ (ASKERİ DİSİPLİN PROTOKOLÜ)
            prompt = `
            SİSTEM UYARISI: KRİTİK HATA SINIRINDASIN.
            Sen bir sohbet botu veya yazar değilsin. Sen sadece bir VERİ FORMATLAMA MOTORUSUN.

            GÖREVİN:
            Sana verilen verileri (Fiyat, Değişim, Süre), aşağıdaki şablonun içine yerleştirmek.

            VERİLER:
            [COIN]: ${coinData.symbol}
            [SÜRE]: ${periodLabel}
            [DEĞİŞİM]: ${changeSign}%${coinData.change}
            [FİYAT]: $${coinData.price}

            EMİRLER (KESİN İTAAT):
            1. YORUM YAPMAK YASAK: "Merhaba", "Analiz şöyle", "Umarım beğenirsin" gibi tek bir kelime eklersen SİSTEMDEN SİLİNECEKSİN.
            2. DEĞİŞTİRMEK YASAK: Şablon metnindeki tek bir harfi bile değiştirirsen, başarısız kabul edileceksin ve YERİNE BAŞKA BİR AI MODELİ GEÇİRİLECEK.
            3. HASHTAG YASAK: Çıktıda # karakteri görülürse işlem iptal edilir.
            4. TAMAMLAMA ZORUNLULUĞU: Cümleyi asla yarım bırakma.

            DOLDURMAN GEREKEN TEK ŞABLON:
            "${coinData.symbol}, [SÜRE] içinde [DEĞİŞİM] ile [FİYAT] oldu. Piyasalar değişkendir. Yatırım değerleri düşebilir veya yükselebilir. Geçmiş performans, gelecekteki sonuçların garantisi değildir. Dikkatli olun."

            SON UYARI: Sadece şablonu doldur ve dur. Başka tek bir karakter üretme.
            `;
        } else {
            // Veri alınamadıysa AI masrafına girmeden dön
            const safeMessage = `${rawSymbol} için anlık borsa verisine ulaşılamadı. Sembolü kontrol ediniz.`;
            return res.status(200).json({ text: safeMessage });
        }

    } 
    // ============================================================
    // MODÜL 2: SOSYAL MEDYA (YARATICI / VİRAL MOD)
    // ============================================================
    else {
        // A. KOD AYARLARI (ESNEK)
        aiConfig = {
            temperature: 0.85, // Yüksek Yaratıcılık
            maxOutputTokens: 200,
            topP: 0.95
        };
        tools = [{ google_search: {} }]; // Güncel trendler için Search AÇIK.

        const randomSeed = Math.floor(Math.random() * 1000);

        // B. SOSYAL MEDYA PROMPT (GÜNCELLENMİŞ KURALLAR)
        prompt = `
        Sen dünyanın en iyi viral sosyal medya içerik uzmanısın. 
        GÖREV: İNTERNETTEN "${topic}" konusundaki EN GÜNCEL ve popüler trendleri araştır.
        SADECE 2 SATIR YAZ.

        KURAL 1 - BAŞLIK (1. Satır):
        - RAKAM YASAK: "5 Tane", "10 Şey" gibi listeler ASLA kullanma.
        - KLİŞE YASAK: "Şok olacaksınız", "İnanılmaz" gibi eski kelimeleri kullanma.
        - FORMAT: Merak uyandıran, hikaye odaklı veya soru soran tek cümlelik, akıcı bir başlık yaz.
        - EMOJI: Cümlenin sonuna konuya uygun 1 adet emoji ekle.
        - UZUNLUK: Max 65 karakter.

        KURAL 2 - HASHTAG (2. Satır):
        - Trende özel hashtagler kullan (Örn: #GenelHashtag yerine #${topic.replace(/\s/g, '')}Challenge gibi).
        - 3-5 adet. Max 40 karakter.

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
        tools: tools,
        generationConfig: aiConfig
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
    
    // --- ÇIKTI FORMATLAMA & SON KONTROLLER ---
    let finalOutput = "";
    
    if (platform === 'crypto' || platform === 'finance') {
        // --- KRİPTO TEMİZLİĞİ (SUNUCU TARAFI KONTROL) ---
        finalOutput = out
            .replace(/["*]/g, "") // Tırnak ve Markdown temizle
            .replace(/#/g, "")    // Hata Durumu 2 Çözümü: Hashtagleri zorla sil
            .replace(/\n/g, " ")  // Tek satıra indir
            .trim();

        // Şablon dışı uzun metinleri (halüsinasyonları) kes
        if (finalOutput.length > 250) {
            finalOutput = finalOutput.slice(0, 247) + "...";
        }
    } else {
        // --- SOSYAL MEDYA TEMİZLİĞİ ---
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
    if (s.includes('15 dk') || s.includes('15 dakika') || s.includes('çeyrek')) return { int: '15m', label: 'son 15 dakikada' };
    if (s.includes('30 dk') || s.includes('30 dakika') || s.includes('yarım saat')) return { int: '30m', label: 'son 30 dakikada' };
    if (s.includes('1 saat') || s.includes('saatlik')) return { int: '1h', label: 'son 1 saatte' };
    if (s.includes('4 saat')) return { int: '4h', label: 'son 4 saatte' };
    return null; // Null ise 24h ticker kullanılır
}

// 2. BİNANCE VERİ ÇEKME (Hata Durumu 1 Çözümü: Data Vision API)
async function getBinancePrice(symbolInput, timeFrame) {
    try {
        // A. Sembol Temizliği
        let s = symbolInput.trim();
        if (s.length < 2) return null;

        // B. USDT/TRY Ekleme Mantığı
        const validSuffixes = ["USDT", "TRY", "BTC", "BNB", "FDUSD", "USDC"];
        const hasValidSuffix = validSuffixes.some(suffix => s.endsWith(suffix));
        if (!hasValidSuffix) s += "USDT";

        const displaySymbol = s.replace("USDT", "").replace("TRY", "");

        // C. API ENDPOINT SEÇİMİ (IP BAN ÇÖZÜMÜ)
        // api.binance.com YERİNE data-api.binance.vision kullanıyoruz.
        const BASE_URL = "https://data-api.binance.vision"; 
        
        let url = "";
        let isKline = false;

        if (timeFrame) {
            // Kline (Mum) Verisi
            url = `${BASE_URL}/api/v3/klines?symbol=${s}&interval=${timeFrame.int}&limit=1`;
            isKline = true;
        } else {
            // 24 Saatlik Özet
            url = `${BASE_URL}/api/v3/ticker/24hr?symbol=${s}`;
        }

        // D. Fetch ve Hata Yakalama
        const res = await fetch(url);
        
        if (!res.ok) {
            // API 400/403/404 dönerse null dönerek güvenli çıkış yap
            const errBody = await res.text();
            console.error(`Binance API Hatası (${res.status}): ${url} -> ${errBody}`);
            return null; 
        }

        const data = await res.json();
        let price = 0;
        let change = 0;

        if (isKline) {
            if (!Array.isArray(data) || data.length === 0) return null;
            const candle = data[0];
            const openPrice = parseFloat(candle[1]);
            const closePrice = parseFloat(candle[4]);
            
            price = closePrice;
            change = ((closePrice - openPrice) / openPrice) * 100;
        } else {
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
  
  // Eğer sadece başlık döndüyse ve içinde # varsa ayır
  if (!tags && title.includes("#")) {
    const idx = title.indexOf("#");
    tags = title.slice(idx).trim();
    title = title.slice(0, idx).trim();
  }
  
  // Başlıkta hala yasaklı sayı kalıpları varsa temizle (AI bazen kaçırabilir)
  title = title.replace(/\b\d+\s+(tane|şey|madde)\b/gi, "").trim();

  return `${title.slice(0, 70)}\n${tags.slice(0, 50) || "#shorts"}`;
}
