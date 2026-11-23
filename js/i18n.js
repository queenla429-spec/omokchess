/*! © 2026 삼대710. 교실 내 비영리 사용 외 복제·수정·상업적 이용 금지 */
(function(){
  const dict = {};
  let lang = 'ko';
  try {
    const saved = localStorage.getItem('omokLang');
    if (saved === 'en' || saved === 'ko') lang = saved;
  } catch {}

  function format(str, args) {
    return String(str).replace(/\{(\d+)\}/g, (_, i) => (args[i] !== undefined ? args[i] : `{${i}}`));
  }

  function T(str, ...args) {
    const base = (lang === 'en' && Object.prototype.hasOwnProperty.call(dict, str)) ? dict[str] : str;
    return args.length ? format(base, args) : base;
  }

  function apply(root = document) {
    document.documentElement.lang = lang;
    root.querySelectorAll('[data-t]').forEach(el => {
      if (!el.dataset.tOrig) el.dataset.tOrig = el.innerHTML;
      el.innerHTML = T(el.dataset.tOrig);
    });
    root.querySelectorAll('[data-t-ph]').forEach(el => {
      if (!el.dataset.tPhOrig) el.dataset.tPhOrig = el.getAttribute('placeholder') || '';
      el.setAttribute('placeholder', T(el.dataset.tPhOrig));
    });
    root.querySelectorAll('[data-t-title]').forEach(el => {
      if (!el.dataset.tTitleOrig) el.dataset.tTitleOrig = el.getAttribute('title') || '';
      el.setAttribute('title', T(el.dataset.tTitleOrig));
    });
    root.querySelectorAll('[data-t-value]').forEach(el => {
      if (!el.dataset.tValOrig) el.dataset.tValOrig = el.value || '';
      el.value = T(el.dataset.tValOrig);
    });
    root.querySelectorAll('[data-t-label]').forEach(el => {
      if (!el.dataset.tLblOrig) el.dataset.tLblOrig = el.getAttribute('aria-label') || '';
      el.setAttribute('aria-label', T(el.dataset.tLblOrig));
    });
    root.querySelectorAll('.lang-pick button[data-lang]').forEach(btn => {
      btn.classList.toggle('on', btn.dataset.lang === lang);
    });
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('.lang-pick button[data-lang]');
    if (!btn) return;
    I18N.set(btn.dataset.lang);
  });

  window.T = T;
  window.I18N = {
    get lang() { return lang; },
    add(map) { Object.assign(dict, map || {}); },
    apply,
    set(next) {
      if (next !== 'ko' && next !== 'en') return;
      try { localStorage.setItem('omokLang', next); } catch {}
      location.reload();
    }
  };
})();
