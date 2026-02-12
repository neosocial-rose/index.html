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

    // RASTGELE ÇEŞİTLİLİK İÇİN
    const randomSeed = Math.floor(Math.random() * 1000);

    // GÜNCELLEME 1: Prompt'a internet araştırması emri eklendi
    const prompt =
`Sen viral sosyal medya içerik uzmanısın. 

GÖREV: Önce "${topic}" konusuyla ilgili internetteki EN GÜNCEL ve TREND gelişmeleri araştır. Sonra bu güncel bilgilere dayanarak ORİJİNAL bir başlık yaz.

⚠️ KRİTİK: Her seferinde FARKLI bir başlık üret. Tekrar etme!

SADECE 2 SATIR YAZ. HİÇBİR AÇIKLAMA YAPMA.

KURAL 1 - BAŞLIK (1. satır):
- "${topic}" konusuna DOĞRUDAN değin
- FARKLI açılardan yaklaş (zaman, sonuç, süreç, problem, çözüm)
- Sayı kullan: 3, 5, 7, 10, 30 (farklı rakamlar dene)
- Güçlü kelime varyasyonu kullan:
  * Sır, Taktik, Yöntem, Teknik, Strateji
  * Püf Noktası, İpucu, Formül, Sistem, Adım
  * Hile, Kural, Detay, Özellik, Fark
- 1-2 emoji (farklı kombinasyonlar)
- Max 60 karakter

ÇEŞİTLİ BAŞLIK YAPILARI (BUNLARDAN BİRİNİ SEÇ):
1. Sonuç odaklı: "30 Günde ${topic} Ustası Ol: 5 Adım 🔥"
2. Problem çözme: "${topic}'te Yapılan 3 Büyük Yanlış ❌"
3. Hızlı sonuç: "${topic} İçin 10 Dakikalık Formül ⚡"
4. Karşılaştırma: "Amatör vs Pro: ${topic}'te 7 Fark 🎯"
5. Zaman bazlı: "${topic} 2024'te Nasıl Değişti? 📊"
6. Gizli bilgi: "${topic} Profesyonellerinin 5 Sırrı 🤫"

KURAL 2 - HASHTAG (2. satır):
- "${topic}" ile alakalı FARKLI hashtag'ler
- Her seferinde değişik kombinasyon
- 3-5 kısa hashtag
- Max 40 karakter

YASAK:
❌ Tekrar eden başlıklar
❌ "Kimse bilmiyor", "Şok", "Gerçek", "Hata", "Bitiriyor"
❌ Konu dışı içerik

Random Seed: ${randomSeed} (farklılık için)

ŞİMDİ "${topic}" İÇİN ORİJİNAL YAZ (SADECE 2 SATIR):

1. satır: Başlık
2. satır: Hashtag`;

    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // GÜNCELLEME 2: Google Search Grounding aracı eklendi
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.9,  // Daha fazla yaratıcılık
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
    // Veriyi temizle ve formatla
    const fixed = enforceTwoLinesMax(out);

    return res.status(200).json({ text: fixed });

  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e) });
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
