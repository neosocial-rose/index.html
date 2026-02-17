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
    let generationTemp = 0.85; // Varsayılan yaratıcı sıcaklık
    
    // ============================================================
    // 1. KRİPTO VE FİNANS MODÜLÜ (ASKERİ DİSİPLİN - KESİN EMİR)
    // ============================================================
    if (platform === 'crypto' || platform === 'finance') {
        generationTemp = 0.0; // SIFIR YARATICILIK (Robot Modu)
        
        const symbol = topic.split(' ')[0].toUpperCase();
        const timeFrame = detectTimeFrame(topic);
        const coinData = await getBinancePrice(symbol, timeFrame);

        if (coinData) {
            const periodLabel = timeFrame ? timeFrame.label : "son 24 saatte";
            
            // AI'ya HİÇBİR hareket alanı bırakmayan, SADECE şablon doldurtan prompt
            prompt = `
            SİSTEM EMİRLERİ (KRİTİK):
            - Sen bir sohbet botu değilsin, sadece bir VERİ DOLDURMA MOTORUSUN.
            - Giriş cümlesi, yorum, emoji veya hashtag KESİNLİKLE YASAK.
            - Sadece aşağıdaki şablonu doldur ve başka tek bir harf yazma.
            - Cümleyi asla yarım bırakma.

            DOLDURULACAK ŞABLON:
            "${coinData.symbol}, ${periodLabel} %${coinData.change} ile $${coinData.price} oldu. Piyasalar değişkendir. Yatırım değerleri düşebilir veya yükselebilir. Geçmiş performans, gelecekteki sonuçların garantisi değildir. Dikkatli olun."
            `;
        } else {
            // Veri çekilemezse AI'ya gitmeden doğrudan güvenli mesaj dön
            return res.status(200).json({ text: `${symbol} için anlık borsa verisine ulaşılamadı. Sembolü kontrol edip tekrar deneyin.` });
        }

    } else {
        // ============================================================
        // 2. SOSYAL MEDYA (VİRAL MOD - RAKAMSIZ VE GÜNCEL)
        // ============================================================
        generationTemp = 0.85; // Yüksek yaratıcılık
        const randomSeed = Math.floor(Math.random() * 1000);
        
        prompt = `
        Sen viral sosyal medya içerik uzmanısın. İNTERNETTEN "${topic}" konusundaki EN GÜNCEL trendleri araştır.
        SADECE 2 SATIR YAZ. HİÇBİR AÇIKLAMA YAPMA.

        KATI KURALLAR:
        1. BAŞLIKTA ASLA RAKAM KULLANMA (5 şey, 10 kişi, Top 3 gibi listeler KESİNLİKLE YASAK).
        2. "Şok", "İnanılmaz" gibi klişe kelimeler kullanma. Merak uyandıran, yeni nesil bir dil kullan.
        3. 1-2 emoji ekle.
        4. Hashtagler konuya özel ve en güncel trendlerden seçilsin.
        5. Başlığı asla yarım bırakma.

        Random Seed: ${randomSeed}

        FORMAT:
        1. satır: Başlık
        2. satır: Hashtag`;
    }

    // --- GEMINI İSTEĞİ ---
    const model = "gemini-2.5-flash-preview-09-2025"; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: (platform === 'crypto' || platform === 'finance') ? [] : [{ google_search: {} }],
        generationConfig: {
          temperature: generationTemp,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 500
        }
      })
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
    if (platform === 'crypto' || platform === 'finance') {
        finalOutput = formatCryptoAnalysis(out);
    } else {
        finalOutput = enforceTwoLinesMax(out);
    }

    return res.status(200).json({ text: finalOutput });

  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e) });
  }
}

// --- YARDIMCI FONKSİYONLAR (ORİJİNAL YAPI KORUNDU) ---

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
        let s = symbolInput.replace(/[^A-Z0-9]/g, '');
        if (!s) s = "BTC";
        if (!s.endsWith("USDT") && !s.endsWith("TRY")) s += "USDT";

        const BASE_URL = "https://data-api.binance.vision"; // IP Ban önleme için public endpoint
        let url = "";

        if (timeFrame) {
            url = `${BASE_URL}/api/v3/klines?symbol=${s}&interval=${timeFrame.int}&limit=1`;
        } else {
            url = `${BASE_URL}/api/v3/ticker/24hr?symbol=${s}`;
        }

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
    // Kriptoda hashtag, markdown ve tırnakları zorla temizle
    return String(text || "")
        .replace(/["*#]/g, "")
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function enforceTwoLinesMax(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map(s => s.trim()).filter(Boolean);
  let title = lines[0] || "";
  let tags = lines[1] || "";
  if (!tags && title.includes("#")) {
    const idx = title.indexOf("#");
    tags = title.slice(idx).trim();
    title = title.slice(0, idx).trim();
  }
  return `${title.slice(0, 70)}\n${tags.slice(0, 50) || "#shorts"}`;
}
