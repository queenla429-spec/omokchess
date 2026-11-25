/*! © 2026 삼대710. 교실 내 비영리 사용 외 복제·수정·상업적 이용 금지 */
/* 내가 그린 기린 그림: 한 명이 그림을 그리면 나머지가 글자로 맞히는 실시간 게임
   - 그림은 선(획) 조각으로 나눠 실시간으로 보내요 (draws/경기/s라운드/키)
   - 정답 단어는 살짝 감춰서 저장해요 (교실용) */
(function () {
  const WORDS = ("기린 사자 호랑이 코끼리 토끼 거북이 강아지 고양이 펭귄 돌고래 상어 문어 나비 개미 거미 달팽이 공룡 원숭이 판다 부엉이 " +
    "사과 바나나 포도 수박 딸기 당근 옥수수 피자 햄버거 김밥 라면 아이스크림 케이크 도넛 떡볶이 " +
    "자동차 자전거 비행기 기차 배 로켓 헬리콥터 버스 " +
    "우산 시계 안경 모자 가방 신발 연필 지우개 가위 책 의자 침대 컵 숟가락 냉장고 텔레비전 컴퓨터 휴대폰 열쇠 풍선 선물 " +
    "해 달 별 구름 비 눈사람 무지개 번개 산 바다 섬 나무 꽃 선인장 화산 " +
    "집 학교 병원 성 다리 등대 텐트 " +
    "축구공 농구 야구 수영 줄넘기 피아노 기타 북 " +
    "왕관 로봇 유령 천사 해적 마법사 경찰 소방관 의사 요리사 " +
    "눈 코 입 귀 손 발 하트 웃음 눈물").split(" ");
  const CHOOSE_MS = 12000, DRAW_MS = 80000, REVEAL_MS = 3000;
  const COLORS = ["#222222", "#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa", "#8d5524", "#ff80ab", "#ffffff"];
  const SIZES = [4, 9, 18];
  const BAD = ["시발", "씨발", "ㅅㅂ", "ㅆㅂ", "병신", "ㅂㅅ", "개새", "새끼", "ㅅㄲ", "좆", "존나", "ㅈㄴ", "미친", "ㅁㅊ", "닥쳐", "꺼져", "애미", "에미", "니미", "느금", "fuck", "shit", "bitch", "sex", "섹스", "바보", "멍청"];

  const norm = t => String(t || "").toLowerCase().replace(/[\s\-_.,!?~'"]/g, "");
  const enc = w => { try { return btoa(unescape(encodeURIComponent("kr:" + w))).split("").reverse().join(""); } catch { return ""; } };
  const dec = x => { try { return decodeURIComponent(escape(atob(String(x || "").split("").reverse().join("")))).slice(3); } catch { return ""; } };
  const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const chosung = w => [...String(w)].map(ch => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch; }).join("");
  const clean = t => { const s = String(t || "").slice(0, 14); const n = norm(s); return BAD.some(b => n.includes(b)) ? "🙊" : s; };
  // 한 글자만 다르면 '거의 맞았어요'
  function close(a, b) {
    a = norm(a); b = norm(b);
    if (!a || !b || a === b || Math.abs(a.length - b.length) > 1) return false;
    let diff = 0;
    if (a.length === b.length) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++; return diff === 1; }
    const [s, l] = a.length < b.length ? [a, b] : [b, a];
    for (let i = 0, j = 0; j < l.length; j++) { if (s[i] === l[j]) i++; else diff++; }
    return diff === 1;
  }
  function pick3(used) {
    const pool = WORDS.filter(w => !(used || []).includes(w));
    const src = pool.length >= 3 ? pool : WORDS.slice();
    const out = [];
    while (out.length < 3) { const w = src[Math.floor(Math.random() * src.length)]; if (!out.includes(w)) out.push(w); }
    return out;
  }
  const points = order => [10, 8, 7, 6, 5, 4, 4, 4][Math.max(0, order - 1)] || 3;

  // 귀여운 기린 낙서 (게임 고르기 그림)
  function doodle(ctx, W) {
    const u = W / 100;
    ctx.fillStyle = "#fffdf6"; ctx.fillRect(0, 0, W, W);
    ctx.strokeStyle = "#e8e2d0"; ctx.lineWidth = u * .4;
    for (let y = 12; y < 100; y += 8) { ctx.beginPath(); ctx.moveTo(0, y * u); ctx.lineTo(W, y * u); ctx.stroke(); }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const st = (c, w) => { ctx.strokeStyle = c; ctx.lineWidth = w * u; };
    ctx.fillStyle = "#ffd54f"; st("#6d4c1d", 1.6);
    ctx.beginPath(); ctx.moveTo(36 * u, 86 * u); ctx.lineTo(40 * u, 40 * u); ctx.quadraticCurveTo(42 * u, 28 * u, 52 * u, 26 * u); ctx.lineTo(56 * u, 30 * u); ctx.lineTo(50 * u, 42 * u); ctx.lineTo(50 * u, 62 * u);
    ctx.quadraticCurveTo(70 * u, 60 * u, 76 * u, 70 * u); ctx.lineTo(76 * u, 86 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#a1662f";
    [[44, 48], [44, 58], [58, 68], [68, 72], [46, 72], [42, 38]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x * u, y * u, 2.6 * u, 0, 7); ctx.fill(); });
    st("#6d4c1d", 1.6); ctx.beginPath(); ctx.moveTo(48 * u, 26 * u); ctx.lineTo(47 * u, 19 * u); ctx.moveTo(53 * u, 26 * u); ctx.lineTo(54 * u, 19 * u); ctx.stroke();
    ctx.fillStyle = "#6d4c1d"; ctx.beginPath(); ctx.arc(50 * u, 30 * u, 1.3 * u, 0, 7); ctx.fill();
    st("#e53935", 2.4); ctx.beginPath(); ctx.moveTo(14 * u, 22 * u); ctx.quadraticCurveTo(20 * u, 12 * u, 26 * u, 20 * u); ctx.stroke();
    st("#1e88e5", 2.4); ctx.beginPath(); ctx.arc(82 * u, 22 * u, 7 * u, 0, 7); ctx.stroke();
    ctx.fillStyle = "#43a047"; ctx.font = `900 ${9 * u}px system-ui,sans-serif`; ctx.textAlign = "center"; ctx.fillText("?", 82 * u, 25 * u);
  }

  class DrawBoardView {
    constructor(canvas, opts = {}) {
      this.cv = canvas; this.ctx = canvas.getContext("2d"); this.opts = opts;
      this.state = { canDraw: false, color: COLORS[0], size: SIZES[1] };
      this.strokes = {}; this.order = []; this.done = new Set(); this.mine = new Set();
      this.cur = null; this.pending = []; this.flushT = null;
      this._ro = new ResizeObserver(() => this.redraw()); this._ro.observe(canvas);
      if (!opts.mini) {
        canvas.style.touchAction = "none";
        this._down = e => this._start(e); this._move = e => this._go(e); this._up = e => this._end(e);
        canvas.addEventListener("pointerdown", this._down);
        canvas.addEventListener("pointermove", this._move);
        window.addEventListener("pointerup", this._up);
        canvas.addEventListener("pointercancel", this._up);
      }
      this.redraw();
    }
    destroy() {
      this._ro && this._ro.disconnect();
      if (this._down) { this.cv.removeEventListener("pointerdown", this._down); this.cv.removeEventListener("pointermove", this._move); window.removeEventListener("pointerup", this._up); this.cv.removeEventListener("pointercancel", this._up); }
      this.cv.style.touchAction = "";
    }
    set(n) { Object.assign(this.state, n || {}); this.cv.classList.toggle("can-draw", !!this.state.canDraw); }
    _size() {
      const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(120, Math.round((this.cv.clientWidth || 300) * dpr));
      if (this.cv.width !== W || this.cv.height !== W) { this.cv.width = this.cv.height = W; return true; }
      return false;
    }
    _bg() {
      const { ctx, cv } = this, W = cv.width;
      ctx.fillStyle = "#fffdf6"; ctx.fillRect(0, 0, W, W);
    }
    // 새 라운드: 판을 비워요
    reset() { this.strokes = {}; this.order = []; this.done.clear(); this.mine.clear(); this.cur = null; this.redraw(); }
    // 서버에서 받은 획들 (키 순서대로)
    feed(obj) {
      obj = obj || {};
      const keys = Object.keys(obj).sort();
      let needFull = false;
      for (const k of keys) {
        if (this.done.has(k)) continue;
        this.strokes[k] = obj[k]; this.done.add(k);
        if (this.mine.has(k)) continue;           // 내가 그린 건 이미 화면에 있어요
        if (obj[k] && obj[k].x) { needFull = true; continue; }
        if (this.order.length && k < this.order[this.order.length - 1]) needFull = true;
        this.order.push(k);
        if (!needFull) this._paint(obj[k]);
      }
      if (needFull) { this.order = Object.keys(this.strokes).sort(); this.redraw(); }
    }
    redraw() {
      if (this.opts.mini) { this._size(); doodle(this.ctx, this.cv.width); return; }
      this._size(); this._bg();
      const keys = Object.keys(this.strokes).sort();
      let start = 0;
      keys.forEach((k, i) => { if (this.strokes[k] && this.strokes[k].x) start = i + 1; });   // 마지막 '전체 지우기' 뒤부터만
      for (let i = start; i < keys.length; i++) this._paint(this.strokes[keys[i]]);
      if (this.cur) this._paint(this.cur);
    }
    _paint(s) {
      if (!s || s.x || !s.p) return;
      const { ctx, cv } = this, W = cv.width, k = W / 1000;
      const pts = String(s.p).split(" ").map(t => t.split(",").map(Number)).filter(a => a.length === 2 && isFinite(a[0]));
      if (!pts.length) return;
      ctx.strokeStyle = s.c || "#222"; ctx.fillStyle = s.c || "#222";
      ctx.lineWidth = Math.max(1, (s.w || 6) * W / 600); ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0][0] * k, pts[0][1] * k, ctx.lineWidth / 2, 0, 7); ctx.fill(); return; }
      ctx.beginPath(); ctx.moveTo(pts[0][0] * k, pts[0][1] * k);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * k, pts[i][1] * k);
      ctx.stroke();
    }
    _pt(e) {
      const r = this.cv.getBoundingClientRect();
      const x = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 1000);
      const y = Math.round(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * 1000);
      return [x, y];
    }
    _start(e) {
      if (!this.state.canDraw) return;
      e.preventDefault();
      try { this.cv.setPointerCapture(e.pointerId); } catch {}
      const p = this._pt(e);
      this.cur = { c: this.state.color, w: this.state.size, pts: [p] };
      this.pending = [p];
      this._paint({ c: this.cur.c, w: this.cur.w, p: p.join(",") });
      this._schedule();
    }
    _go(e) {
      if (!this.cur || !this.state.canDraw) return;
      e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs.length ? evs : [e]) {
        const p = this._pt(ev), last = this.cur.pts[this.cur.pts.length - 1];
        if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 3) continue;
        this._paint({ c: this.cur.c, w: this.cur.w, p: `${last.join(",")} ${p.join(",")}` });
        this.cur.pts.push(p); this.pending.push(p);
      }
      this._schedule();
    }
    _end() {
      if (!this.cur) return;
      this._flush(); this.cur = null;
    }
    _schedule() { if (!this.flushT) this.flushT = setTimeout(() => this._flush(), 90); }
    // 모인 점들을 한 조각으로 보내요 (앞 조각의 마지막 점을 이어 붙여 끊기지 않게)
    _flush() {
      clearTimeout(this.flushT); this.flushT = null;
      if (!this.cur || !this.pending.length) return;
      const pts = this.pending; this.pending = [pts[pts.length - 1]];
      if (pts.length < 1) return;
      const key = this.opts.newKey ? this.opts.newKey() : Date.now().toString(36);
      const s = { c: this.cur.c, w: this.cur.w, p: pts.map(p => p.join(",")).join(" ") };
      this.mine.add(key); this.strokes[key] = s; this.done.add(key);
      this.opts.onStroke && this.opts.onStroke(key, s);
    }
    clearAll() {
      const key = this.opts.newKey ? this.opts.newKey() : Date.now().toString(36);
      this.mine.add(key); this.strokes[key] = { x: 1 }; this.done.add(key);
      this.redraw();
      this.opts.onStroke && this.opts.onStroke(key, { x: 1 });
    }
  }

  // 선생님 화면: 실시간 경기 카드 / 경기 기록 줄
  const DrawUI = {
    liveCard(card, a) {
      const App = window.App, sc = a.scores || {};
      card.querySelector(".vs").innerHTML = (a.players || []).map(u => `<div class="row">${App.nameTag(u)}${a.status === "active" ? ` <span class="muted">${sc[u] || 0}점${a.drawer === u ? " ✏️" : ""}</span>` : ""}</div>`).join("");
      const mode = a.mode === "rank" ? "🏆 랭크" : "🎮 일반";
      const total = (a.rounds || 1) * ((a.players || []).length || 1);
      const stTxt = a.status === "waiting" ? `⏳ 대기 ${(a.players || []).length}/${a.n || 2}` : a.status === "active" ? `${(a.round || 0) + 1}/${total} 라운드` : a.status === "finished" ? "종료" : "취소";
      card.querySelector(".meta").innerHTML = `<span>${mode} · ${(a.players || []).length}인 그림 맞히기</span><span>${stTxt}</span>`;
    }
  };

  window.Draw = { WORDS, CHOOSE_MS, DRAW_MS, REVEAL_MS, COLORS, SIZES, norm, enc, dec, chosung, clean, close, pick3, points, doodle };
  window.DrawBoardView = DrawBoardView;
  window.DrawUI = DrawUI;
})();
