async function generateContent() {
  const topic = document.getElementById('modal-topic-input').value.trim();
  if (!topic) { notify(translate('notify_topic')); return; }
  if (state.credits[state.currentPlatform] <= 0) { notify(translate('notify_limit')); return; }

  const btn = document.getElementById('modal-gen-btn');
  const resultBox = document.getElementById('modal-result-box');
  const resultText = document.getElementById('modal-result-text');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> ' + (state.lang === 'tr' ? 'ÜRETİLİYOR...' : 'GENERATING...');

  try {
    // ✅ FRONTEND ARTIK KEY KULLANMIYOR: VERCEL /api/generate
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        lang: state.lang,
        platform: state.currentPlatform
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'API Error');

    let result = (data?.text || "").trim();
    // 2 satırı koru (başlık + hashtag)
    // güvenlik için en fazla 2 satır
    const lines = result.replace(/\r/g, "").split("\n").map(s => s.trim()).filter(Boolean);
    result = (lines[0] || "") + "\n" + (lines[1] || "");

    if (result && (lines[0] || lines[1])) {
      state.credits[state.currentPlatform]--;
      saveCredits();
      updateAllBadges();
      document.getElementById('modal-credit-badge').innerText = `${state.credits[state.currentPlatform]}/2`;

      resultText.innerText = result;

      // karakter sayacı (toplam)
      const totalLen = Array.from(result.replace("\n", " ")).length;
      document.getElementById('modal-char-count').innerText =
        `${totalLen}/120 ${state.lang === 'tr' ? 'karakter' : 'characters'}`;

      // SEO skorunu toplam metne göre hesapla (istersen sadece başlıkla da yaparsın)
      const seoScore = calculateSEO(result);
      const scoreBadge = document.getElementById('seo-score-badge');
      scoreBadge.innerText = `${seoScore}/100`;
      scoreBadge.className = `seo-badge ${getSEOClass(seoScore)}`;

      resultBox.classList.remove('hidden');
      notify(translate('notify_success'));
    } else {
      throw new Error('Empty response');
    }

  } catch (e) {
    console.error('Generation error:', e);
    notify(translate('notify_error'));
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span data-translate="generate_btn">${translate('generate_btn')}</span>`;
  }
}
