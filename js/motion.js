/*! © 2026 삼대710. 교실 내 비영리 사용 외 복제·수정·상업적 이용 금지 */
(function(){
  const on = () => !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  window.Fx = {
    RISE_MS: 340,
    on,
    shake(el) {
      if (!el || !on() || !el.animate) return;
      el.animate([
        { transform: 'translateX(0)' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(6px)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(0)' }
      ], { duration: 280, easing: 'ease-out' });
    },
    fade(el, from, to, ms = 160) {
      if (!el || !el.animate) return { cancel() {} };
      return el.animate([{ opacity: from }, { opacity: to }], { duration: ms, fill: 'forwards' });
    },
    out(els) {
      return (els || []).map(el => el && el.animate ? el.animate([
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(-6px)' }
      ], { duration: 160, fill: 'forwards' }) : { cancel() {} });
    },
    rise(els, elapsed = 0) {
      if (!on()) return;
      (els || []).forEach((el, i) => {
        if (!el || !el.animate) return;
        const delay = Math.max(0, i * 35 - elapsed);
        el.animate([
          { opacity: 0, transform: 'translateY(10px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ], { duration: 260, delay, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
      });
    },
    draw(rectEl, totalLen, ms = 220) {
      if (!rectEl || !on() || !rectEl.animate) return;
      rectEl.animate([
        { strokeDashoffset: totalLen },
        { strokeDashoffset: 0 }
      ], { duration: ms, easing: 'ease-out', fill: 'forwards' });
    },
    dim(el, ms = 250) {
      if (!el || !on() || !el.animate) return;
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, fill: 'forwards' });
    },
    lift(el) {
      if (!el || !on() || !el.animate) return;
      el.animate([
        { opacity: 0, transform: 'scale(.92) translateY(10px)' },
        { opacity: 1, transform: 'scale(1) translateY(0)' }
      ], { duration: 320, easing: 'cubic-bezier(.2,1.25,.4,1)', fill: 'both' });
    },
    settle(el, delay = 0) {
      if (!el || !on() || !el.animate) return;
      el.animate([
        { opacity: 0, transform: 'translateY(-8px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 360, delay, easing: 'ease-out', fill: 'both' });
    },
    stamp(sealEl, _cardEl, delay = 500) {
      if (!sealEl || !on() || !sealEl.animate) return;
      sealEl.animate([
        { opacity: 0, transform: 'scale(2.2) rotate(-18deg)' },
        { opacity: 1, transform: 'scale(.95) rotate(-6deg)', offset: 0.7 },
        { opacity: 1, transform: 'scale(1) rotate(-6deg)' }
      ], { duration: 320, delay, easing: 'cubic-bezier(.2,1.4,.4,1)', fill: 'both' });
    },
    seep(sealEl, delay = 600, ms = 400) {
      if (!sealEl || !on() || !sealEl.animate) return;
      sealEl.animate([
        { opacity: 0, transform: 'scale(1.08) rotate(-6deg)' },
        { opacity: 0.9, transform: 'scale(1) rotate(-6deg)' }
      ], { duration: ms, delay, easing: 'ease-out', fill: 'both' });
    },
    tween(ms, onStep, onDone) {
      if (!on() || ms <= 0) { onStep(1); onDone && onDone(); return; }
      const t0 = performance.now();
      const tick = now => {
        const p = Math.min(1, (now - t0) / ms);
        const eased = 1 - Math.pow(1 - p, 3);
        onStep(eased);
        if (p < 1) requestAnimationFrame(tick);
        else onDone && onDone();
      };
      requestAnimationFrame(tick);
    }
  };
})();
