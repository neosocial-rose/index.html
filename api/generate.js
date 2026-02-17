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
    // 1. KRİPTO VE FİNANS MODÜLÜ (RİSK ANALİZ MODU)
    // ============================================================
    if (platform === 'crypto' || platform === 'finance') {
        const symbol = topic.split(' ')[0].toUpperCase(); // Örn: "ETH yarım saat" -> "ETH"
        const timeFrame = detectTimeFrame(topic); // Zaman aralığını algıla (15m, 30m, 1h...)
        
        // Binance'den veriyi çek (Mum/Kline verisi veya 24s Ticker)
        const coinData = await getBinancePrice(symbol, timeFrame);

        if (coinData) {
            const periodLabel = timeFrame ? timeFrame.label : "Son 24 Saat";
            
            // RİSK YÖNETİMİ MANTIĞI:
            // Eğer süre 1 saat veya altındaysa (15m, 30m, 1h), ZORUNLU risk uyarısı ekle.
            let riskInstruction = "";
            const isShortTerm = timeFrame && ['15m', '30m', '1h'].includes(timeFrame.int);

            if (isShortTerm) {
                riskInstruction = `
                KRİTİK ZORUNLULUK: Analiz ettiğin süre (${periodLabel}) piyasa yönünü belirlemek için ÇOK KISADIR.
                Cümlenin sonuna mutlaka şu anlamı taşıyan bir uyarı ekle: "Bu kısa zaman dilimi yüksek volatilite (oynaklık) içerdiğinden, veriler tek başına trend teyidi için yeterli değildir ve risk barındırır."
                Yatırımcıyı asla heyecanlandırma, tam tersine sakinleştir ve uyar.
                `;
            } else {
                riskInstruction = "Piyasa yönü hakkında teknik seviyeleri (destek/direnç) belirterek, dengeli ve profesyonel bir yorum yap.";
            }

            prompt = `
            Rol: Kıdemli Finansal Risk Analisti.
            Dil: ${lang}
            Varlık: ${coinData.symbol}
            
            CANLI PİYASA VERİLERİ:
            - Anlık Fiyat: $${coinData.price}
            - İncelenen Süre: ${periodLabel}
            - Bu Süredeki Değişim: %${coinData.change}
            
            GÖREV:
            Yatırımcıyı bilgilendiren, soğukkanlı, mesafeli ve kurumsal bir piyasa bilgi notu yaz.
            
            KESİN KURALLAR:
            1. ASLA HASHTAG KULLANMA (#BTC vb. YASAK).
            2. ASLA "Uçtu, kaçtı, fırsat, fırladı, hemen al" gibi FOMO yaratan kelimeler kullanma.
            3. Varlığın adını, fiyatını ve değişim oranını cümlenin içinde geçir.
            4. ${riskInstruction}
            5. Maksimum 200 karakter (yaklaşık 1-2 cümle). Tek bir paragraf olsun.
            
            İSTENEN ÇIKTI TONU ÖRNEĞİ:
            "Ethereum, son 30 dakikalık periyotta %0.85 oranında değişimle 2.950$ seviyesinde işlem görüyor. Ancak yarım saatlik veriler yüksek volatilite barındırdığından, genel trendi teyit etmek için risklidir."
            `;
        } else {
            // Veri çekilemezse (Binance hatası veya coin yoksa)
            prompt = `Rol: Finansal Risk Uzmanı. "${topic}" hakkında yatırımcıları riskler konusunda uyaran, hashtag içermeyen, 2 cümlelik profesyonel bir genel piyasa yorumu yaz.`;
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
          temperature: 0.4, // Finansal analiz için yaratıcılığı kıstık (Daha ciddi olması için)
          topP: 0.90,
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
        // Kripto için: Hashtag temizle, Markdown temizle, temiz metin döndür
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

// --- ZAMAN ARALIĞI TESPİT FONKSİYONU ---
function detectTimeFrame(str) {
    const s = str.toLowerCase();
    
    // Kısa Vade (Risk Uyarısı Tetikleyecekler)
    if (s.includes('15 dk') || s.includes('15 dakika') || s.includes('çeyrek')) {
        return { int: '15m', label: 'son 15 dakikada' };
    }
    if (s.includes('30 dk') || s.includes('30 dakika') || s.includes('yarım saat')) {
        return { int: '30m', label: 'son 30 dakikada' };
    }
    if (s.includes('1 saat') || s.includes('saatlik') || s.includes('1 s')) {
        return { int: '1h', label: 'son 1 saatte' };
    }
    
    // Orta/Uzun Vade
    if (s.includes('4 saat')) {
        return { int: '4h', label: 'son 4 saatte' };
    }
    if (s.includes('günlük') || s.includes('24 saat')) {
        return { int: '1d', label: 'son 24 saatte' };
    }
    if (s.includes('haftalık') || s.includes('1 hafta')) {
        return { int: '1w', label: 'bu hafta' };
    }
    
    return null; // Varsayılan (24 saat Ticker)
}

// --- BİNANCE VERİ ÇEKME FONKSİYONU ---
async function getBinancePrice(symbolInput, timeFrame) {
    try {
        let s = symbolInput.replace(/[^A-Z0-9]/g, ''); // Sadece harf ve rakamları al
        if (!s) s = "BTC";
        
        // Çoğu coin USDT paritesindedir
        if (!s.endsWith("USDT") && !s.endsWith("TRY") && !s.endsWith("BTC")) {
            s += "USDT";
        }

        let price = "0";
        let change = "0";
        const finalSymbol = s.replace("USDT", "");

        if (timeFrame) {
            // ÖZEL ZAMAN ARALIĞI (Klines/Mum Verisi)
            // limit=1 son mumu getirir (anlık durumu görmek için)
            const klineRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${s}&interval=${timeFrame.int}&limit=1`);
            
            if (!klineRes.ok) return null; // Coin bulunamazsa null dön

            const data = await klineRes.json();
            
            // Binance Kline Formatı: [OpenTime, Open, High, Low, Close, Volume...]
            if (data && data.length > 0) {
                const candle = data[0];
                const openPrice = parseFloat(candle[1]); // Mum açılış fiyatı
                const closePrice = parseFloat(candle[4]); // Mum kapanış (güncel) fiyatı
                
                price = closePrice < 1 ? closePrice.toPrecision(4) : closePrice.toFixed(2);
                
                // Yüzdelik Değişim Formülü: ((Kapanış - Açılış) / Açılış) * 100
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

// Yeni: Kripto metni temizleyici (Hashtag'leri ve Markdown'ı siler)
function formatCryptoAnalysis(text) {
    let clean = String(text || "").replace(/\r/g, "").replace(/\n/g, " ").trim();
    clean = clean.replace(/#\w+/g, ""); // Hashtag'leri tamamen sil
    clean = clean.replace(/\*/g, ""); // Markdown yıldızlarını sil
    clean = clean.replace(/\s+/g, " "); // Fazla boşlukları düzelt
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
