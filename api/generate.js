const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// Gemini API Key - .env dosyasından okunuyor
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Gelişmiş prompt şablonları - Orijinal ve SEO uyumlu içerik için
const PROMPTS = {
  youtube: {
    tr: `Sen 10 yıllık deneyimli bir viral YouTube içerik uzmanısın. MrBeast, Ali Abdaal gibi profesyonel YouTuber'ların başlık stratejilerini biliyorsun.

"${TOPIC}" konusu için PROFESYONEL, VİRAL POTANSİYELLİ bir başlık + hashtag üret.

🚫 ASLA KULLANMA:
❌ "Bu videoda" / "İzle ve öğren" / "Mutlaka izle"
❌ Çocukça ifadeler / Sıradan cümleler
❌ Genel hashtag'ler (#video #youtube #keşfet)
❌ 3. sınıf kompozisyon başlıkları

✅ MUTLAKA KULLAN:
✔️ Sayılar (7 Gizli, 3 Adım, 10 Dakika)
✔️ Güçlü kelimeler (Sır, Şok, Gerçek, Kanıtlandı, Keşfet)
✔️ Merak açığı yarat (ama clickbait YAPMA)
✔️ 1-2 emoji (aşırıya kaçma)
✔️ 3-5 KISA hashtag (viral potansiyelli)

⚠️ KRİTİK: TOPLAM UZUNLUK (başlık + hashtag + emoji) = MAKSIMUM 100 KARAKTER

BAŞLIK FORMÜLÜ:
[GÜÇLÜ HOOK] + [SAYISAL DEĞİŞİM] + [MERAK] + [EMOJİ]

ÖRNEK SEVİYE (100 KARAKTER İÇİNDE):
"Futbol IQ'nu 30 Günde 2X: 5 Gizli Teknik ⚡ #FutbolTaktik #ProAntrenman #Performans"
"Kripto'da 10K Kaybettim: 3 Ölümcül Hata 💸 #Kripto #Yatırım #Finance"

ŞİMDİ "${TOPIC}" İÇİN PROFESYONEL BAŞLIK ÜRET (100 KARAKTER MAX, tek satır):`,

    en: `You are an expert SEO strategist and viral content creator for YouTube.

TASK: Create a professional, attention-grabbing, and SEO-optimized YouTube video title + hashtag set for the topic: "${TOPIC}"

CRITICAL RULES:
✅ Title must be 100% ORIGINAL - no clichés
✅ Use numbers, emojis, and curiosity-triggering words
✅ Powerful phrases: "How to", "Why", "X Ways", "Discover"
✅ Add 3-5 SHORT trending hashtags
✅ Hashtags must be 100% relevant and have viral potential
✅ 1-2 emojis max

⚠️ CRITICAL: TOTAL LENGTH (title + hashtags + emojis) = MAXIMUM 100 CHARACTERS

FORMAT (single line):
[Title] #hashtag1 #hashtag2 #hashtag3

EXAMPLE (UNDER 100 CHARS):
"Ronaldo's Secret: 3 Speed Drills 🔥 #Soccer #Training #Pro"

NOW CREATE FOR "${TOPIC}" (100 CHARS MAX):`,
  },

  instagram: {
    tr: `Sen 1M+ takipçili influencer'ların başlık yazarısın. Gary Vee, Jay Shetty seviyesinde engagement alacak başlıklar yazıyorsun.

"${TOPIC}" için PROFESYONEL Instagram başlık + hashtag üret.

🚫 ASLA YAZMA:
❌ "#takipcikazan #keşfet #instagram" gibi çöp hashtag'ler
❌ "Arkadaşını etiketle" (organik değilse)
❌ Sahte motivasyon sözleri
❌ Lise günlüğü gibi cümleler

✅ MUTLAKA YAZ:
✔️ Hikaye anlat (kısa ama güçlü)
✔️ Duygusal bağ kur
✔️ SORU sor (engagement için)
✔️ 2-3 emoji (doğal yerlere koy)
✔️ 5-7 KISA hashtag (niche + trend)
✔️ Call-to-action

⚠️ KRİTİK: TOPLAM UZUNLUK (başlık + hashtag + emoji) = MAKSIMUM 100 KARAKTER

BAŞLIK FORMÜLÜ:
[HİKAYE] + [SORU] + [CTA]

PROFESYONEL SEVIYE ÖRNEKLER (100 KARAKTER MAX):
"6 ayda 15kg verdim. Hangi adımı deneyeceksin? 💪 #Diyet #Fitness #Sağlık #Motivasyon"
"Sabah 5'te kalkıyorum. Hayatım değişti. Sen? 🌅 #Sabah #Rutin #Motivasyon"

ŞİMDİ "${TOPIC}" İÇİN PROFESYONEL BAŞLIK YAZ (100 KARAKTER MAX, tek satır):`,

    en: `You are an expert Instagram growth strategist and engagement specialist.

TASK: Create an impactful, aesthetic, and high-engagement Instagram post caption + hashtag set for: "${TOPIC}"

CRITICAL RULES:
✅ Caption must create emotional connection and tell a story
✅ Use emojis but don't overdo it (max 2-3)
✅ Ask questions to encourage engagement
✅ Add 5-7 SHORT strategic hashtags (mix of niche + trending)
✅ Include call-to-action (comment, save, share)

⚠️ CRITICAL: TOTAL LENGTH (caption + hashtags + emojis) = MAXIMUM 100 CHARACTERS

FORMAT (single line):
[Caption] #hashtag1 #hashtag2 #hashtag3

EXAMPLE (UNDER 100 CHARS):
"Morning routine changed my life! Which step first? 🌅 #Morning #Routine #Growth"

NOW CREATE FOR "${TOPIC}" (100 CHARS MAX):`,
  },

  tiktok: {
    tr: `Sen 10M+ görüntüleme alan viral TikTok içerik uzmanısın. Khaby Lame, Zach King seviyesinde viral başlıklar yazıyorsun.

"${TOPIC}" için VİRAL TikTok başlık + hashtag üret.

🚫 ASLA YAZMA:
❌ Düz anlatım başlıkları
❌ "Takip et" (spam gibi)
❌ Eski trend hashtag'ler
❌ Boomer dili

✅ MUTLAKA YAZ:
✔️ POV, Storytime formatları
✔️ ŞOK faktörü (ilk 3 kelime)
✔️ Gen Z dili (doğal, enerjik)
✔️ 2-3 emoji (yerinde)
✔️ 4-6 KISA hashtag (#FYP + niche)

⚠️ KRİTİK: TOPLAM UZUNLUK (başlık + hashtag + emoji) = MAKSIMUM 100 KARAKTER

BAŞLIK FORMÜLÜ:
[POV/HOOK] + [ŞOK] + [EMOJİ]

VİRAL SEVİYE ÖRNEKLER (100 KARAKTER MAX):
"POV: Antrenörün seni yılın oyuncusu ilan etti ama dün başladın ⚡ #FYP #Futbol #Viral"
"Bunu yapınca herkes şoke oldu... 🔥 #FYP #TikTok #Trend #Viral"

ŞİMDİ "${TOPIC}" İÇİN VİRAL BAŞLIK YAZ (100 KARAKTER MAX, tek satır):`,

    en: `You are an expert TikTok content creator and algorithm specialist.

TASK: Create a TikTok algorithm-optimized, trending, FYP-worthy video caption + hashtag set for: "${TOPIC}"

CRITICAL RULES:
✅ Caption must be short, shocking, curiosity-inducing
✅ First 3 words must be a hook that stops scrolling
✅ Use emojis (natural in Gen Z language, 2-3 max)
✅ 4-6 SHORT viral-potential hashtags
✅ Include core hashtags like #FYP, #ForYou
✅ Use energetic, Gen Z-friendly language

⚠️ CRITICAL: TOTAL LENGTH (caption + hashtags + emojis) = MAXIMUM 100 CHARACTERS

FORMAT (single line):
[Caption] #hashtag1 #hashtag2 #hashtag3

EXAMPLE (UNDER 100 CHARS):
"POV: You shocked everyone at practice ⚡ #FYP #Soccer #Viral #Skills"

NOW CREATE FOR "${TOPIC}" (100 CHARS MAX):`,
  },

  x: {
    tr: `Sen Elon Musk, Naval Ravikant seviyesinde viral tweet yazan bir stratejistsin. Her tweet'in 10K+ engagement alıyor.

"${TOPIC}" için PROFESYONEL X (Twitter) tweet + hashtag üret.

🚫 ASLA YAZMA:
❌ "RT yapın" / "Beğenmeyi unutmayın"
❌ Clickbait linkler
❌ 10+ hashtag (spam)
❌ Sıradan düşünceler

✅ MUTLAKA YAZ:
✔️ TARTIŞMA BAŞLAT (controversial ama doğru)
✔️ DATA/SAYILAR kullan (%47, 3 yıl, 10K)
✔️ Akıllı gözlem / Ters köşe düşünce
✔️ 0-1 emoji (minimal)
✔️ 3-4 KISA hashtag (güçlü, alakalı)

⚠️ KRİTİK: TOPLAM UZUNLUK (tweet + hashtag + emoji) = MAKSIMUM 100 KARAKTER

TWEET FORMÜLÜ:
[GÜÇLÜ İDDİA] + [VERİ] + [SORU]

PROFESYONEL SEVİYE ÖRNEKLER (100 KARAKTER MAX):
"Data analiz yok = 5 yılda lig düşüş. Türkiye bunu kaç yılda anlayacak? #Futbol #Data"
"3 yıl kurs: ₺50K, 3 kelime. 90 gün AI: ₺0, akıcı. 🤔 #AI #Eğitim"

ŞİMDİ "${TOPIC}" İÇİN ZEKİ TWEET YAZ (100 KARAKTER MAX, tek satır):`,

    en: `You are an expert Twitter/X engagement strategist and viral content specialist.

TASK: Create a retweet-worthy, discussion-starting X (Twitter) tweet + hashtag set for: "${TOPIC}"

CRITICAL RULES:
✅ Tweet must be short, sharp, powerful
✅ First sentence must grab attention immediately
✅ Encourage discussion and debate
✅ Smart, thought-provoking, or witty tone
✅ 3-4 SHORT strategic hashtags
✅ Thread potential content
✅ Minimal emoji use (0-1)

⚠️ CRITICAL: TOTAL LENGTH (tweet + hashtags + emojis) = MAXIMUM 100 CHARACTERS

FORMAT (single line):
[Tweet] #hashtag1 #hashtag2 #hashtag3

EXAMPLE (UNDER 100 CHARS):
"AI boosts performance 47%. Sports science or less talent? 🤔 #Soccer #AI #Data"

NOW CREATE FOR "${TOPIC}" (100 CHARS MAX):`,
  }
};

// API Handler Function
async function generateContent(req, res) {
  try {
    const { topic, platform, lang } = req.body;

    // Validasyon
    if (!topic || !platform || !lang) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Prompt seçimi
    const promptTemplate = PROMPTS[platform][lang];
    if (!promptTemplate) {
      return res.status(400).json({ error: 'Invalid platform or language' });
    }

    // Gemini AI çağrısı
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = promptTemplate.replace(/\$\{TOPIC\}/g, topic);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Temiz output
    const cleanText = text
      .replace(/```/g, '')
      .replace(/\*\*/g, '')
      .replace(/\n+/g, ' ')
      .trim();

    return res.status(200).json({
      success: true,
      text: cleanText,
      platform,
      lang,
      topic
    });

  } catch (error) {
    console.error('Gemini API Error:', error);
    return res.status(500).json({
      error: 'Failed to generate content',
      message: error.message
    });
  }
}

module.exports = { generateContent };
