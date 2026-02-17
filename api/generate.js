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
    let aiConfig = {};
    let tools = [];

    // ============================================================
    // MODÜL 1: KRİPTO & FİNANS (DOKUNULMADI)
    // ============================================================
    if (platform === 'crypto' || platform === 'finance') {
        aiConfig = { temperature: 0.0, maxOutputTokens: 1000, topP: 0.95 };
        tools = [];

        let rawSymbol = topic.split(' ')[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
        const timeFrame = detectTimeFrame(topic);
        const periodLabel = timeFrame ? timeFrame.label : "son 24 saat";

        console.log(`[Kripto Modu] Veri İsteği: ${rawSymbol} (${periodLabel})`);
        const coinData = await getBinancePrice(rawSymbol, timeFrame);

        if (coinData) {
            const changeSign = parseFloat(coinData.change) > 0 ? "+" : "";
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
            1. YORUM YAPMAK YASAK.
            2. DEĞİŞTİRMEK YASAK.
            3. HASHTAG YASAK.
            4. Cümleyi asla yarım bırakma.

            DOLDURMAN GEREKEN TEK ŞABLON:
            "${coinData.symbol}, [SÜRE] içinde [DEĞİŞİM] ile [FİYAT] oldu. Piyasalar değişkendir. Yatırım değerleri düşebilir veya yükselebilir. Geçmiş performans, gelecekteki sonuçların garantisi değildir. Dikkatli olun."
            `;
        } else {
            return res.status(200).json({ text: `${rawSymbol} için anlık borsa verisine ulaşılamadı. Sembolü kontrol ediniz.` });
        }

    }
    // ============================================================
    // MODÜL 2: SOSYAL MEDYA
    // ============================================================
    else {
        aiConfig = { temperature: 0.85, maxOutputTokens: 200, topP: 0.95 };
        tools = [];

        const randomSeed = Math.floor(Math.random() * 1000);

        prompt = `
        Rol: Sosyal Medya Fenomeni.
        GÖREV: "${topic}" konusu için tek satırlık, vurucu ve akılda kalıcı bir paylaşım metni yaz.

        FORMAT: [Vurucu Başlık] [Emoji] [Hashtagler]

        KURALLAR:
        1. ASLA liste sayıları kullanma ("5 Yol", "3 Adım" gibi).
        2. Her şey tek satırda olsun, alt alta değil.
        3. Hashtagleri sona ekle, konuyla ilgili popüler olanları seç.
        4. Sadece metni ver, tırnak işareti koyma.
        5. "tararara" kelimesini kesinlikle kullanma.

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
        finalOutput = out.replace(/["*]/g, "").replace(/#/g, "").replace(/\n/g, " ").trim();
        if (finalOutput.length > 250) finalOutput = finalOutput.slice(0, 247) + "...";
    } else {
        // 1. Tek satıra çek, tırnakları temizle
        finalOutput = out.replace(/\r/g, "").replace(/\n/g, " ").trim();
        finalOutput = finalOutput.replace(/^"|"$/g, '');

        // 2. Rakamlı listeleri temizle
        finalOutput = finalOutput.replace(/\b\d+\s+(tane|şey|yol|adım)\b/gi, "").trim();

        // 3. tararara yasağı
        finalOutput = finalOutput.replace(/tararara/gi, "").replace(/\s{2,}/g, " ").trim();

        // 4. Akıllı kesme: 120 karakterden uzunsa son boşluktan kes
        if (finalOutput.length > 120) {
            const cut = finalOutput.slice(0, 120);
            const lastSpace = cut.lastIndexOf(" ");
            finalOutput = lastSpace > 40 ? cut.slice(0, lastSpace).trim() : cut.trim();
        }

        // 5. Sonda yalnız kalan # işaretini temizle
        finalOutput = finalOutput.replace(/\s*#+\s*$/, "").trim();
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
