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
    // MODÜL 1: KRİPTO & FİNANS (DOKUNULMADI - AYNI KALDI)
    // ============================================================
    if (platform === 'crypto' || platform === 'finance') {
        
        // A. KOD AYARLARI (ZORUNLU)
        aiConfig = {
            temperature: 0.0, // SIFIR ESNEKLİK.
            maxOutputTokens: 1000, 
            topP: 0.95
        };
        tools = []; // Kripto için Google Search KAPALI.

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
            const safeMessage = `${rawSymbol} için anlık borsa verisine ulaşılamadı. Sembolü kontrol ediniz.`;
            return res.status(200).json({ text: safeMessage });
        }

    } 
    // ============================================================
    // MODÜL 2: SOSYAL MEDYA (GÜNCELLENDİ - İNSAN TİPİ FORMAT)
    // ============================================================
    else {
        // A. KOD AYARLARI (YARATICI AMA KISA)
        aiConfig = {
            temperature: 0.9, // İnsan gibi hissettirmesi için yüksek yaratıcılık
            maxOutputTokens: 150, // Kısa cevap için limit
            topP: 0.95
        };
        tools = [{ google_search: {} }]; // Trendleri yakalamak için Google Search AÇIK

        const randomSeed = Math.floor(Math.random() * 1000);

        // B. GÜNCELLENMİŞ "İNSAN GİBİ" PROMPT
        prompt = `
        Sen profesyonel bir içerik üreticisisin.
        GÖREV: "${topic}" konusu için YouTube Shorts/Instagram Reels tarzında TEK BİR METİN yaz.

        REFERANS FORMAT (Buna Benzesin):
        "Trumpet Meets Sax — Soul Energy 🎷 #soulful #healingmusic #색소폰 #트럼펫 #악기연주 #tararara #shorts"

        KURALLAR (KESİN):
        1. RAKAM KULLANMA: "5 Adımda", "3 Tane" gibi sayılar ASLA olmasın.
        2. DOĞALLIK: Yapay zeka gibi değil, gerçek bir insan gibi kısa ve "cool" yaz.
        3. UZUNLUK: Başlık ve Hashtagler TOPLAM en fazla 100 karakter olsun.
        4. İÇERİK: "${topic}" ile ilgili en son trendlere uygun olsun.
        5. HASHTAG: Konuyla ilgili popüler, kısa ve etkili etiketler kullan.
        6. ÇIKTI: Sadece metni ver. Açıklama yapma.

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
    
    // --- ÇIKTI FORMATLAMA ---
    let finalOutput = "";
    
    if (platform === 'crypto' || platform === 'finance') {
        // Kripto Temizliği (Dokunulmadı)
        finalOutput = out
            .replace(/["*]/g, "")
            .replace(/#/g, "")
            .replace(/\n/g, " ")
            .trim();
        if (finalOutput.length > 250) finalOutput = finalOutput.slice(0, 247) + "...";
    } else {
        // --- SOSYAL MEDYA FORMATI (GÜNCELLENDİ) ---
        // Gelen metni tek satıra indir, gereksiz boşlukları temizle
        finalOutput = out.replace(/\r/g, "").replace(/\n/g, " ").trim();

        // 100 Karakter Limiti Kontrolü (Sert Kesme)
        if (finalOutput.length > 100) {
             // Hashtaglerin ortasından kesmemek için son boşluktan kırp
             let cut = finalOutput.slice(0, 100);
             let lastSpace = cut.lastIndexOf(" ");
             if (lastSpace > 50) { // Çok erken kesilmesin
                 finalOutput = cut.slice(0, lastSpace); 
             } else {
                 finalOutput = cut; // Boşluk bulamazsa direkt kes
             }
        }
        
        // Rakam Temizliği (AI kaçırırsa diye son güvenlik önlemi)
        // Başlık kısmındaki "5 şey" gibi yapıları temizle
        finalOutput = finalOutput.replace(/\b\d+\s+(tane|şey|yol|adım)\b/gi, "").trim();
    }

    return res.status(200).json({ text: finalOutput });

  } catch (e) {
    console.error("Handler Hatası:", e);
    return res.status(500).json({ error: "Sunucu içi hata", detail: String(e) });
  }
}

// ============================================================
// YARDIMCI FONKSİYONLAR (DOKUNULMADI)
// ============================================================

function detectTimeFrame(str) {
    const s = str.toLowerCase();
    if (s.includes('15 dk') || s.includes('15 dakika') || s.includes('çeyrek')) return { int: '15m', label: 'son 15 dakikada' };
    if (s.includes('30 dk') || s.includes('30 dakika') || s.includes('yarım saat')) return { int: '30m', label: 'son 30 dakikada' };
    if (s.includes('1 saat') || s.includes('saatlik')) return { int: '1h', label: 'son 1 saatte' };
    if (s.includes('4 saat')) return { int: '4h', label: 'son 4 saatte' };
    return null; 
}

async function getBinancePrice(symbolInput, timeFrame) {
    try {
        let s = symbolInput.trim();
        if (s.length < 2) return null;
        const validSuffixes = ["USDT", "TRY", "BTC", "BNB", "FDUSD", "USDC"];
        if (!validSuffixes.some(suffix => s.endsWith(suffix))) s += "USDT";
        const displaySymbol = s.replace("USDT", "").replace("TRY", "");
        const BASE_URL = "https://data-api.binance.vision"; 
        
        let url = "";
        let isKline = false;

        if (timeFrame) {
            url = `${BASE_URL}/api/v3/klines?symbol=${s}&interval=${timeFrame.int}&limit=1`;
            isKline = true;
        } else {
            url = `${BASE_URL}/api/v3/ticker/24hr?symbol=${s}`;
        }

        const res = await fetch(url);
        if (!res.ok) return null; 

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
        return { symbol: displaySymbol, price: formatPrice(price), change: change.toFixed(2) };
    } catch (e) {
        return null;
    }
}

function formatPrice(val) {
    if (val < 1) return val.toPrecision(4);  
    if (val < 10) return val.toFixed(3);     
    return val.toFixed(2);                   
}
