export default async function handler(req, res) {
  // CORS headers ekle
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  // OPTIONS request için
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Sadece POST desteklenir" });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  
  if (!GEMINI_KEY) {
    console.error("❌ GEMINI_API_KEY bulunamadı!");
    return res.status(500).json({ 
      error: "API anahtarı yapılandırılmamış. Lütfen Vercel Environment Variables kontrol edin." 
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const topic = String(body.topic || "").trim();
    const lang = String(body.lang || "tr");
    const platform = String(body.platform || "youtube");

    if (!topic) {
      return res.status(400).json({ error: "Konu boş olamaz" });
    }

    console.log("✅ İstek alındı:", { topic, platform, lang });

    // RASTGELE ÇEŞİTLİLİK İÇİN
    const randomSeed = Math.floor(Math.random() * 10000);

    const prompt = `Sen viral sosyal medya içerik uzmanısın. İnternetten "${topic}" konusundaki EN GÜNCEL trend ve gelişmeleri araştır.

⚠️ KRİTİK: Her seferinde FARKLI bir başlık üret. İnternetteki GÜNCEL trendleri kullan.

SADECE 2 SATIR YAZ. HİÇBİR AÇIKLAMA YAPMA.

KURAL 1 - BAŞLIK (1. satır):
- "${topic}" konusuna DOĞRUDAN değin
- İnternetten güncel bilgi al ve kullan
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
5. Zaman bazlı: "${topic} 2026'da Nasıl Değişti? 📊"
6. Gizli bilgi: "${topic} Profesyonellerinin 5 Sırrı 🤫"
7. Trend odaklı: "Viral Olan ${topic} Trendi! 🚀"

KURAL 2 - HASHTAG (2. satır):
- "${topic}" ile alakalı GÜNCEL ve TREND hashtag'ler
- İnternetten popüler hashtag'leri araştır
- Her seferinde değişik kombinasyon
- 3-5 kısa hashtag
- Max 40 karakter

YASAK:
❌ Tekrar eden başlıklar
❌ "Kimse bilmiyor", "Şok", "Gerçek" (aşırı kullanılmış kelimeler)
❌ Konu dışı içerik

Random Seed: ${randomSeed} (farklılık için)

ŞİMDİ "${topic}" İÇİN GÜNCEL VE ORİJİNAL İÇERİK YAZ (SADECE 2 SATIR):

1. satır: Başlık (max 60 karakter)
2. satır: Hashtag (max 40 karakter)`;

    // STABİL MODEL KULLAN
    const model = "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

    console.log("📡 Gemini API'ye istek gönderiliyor...");

    const apiResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // ✅ İNTERNET ARAŞTIRMASI (opsiyonel - bazen sorun çıkarabilir)
        // tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 200
        }
      })
    });

    const responseText = await apiResponse.text();
    console.log("📥 Gemini yanıt aldı, status:", apiResponse.status);

    let data = {};
    try { 
      data = JSON.parse(responseText); 
    } catch (parseError) {
      console.error("❌ JSON parse hatası:", parseError);
      console.error("Response text:", responseText.slice(0, 200));
      return res.status(500).json({ 
        error: "Gemini yanıtı parse edilemedi",
        detail: responseText.slice(0, 200)
      });
    }

    if (!apiResponse.ok) {
      console.error("❌ Gemini API hatası:", data);
      return res.status(500).json({ 
        error: "Gemini API hatası", 
        detail: data?.error?.message || responseText.slice(0, 200) 
      });
    }

    const generatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    if (!generatedText) {
      console.error("❌ Boş yanıt:", data);
      return res.status(500).json({ 
        error: "Gemini boş yanıt döndü",
        detail: JSON.stringify(data).slice(0, 200)
      });
    }

    console.log("✅ İçerik üretildi:", generatedText.slice(0, 50) + "...");

    const processedText = enforceTwoLinesMax(generatedText);

    return res.status(200).json({ text: processedText });

  } catch (e) {
    console.error("💥 Server hatası:", e);
    return res.status(500).json({ 
      error: "Sunucu hatası", 
      detail: String(e.message || e).slice(0, 200) 
    });
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
  if (!tags) tags = "#viral #trending";

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
