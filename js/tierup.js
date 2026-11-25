/*! 티어 승급 연출 (guide/ink-theme 의 .tu-* 스타일 사용) */
(function(){
  function show(fromId, toId) {
    const A = window.App, R = window.Rating, T = window.T;
    if (!A || !R || document.querySelector('.tu-bg')) return;
    const nm = id => { const t = R.TIERS.find(x => x.id === id); return t ? t.name : id; };
    const bg = document.createElement('div');
    bg.className = 'tu-bg';
    bg.innerHTML = `<div class="tu-card">
      <div class="tu-kicker">${T('티어가 올랐어요!')}</div>
      <div class="tu-embs">${A.emblem(fromId)}<span class="tu-arrow">→</span>${A.emblem(toId)}</div>
      <div class="tu-title tier-color-${toId}">${T('{0} 승급', nm(toId))}</div>
      <div class="tu-sub">${T('좋아요!')}</div>
      <button class="btn primary lg tu-ok" type="button">${T('확인')}</button></div>`;
    document.body.appendChild(bg);
    if (window.Fx) window.Fx.lift(bg.firstElementChild);
    bg.querySelector('.tu-ok').onclick = () => bg.remove();
  }
  window.TierUp = { show };
})();
