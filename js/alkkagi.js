/*! 알까기: 물리 엔진 + 판(드래그로 튕기기) + AI
 *  - 판 좌표는 0~1 정사각형. 돌의 중심이 판 밖으로 나가면 탈락.
 *  - 물리 계산은 덧셈·곱셈·나눗셈·제곱근만 써서 어느 기기에서나 같은 결과가 나와요.
 *  - 쏜 사람의 결과(after)를 함께 저장해서, 다른 화면은 같은 장면을 재생한 뒤 저장된 위치로 맞춰요.
 */
(function(){
  const R = 0.029;            // 돌 반지름 (이전 0.042에서 약 30% 작게)
  const MAXV = 1.667;          // 가장 세게 쐈을 때 속도 (판 길이/초) — 1.755에서 5% 내림
  const FRICTION = 1.3;       // 마찰로 줄어드는 속도 (판 길이/초²) — 약해진 힘으로도 상대 알까지 닿게
  const REST = 0.55;           // 부딪힐 때 튕기는 정도 — 낮을수록 맞은 알이 덜 튕겨 나가요
  const DT = 1 / 240, MAX_STEPS = 240 * 9, REC_EVERY = 4;
  const r5 = v => Math.round(v * 1e5) / 1e5;
  // 게이지가 1%→100%→1% 한 바퀴 도는 시간(ms). 내 알이 적게 남을수록 느려져요 (지고 있는 쪽이 유리하게)
  const GAUGE_BY_LEFT = { 4: 800, 3: 800, 2: 1000, 1: 1200 };
  const gaugeMs = left => GAUGE_BY_LEFT[Math.max(1, Math.min(4, left))] || 1200;
  const AIM_MIN = 0.035;      // 방향을 정하는 데 필요한 최소 당김 거리

  function initial() {
    // 앞 절반 = 흑(선공, 아래쪽) / 뒤 절반 = 백(위쪽). 4개씩
    const xs = [.2, .4, .6, .8];
    return [...xs.map(x => [x, .8]), ...xs.map(x => [x, .2])].map(([x, y]) => ({ x, y, a: 1 }));
  }
  const colorOf = (i, n = 8) => i < n / 2 ? 1 : 2;   // n = 전체 알 수 (예전 3개씩 경기도 그대로 읽혀요)
  function posOf(moves) {
    const last = (moves || [])[(moves || []).length - 1];
    return last && last.after ? last.after.map(p => ({ x: p.x, y: p.y, a: p.a })) : initial();
  }
  const aliveCount = (pos, c) => pos.filter((p, i) => p.a && colorOf(i, pos.length) === c).length;

  // 한 번 튕기기: pos 는 바꾸지 않고 결과를 돌려줘요. record=true 면 그리기용 장면도 함께.
  function simulate(pos0, s, vx, vy, record) {
    const n = pos0.length, x = [], y = [], u = [], v = [], a = [];
    for (let i = 0; i < n; i++) { x[i] = pos0[i].x; y[i] = pos0[i].y; u[i] = 0; v[i] = 0; a[i] = pos0[i].a ? 1 : 0; }
    if (a[s]) { u[s] = vx; v[s] = vy; }
    const frames = record ? [] : null, hits = [];
    const snap = () => frames.push(x.map((_, i) => [x[i], y[i], a[i]]));
    if (record) snap();
    let step = 0;
    for (; step < MAX_STEPS; step++) {
      let moving = false;
      for (let i = 0; i < n; i++) {
        if (!a[i]) continue;
        const sp = Math.sqrt(u[i] * u[i] + v[i] * v[i]);
        if (sp > 0) {
          const ns = sp - FRICTION * DT;
          if (ns <= 0) { u[i] = 0; v[i] = 0; }
          else { const k = ns / sp; u[i] *= k; v[i] *= k; moving = true; }
          x[i] += u[i] * DT; y[i] += v[i] * DT;
        }
      }
      for (let i = 0; i < n; i++) {
        if (!a[i]) continue;
        for (let j = i + 1; j < n; j++) {
          if (!a[j]) continue;
          const dx = x[j] - x[i], dy = y[j] - y[i], d2 = dx * dx + dy * dy, md = 2 * R;
          if (d2 >= md * md || d2 === 0) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          const rel = (u[i] - u[j]) * nx + (v[i] - v[j]) * ny;
          if (rel > 0) {
            const jimp = (1 + REST) * rel / 2;
            u[i] -= jimp * nx; v[i] -= jimp * ny; u[j] += jimp * nx; v[j] += jimp * ny;
            if (record) hits.push(step);
            moving = true;
          }
          const push = (md - d) / 2;
          x[i] -= nx * push; y[i] -= ny * push; x[j] += nx * push; y[j] += ny * push;
        }
      }
      for (let i = 0; i < n; i++) {
        if (a[i] && (x[i] < 0 || x[i] > 1 || y[i] < 0 || y[i] > 1)) { a[i] = 0; u[i] = 0; v[i] = 0; }
      }
      if (record && step % REC_EVERY === 0) snap();
      if (!moving) break;
    }
    if (record) snap();
    const after = x.map((_, i) => ({ x: r5(x[i]), y: r5(y[i]), a: a[i] }));
    return { after, frames, hits, steps: step };
  }

  // ---- AI: 여러 후보 샷을 실제로 시뮬레이션해서 가장 좋은 걸 골라요 ----
  function pickShot(moves, level) {
    const pos = posOf(moves), me = (moves || []).length % 2 === 0 ? 1 : 2, op = 3 - me;
    const mine = pos.map((p, i) => i).filter(i => pos[i].a && colorOf(i, pos.length) === me);
    const theirs = pos.map((p, i) => i).filter(i => pos[i].a && colorOf(i, pos.length) !== me);
    if (!mine.length || !theirs.length) return null;
    const cfg = { easy: { pw: [.75, .9, 1], ang: [0], noise: .22 }, normal: { pw: [.7, .85, 1], ang: [-.04, 0, .04], noise: .12 }, hard: { pw: [.6, .75, .85, .95, 1], ang: [-.09, -.05, -.02, 0, .02, .05, .09], noise: .05 } }[level] || null;
    const c = cfg || { pw: [.7, .85, 1], ang: [-.04, 0, .04], noise: .12 };
    let best = null;
    const pool = level === 'easy' ? [mine[(Math.random() * mine.length) | 0]] : mine;
    for (const s of pool) for (const t of theirs) {
      const dx = pos[t].x - pos[s].x, dy = pos[t].y - pos[s].y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      for (const da of c.ang) {
        const ca = 1 - da * da / 2, sa = da;            // 작은 각도 회전 (sin/cos 없이)
        const ux = (dx / d) * ca - (dy / d) * sa, uy = (dx / d) * sa + (dy / d) * ca;
        for (const pw of c.pw) {
          const vx = ux * pw * MAXV, vy = uy * pw * MAXV;
          const r = simulate(pos, s, vx, vy, false).after;
          const score = (aliveCount(pos, op) - aliveCount(r, op)) * 10 - (aliveCount(pos, me) - aliveCount(r, me)) * 13
            - Math.abs(r[s].x - .5) * 2 - Math.abs(r[s].y - .5) * 2;   // 내 돌은 가운데 쪽에 남을수록 좋아요
          if (!best || score > best.score) best = { s, vx, vy, score };
        }
      }
    }
    if (!best) return null;
    const nz = () => 1 + (Math.random() * 2 - 1) * c.noise;
    const ang = (Math.random() * 2 - 1) * c.noise * .6, ca = 1 - ang * ang / 2;
    const vx = (best.vx * ca - best.vy * ang) * nz(), vy = (best.vx * ang + best.vy * ca) * nz();
    return { s: best.s, vx: r5(vx), vy: r5(vy) };
  }

  // ---- 판 (기존 BoardView 와 같은 모양: set / destroy, onShot 으로 튕기기 전달) ----
  class BoardView {
    constructor(canvas, opts = {}) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.opts = opts;
      this.state = { moves: [], myColor: 0, canShoot: false, flip: false };
      this.pos = initial(); this.anim = null; this.aim = null; this.shownLen = 0;
      this._ro = new ResizeObserver(() => this.draw()); this._ro.observe(canvas);
      if (opts.interactive) {
        canvas.style.touchAction = 'none';
        this._down = e => this._onDown(e); this._move = e => this._onMove(e); this._up = e => this._onUp(e);
        canvas.addEventListener('pointerdown', this._down);
        canvas.addEventListener('pointermove', this._move);
        canvas.addEventListener('pointerup', this._up);
        canvas.addEventListener('pointercancel', this._up);
      }
      this.draw();
    }
    destroy() {
      this._ro && this._ro.disconnect();
      if (this._down) { const c = this.canvas; c.removeEventListener('pointerdown', this._down); c.removeEventListener('pointermove', this._move); c.removeEventListener('pointerup', this._up); c.removeEventListener('pointercancel', this._up); }
      if (this.anim) cancelAnimationFrame(this.anim.raf);
      if (this.aim) cancelAnimationFrame(this.aim.raf);
    }
    get busy() { return !!this.anim; }
    _geom() {
      const size = this.canvas.width, m = size * (this.opts.mini ? .05 : .07);
      return { size, m, S: size - 2 * m };
    }
    _toBoard(e) {
      const r = this.canvas.getBoundingClientRect(), { size, m, S } = this._geom();
      let bx = ((e.clientX - r.left) / r.width * size - m) / S, by = ((e.clientY - r.top) / r.height * size - m) / S;
      if (this.state.flip) { bx = 1 - bx; by = 1 - by; }
      return [bx, by];
    }
    _onDown(e) {
      if (!this.state.canShoot || this.anim) return;
      const [bx, by] = this._toBoard(e);
      let pick = -1, bd = (R * 1.6) * (R * 1.6);
      this.pos.forEach((p, i) => {
        if (!p.a || colorOf(i, this.pos.length) !== this.state.myColor) return;
        const d = (p.x - bx) ** 2 + (p.y - by) ** 2; if (d < bd) { bd = d; pick = i; }
      });
      if (pick < 0) return;
      this.canvas.setPointerCapture && this.canvas.setPointerCapture(e.pointerId);
      this.aim = { s: pick, px: bx, py: by, t0: performance.now(), ms: gaugeMs(aliveCount(this.pos, this.state.myColor)) };
      const loop = () => { if (!this.aim) return; this.draw(); this.aim.raf = requestAnimationFrame(loop); };   // 게이지가 계속 움직이게
      this.aim.raf = requestAnimationFrame(loop);
    }
    _onMove(e) { if (!this.aim) return; const [bx, by] = this._toBoard(e); this.aim.px = bx; this.aim.py = by; this.draw(); }
    // [변경] 타이밍 게이지: 누르고 있는 동안 파워가 1% → 100% → 1% 로 빠르게 왕복해요. 당긴 거리는 '방향'만 정해요.
    _gauge(now) {
      const ph = (((now ?? performance.now()) - this.aim.t0) % this.aim.ms) / this.aim.ms;
      const tri = ph < .5 ? ph * 2 : 2 - ph * 2;
      return Math.max(.01, Math.min(1, .01 + .99 * tri));
    }
    _shotFromAim(now) {
      const p = this.pos[this.aim.s], dx = p.x - this.aim.px, dy = p.y - this.aim.py, d = Math.sqrt(dx * dx + dy * dy);
      if (d < AIM_MIN) return null;                    // 방향을 정하려면 조금은 당겨야 해요
      const pw = this._gauge(now);
      return { s: this.aim.s, vx: r5(dx / d * pw * MAXV), vy: r5(dy / d * pw * MAXV), pw, ux: dx / d, uy: dy / d };
    }
    _onUp() {
      if (!this.aim) return;
      const shot = this._shotFromAim(performance.now()); cancelAnimationFrame(this.aim.raf); this.aim = null; this.draw();
      if (shot && this.opts.onShot) this.opts.onShot(shot.s, shot.vx, shot.vy);
    }
    set(n) {
      const prevLen = this.shownLen;
      Object.assign(this.state, n || {});
      const moves = this.state.moves || [];
      if (moves.length === prevLen + 1 && !this.opts.mini && moves[moves.length - 1] && moves[moves.length - 1].after) {
        const mv = moves[moves.length - 1], from = posOf(moves.slice(0, -1));
        this.shownLen = moves.length;
        this._play(from, mv);
      } else if (moves.length !== prevLen || !this.anim) {
        if (this.anim) { cancelAnimationFrame(this.anim.raf); this.anim = null; }
        this.shownLen = moves.length; this.pos = posOf(moves); this.draw();
      } else this.draw();
    }
    _play(from, mv) {
      if (this.anim) cancelAnimationFrame(this.anim.raf);
      const sim = simulate(from, mv.s, mv.vx, mv.vy, true), frames = sim.frames, t0 = performance.now();
      this.lastShot = mv.s;
      const tick = now => {
        const k = Math.max(0, Math.min(frames.length - 1, Math.floor((now - t0) / (1000 / 60))));   // 첫 프레임 시간이 시작보다 살짝 이를 수 있어요
        this.pos = frames[k].map(([x, y, a]) => ({ x, y, a }));
        this.draw();
        if (k < frames.length - 1) this.anim.raf = requestAnimationFrame(tick);
        else { this.anim = null; this.pos = posOf(this.state.moves); this.draw(); this.opts.onAnimEnd && this.opts.onAnimEnd(); }
      };
      this.anim = { raf: requestAnimationFrame(tick) };
    }
    draw() {
      const cv = this.canvas, ctx = this.ctx;
      const dpr = Math.min(2, window.devicePixelRatio || 1), size = Math.max(120, Math.round((cv.clientWidth || 300) * dpr));
      if (cv.width !== size || cv.height !== size) cv.width = cv.height = size;
      const { m, S } = this._geom(), fl = this.state.flip;
      const X = bx => m + (fl ? 1 - bx : bx) * S, Y = by => m + (fl ? 1 - by : by) * S;

      // 바닥(책상) + 판
      const tb = ctx.createLinearGradient(0, 0, size, size); tb.addColorStop(0, '#3d5a45'); tb.addColorStop(1, '#22342a');
      ctx.fillStyle = tb; ctx.fillRect(0, 0, size, size);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = m * .7; ctx.shadowOffsetY = m * .25;
      const VIC = window.StoneSkin && window.StoneSkin.theme(this.state.boardTheme);   // [추가] 승리의 바둑판 (내 화면에만)
      if (VIC) { ctx.fillStyle = '#000'; ctx.fillRect(m, m, S, S); ctx.restore(); VIC.bg(ctx, m, m, S, S); }
      else {
      const wd = ctx.createLinearGradient(m, m, m + S, m + S); wd.addColorStop(0, '#ecc683'); wd.addColorStop(.5, '#ddb168'); wd.addColorStop(1, '#c89448');
      ctx.fillStyle = wd; ctx.fillRect(m, m, S, S); ctx.restore();
      ctx.fillStyle = 'rgba(255,240,200,.35)'; ctx.fillRect(m, m, S, Math.max(2, S * .008)); ctx.fillRect(m, m, Math.max(2, S * .008), S);
      ctx.fillStyle = 'rgba(70,40,10,.35)'; ctx.fillRect(m, m + S - Math.max(2, S * .008), S, Math.max(2, S * .008)); ctx.fillRect(m + S - Math.max(2, S * .008), m, Math.max(2, S * .008), S);
      }
      // 바둑판 줄
      const g0 = .04, gs = (1 - 2 * g0) / 18;
      ctx.strokeStyle = VIC ? VIC.line : 'rgba(50,30,8,.55)'; ctx.lineWidth = Math.max(1, S * .0018);
      for (let i = 0; i < 19; i++) {
        const t = g0 + i * gs;
        ctx.beginPath(); ctx.moveTo(m + g0 * S, m + t * S); ctx.lineTo(m + (1 - g0) * S, m + t * S); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(m + t * S, m + g0 * S); ctx.lineTo(m + t * S, m + (1 - g0) * S); ctx.stroke();
      }
      ctx.fillStyle = VIC ? VIC.star : 'rgba(40,24,6,.8)';
      for (const a of [3, 9, 15]) for (const b of [3, 9, 15]) { ctx.beginPath(); ctx.arc(m + (g0 + a * gs) * S, m + (g0 + b * gs) * S, Math.max(1.5, S * .006), 0, Math.PI * 2); ctx.fill(); }

      // 조준선 (당긴 반대 방향으로 날아가요)
      if (this.aim && !this.opts.mini) {
        const shot = this._shotFromAim(), p = this.pos[this.aim.s];
        ctx.save();
        ctx.setLineDash([S * .012, S * .01]); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(1.5, S * .004);
        ctx.beginPath(); ctx.moveTo(X(p.x), Y(p.y)); ctx.lineTo(X(this.aim.px), Y(this.aim.py)); ctx.stroke();
        ctx.restore();
        const gpw = this._gauge();
        if (shot) {
          const len = .22, ux = shot.ux, uy = shot.uy;
          const ex = p.x + ux * len, ey = p.y + uy * len, col = gpw > .85 ? '#e0392b' : gpw > .5 ? '#f0a020' : '#2f9e55';
          ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(3, S * .012); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(X(p.x), Y(p.y)); ctx.lineTo(X(ex), Y(ey)); ctx.stroke();
          const hx = X(ex), hy = Y(ey), ang = Math.atan2(Y(ey) - Y(p.y), X(ex) - X(p.x)), hs = S * .035;
          ctx.beginPath(); ctx.moveTo(hx + Math.cos(ang) * hs, hy + Math.sin(ang) * hs);
          ctx.lineTo(hx + Math.cos(ang + 2.5) * hs, hy + Math.sin(ang + 2.5) * hs); ctx.lineTo(hx + Math.cos(ang - 2.5) * hs, hy + Math.sin(ang - 2.5) * hs); ctx.fill();
        }
        // 파워 게이지 (알 옆 세로 막대)
        const gx = X(p.x) + S * .07, gh = S * .2, gw = S * .028, gy = Y(p.y) - gh / 2;
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(gx - 2, gy - 2, gw + 4, gh + 4);
        const gg = ctx.createLinearGradient(0, gy + gh, 0, gy); gg.addColorStop(0, '#2f9e55'); gg.addColorStop(.55, '#f0a020'); gg.addColorStop(1, '#e0392b');
        ctx.fillStyle = gg; ctx.fillRect(gx, gy + gh * (1 - gpw), gw, gh * gpw);
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; ctx.strokeRect(gx, gy, gw, gh);
        ctx.font = `800 ${Math.max(11, S * .035)}px system-ui,sans-serif`; ctx.textAlign = 'center';
        ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 3;
        const lbl = shot ? Math.round(gpw * 100) + '%' : '방향을 정하세요';
        ctx.strokeText(lbl, X(p.x), Y(p.y) - S * .075); ctx.fillText(lbl, X(p.x), Y(p.y) - S * .075);
      }

      // 돌
      const rr = R * S;
      this.pos.forEach((p, i) => {
        if (!p.a) return;
        const cx = X(p.x), cy = Y(p.y), black = colorOf(i, this.pos.length) === 1;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = rr * .45; ctx.shadowOffsetX = rr * .12; ctx.shadowOffsetY = rr * .22;
        const sg = ctx.createRadialGradient(cx - rr * .35, cy - rr * .35, rr * .08, cx, cy, rr);
        if (black) { sg.addColorStop(0, '#77777d'); sg.addColorStop(.5, '#1d1d20'); sg.addColorStop(1, '#040405'); }
        else { sg.addColorStop(0, '#ffffff'); sg.addColorStop(.6, '#ece8df'); sg.addColorStop(1, '#b8b2a4'); }
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
        ctx.shadowColor = 'transparent';
        if (window.StoneSkin && this.state.skins) window.StoneSkin.draw(ctx, cx, cy, rr, black ? 1 : 2, this.state.skins[black ? 1 : 2]);   // [추가] 티어 스킨
        ctx.restore();
        const mineTurn = this.state.canShoot && !this.anim && colorOf(i, this.pos.length) === this.state.myColor && !this.opts.mini;
        if (mineTurn || (this.aim && this.aim.s === i)) {
          ctx.strokeStyle = this.aim && this.aim.s === i ? '#2563eb' : 'rgba(47,158,85,.9)'; ctx.lineWidth = Math.max(2, rr * .14);
          ctx.beginPath(); ctx.arc(cx, cy, rr * 1.2, 0, Math.PI * 2); ctx.stroke();
        } else if (this.lastShot === i && !this.opts.mini) {
          ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.arc(cx, cy, Math.max(2.5, rr * .18), 0, Math.PI * 2); ctx.fill();
        }
      });
    }
  }

  window.Alkkagi = { R, MAXV, gaugeMs, initial, colorOf, posOf, aliveCount, simulate, pickShot };
  window.AlkkagiBoardView = BoardView;
})();
