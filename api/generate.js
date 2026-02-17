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
    let prompt = "";
    
    // ============================================================
    // 1. KRİPTO VE FİNANS MODÜLÜ (SMS RİSK ANALİZ MODU - MAX 160 KARAKTER)
    // ============================================================
    if (platform === 'crypto' || platform === 'finance') {
        const symbol = topic.split(' ')[0].toUpperCase(); 
        const timeFrame = detectTimeFrame(topic); // Zamanı algıla
        
        // Binance'den veriyi çek
        const coinData = await getBinancePrice(symbol, timeFrame);

        if (coinData) {
            const periodDisplay = timeFrame ? timeFrame.display : "24 saatte"; // "30 dakikada"

            // SABİT UYARI METNİ (~105 Karakter)
            const warningText = "Kısa vadeli veriler yüksek oynaklık içerir; yatırım kararı için tek başına yeterli değildir, dikkatli olun.";

            prompt = `
            Rol: Risk Analisti.
            Dil: ${lang}
            
            VERİLER:
            - Sembol: ${coinData.symbol}
            - Süre: ${periodDisplay}
            - Değişim: %${coinData.change}
            - Fiyat: $${coinData.price}
            
            GÖREV:
            Aşağıdaki şablonu verilerle doldur ve TEK BİR CÜMLE olarak yaz.
            
            ŞABLON:
            "${coinData.symbol}, son ${periodDisplay} %[Değişim] ile $[Fiyat] oldu. ${warningText}"
            
            KURALLAR:
            1. Şablondaki [Değişim] ve [Fiyat] kısımlarını yukarıdaki verilerle değiştir.
            2. ASLA HASHTAG KULLANMA.
            3. ASLA EKSTRA YORUM YAPMA.
            4. Toplam uzunluk 160 karakteri geçmemeli.
            `;
        } else {
            // Veri yoksa kısa hata mesajı
            prompt = `Rol: Risk Analisti. "${topic}" için veri alınamadı. Yatırımcıyı piyasa risklerine karşı uyaran 140 karakterlik kısa bir not yaz. Hashtag kullanma.`;
        }

    } else {
        // ============================================================
        // 2. SOSYAL MEDYA (YOUTUBE, INSTA, TIKTOK) - VİRAL MOD
        // ============================================================
        prompt =
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
    }

    // --- GEMINI İSTEĞİ ---
    const model = "gemini-2.5-flash"; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.2, // Şablona tam sadakat için yaratıcılık en aza indirildi
          topP: 0.80,
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
    
    // --- ÇIKTI FORMATLAMA ---
    let finalOutput = "";
    if (platform === 'crypto' || platform === 'finance') {
        // Kripto için: 160 Karakter Kesme + Temizleme
        finalOutput = formatCryptoSMS(out);
    } else {
        // Sosyal medya için: Başlık + Hashtag
        finalOutput = enforceTwoLinesMax(out);
    }

    return res.status(200).json({ text: finalOutput });

  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e) });
  }
}

// --- ZAMAN ARALIĞI TESPİT FONKSİYONU ---
function detectTimeFrame(str) {
    const s = str.toLowerCase();
    
    // display: Cümle içinde nasıl görüneceği
    if (s.includes('15 dk') || s.includes('15 dakika') || s.includes('çeyrek')) {
        return { int: '15m', display: '15 dakikada' };
    }
    if (s.includes('30 dk') || s.includes('30 dakika') || s.includes('yarım saat')) {
        return { int: '30m', display: '30 dakikada' };
    }
    if (s.includes('1 saat') || s.includes('saatlik') || s.includes('1 s')) {
        return { int: '1h', display: '1 saatte' };
    }
    if (s.includes('4 saat')) {
        return { int: '4h', display: '4 saatte' };
    }
    if (s.includes('günlük') || s.includes('24 saat')) {
        return { int: '1d', display: '24 saatte' };
    }
    if (s.includes('haftalık') || s.includes('1 hafta')) {
        return { int: '1w', display: 'haftada' };
    }
    return null; 
}

// --- BİNANCE VERİ ÇEKME ---
async function getBinancePrice(symbolInput, timeFrame) {
    try {
        let s = symbolInput.replace(/[^A-Z0-9]/g, '');
        if (!s) s = "BTC";
        if (!s.endsWith("USDT") && !s.endsWith("TRY") && !s.endsWith("BTC")) {
            s += "USDT";
        }

        let price = "0";
        let change = "0";
        const finalSymbol = s.replace("USDT", "");

        if (timeFrame) {
            const klineRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${s}&interval=${timeFrame.int}&limit=1`);
            if (!klineRes.ok) return null;
            const data = await klineRes.json();
            
            if (data && data.length > 0) {
                const candle = data[0];
                const openPrice = parseFloat(candle[1]);
                const closePrice = parseFloat(candle[4]);
                price = closePrice < 1 ? closePrice.toPrecision(4) : closePrice.toFixed(2);
                change = (((closePrice - openPrice) / openPrice) * 100).toFixed(2);
            }
        } else {
            const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`);
            if (!res.ok) return null;
            const d = await res.json();
            price = parseFloat(d.lastPrice) < 1 ? parseFloat(d.lastPrice).toPrecision(4) : parseFloat(d.lastPrice).toFixed(2);
            change = parseFloat(d.priceChangePercent).toFixed(2);
        }
        
        return { symbol: finalSymbol, price, change };
    } catch (e) {
        console.error("Binance error:", e);
        return null;
    }
}

// --- FORMATLAYICILAR ---

// Yeni: SMS Formatlayıcı (Max 160 Karakter)
function formatCryptoSMS(text) {
    let clean = String(text || "").replace(/\r/g, "").replace(/\n/g, " ").trim();
    clean = clean.replace(/#\w+/g, ""); // Hashtag yok
    clean = clean.replace(/\*/g, ""); 
    clean = clean.replace(/\s+/g, " ");
    
    // 160 Karakterden uzunsa kes ve nokta koy
    if (clean.length > 160) {
        clean = clean.substring(0, 157) + "...";
    }
    return clean;
}

// Eski: Sosyal Medya (Korundu)
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

  title = smartTrim(title, 65);
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
