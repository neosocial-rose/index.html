const prompt =
`Sohbet etme. Açıklama yapma. SADECE 2 SATIR.

AMAÇ: Viral + SEO güçlü başlık üret.
KURAL:
- 1) Başlık: EN FAZLA 49 karakter (emoji dahil). 49'u GEÇME.
- 2) Hashtag: EN FAZLA 50 karakter (boşluk dahil). 50'yi GEÇME.
- Kelime bölme yok. Yarım kelime yok.

SEO KALİTE KURALLARI (ZORUNLU):
- Başlık jenerik olamaz (örn: "sırlar", "rehber" tek başına olmaz).
- Başlıkta en az 1 güçlü tetikleyici kullan:
  (ŞOK / 7 HATA / 3 TAKTİK / 1 DETAY / KİMSE BİLMİYOR)
- Başlıkta 1 anahtar kelime zorunlu:
  futbol / prodüksiyon / montaj / çekim / içerik (konuya göre seç)
- Başlık merak uyandırsın, net sonuç vaadi versin.
- TR ağırlıklı, gerekirse 1 kısa EN kelime eklenebilir (örn: "viral", "edit").

HASHTAG KURALLARI:
- Küçük harf tercih.
- 3–6 etiket üret (50 karaktere sığacak kadar).
- TR+EN karışık, niş etiket ekle (örn: #shorts #edit #reels).
- # ile başlasın, arası tek boşluk.

Dil: ${lang}
Platform: ${platform}
Tür: ${type}
Konu: ${topic}

FORMAT:
<başlık>
<hashtag>`;

