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

    // --- KRİPTO ANALİZ AKIŞI ---
    if (platform === 'crypto' || platform === 'finance') {
      const symbol = extractCoinSymbol(topic);
      const coinData = await getBinanceData(symbol);

      let cryptoPrompt = "";
      if (coinData) {
        // VERİ VAR: Gemini'ye net ve rakamsal analiz yaptır
        cryptoPrompt = `
        Sen profesyonel bir borsa terminalisin. Dil: ${lang}.
        VERİ: ${coinData.symbol} Fiyat: $${coinData.price}, 24s Değişim: %${coinData.change}.
        GÖREV: Bu rakamları kullanarak tek bir cümlelik teknik analiz yaz.
        KURALLAR:
        - "Piyasa koşulları", "dikkatli olunmalı", "önem taşımaktadır" gibi boş lafları ASLA kullanma.
        - MUTLAKA Fiyatı ($${coinData.price}) ve Değişimi (%${coinData.change}) cümlenin içinde geçir.
        - Eğer %${coinData.change} pozitifse "direnci kırdı", "hacimli yükseliş" gibi terimler kullan.
        - Eğer %${coinData.change} negatifse "desteği test ediyor", "satış baskısı" gibi terimler kullan.
        - Maksimum 100 karakter. Hashtag kullanma.
        `;
      } else {
        // VERİ ÇEKİLEMEZSE: Profesyonelce durumu kurtar
        cryptoPrompt = `Konu: ${topic}. Kripto piyasasında volatilite artıyor, ${topic} için işlem hacimleri ve teknik seviyeler takip edilmeli. Hashtagsiz tek cümle yaz.`;
      }

      const out = await callGemini(GEMINI_KEY, cryptoPrompt, 0.2); // Düşük temperature ile daha stabil sonuç
      const cleanOutput = out.replace(/#/g, '').trim();
      return res.status(200).json({ text: smartTrim(cleanOutput, 100) });
    }

    // --- STANDART SOSYAL MEDYA AKIŞI (ORİJİNAL PROMPT) ---
    const standardPrompt = 
`Sen viral sosyal medya içerik uzmanısın. İNTERNETTEN "${topic}" konusundaki EN GÜNCEL trendleri araştır.
SADECE 2 SATIR YAZ. HİÇBİR AÇIKLAMA YAPMA.
KURAL 1 - BAŞLIK (1. satır):
- "${topic}" konusundaki GÜNCEL gelişmeleri kullan, sayı ve emoji ekle. Max 60 karakter.
KURAL 2 - HASHTAG (2. satır):
- 3-5 kısa hashtag. Max 40 karakter.
Random Seed: ${randomSeed}
1. satır: Başlık
2. satır: Hashtag`;

    const out = await callGemini(GEMINI_KEY, standardPrompt, 0.9);
    const fixed = enforceTwoLinesMax(out);

    return res.status(200).json({ text: fixed });

  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e) });
  }
}

// --- YARDIMCI FONKSİYONLAR ---

async function callGemini(key, prompt, temp = 0.7) {
  const model = "gemini-2.0-flash"; // Güncel model adı
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: temp, topP: 0.95 }
    })
  });

  if (!r.ok) return "İçerik üretiminde bir sorun oluştu.";
  const data = await r.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function getBinanceData(symbol) {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
    if (!res.ok) return null;
    const d = await res.json();
    return {
      symbol: symbol.replace("USDT", ""),
      price: parseFloat(d.lastPrice) < 1 ? parseFloat(d.lastPrice).toPrecision(4) : parseFloat(d.lastPrice).toFixed(2),
      change: parseFloat(d.priceChangePercent).toFixed(2)
    };
  } catch { return null; }
}

function extractCoinSymbol(text) {
  const mapping = { "BITCOIN": "BTC", "ETHEREUM": "ETH", "AVAX": "AVAX", "SOLANA": "SOL", "RIPPLE": "XRP" };
  const up = text.toUpperCase();
  for (let key in mapping) if (up.includes(key)) return mapping[key] + "USDT";
  let clean = up.split(' ')[0].replace(/[^A-Z0-9]/g, '');
  return (clean.length < 2 ? "BTC" : clean) + "USDT";
}

// --- ORİJİNAL FORMATLAMA FONKSİYONLARIN (EKSİKSİZ) ---

function enforceTwoLinesMax(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map(s => s.trim()).filter(Boolean);
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
