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
    let finalPrompt = "";
    let isCryptoMode = false;

    // --- 1. SENARYO: KRİPTO ANALİZ (GERÇEK VERİ + TEKNİK YORUM) ---
    if (platform === 'crypto') {
      isCryptoMode = true;
      const symbol = extractCoinSymbol(topic);
      const coin = await getBinancePrice(symbol);

      if (coin) {
        finalPrompt = `
          ROL: Kıdemli Kripto Analisti. Dil: ${lang}.
          VERİ: ${coin.s} Fiyat: $${coin.p}, Değişim: %${coin.c}.
          GÖREV: Bu rakamları kullanarak tek bir cümlelik teknik rapor yaz.
          KURALLAR:
          - ASLA HASHTAG KULLANMA.
          - ASLA "yapay zekayım", "yatırım tavsiyesi değildir", "erişimim yok" deme.
          - Fiyatı ($${coin.p}) ve Değişimi (%${coin.c}) cümlenin içinde mutlaka kullan.
          - Yön %${coin.c} ise buna göre "Desteği test ediyor" veya "Direnci kırdı" de.
          - Maksimum 100 karakter.
        `;
      } else {
        finalPrompt = `Konu: ${topic}. Kripto piyasasında volatilite artıyor, teknik seviyeler ve hacim takibi kritik. Hashtagsiz tek cümle yaz.`;
      }
    } 

    // --- 2. SENARYO: FİNANS & BORSA (VİRAL BAŞLIK + HASHTAG) ---
    else if (platform === 'finance') {
      finalPrompt = `
        ROL: Viral Finans Editörü. Dil: ${lang}.
        KONU: ${topic}.
        GÖREV: Reklam geliri (TBM) yüksek kelimeler içeren, viral bir borsa başlığı ve hashtagleri üret.
        FORMAT:
        1. Satır: Başlık (Sayı ve emoji kullan, max 60 karakter)
        2. Satır: 3-5 adet popüler hashtag (#borsa #finans vb.)
      `;
    }

    // --- 3. SENARYO: DİĞER SOSYAL MEDYA KARTLARI ---
    else {
      finalPrompt = `
        ROL: Viral Sosyal Medya Uzmanı. Dil: ${lang}. Konu: ${topic}.
        İNTERNETTEN trendleri araştır ve şu formatta yaz:
        1. Satır: Başlık (Max 60 karakter)
        2. Satır: 3-5 Hashtag
        Seed: ${randomSeed}
      `;
    }

    // GEMINI ÇAĞRISI
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: finalPrompt }] }],
        tools: [{ google_search: {} }], // Trendler için search açık
        generationConfig: { 
          temperature: isCryptoMode ? 0.2 : 0.9, // Kriptoda daha ciddi, diğerlerinde daha viral
          topP: 0.95 
        }
      })
    });

    const data = await r.json();
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (isCryptoMode) {
      // Kriptoda hashtag temizliği ve tek satır kuralı
      const clean = out.replace(/#/g, '').split('\n')[0].trim();
      return res.status(200).json({ text: smartTrim(clean, 100) });
    } else {
      // Finans ve diğerlerinde 2 satır + hashtag kuralı
      const fixed = enforceTwoLinesMax(out);
      return res.status(200).json({ text: fixed });
    }

  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e) });
  }
}

// --- TÜM YARDIMCI FONKSİYONLAR (EKSİKSİZ) ---

async function getBinancePrice(symbol) {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
    if (!res.ok) return null;
    const d = await res.json();
    return {
      s: symbol.replace("USDT", ""),
      p: parseFloat(d.lastPrice) < 1 ? parseFloat(d.lastPrice).toPrecision(4) : parseFloat(d.lastPrice).toFixed(2),
      c: parseFloat(d.priceChangePercent).toFixed(2)
    };
  } catch { return null; }
}

function extractCoinSymbol(text) {
  const m = { "BITCOIN": "BTC", "ETHEREUM": "ETH", "AVAX": "AVAX", "SOLANA": "SOL", "RIPPLE": "XRP" };
  const up = text.toUpperCase();
  for (let k in m) if (up.includes(k)) return m[k] + "USDT";
  let c = up.split(' ')[0].replace(/[^A-Z0-9]/g, '');
  return (c.length < 2 ? "BTC" : c) + "USDT";
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

  title = smartTrim(title, 60);
  tags = normalizeTags(tags);
  tags = smartTrim(tags, 40);
  if (!tags) tags = "#viral #trend";

  return `${title}\n${tags}`;
}

function normalizeTags(s) {
  let t = String(s || "").trim();
  if (!t) return "";
  if (!t.startsWith("#")) t = "#" + t;
  return t.replace(/[，,;]+/g, " ").replace(/\s+/g, " ").trim();
}

function smartTrim(str, maxLen) {
  const arr = Array.from(String(str || ""));
  if (arr.length <= maxLen) return arr.join("").trim();
  const cut = arr.slice(0, maxLen).join("");
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > 0 ? cut.slice(0, lastSpace).trim() : cut.trim();
}
