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
    
    // --- 1. KRİPTO VE FİNANS İÇİN ÖZEL AKIŞ (Mini Teknik Analiz) ---
    if (platform === 'crypto' || platform === 'finance') {
        const symbol = topic.split(' ')[0].toUpperCase(); // "BTC 15 dk" -> "BTC"
        const timeFrame = detectTimeFrame(topic); // Zaman aralığını bul
        
        // Binance'den mum (kline) veya ticker verisi çek
        const coinData = await getBinancePrice(symbol, timeFrame);

        if (coinData) {
            const periodLabel = timeFrame ? timeFrame.label : "Son 24 Saat";
            const direction = parseFloat(coinData.change) > 0 ? "Yükseliş Eğilimi" : "Düşüş Eğilimi";

            prompt = `
            Rol: Kıdemli Finansal Piyasa Analisti.
            Dil: ${lang}
            Konu: ${coinData.symbol} Teknik Analizi.
            
            CANLI PİYASA VERİSİ:
            - Fiyat: $${coinData.price}
            - Periyot: ${periodLabel}
            - Değişim: %${coinData.change}
            - Yön: ${direction}
            
            GÖREV:
            Yatırımcılar için 2-3 cümleden oluşan profesyonel, kısa bir teknik analiz özeti yaz.
            
            KESİN KURALLAR:
            1. ASLA HASHTAG (#BTC vb.) KULLANMA.
            2. ASLA "Uçtu, fırladı, aya gidiyor" gibi amatör tabirler kullanma.
            3. Bunun yerine "Direnci test ediyor", "Satış baskısı hakim", "Hacimli kırılım", "Konsolidasyon süreci" gibi FİNANSAL JARGON kullan.
            4. Metin içinde fiyattan ($${coinData.price}) ve değişim oranından (%${coinData.change}) mutlaka bahset.
            5. Maksimum 200 karakter (yaklaşık 2 cümle).
            
            Örnek Çıktı Formatı:
            Bitcoin son 15 dakikada %0.45 değer kazanarak 98.200$ seviyesindeki ara direnci test ediyor. Alıcıların bu seviyeyi koruması kısa vadeli trendin devamı için kritik.
            `;
        } else {
            // Veri çekilemezse fallback
            prompt = `Rol: Finans Analisti. "${topic}" hakkında 2 cümlelik genel piyasa yorumu yap. Hashtag kullanma.`;
        }

    } else {
        // --- 2. DİĞER PLATFORMLAR (YouTube, Insta, TikTok) İÇİN VİRAL AKIŞ ---
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
          temperature: 0.7, // Analiz için yaratıcılığı biraz kıstık (daha tutarlı olması için)
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
    
    // --- ÇIKTI FORMATLAMA (PLATFORMA GÖRE AYRILDI) ---
    let finalOutput = "";
    if (platform === 'crypto' || platform === 'finance') {
        // Kripto için analiz formatı (Hashtag yok, cümle var)
        finalOutput = formatCryptoAnalysis(out);
    } else {
        // Sosyal medya için başlık + hashtag formatı
        finalOutput = enforceTwoLinesMax(out);
    }

    return res.status(200).json({ text: finalOutput });

  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e) });
  }
}

// --- YARDIMCI: ZAMAN ARALIĞI TESPİT ---
function detectTimeFrame(str) {
    const s = str.toLowerCase();
    // Binance API kodları: 15m, 30m, 1h, 4h, 1d, 1w
    if (s.includes('15 dk') || s.includes('15 dakika') || s.includes('çeyrek')) return { int: '15m', label: 'son 15 dakikada' };
    if (s.includes('30 dk') || s.includes('30 dakika') || s.includes('yarım saat')) return { int: '30m', label: 'son 30 dakikada' };
    if (s.includes('1 saat') || s.includes('saatlik')) return { int: '1h', label: 'son 1 saatte' };
    if (s.includes('4 saat')) return { int: '4h', label: 'son 4 saatte' };
    if (s.includes('günlük') || s.includes('24 saat')) return { int: '1d', label: 'son 24 saatte' };
    if (s.includes('haftalık')) return { int: '1w', label: 'bu hafta' };
    return null; 
}

// --- YARDIMCI: BİNANCE VERİ ÇEKME (TICKER & KLINES) ---
async function getBinancePrice(symbolInput, timeFrame) {
    try {
        let s = symbolInput.replace(/[^A-Z0-9]/g, '');
        if (!s) s = "BTC";
        if (!s.endsWith("USDT") && !s.endsWith("TRY")) s += "USDT";

        let price = "0";
        let change = "0";
        const finalSymbol = s.replace("USDT", "");

        if (timeFrame) {
            // ÖZEL ZAMAN ARALIĞI: Mum (Kline) Verisi Çek
            // limit=1 son mumu getirir (henüz kapanmamış olabilir), limit=2 son kapananı garantiler.
            // Burada anlık durumu istediğimiz için son mumu alıyoruz.
            const klineRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${s}&interval=${timeFrame.int}&limit=1`);
            if (!klineRes.ok) return null;
            const data = await klineRes.json();
            
            if (data && data.length > 0) {
                const candle = data[0];
                const openPrice = parseFloat(candle[1]); // Açılış
                const currentPrice = parseFloat(candle[4]); // O anki fiyat (Kapanış)
                
                price = currentPrice < 1 ? currentPrice.toPrecision(4) : currentPrice.toFixed(2);
                // Yüzdelik hesapla
                change = (((currentPrice - openPrice) / openPrice) * 100).toFixed(2);
            }
        } else {
            // VARSAYILAN: 24 Saatlik Ticker
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

// --- YENİ: KRİPTO ANALİZ FORMATLAYICI ---
function formatCryptoAnalysis(text) {
    // 1. Gereksiz satır başlarını ve boşlukları temizle
    let clean = String(text || "").replace(/\r/g, "").replace(/\n/g, " ").trim();
    
    // 2. Hashtag'leri temizle (Prompt yasaklasa da AI bazen ekleyebilir, biz silelim)
    clean = clean.replace(/#\w+/g, "").trim();
    
    // 3. Çift boşlukları teke indir
    clean = clean.replace(/\s+/g, " ");
    
    // 4. Uzunluk kontrolü (Max 220 karaktere izin verelim, cümle bölünmesin diye)
    if (clean.length > 220) {
        // Son noktadan kesmeye çalış
        const cutIndex = clean.lastIndexOf(".", 220);
        if (cutIndex > 50) {
            clean = clean.substring(0, cutIndex + 1);
        } else {
            // Nokta yoksa sert kes
            clean = clean.substring(0, 217) + "...";
        }
    }
    return clean;
}

// --- ESKİ: SOSYAL MEDYA FORMATLAYICI (Aynen kaldı) ---
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
