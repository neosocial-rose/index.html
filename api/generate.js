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

    const randomSeed = Math.floor(Math.random() * 1000);

    // --- 1. VARSAYILAN PROMPT (Diğer platformlar için) ---
    let prompt =
`Sen viral sosyal medya içerik uzmanısın. İNTERNETTEN "${topic}" konusundaki EN GÜNCEL trendleri araştır.
SADECE 2 SATIR YAZ. HİÇBİR AÇIKLAMA YAPMA.

KURAL 1 - BAŞLIK (1. satır):
- "${topic}" konusundaki GÜNCEL gelişmeleri kullan
- Sayı kullan: 3, 5, 7, 10
- 1-2 emoji
- Max 60 karakter

KURAL 2 - HASHTAG (2. satır):
- 3-5 kısa hashtag
- Max 40 karakter

Random Seed: ${randomSeed}

ŞİMDİ YAZ:
1. satır: Başlık
2. satır: Hashtag`;

    // --- 2. KRİPTO/FİNANS İSE GERÇEK VERİYİ VE ZAMANI DEVREYE SOK ---
    if (platform === 'crypto' || platform === 'finance') {
        // Konunun ilk kelimesini coin sembolü olarak al (Örn: "BTC 15 dk" -> "BTC")
        const symbol = topic.split(' ')[0].toUpperCase();
        
        // YENİ: Zaman aralığını tespit et (15m, 1h, 4h vb.)
        const timeFrame = detectTimeFrame(topic);

        // Binance'den veriyi çek (Zaman aralığı varsa ona göre çeker)
        const coinData = await getBinancePrice(symbol, timeFrame);

        if (coinData) {
            // VERİ BULUNDU! Prompt'u tamamen değiştiriyoruz.
            const trendIcon = parseFloat(coinData.change) > 0 ? "🚀" : "🔻";
            const changeDirection = parseFloat(coinData.change) > 0 ? "YÜKSELİŞTE" : "DÜŞÜŞTE";
            
            // Kullanıcıya gösterilecek zaman etiketi (Örn: "Son 15 Dakika" veya "Son 24 Saat")
            const periodLabel = timeFrame ? timeFrame.label : "Son 24 Saat";

            prompt = `
            Rol: Kripto Para Analisti.
            Dil: ${lang}
            Coin: ${coinData.symbol}
            Zaman Aralığı: ${periodLabel}
            
            GERÇEK PİYASA VERİLERİ (Şu an Canlı):
            - Fiyat: $${coinData.price}
            - Değişim (${periodLabel}): %${coinData.change}
            - Yön: ${changeDirection}
            
            GÖREV:
            Bu verilere dayalı, yatırımcıyı heyecanlandıran viral bir başlık at.
            
            KURALLAR:
            1. BAŞLIKTA MUTLAKA "${periodLabel}" İFADESİNİ VE DEĞİŞİMİ (%${coinData.change}) KULLAN.
            2. Asla soru sorma (Örn: "Yükselir mi?"). Veriye bakarak durumu bildir (Örn: "Fırladı", "Çakıldı", "Patlama Yaptı").
            3. Fiyatı ($${coinData.price}) başlığa dahil et.
            4. Sadece 2 satır yaz.
            
            ÖRNEK ÇIKTI FORMATI:
            ${coinData.symbol} ${periodLabel}da %${coinData.change} Fırladı! $${coinData.price} Seviyesinde! ${trendIcon}
            #${coinData.symbol} #Bitcoin #Kripto
            `;
        }
    }
    // --- BİTİŞ ---

    const model = "gemini-2.5-flash"; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }], // Google araması açık
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          topK: 40
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
    const fixed = enforceTwoLinesMax(out);

    return res.status(200).json({ text: fixed });

  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e) });
  }
}

// --- YENİ: ZAMAN ARALIĞI TESPİT FONKSİYONU ---
function detectTimeFrame(str) {
    const s = str.toLowerCase();
    
    // 15 Dakika
    if (s.includes('15 dk') || s.includes('15 dakika') || s.includes('çeyrek')) {
        return { interval: '15m', label: 'Son 15 Dakika' };
    }
    // 30 Dakika
    if (s.includes('30 dk') || s.includes('30 dakika') || s.includes('yarım saat')) {
        return { interval: '30m', label: 'Son 30 Dakika' };
    }
    // 1 Saat
    if (s.includes('1 saat') || s.includes('saatlik')) {
        return { interval: '1h', label: 'Son 1 Saat' };
    }
    // 4 Saat
    if (s.includes('4 saat')) {
        return { interval: '4h', label: 'Son 4 Saat' };
    }
    // 1 Hafta
    if (s.includes('haftalık') || s.includes('1 hafta')) {
        return { interval: '1w', label: 'Bu Hafta' };
    }
    
    return null; // Hiçbiri yoksa varsayılan (24 saat) çalışır
}

// --- GÜNCELLENMİŞ BİNANCE FİYAT ÇEKME ---
async function getBinancePrice(symbolInput, timeFrame) {
    try {
        // Sembol temizliği (BTC -> BTCUSDT)
        let s = symbolInput.replace(/[^A-Z0-9]/g, '');
        if (!s) s = "BTC";
        
        if (!s.endsWith("USDT") && !s.endsWith("TRY")) {
            s += "USDT";
        }

        let price = "0";
        let change = "0";
        let finalSymbol = s.replace("USDT", "");

        // EĞER ÖZEL ZAMAN ARALIĞI VARSA (Mum Grafiği Çek)
        if (timeFrame) {
            const klineRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${s}&interval=${timeFrame.interval}&limit=1`);
            
            if (!klineRes.ok) return null;

            const data = await klineRes.json();
            // Data formatı: [ [OpenTime, Open, High, Low, Close, Volume...], ... ]
            if (data && data.length > 0) {
                const candle = data[0];
                const openPrice = parseFloat(candle[1]);
                const closePrice = parseFloat(candle[4]);
                
                price = closePrice < 1 ? closePrice.toPrecision(4) : closePrice.toFixed(2);
                
                // Yüzdelik Değişim Hesapla: ((Kapanış - Açılış) / Açılış) * 100
                const percentChange = ((closePrice - openPrice) / openPrice) * 100;
                change = percentChange.toFixed(2);
            }

        } else {
            // ZAMAN ARALIĞI YOKSA (Klasik 24 Saatlik Veri)
            const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`);
            if (!res.ok) return null;
            
            const d = await res.json();
            price = parseFloat(d.lastPrice) < 1 ? parseFloat(d.lastPrice).toPrecision(4) : parseFloat(d.lastPrice).toFixed(2);
            change = parseFloat(d.priceChangePercent).toFixed(2);
        }
        
        return {
            symbol: finalSymbol,
            price: price,
            change: change
        };

    } catch (e) {
        console.error("Binance error:", e);
        return null;
    }
}

// --- FORMATLAMA FONKSİYONLARI (AYNEN KALDI) ---
function enforceTwoLinesMax(text) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  let title = lines[0] || "";
  let tags = lines[1] || "";

  if (!tags && title.includes("#")) {
    const idx = title.indexOf("#");
    tags = title.slice(idx).trim();
    title = title.slice(0, idx).trim();
  }

  title = smartTrim(title, 65); // Başlık için biraz daha yer açtım
  tags = normalizeTags(tags);
  tags = smartTrim(tags, 40);
  if (!tags) tags = "#shorts";

  const total = Array.from(title).length + Array.from(tags).length + 1;
  if (total > 110) {
    const maxTagLen = 110 - Array.from(title).length - 1;
    if (maxTagLen > 10) {
      tags = smartTrim(tags, maxTagLen);
    } else {
      title = smartTrim(title, 55);
      tags = smartTrim(tags, 50);
    }
  }
  return `${title}\n${tags}`;
}

function normalizeTags(s) {
  let t = String(s || "").trim();
  if (!t) return "";
  if (!t.startsWith("#")) t = "#" + t;
  t = t.replace(/[，,;]+/g, " ").replace(/\s+/g, " ").trim();
  return t;
}

function smartTrim(str, maxLen) {
  const arr = Array.from(String(str || ""));
  if (arr.length <= maxLen) return arr.join("").trim();
  const cut = arr.slice(0, maxLen).join("");
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > 0) return cut.slice(0, lastSpace).trim();
  return cut.trim();
}
