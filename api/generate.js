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
    
    // --- 1. VARSAYILAN PROMPT ---
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

    // --- 2. KRİPTO/FİNANS ANALİZ BÖLÜMÜ (SADECE BURASI GÜNCELLENDİ) ---
    if (platform === 'crypto' || platform === 'finance') {
        const symbol = topic.split(' ')[0].toUpperCase();
        const coinData = await getBinancePrice(symbol);
        if (coinData) {
            const trendText = parseFloat(coinData.change) > 0 ? "YÜKSELİŞ" : "DÜŞÜŞ";
            prompt = `
            Rol: Profesyonel Kripto Veri Analisti.
            Dil: ${lang}
            Konu: ${topic}
            Veri: ${coinData.symbol} $${coinData.price} (%${coinData.change} ${trendText})
            
            GÖREV:
            Google Arama ile son 24 saati tara. Bu fiyat hareketinin teknik nedenini bul ve analiz et.
            Viral dil kullanma, teknik veri odaklı konuş.
            
            KURALLAR:
            1. İlk satırda fiyatı, değişimi ve teknik durumu özetle.
            2. İkinci satırda sadece ilgili hashtagleri yaz.
            3. Toplam 2 satır.
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
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.7,
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

// --- TÜM YARDIMCI FONKSİYONLARIN ORİJİNAL HALİ ---
async function getBinancePrice(symbolInput) {
    try {
        let s = symbolInput.replace(/[^A-Z0-9]/g, '');
        if (!s) s = "BTC";
        if (!s.endsWith("USDT") && !s.endsWith("TRY")) {
            s += "USDT";
        }
        const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`);
        if (!res.ok) return null;
        const d = await res.json();
        return {
            symbol: s.replace("USDT", ""),
            price: parseFloat(d.lastPrice) < 1 ? parseFloat(d.lastPrice).toPrecision(4) : parseFloat(d.lastPrice).toFixed(2),
            change: parseFloat(d.priceChangePercent).toFixed(2)
        };
    } catch (e) {
        return null;
    }
}

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
  title = smartTrim(title, 60);
  tags = normalizeTags(tags);
  tags = smartTrim(tags, 40);
  if (!tags) tags = "#shorts";
  
  // SİLDİĞİM VE ŞİMDİ GERİ EKLEDİĞİM KRİTİK MANTIK:
  const total = Array.from(title).length + Array.from(tags).length + 1;
  if (total > 100) {
    const maxTagLen = 100 - Array.from(title).length - 1;
    if (maxTagLen > 10) {
      tags = smartTrim(tags, maxTagLen);
    } else {
      title = smartTrim(title, 50);
      tags = smartTrim(tags, 49);
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
