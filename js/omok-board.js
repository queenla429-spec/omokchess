/*! © 2026 삼대710. 교실 내 비영리 사용 외 복제·수정·상업적 이용 금지 */
(function(){
  const N = 15;
  const STARS = [[3,3],[11,3],[7,7],[3,11],[11,11]];
  const LETTERS = 'ABCDEFGHIJKLMNO';

  class BoardView {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = opts;
      this.state = { moves: [], forbidden: [], ghost: -1, ghostColor: 1, numbers: false };
      this._ro = new ResizeObserver(() => this.draw());
      this._ro.observe(canvas);
      if (opts.interactive && opts.onTap) {
        this._onClick = e => {
          const rect = canvas.getBoundingClientRect();
          const px = (e.clientX - rect.left) / rect.width;
          const py = (e.clientY - rect.top) / rect.height;
          const pad = this.opts.labels ? 0.065 : 0.05;
          const span = 1 - pad * 2;
          const gx = Math.round(((px - pad) / span) * (N - 1));
          const gy = Math.round(((py - pad) / span) * (N - 1));
          if (gx >= 0 && gx < N && gy >= 0 && gy < N) opts.onTap(gy * N + gx);
        };
        canvas.addEventListener('pointerup', this._onClick);
      }
      this.draw();
    }

    set(next) {
      Object.assign(this.state, next || {});
      this.draw();
    }

    destroy() {
      this._ro && this._ro.disconnect();
      this._onClick && this.canvas.removeEventListener('pointerup', this._onClick);
    }

    draw() {
      const { canvas, ctx, opts, state } = this;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = Math.max(120, Math.round((canvas.clientWidth || 300) * dpr));
      if (canvas.width !== size || canvas.height !== size) {
        canvas.width = canvas.height = size;
      }

      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, '#e5bd78');
      grad.addColorStop(0.5, '#d8aa5c');
      grad.addColorStop(1, '#c69546');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      const pad = size * (opts.labels ? 0.065 : 0.05);
      const step = (size - pad * 2) / (N - 1);

      ctx.strokeStyle = 'rgba(42, 26, 8, 0.72)';
      ctx.lineWidth = Math.max(1, size * 0.0022);
      for (let i = 0; i < N; i++) {
        const p = pad + i * step;
        ctx.beginPath(); ctx.moveTo(pad, p); ctx.lineTo(size - pad, p); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p, pad); ctx.lineTo(p, size - pad); ctx.stroke();
      }

      ctx.fillStyle = '#2a1a08';
      const starR = Math.max(2, step * 0.11);
      for (const [sx, sy] of STARS) {
        ctx.beginPath();
        ctx.arc(pad + sx * step, pad + sy * step, starR, 0, Math.PI * 2);
        ctx.fill();
      }

      if (opts.labels && !opts.mini) {
        ctx.fillStyle = 'rgba(42, 26, 8, 0.75)';
        ctx.font = `700 ${Math.max(9, Math.round(step * 0.34))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < N; i++) {
          const p = pad + i * step;
          ctx.fillText(LETTERS[i], p, pad * 0.42);
          ctx.fillText(String(N - i), pad * 0.42, p);
        }
      }

      const stoneR = step * 0.44;
      const drawStone = (idx, color, alpha = 1) => {
        const cx = pad + (idx % N) * step;
        const cy = pad + Math.floor(idx / N) * step;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowColor = 'rgba(0,0,0,0.42)';
        ctx.shadowBlur = stoneR * 0.25;
        ctx.shadowOffsetY = stoneR * 0.12;
        const sg = ctx.createRadialGradient(cx - stoneR * 0.3, cy - stoneR * 0.3, stoneR * 0.08, cx, cy, stoneR);
        if (color === 1) {
          sg.addColorStop(0, '#626268');
          sg.addColorStop(0.55, '#19191c');
          sg.addColorStop(1, '#050507');
        } else {
          sg.addColorStop(0, '#ffffff');
          sg.addColorStop(0.65, '#ece9e2');
          sg.addColorStop(1, '#bab5aa');
        }
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(cx, cy, stoneR, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        if (window.StoneSkin && state.skins) window.StoneSkin.draw(ctx, cx, cy, stoneR, color, state.skins[color]);   // [추가] 티어 스킨
        ctx.restore();
      };

      const moves = state.moves || [];
      moves.forEach((m, i) => drawStone(m, i % 2 === 0 ? 1 : 2, 1));

      if (!opts.mini && (state.forbidden || []).length) {
        ctx.strokeStyle = '#c82828';
        ctx.lineWidth = Math.max(2, step * 0.09);
        const r = step * 0.22;
        for (const f of state.forbidden) {
          const cx = pad + (f % N) * step;
          const cy = pad + Math.floor(f / N) * step;
          ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke();
        }
      }

      if (!opts.mini && state.ghost >= 0) {
        drawStone(state.ghost, state.ghostColor || 1, 0.55);
        const cx = pad + (state.ghost % N) * step;
        const cy = pad + Math.floor(state.ghost / N) * step;
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = Math.max(2, step * 0.08);
        ctx.beginPath();
        ctx.arc(cx, cy, stoneR * 1.06, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (moves.length) {
        if (state.numbers && !opts.mini) {
          ctx.font = `800 ${Math.max(9, Math.round(stoneR * 0.85))}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          moves.forEach((m, i) => {
            const cx = pad + (m % N) * step;
            const cy = pad + Math.floor(m / N) * step;
            ctx.fillStyle = i === moves.length - 1 ? '#ff4d4d' : (i % 2 === 0 ? '#f5f5f5' : '#18181b');
            ctx.fillText(String(i + 1), cx, cy);
          });
        } else {
          const last = moves[moves.length - 1];
          const cx = pad + (last % N) * step;
          const cy = pad + Math.floor(last / N) * step;
          ctx.fillStyle = '#e53935';
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(2.5, stoneR * 0.24), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  window.OmokBoardView = BoardView;
})();