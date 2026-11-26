/*! 체스판 (기존 오목 BoardView와 같은 인터페이스: set / destroy / onTap)
 *  입체 나무 판 + 직접 그린 입체 기물(100×100 좌표로 그린 뒤 칸 크기에 맞춰 확대) */
(function(){
  const CR = window.ChessRules;

  // ---- 기물 모양 (100×100 기준, 아래쪽이 받침) ----
  const BASE = 'M22 84 C22 80 26 78 30 78 L70 78 C74 78 78 80 78 84 L80 90 C80 92 78 93 76 93 L24 93 C22 93 20 92 20 90 Z';
  const SHAPES = {
    p: {
      body: 'M37 78 C37 68 41 60 45 55 C40 53 38 50 38 47 C38 43 41 41 44 40 C40 37 38 33 38 29 C38 22 43 17 50 17 C57 17 62 22 62 29 C62 33 60 37 56 40 C59 41 62 43 62 47 C62 50 60 53 55 55 C59 60 63 68 63 78 Z',
      lines: ['M41 47 L59 47'], dots: []
    },
    r: {
      body: 'M30 18 L39 18 L39 25 L45 25 L45 18 L55 18 L55 25 L61 25 L61 18 L70 18 L70 32 L64 37 L64 64 L70 70 L70 78 L30 78 L30 70 L36 64 L36 37 L30 32 Z',
      lines: ['M30 32 L70 32', 'M36 37 L64 37', 'M36 64 L64 64', 'M44 46 L56 46', 'M50 46 L50 55', 'M42 55 L58 55'], dots: []
    },
    b: {
      body: 'M50 9 C53.5 9 56 11.5 56 14.5 C56 16.5 55 18 53.5 19 C61 24 67 33 66 43 C65.5 49 62 53 57 55 L59 58 L56 61 C59 66 62 72 63 78 L37 78 C38 72 41 66 44 61 L41 58 L43 55 C38 53 34.5 49 34 43 C33 33 39 24 46.5 19 C45 18 44 16.5 44 14.5 C44 11.5 46.5 9 50 9 Z',
      lines: ['M55 28 L46 40', 'M42 58 L58 58'], dots: []
    },
    n: {
      body: 'M33 78 C32 70 34 63 39 57 C43 52 47 49 48 45 C44 47 40 49 35 51 C31 52.5 27 53 24 51 C20 48.5 19.5 44 22 40 C25 35 30 30 33 25 C35 21 36.5 17 38 13 L41 19 L44 12 L49 17 C59 17 69 23 74 33 C79 43 79 56 75 66 C73.5 70.5 72 74.5 71 78 Z',
      lines: ['M49 17 C56 21 61 26 64 33', 'M54 18 C62 23 68 31 70 40', 'M60 20 C68 27 73 37 74 48', 'M33 46 C36 44 39 43 42 43'],
      dots: [[38, 30, 2.6], [25.5, 45, 1.6]]
    },
    q: {
      body: 'M24 26 L35 52 L38 22 L46 50 L50 18 L54 50 L62 22 L65 52 L76 26 L69 62 C67 64 66 66 66 68 L67 78 L33 78 L34 68 C34 66 33 64 31 62 Z',
      lines: ['M31 62 C43 58 57 58 69 62', 'M34 68 L66 68'],
      dots: [[24, 23, 4], [38, 19, 4], [50, 15, 4.3], [62, 19, 4], [76, 23, 4]]
    },
    k: {
      body: 'M46.5 6 L53.5 6 L53.5 12 L59 12 L59 18 L53.5 18 L53.5 25 C62 25 72 28 74 36 C76 44 70 52 65 60 C63.5 62.5 64 66 64.5 68 L66 78 L34 78 L35.5 68 C36 66 36.5 62.5 35 60 C30 52 24 44 26 36 C28 28 38 25 46.5 25 L46.5 18 L41 18 L41 12 L46.5 12 Z',
      lines: ['M35 60 C45 56 55 56 65 60', 'M35.5 68 L64.5 68', 'M50 25 L50 52'], dots: []
    }
  };
  const P2D = {};
  const path = d => P2D[d] || (P2D[d] = new Path2D(d));

  function drawPiece(ctx, type, color, cx, cy, cell, skin) {
    const sh = SHAPES[type]; if (!sh) return;
    const s = cell / 100 * 1.02;
    const white = color === 'w';
    ctx.save();
    ctx.translate(cx - 50 * s, cy - 50 * s);
    ctx.scale(s, s);
    // 바닥 그림자
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(52, 94, 33, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const g = ctx.createLinearGradient(20, 0, 80, 0);
    const vic = skin === 'victory';   // [추가] 승리의 기물: 백 = 연보라 진주, 흑 = 깊은 보라·파랑
    if (vic && white) { g.addColorStop(0, '#ffffff'); g.addColorStop(.5, '#e9e2ff'); g.addColorStop(1, '#a99be8'); }
    else if (vic) { g.addColorStop(0, '#7b6cff'); g.addColorStop(.45, '#3a2a9c'); g.addColorStop(1, '#0f0b33'); }
    else if (white) { g.addColorStop(0, '#ffffff'); g.addColorStop(.45, '#f4efe3'); g.addColorStop(1, '#bdb29a'); }
    else { g.addColorStop(0, '#6d6660'); g.addColorStop(.4, '#34302d'); g.addColorStop(1, '#0d0c0b'); }
    const outline = vic ? (white ? '#4a3a9a' : '#0b0827') : white ? '#3b3226' : '#050505';

    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 6; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;
    ctx.fillStyle = g;
    ctx.fill(path(BASE)); ctx.fill(path(sh.body));
    ctx.shadowColor = 'transparent';
    for (const [x, y, r] of sh.dots) if (r >= 4) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = outline; ctx.lineWidth = 2.6;
    ctx.stroke(path(BASE)); ctx.stroke(path(sh.body));
    for (const [x, y, r] of sh.dots) if (r >= 4) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }

    // 왼쪽 위 반짝임 (입체감)
    ctx.save();
    ctx.clip(path(sh.body));
    const hl = ctx.createLinearGradient(20, 10, 60, 60);
    hl.addColorStop(0, white ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.28)');
    hl.addColorStop(.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl; ctx.fillRect(0, 0, 100, 100);
    ctx.restore();

    // 세부 선 (갈기·눈·장식)
    ctx.strokeStyle = white ? 'rgba(59,50,38,.85)' : 'rgba(225,215,195,.75)';
    ctx.lineWidth = 1.8;
    for (const l of sh.lines) ctx.stroke(path(l));
    ctx.fillStyle = white ? '#2a231a' : '#e9e0cc';
    for (const [x, y, r] of sh.dots) if (r < 4) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    // 받침의 띠
    ctx.strokeStyle = white ? 'rgba(59,50,38,.55)' : 'rgba(225,215,195,.4)';
    ctx.beginPath(); ctx.moveTo(24, 85); ctx.lineTo(76, 85); ctx.stroke();
    if (skin && window.StoneSkin) window.StoneSkin.piece(ctx, skin, type, path(BASE), path(sh.body));   // [추가] 티어 스킨
    ctx.restore();
  }

  class BoardView {
    constructor(canvas, opts = {}) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.opts = opts;
      this.state = { moves: [], flip: false, sel: null, targets: [], ghost: null, danger: [], risky: [], hint: null };
      this._ro = new ResizeObserver(() => this.draw()); this._ro.observe(canvas);
      if (opts.interactive && opts.onTap) {
        this._f = e => {
          const r = canvas.getBoundingClientRect(), pad = this._pad(), span = 1 - pad * 2;
          let x = Math.floor(((e.clientX - r.left) / r.width - pad) / span * 8);
          let y = Math.floor(((e.clientY - r.top) / r.height - pad) / span * 8);
          if (x < 0 || x > 7 || y < 0 || y > 7) return;
          if (this.state.flip) { x = 7 - x; y = 7 - y; }
          opts.onTap(y * 8 + x);                      // 항상 a8=0 … h1=63
        };
        canvas.addEventListener('pointerup', this._f);
      }
      this.draw();
    }
    _pad() { return this.opts.mini ? 0.025 : 0.05; }
    set(n) { Object.assign(this.state, n || {}); this.draw(); }
    destroy() { this._ro && this._ro.disconnect(); this._f && this.canvas.removeEventListener('pointerup', this._f); }

    draw() {
      const { canvas: cv, ctx, opts, state: s } = this;
      const dpr = Math.min(2, window.devicePixelRatio || 1), size = Math.max(120, Math.round((cv.clientWidth || 300) * dpr));
      if (cv.width !== size || cv.height !== size) cv.width = cv.height = size;
      const pad = size * this._pad(), cell = (size - pad * 2) / 8, fl = s.flip;
      const X = x => pad + (fl ? 7 - x : x) * cell, Y = y => pad + (fl ? 7 - y : y) * cell;
      let c; try { c = CR.from(s.moves); } catch (e) { return; }
      const bd = c.board();

      // 테두리: 짙은 나무 + 빛 받는 경사면
      const VIC = window.StoneSkin ? window.StoneSkin.theme(s.boardTheme) : null;   // [추가] 승리의 체스판 (내 화면에만)
      const fr = ctx.createLinearGradient(0, 0, size, size);
      if (VIC) { fr.addColorStop(0, VIC.frame[0]); fr.addColorStop(.5, VIC.frame[1]); fr.addColorStop(1, VIC.frame[2]); }
      else { fr.addColorStop(0, '#7a4a22'); fr.addColorStop(.5, '#5a3215'); fr.addColorStop(1, '#3d200b'); }
      ctx.fillStyle = fr; ctx.fillRect(0, 0, size, size);
      const bev = Math.max(2, pad * 0.22);
      ctx.fillStyle = 'rgba(255,220,170,.22)'; ctx.fillRect(0, 0, size, bev); ctx.fillRect(0, 0, bev, size);
      ctx.fillStyle = 'rgba(0,0,0,.30)'; ctx.fillRect(0, size - bev, size, bev); ctx.fillRect(size - bev, 0, bev, size);

      // 칸: 나뭇결 느낌의 그라데이션 + 결 무늬
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const dark = (x + y) % 2 === 1, px = X(x), py = Y(y);
        const gr = ctx.createLinearGradient(px, py, px + cell, py + cell);
        if (VIC) { const q = dark ? VIC.sqDark : VIC.sqLight; gr.addColorStop(0, q[0]); gr.addColorStop(1, q[1]); }
        else if (dark) { gr.addColorStop(0, '#b77a45'); gr.addColorStop(1, '#94592c'); }
        else { gr.addColorStop(0, '#f3dcb1'); gr.addColorStop(1, '#ddbb84'); }
        ctx.fillStyle = gr; ctx.fillRect(px, py, cell, cell);
        ctx.strokeStyle = dark ? 'rgba(70,35,10,.13)' : 'rgba(150,100,45,.12)'; ctx.lineWidth = Math.max(1, cell * 0.012);
        for (let k = 1; k <= 3; k++) {
          const yy = py + cell * (k / 4) + Math.sin((x * 7 + y * 3 + k) * 1.7) * cell * 0.05;
          ctx.beginPath(); ctx.moveTo(px, yy); ctx.bezierCurveTo(px + cell * .35, yy - cell * .04, px + cell * .65, yy + cell * .04, px + cell, yy); ctx.stroke();
        }
      }
      if (VIC && VIC.overlay) VIC.overlay(ctx, pad, pad, cell * 8, cell * 8);   // 시즌 0: 흑백 용 그림을 은은하게
      // 판 안쪽 그림자 (판이 테두리보다 살짝 들어가 보이게)
      ctx.save();
      ctx.beginPath(); ctx.rect(pad, pad, cell * 8, cell * 8); ctx.clip();
      ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = cell * 0.35;
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = cell * 0.2;
      ctx.strokeRect(pad - cell * 0.1, pad - cell * 0.1, cell * 8 + cell * 0.2, cell * 8 + cell * 0.2);
      ctx.restore();
      ctx.strokeStyle = VIC ? window.StoneSkin.goldGrad(ctx, pad, pad, pad + cell * 8, pad + cell * 8) : 'rgba(30,15,5,.8)'; ctx.lineWidth = Math.max(1, size * (VIC ? 0.008 : 0.003)); ctx.strokeRect(pad, pad, cell * 8, cell * 8);

      const tint = (i, col) => { ctx.fillStyle = col; ctx.fillRect(X(i & 7), Y(i >> 3), cell, cell); };
      const last = (s.moves || []).slice(-1)[0];
      if (last) { tint(CR.idx(last.slice(0, 2)), 'rgba(255,215,60,.38)'); tint(CR.idx(last.slice(2, 4)), 'rgba(255,215,60,.5)'); }
      if (s.sel != null) tint(s.sel, 'rgba(70,140,255,.45)');
      if (c.in_check()) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const p = bd[y][x];
        if (p && p.type === 'k' && p.color === c.turn()) {
          const cx = X(x) + cell / 2, cy = Y(y) + cell / 2, rg = ctx.createRadialGradient(cx, cy, cell * .1, cx, cy, cell * .7);
          rg.addColorStop(0, 'rgba(255,40,40,.9)'); rg.addColorStop(1, 'rgba(255,40,40,0)');
          ctx.fillStyle = rg; ctx.fillRect(X(x), Y(y), cell, cell);
        }
      }

      if (!opts.mini) {
        ctx.fillStyle = VIC ? VIC.label : 'rgba(255,236,200,.9)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `700 ${Math.max(9, Math.round(pad * 0.5))}px system-ui,sans-serif`;
        for (let i = 0; i < 8; i++) {
          ctx.fillText('abcdefgh'[fl ? 7 - i : i], pad + (i + .5) * cell, size - pad / 2);
          ctx.fillText(String(fl ? i + 1 : 8 - i), pad / 2, pad + (i + .5) * cell);
        }
      }

      // [가이드] 잡힐 위험이 있는 내 말: 빨간 바닥 + 테두리
      for (const i of s.danger || []) {
        const x = i & 7, y = i >> 3, cx = X(x) + cell / 2, cy = Y(y) + cell / 2;
        tint(i, 'rgba(230,40,40,.28)');
        ctx.beginPath(); ctx.strokeStyle = 'rgba(210,30,30,.95)'; ctx.lineWidth = cell * 0.07; ctx.arc(cx, cy, cell * 0.44, 0, 7); ctx.stroke();
      }
      // [가이드] 추천 수 출발/도착 칸
      if (s.hint) { tint(s.hint.from, 'rgba(40,180,90,.35)'); tint(s.hint.to, 'rgba(40,180,90,.5)'); }

      // 기물: 뒤쪽 줄부터 그려서 앞 기물이 위로 겹치게
      for (let row = 0; row < 8; row++) for (let x = 0; x < 8; x++) {
        const y = fl ? 7 - row : row, p = bd[y][x]; if (!p) continue;
        drawPiece(ctx, p.type, p.color, X(x) + cell / 2, Y(y) + cell * 0.45, cell, !opts.mini && s.skins ? s.skins[p.color] : null);
      }

      if (!opts.mini) {
        const risky = new Set(s.risky || []);
        for (const i of s.targets || []) {
          const x = i & 7, y = i >> 3, cx = X(x) + cell / 2, cy = Y(y) + cell / 2, bad = risky.has(i);
          ctx.beginPath();
          if (bd[y][x]) { ctx.strokeStyle = bad ? 'rgba(235,120,20,.95)' : 'rgba(46,160,67,.9)'; ctx.lineWidth = cell * 0.08; ctx.arc(cx, cy, cell * 0.45, 0, 7); ctx.stroke(); }
          else { ctx.fillStyle = bad ? 'rgba(235,120,20,.8)' : 'rgba(30,120,50,.55)'; ctx.arc(cx, cy, cell * (bad ? 0.17 : 0.15), 0, 7); ctx.fill(); }
        }
        // [가이드] 추천 수 화살표
        if (s.hint) {
          const a = s.hint.from, b = s.hint.to;
          const x1 = X(a & 7) + cell / 2, y1 = Y(a >> 3) + cell / 2, x2 = X(b & 7) + cell / 2, y2 = Y(b >> 3) + cell / 2;
          const ang = Math.atan2(y2 - y1, x2 - x1), hl = cell * 0.36, ex = x2 - Math.cos(ang) * hl * 0.7, ey = y2 - Math.sin(ang) * hl * 0.7;
          ctx.save(); ctx.strokeStyle = 'rgba(25,150,70,.85)'; ctx.fillStyle = 'rgba(25,150,70,.9)'; ctx.lineCap = 'round';
          ctx.lineWidth = cell * 0.14; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - hl * Math.cos(ang - 0.5), y2 - hl * Math.sin(ang - 0.5));
          ctx.lineTo(x2 - hl * Math.cos(ang + 0.5), y2 - hl * Math.sin(ang + 0.5)); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        if (s.ghost) {
          const a = s.ghost.from, b = s.ghost.to;
          ctx.strokeStyle = '#2563eb'; ctx.lineWidth = cell * 0.08;
          ctx.strokeRect(X(b & 7) + cell * .05, Y(b >> 3) + cell * .05, cell * .9, cell * .9);
          ctx.beginPath(); ctx.moveTo(X(a & 7) + cell / 2, Y(a >> 3) + cell / 2); ctx.lineTo(X(b & 7) + cell / 2, Y(b >> 3) + cell / 2); ctx.stroke();
        }
      }
    }
  }
  window.ChessPiece = drawPiece;   // 로비 스킨 미리보기용
  window.ChessBoardView = BoardView;
})();
