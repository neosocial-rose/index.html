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
    const platform = String(body.platform || "youtube");

    if (!topic) return res.status(400).json({ error: "topic empty" });

    let prompt = "";
    let generationTemp = 0.5; // Varsayılan sıcaklık
    
    // ============================================================
    // 1. KRİPTO VE FİNANS MODÜLÜ (STRICT / KATI MOD)
    // ============================================================
    if (platform === 'crypto' || platform === 'finance') {
        generationTemp = 0.1; // KRİTİK: Yaratıcılığı öldür, sadece veriyi işle.

        const symbol = topic.split(' ')[0].toUpperCase();
        const timeFrame = detectTimeFrame(topic);
        
        // Binance verisi çek
        const coinData = await getBinancePrice(symbol, timeFrame);

        if (coinData) {
            const periodLabel = timeFrame ? timeFrame.label : "son 24 saat";
            const changeSign = parseFloat(coinData.change) > 0 ? "+" : ""; // Artı işareti ekle
            
            // AI Sadece bir "Template Filler" (Şablon Doldurucu) olarak çalışacak.
            prompt = `
            GÖREV: Sen bir veritabanı botusun. Yorum yapma. Sohbet etme. Sadece sana verilen şablonu doldur.
            
            VERİLER:
            SYMBOL: ${coinData.symbol}
            SÜRE: ${periodLabel}
            DEĞİŞİM: ${changeSign}%${coinData.change}
            FİYAT: $${coinData.price}
            
            ŞABLON:
            "${coinData.symbol}, [SÜRE] içinde [DEĞİŞİM] ile [FİYAT] oldu. Kısa vadeli veriler yüksek oynaklık içerir; yatırım kararı için tek başına yeterli değildir, dikkatli olun."

            KURALLAR:
            1. Şablondaki köşeli parantezli alanları VERİLER kısmındaki bilgilerle değiştir.
            2. Başka HİÇBİR kelime, emoji veya hashtag ekleme.
            3. Metin 160 karakteri asla geçmemeli.
            `;
        } else {
            // Veri çekilemezse güvenli mod
            prompt = `GÖREV: "${symbol}" için veri alınamadı. Sadece şunu yaz: "${symbol} için anlık borsa verisine ulaşılamadı. Lütfen sembolü kontrol edip tekrar deneyin."`;
        }

    } else {
        // ============================================================
        // 2. SOSYAL MEDYA (VİRAL MOD - Değişiklik Yok)
        // ============================================================
        const randomSeed = Math.floor(Math.random() * 1000);
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
        // Kripto modunda Google Search'e gerek yok, veriyi biz veriyoruz.
        // Sadece sosyal medya için search aracı açık kalsın.
        tools: (platform === 'crypto' || platform === 'finance') ? [] : [{ google_search: {} }],
        generationConfig: {
          temperature: generationTemp, 
          maxOutputTokens: 100, // Kripto için kısa cevap zorla
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
    
    // --- ÇIKTI FORMATLAMA (SON KONTROL) ---
    let finalOutput = "";
    if (platform === 'crypto' || platform === 'finance') {
        // 1. Temizle
        finalOutput = formatCryptoAnalysis(out);
        // 2. Zorla Kes (SMS Limiti)
        if (finalOutput.length > 160) {
            finalOutput = finalOutput.slice(0, 157) + "...";
        }
    } else {
        finalOutput = enforceTwoLinesMax(out);
    }

    return res.status(200).json({ text: finalOutput });

  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e) });
  }
}

// --- ZAMAN ARALIĞI TESPİT (Geliştirilmiş) ---
function detectTimeFrame(str) {
    const s = str.toLowerCase();
    
    // Kısa Vade (Öncelikli)
    if (s.includes('15 dk') || s.includes('15 dakika') || s.includes('çeyrek')) {
        return { int: '15m', label: 'son 15 dakikada' };
    }
    if (s.includes('30 dk') || s.includes('30 dakika') || s.includes('yarım saat')) {
        return { int: '30m', label: 'son 30 dakikada' };
    }
    
    // Orta Vade
    if (s.includes('1 saat') || s.includes('saatlik')) {
        return { int: '1h', label: 'son 1 saatte' };
    }
    if (s.includes('4 saat')) {
        return { int: '4h', label: 'son 4 saatte' };
    }
    
    // Uzun Vade
    if (s.includes('günlük') || s.includes('24 saat') || s.includes('bugün')) {
        return { int: '1d', label: 'son 24 saatte' }; // Kline yerine ticker kullanılacak ama label bu.
    }
    
    return null; // Null dönerse varsayılan 24h ticker çalışır.
}

// --- BİNANCE VERİ ÇEKME (Open/Close Hesabı) ---
async function getBinancePrice(symbolInput, timeFrame) {
    try {
        // Sembol temizliği (ETH -> ETHUSDT)
        let s = symbolInput.replace(/[^A-Z0-9]/g, '');
        // Yaygın hataları düzelt veya varsayılan ata
        if (!s || s.length < 2) return null; 
        
        // Türk Lirası veya USDT kontrolü
        if (!s.endsWith("TRY") && !s.endsWith("USDT") && !s.endsWith("BTC") && !s.endsWith("BNB")) {
            s += "USDT";
        }

        const finalSymbol = s.replace("USDT", "").replace("TRY", "");
        let price = "0";
        let change = "0";

        if (timeFrame && timeFrame.int !== '1d') {
            // KLINES (Mum verisi) - Belirtilen aralık için
            // limit=1 bize en son (şu anki) mumu verir.
            const klineRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${s}&interval=${timeFrame.int}&limit=1`);
            
            if (!klineRes.ok) throw new Error("Binance Kline Error");
            
            const data = await klineRes.json();
            if (data && data.length > 0) {
                const candle = data[0];
                const openPrice = parseFloat(candle[1]); // Açılış
                const closePrice = parseFloat(candle[4]); // O anki güncel fiyat (Kapanış henüz olmadı ama güncel bu)
                
                price = formatPrice(closePrice);
                // Yüzde değişimi hesapla: ((Son - İlk) / İlk) * 100
                change = (((closePrice - openPrice) / openPrice) * 100).toFixed(2);
            }
        } else {
            // VARSAYILAN (24 Saatlik Ticker)
            const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`);
            if (!res.ok) throw new Error("Binance Ticker Error");
            
            const d = await res.json();
            price = formatPrice(parseFloat(d.lastPrice));
            change = parseFloat(d.priceChangePercent).toFixed(2);
        }
        
        return { symbol: finalSymbol, price, change };
    } catch (e) {
        console.error("Binance data error:", e);
        return null;
    }
}

// Yardımcı: Fiyat formatlama (küsürat ayarı)
function formatPrice(val) {
    if (val < 1) return val.toPrecision(4);
    if (val < 10) return val.toFixed(3);
    return val.toFixed(2);
}

// --- FORMATLAYICILAR ---

function formatCryptoAnalysis(text) {
    let clean = String(text || "")
        .replace(/"/g, "") // Tırnak işaretlerini kaldır
        .replace(/\r/g, "")
        .replace(/\n/g, " ") // Satır sonlarını boşluğa çevir
        .replace(/#\w+/g, "") // Hashtagleri sil
        .replace(/\*/g, "") // Markdown'ı temizle
        .trim();
        
    // Eğer AI "Şablon:" gibi prefixler eklediyse temizle
    if (clean.toLowerCase().startsWith("şablon:")) {
        clean = clean.substring(7).trim();
    }
    return clean;
}

// Sosyal Medya için (Eski fonksiyon korundu)
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
