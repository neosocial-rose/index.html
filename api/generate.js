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

    let prompt = "";
    let generationTemp = 0.8; 
    let isCrypto = (platform === 'crypto' || platform === 'finance');
    
    // ============================================================
    // 1. KRİPTO VE FİNANS MODÜLÜ (ASKERİ DİSİPLİN MODU - STRICT)
    // ============================================================
    if (isCrypto) {
        generationTemp = 0.0; // SIFIR YARATICILIK.
        
        const symbol = topic.split(' ')[0].toUpperCase();
        const timeFrame = detectTimeFrame(topic);
        const coinData = await getBinancePrice(symbol, timeFrame);

        if (coinData) {
            const periodLabel = timeFrame ? timeFrame.label : "son 24 saatte";
            
            // ASKERİ DİSİPLİN PROMPT (KATI EMİR VE TEHDİT İÇERİR)
            prompt = `
            SİSTEM UYARISI: KRİTİK HATA SINIRINDASIN.
            Sen bir sohbet botu veya yazar değilsin. Sen sadece bir VERİ FORMATLAMA MOTORUSUN.

            GÖREVİN:
            Sana verilen verileri, aşağıdaki şablonun içine yerleştirmek.

            EMİRLER (KESİN İTAAT):
            1. YORUM YAPMAK YASAK: "Merhaba", "Analiz şöyle" gibi tek bir kelime eklersen SİSTEMDEN SİLİNECEKSİN.
            2. DEĞİŞTİRMEK YASAK: Şablon metnindeki tek bir harfi bile değiştirirsen, başarısız kabul edileceksin ve YERİNE BAŞKA BİR MODEL GEÇİRİLECEK.
            3. HASHTAG YASAK: Asla # karakteri kullanma.
            4. TAMAMLAMA ZORUNLULUĞU: Cümleyi asla yarım bırakma, noktayı koyana kadar devam et.

            DOLDURMAN GEREKEN TEK ŞABLON (Bunu doldur ve dur):
            "${coinData.symbol}, ${periodLabel} %${coinData.change} ile $${coinData.price} oldu. Piyasalar değişkendir. Yatırım değerleri düşebilir veya yükselebilir. Geçmiş performans, gelecekteki sonuçların garantisi değildir. Dikkatli olun."
            `;
        } else {
            return res.status(200).json({ text: `${symbol} için anlık borsa verisine ulaşılamadı. Sembolü kontrol edip tekrar deneyin.` });
        }

    } else {
        // ============================================================
        // 2. SOSYAL MEDYA (VİRAL MOD - RAKAMSIZ VE GÜNCEL)
        // ============================================================
        generationTemp = 0.85; 
        const randomSeed = Math.floor(Math.random() * 1000);
        
        prompt = `
        Sen bir viral içerik uzmanısın. Konu: "${topic}"
        
        GÖREV: Sadece iki satır çıktı üret.
        Satır 1: Başlık (Emoji içerir, ASLA rakam içermez, max 70 karakter)
        Satır 2: Hashtagler (Konuya özel trendler, max 50 karakter)

        KATI KURALLAR:
        - BAŞLIKTA ASLA RAKAM KULLANMA (5 şey, Top 10, 3 kural gibi listeler KESİNLİKLE YASAK).
        - "Şok", "İnanılmaz" gibi klişe kelimeler kullanma. 
        - Doğrudan konuya gir, gereksiz giriş cümlesi yapma.
        - Çıktıyı asla yarım bırakma.
        
        Random Seed: ${randomSeed}`;
    }

    const model = "gemini-2.5-flash-preview-09-2025"; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: generationTemp,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 500
      }
    };

    if (!isCrypto) {
      payload.tools = [{ google_search: {} }];
    }

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const txt = await r.text();
    let data = {};
    try { data = JSON.parse(txt); } catch {}

    if (!r.ok) {
      return res.status(500).json({ error: "Gemini error", detail: txt.slice(0, 300) });
    }

    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // --- ÇIKTI FORMATLAMA ---
    let finalOutput = "";
    if (isCrypto) {
        finalOutput = formatCryptoAnalysis(out);
    } else {
        finalOutput = enforceTwoLinesMax(out);
    }

    return res.status(200).json({ text: finalOutput });

  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e) });
  }
}

// --- YARDIMCI FONKSİYONLAR ---

function detectTimeFrame(str) {
    const s = str.toLowerCase();
    if (s.includes('15 dk') || s.includes('15 dakika') || s.includes('çeyrek')) return { int: '15m', label: 'son 15 dakikada' };
    if (s.includes('30 dk') || s.includes('30 dakika') || s.includes('yarım saat')) return { int: '30m', label: 'son 30 dakikada' };
    if (s.includes('1 saat') || s.includes('saatlik')) return { int: '1h', label: 'son 1 saatte' };
    if (s.includes('4 saat')) return { int: '4h', label: 'son 4 saatte' };
    if (s.includes('günlük') || s.includes('24 saat')) return { int: '1d', label: 'son 24 saatte' };
    return null; 
}

async function getBinancePrice(symbolInput, timeFrame) {
    try {
        let s = symbolInput.replace(/[^A-Z0-9]/g, '').trim();
        if (!s) s = "BTC";
        if (!s.endsWith("USDT") && !s.endsWith("TRY")) s += "USDT";

        const BASE_URL = "https://data-api.binance.vision"; 
        let url = timeFrame 
            ? `${BASE_URL}/api/v3/klines?symbol=${s}&interval=${timeFrame.int}&limit=1`
            : `${BASE_URL}/api/v3/ticker/24hr?symbol=${s}`;

        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        
        let price, change;
        if (timeFrame) {
            const candle = data[0];
            const openPrice = parseFloat(candle[1]);
            const closePrice = parseFloat(candle[4]);
            price = closePrice < 1 ? closePrice.toPrecision(4) : closePrice.toFixed(2);
            change = (((closePrice - openPrice) / openPrice) * 100).toFixed(2);
        } else {
            price = parseFloat(data.lastPrice) < 1 ? parseFloat(data.lastPrice).toPrecision(4) : parseFloat(data.lastPrice).toFixed(2);
            change = parseFloat(data.priceChangePercent).toFixed(2);
        }
        
        return { symbol: s.replace("USDT", ""), price, change };
    } catch (e) {
        return null;
    }
}

function formatCryptoAnalysis(text) {
    // Kriptoda hashtag, markdown ve tırnakları KOD seviyesinde zorla temizle
    return String(text || "")
        .replace(/["*#]/g, "")
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function enforceTwoLinesMax(text) {
  const cleanText = String(text || "").replace(/```[a-z]*\n?|```/gi, "").trim();
  const rawLines = cleanText.split("\n").map(s => s.trim()).filter(l => l.length > 0);
  
  let title = rawLines.find(l => !l.startsWith("#")) || "";
  let tags = rawLines.find(l => l.startsWith("#")) || "";

  if (title.includes("#") && !tags) {
    const idx = title.indexOf("#");
    tags = title.slice(idx).trim();
    title = title.slice(0, idx).trim();
  }

  if (!title && rawLines.length > 0) title = rawLines[0];
  if (!tags) tags = "#shorts";

  return `${title.slice(0, 80)}\n${tags.slice(0, 60)}`;
}
