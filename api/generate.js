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
    // 1. KRİPTO VE FİNANS MODÜLÜ (RİSK ANALİZ & ŞABLON MODU)
    // ============================================================
    if (platform === 'crypto' || platform === 'finance') {
        const symbol = topic.split(' ')[0].toUpperCase(); // Örn: "ETH yarım saat" -> "ETH"
        const timeFrame = detectTimeFrame(topic); // Zaman aralığını algıla (15m, 30m, 1h...)
        
        // Binance'den veriyi çek (Mum/Kline verisi veya 24s Ticker)
        const coinData = await getBinancePrice(symbol, timeFrame);

        if (coinData) {
            const periodLabel = timeFrame ? timeFrame.label : "24 saatlik"; // Şablon için etiket (örn: "yarım saatlik")
            const periodDisplay = timeFrame ? timeFrame.display : "Son 24 saat"; // Bilgi cümlesi için (örn: "Son 30 dakika")

            // ZORUNLU RİSK METNİ ŞABLONU (Dinamik Verilerle)
            const mandatoryWarning = `Kripto para piyasaları, özellikle ${coinData.symbol} gibi varlıklar, ilk ${periodLabel} verilerde dahi önemli fiyat dalgalanmaları sergileyebilir. Yatırımcıların bu tür hızlı hareketlerin spekülatif doğasını ve yüksek risk potansiyelini göz önünde bulundurarak dikkatli olmaları kritik öneme sahiptir.`;

            prompt = `
            Rol: Kıdemli Finansal Risk Analisti.
            Dil: ${lang}
            
            VERİLER:
            - Varlık: ${coinData.symbol}
            - Fiyat: $${coinData.price}
            - Süre: ${periodDisplay}
            - Değişim: %${coinData.change}
            
            GÖREV:
            Aşağıdaki 2 kısımdan oluşan metni oluştur.
            
            KISIM 1 (Durum Özeti):
            "${coinData.symbol} (${coinData.symbol}), ${periodDisplay} içerisinde %${coinData.change} oranında bir değişimle $${coinData.price} seviyesinde işlem görüyor." cümlesine benzer, resmi ve net bir giriş cümlesi yaz.
            
            KISIM 2 (Zorunlu Uyarı):
            Hemen ardından şu metni KELİMESİ KELİMESİNE ekle:
            "${mandatoryWarning}"
            
            KURALLAR:
            - ASLA HASHTAG KULLANMA.
            - ASLA "Uçtu, kaçtı, fırsat" deme.
            - Kısım 1 ve Kısım 2'yi birleştirip tek bir paragraf olarak sun.
            `;
        } else {
            // Veri çekilemezse genel risk uyarısı
            prompt = `Rol: Kıdemli Risk Analisti. "${topic}" hakkında yatırımcıları kripto piyasalarının yüksek volatilitesi ve riskleri konusunda uyaran, hashtag içermeyen, soğukkanlı bir paragraf yaz.`;
        }

    } else {
        // ============================================================
        // 2. SOSYAL MEDYA (YOUTUBE, INSTA, TIKTOK) - VİRAL MOD
        // ============================================================
        // Burası aynen korundu, viral içerik üretmeye devam eder.
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
          temperature: 0.3, // Şablona sadık kalması için yaratıcılık iyice düşürüldü
          topP: 0.85,
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
        // Kripto için: Hashtag temizle, Markdown temizle
        finalOutput = formatCryptoAnalysis(out);
    } else {
        // Sosyal medya için: Başlık + Hashtag yapısını koru
        finalOutput = enforceTwoLinesMax(out);
    }

    return res.status(200).json({ text: finalOutput });

  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e) });
  }
}

// --- ZAMAN ARALIĞI TESPİT FONKSİYONU (Gramere Uygun Label ile) ---
function detectTimeFrame(str) {
    const s = str.toLowerCase();
    
    // label: Şablonun içine girecek (örn: "ilk [yarım saatlik] verilerde")
    // display: Bilgi cümlesinde görünecek (örn: "Son 30 dakikalık")

    if (s.includes('15 dk') || s.includes('15 dakika') || s.includes('çeyrek')) {
        return { int: '15m', label: '15 dakikalık', display: 'son 15 dakikalık' };
    }
    if (s.includes('30 dk') || s.includes('30 dakika') || s.includes('yarım saat')) {
        return { int: '30m', label: 'yarım saatlik', display: 'son 30 dakikalık' };
    }
    if (s.includes('1 saat') || s.includes('saatlik') || s.includes('1 s')) {
        return { int: '1h', label: 'bir saatlik', display: 'son 1 saatlik' };
    }
    if (s.includes('4 saat')) {
        return { int: '4h', label: '4 saatlik', display: 'son 4 saatlik' };
    }
    if (s.includes('günlük') || s.includes('24 saat')) {
        return { int: '1d', label: 'günlük', display: 'son 24 saatlik' };
    }
    if (s.includes('haftalık') || s.includes('1 hafta')) {
        return { int: '1w', label: 'haftalık', display: 'son 1 haftalık' };
    }
    
    return null; // Varsayılan
}

// --- BİNANCE VERİ ÇEKME FONKSİYONU ---
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
            // ÖZEL ZAMAN ARALIĞI (Klines/Mum Verisi)
            // limit=1 son mumu alır.
            const klineRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${s}&interval=${timeFrame.int}&limit=1`);
            
            if (!klineRes.ok) return null;

            const data = await klineRes.json();
            
            if (data && data.length > 0) {
                const candle = data[0];
                const openPrice = parseFloat(candle[1]);
                const closePrice = parseFloat(candle[4]);
                
                price = closePrice < 1 ? closePrice.toPrecision(4) : closePrice.toFixed(2);
                
                // Yüzdelik Değişim
                change = (((closePrice - openPrice) / openPrice) * 100).toFixed(2);
            }
        } else {
            // VARSAYILAN (24h Ticker Verisi)
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

// Yeni: Kripto metni temizleyici
function formatCryptoAnalysis(text) {
    let clean = String(text || "").replace(/\r/g, "").replace(/\n/g, " ").trim();
    clean = clean.replace(/#\w+/g, ""); // Hashtag'leri sil
    clean = clean.replace(/\*/g, ""); // Markdown sil
    clean = clean.replace(/\s+/g, " "); // Boşlukları düzelt
    return clean.trim();
}

// Eski: Sosyal Medya Formatlayıcı (Aynen korundu)
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
