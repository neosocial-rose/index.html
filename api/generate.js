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

    // --- 1. ORİJİNAL PROMPT (VARSAYILAN) ---
    // (Burada 'const' yerine 'let' kullandık ki aşağıda değiştirebilelim)
    let prompt =
`Sen viral sosyal medya içerik uzmanısın. İNTERNETTEN "${topic}" konusundaki EN GÜNCEL trendleri araştır.

⚠️ KRİTİK: İnternetten güncel bilgi al ve FARKLI başlık üret!

SADECE 2 SATIR YAZ. HİÇBİR AÇIKLAMA YAPMA.

KURAL 1 - BAŞLIK (1. satır):
- "${topic}" konusundaki GÜNCEL gelişmeleri kullan
- İnternetten trend hashtag'leri araştır
- Sayı kullan: 3, 5, 7, 10, 30
- 1-2 emoji
- Max 60 karakter

KURAL 2 - HASHTAG (2. satır):
- İnternetten POPÜLER hashtag'leri bul
- 3-5 kısa hashtag
- Max 40 karakter

Random Seed: ${randomSeed}

ŞİMDİ "${topic}" İÇİN GÜNCEL İÇERİK YAZ (SADECE 2 SATIR):

1. satır: Başlık
2. satır: Hashtag`;

    // --- 2. YENİ EKLENEN: KRİPTO/FİNANS İSE GERÇEK VERİ ÇEK ---
    if (platform === 'crypto' || platform === 'finance') {
        const coinData = await getBinancePrice(topic);
        
        if (coinData) {
            const trendIcon = coinData.c > 0 ? "🚀" : "🔻";
            const trendText = coinData.c > 0 ? "YÜKSELİŞ" : "DÜŞÜŞ";
            
            // Gemini'ye GERÇEK veriyi veriyoruz ve yorumlatıyoruz
            prompt = `
            Rol: Kripto Para Analisti. Dil: ${lang}.
            
            GERÇEK BİNAS VERİLERİ (Şu an):
            - Coin: ${coinData.s}
            - Fiyat: $${coinData.p}
            - Değişim (24s): %${coinData.c}
            - Durum: ${trendText} ${trendIcon}

            GÖREV:
            Bu matematiksel verilere dayanarak yatırımcıyı heyecanlandıracak veya uyaracak MÜKEMMEL bir başlık at.

            KURALLAR:
            1. Satır: Başlık (Max 60 karakter). Mutlaka Fiyatı ($${coinData.p}) veya Değişimi (%${coinData.c}) metnin içinde kullan!
            2. Satır: İlgili 3 hashtag.
            
            Örnek Çıktı:
            ${coinData.s} $${coinData.p} Oldu! ${trendIcon} Sırada Ne Var?
            #${coinData.s} #Kripto #Analiz
            `;
        }
    }
    // --- EKLEME BİTTİ ---

    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // Kripto verisini biz elle verdiğimiz için google_search tool'unu sadece normal modda kullanabiliriz
        // ama burada açık kalması sorun yaratmaz, Gemini verdiğimiz veriyi öncelikler.
        tools: [{ google_search: {} }],
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

// --- YARDIMCI FONKSİYONLAR (EN ALTA EKLENDİ) ---

// 1. Binance'den Fiyat Çeken Basit Fonksiyon
async function getBinancePrice(userInput) {
    try {
        // Kullanıcı "Bitcoin analizi" yazsa bile içinden "BTC"yi bulmaya çalışır
        // Basitçe: İlk kelimeyi al, harf dışındakileri sil, USDT ekle.
        let symbol = String(userInput).split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '');
        
        // Eğer çok kısaysa (örn boşluk) varsayılan BTC olsun
        if (symbol.length < 2) symbol = "BTC";
        
        // Sonu USDT ile bitmiyorsa ekle (Binance pariteleri genelde BTCUSDT şeklindedir)
        if (!symbol.endsWith("USDT")) symbol += "USDT";

        const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
        if (!r.ok) return null; // Coin bulunamadıysa null dön (Eski sistem çalışsın)
        
        const d = await r.json();
        return {
            s: symbol.replace("USDT", ""), // Sadece Coin adı (BTC)
            p: parseFloat(d.lastPrice).toFixed(2), // Fiyat (98000.50)
            c: parseFloat(d.priceChangePercent).toFixed(2) // Yüzde değişim (-2.50)
        };
    } catch (e) {
        return null; // Hata olursa null dön
    }
}

// 2. Orijinal Metin Düzenleme Fonksiyonları (DOKUNULMADI)
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
