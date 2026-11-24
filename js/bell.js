/*! © 2026 삼대710. 교실 내 비영리 사용 외 복제·수정·상업적 이용 금지 */
/* 갈리할리: 카드를 한 장씩 내다가, 펼쳐진 카드 위 같은 과일이 정확히 5개가 되면 종을 쳐요.
   - 경기 기록(moves)은 사건 목록: "f" = 차례인 사람이 카드 뒤집기, "r2" = 2번 자리가 종 치기, "q1" = 1번 자리 기권
   - 처음 나눠 준 카드(deal)와 사건 목록만 있으면 누구 화면에서든 똑같은 판이 다시 만들어져요. */
(function () {
  const COLORS = ["r", "b", "y", "g"];
  const COLOR_KO = { r: "딸기", b: "포도", y: "바나나", g: "라임" };       // 과일마다 색이 달라요
  // 과일 그림 (직접 그린 SVG, 0~100 좌표)
  const FRUIT_SVG = {
    r: `<svg viewBox="0 0 100 100"><path d="M50 92C30 80 12 58 14 40c2-14 14-20 24-17 5 1 9 4 12 4s7-3 12-4c10-3 22 3 24 17 2 18-16 40-36 52z" fill="#e53935" stroke="#8e1c14" stroke-width="4"/>
        <g fill="#ffe9a8"><ellipse cx="34" cy="44" rx="2.6" ry="4"/><ellipse cx="50" cy="40" rx="2.6" ry="4"/><ellipse cx="66" cy="44" rx="2.6" ry="4"/><ellipse cx="40" cy="60" rx="2.6" ry="4"/><ellipse cx="60" cy="60" rx="2.6" ry="4"/><ellipse cx="50" cy="76" rx="2.6" ry="4"/></g>
        <path d="M50 28L36 16l9 2-3-12 8 10 8-10-3 12 9-2z" fill="#3a9a3f" stroke="#1d5e22" stroke-width="3" stroke-linejoin="round"/>
        <path d="M24 40q4-12 14-12" stroke="#fff8" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`,
    y: `<svg viewBox="0 0 100 100"><path d="M14 30c10 30 38 50 72 44 6-1 8 6 2 10-34 16-74-10-82-50-1-6 6-9 8-4z" fill="#ffd43b" stroke="#a87b00" stroke-width="4" stroke-linejoin="round"/>
        <path d="M20 40c12 22 34 34 58 33" stroke="#e6b800" stroke-width="4" fill="none"/>
        <path d="M8 28l-2-10 9 3z" fill="#6b4a12" stroke="#4a320a" stroke-width="3" stroke-linejoin="round"/><circle cx="91" cy="78" r="4" fill="#4a320a"/></svg>`,
    g: `<svg viewBox="0 0 100 100"><circle cx="50" cy="52" r="38" fill="#7cc243" stroke="#2f6d14" stroke-width="5"/>
        <circle cx="50" cy="52" r="29" fill="#d6f0a8"/>
        <g stroke="#9bd35e" stroke-width="5" stroke-linecap="round"><path d="M50 52V26M50 52V78M50 52L28 39M50 52L72 39M50 52L28 65M50 52L72 65"/></g>
        <circle cx="50" cy="52" r="4" fill="#f4fbe6"/></svg>`,
    b: `<svg viewBox="0 0 100 100"><path d="M52 20q4-10 16-12" stroke="#6b4a12" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path d="M56 18q14-6 22 4-12 6-22-4z" fill="#3a9a3f" stroke="#1d5e22" stroke-width="2.5"/>
        <g fill="#8e44c9" stroke="#4d1d78" stroke-width="3"><circle cx="34" cy="34" r="12"/><circle cx="58" cy="34" r="12"/><circle cx="46" cy="52" r="12"/><circle cx="70" cy="52" r="11"/><circle cx="26" cy="54" r="11"/><circle cx="38" cy="72" r="11"/><circle cx="60" cy="72" r="11"/><circle cx="49" cy="89" r="9"/></g>
        <g fill="#ffffff70"><circle cx="30" cy="30" r="3.5"/><circle cx="54" cy="30" r="3.5"/><circle cx="42" cy="48" r="3.5"/></g></svg>`
  };
  const COUNTS = [1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5];     // 색깔마다 14장 → 모두 56장
  const LIMIT_MS = 5 * 60000;                                   // 한 판 최대 5분
  const TURN_MS = 15000;                                        // 15초 동안 [카드 내기]를 안 누르면 자동으로 나가요
  const AI_CFG = {
    easy: { ring: [1700, 2700], flip: [900, 1400], miss: 0.25, wrong: 0.06 },
    normal: { ring: [1050, 1700], flip: [750, 1100], miss: 0.08, wrong: 0.025 },
    hard: { ring: [600, 950], flip: [600, 900], miss: 0, wrong: 0.01 }
  };

  // 할리갈리 규칙처럼 56장을 모두, 첫 번째 사람(first)부터 한 장씩 돌려 나눠요 (사람마다 1장 차이가 날 수 있어요)
  function newDeal(n, first = 0) {
    const deck = [];
    for (const c of COLORS) for (const k of COUNTS) deck.push(c + k);
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const hands = Array.from({ length: n }, () => []);
    deck.forEach((c, i) => hands[(first + i) % n].push(c));
    return hands;
  }

  // 펼쳐진 맨 위 카드들에서 과일별 개수
  function sums(piles) {
    const t = { r: 0, b: 0, y: 0, g: 0 };
    for (const p of piles) { const c = p[p.length - 1]; if (c) t[c[0]] += +c.slice(1); }
    return t;
  }
  const fiveOf = piles => { const t = sums(piles); return COLORS.find(c => t[c] === 5) || null; };

  // 규칙 (보드게임 할리갈리와 같게)
  //  - 차례대로 맨 위 카드를 뒤집어요. 뒤집을 카드가 없는 사람은 건너뛰지만, 종은 칠 수 있어요.
  //  - 맞게 치면 펼쳐진 카드를 모두 가져가 내 더미 밑에 넣고, 그 사람이 다음 카드를 뒤집어요.
  //  - 틀리게 치면 다른 사람에게 1장씩 줘요. 줄 카드가 없는데 틀리면 탈락이에요.
  //  - 손 카드와 앞에 펼친 카드가 모두 없어지면 탈락이에요.
  //  - 3~4명으로 시작해서 2명만 남으면 마지막 대결: 다음에 맞게 친 사람이 카드를 가져가고 끝, 틀리면 상대가 가져가고 끝.
  //  - 2명이 하는 게임에서 틀리면 상대가 펼쳐진 카드를 모두 가져가요. (한 사람이 모든 카드를 가질 때까지 계속)
  //  - 끝나면 카드가 가장 많은 사람이 1등이에요.
  function replay(g) {
    const n = (g.players || []).length || g.n || 2;
    const decks = (g.deal || []).map(a => (a || []).slice());
    while (decks.length < n) decks.push([]);
    let piles = Array.from({ length: n }, () => []);
    const out = Array(n).fill(false), outAt = Array(n).fill(-1);
    let turn = (g.first || 0) % n, last = null, finalTwo = false, done = null;
    const canFlip = s => !out[s] && decks[s].length > 0;
    const nextTurn = from => { for (let d = 1; d <= n; d++) { const s = (from + d) % n; if (canFlip(s)) return s; } return -1; };
    const fixTurn = () => { if (turn < 0 || !canFlip(turn)) turn = nextTurn(turn < 0 ? n - 1 : turn); };
    const aliveCnt = () => out.filter(o => !o).length;
    const checkOut = k => { for (let s = 0; s < n; s++) if (!out[s] && !decks[s].length && !piles[s].length) { out[s] = true; outAt[s] = k; } };
    const takeAll = s => { const won = []; for (const p of piles) won.push(...p); piles = Array.from({ length: n }, () => []); decks[s].push(...won); return won.length; };
    (g.moves || []).forEach((ev, k) => {
      if (done) return;
      if (ev === "f") {
        fixTurn();
        const s = turn; if (s < 0) return;
        const c = decks[s].shift(); piles[s].push(c);
        last = { t: "f", s, c, k };
        turn = nextTurn(s);
      } else if (ev[0] === "r") {
        const s = +ev.slice(1);
        if (s >= n || out[s]) return;
        const col = fiveOf(piles);
        if (col) {
          const gain = takeAll(s);
          last = { t: "r", s, ok: true, gain, col, k };
          turn = s;
          checkOut(k);
          if (finalTwo) done = "final";
        } else if (finalTwo || n === 2) {
          const o = [...Array(n).keys()].find(x => x !== s && !out[x]);
          const gain = o == null ? 0 : takeAll(o);
          last = { t: "r", s, ok: false, to: o, gain, k };
          checkOut(k);
          if (finalTwo) done = "final";
        } else if (!decks[s].length) {
          out[s] = true; outAt[s] = k;
          last = { t: "r", s, ok: false, give: 0, outNow: true, k };
        } else {
          let give = 0;
          for (let d = 1; d < n; d++) {
            const t = (s + d) % n;
            if (out[t] || !decks[s].length) continue;
            decks[t].push(decks[s].pop()); give++;
          }
          last = { t: "r", s, ok: false, give, k };
          checkOut(k);
        }
      } else if (ev[0] === "q") {
        const s = +ev.slice(1);
        if (s >= n || out[s]) return;
        out[s] = true; outAt[s] = k; decks[s] = [];
        last = { t: "q", s, k };
      }
      fixTurn();
      if (!done && n >= 3 && !finalTwo && aliveCnt() === 2) finalTwo = true;
      if (!done && aliveCnt() <= 1) done = "last";
    });
    fixTurn();
    const five = fiveOf(piles);
    if (!done && turn < 0 && !five) done = "stuck";          // 아무도 뒤집을 카드가 없고 종 칠 것도 없으면 끝
    const alive = out.map((o, i) => (o ? -1 : i)).filter(i => i >= 0);
    return { n, decks, piles, out, outAt, turn, last, alive, five, sums: sums(piles), ver: (g.moves || []).length, finalTwo, done };
  }

  // 등수: 살아남은 사람은 가진 카드(손 + 내 앞에 펼친 카드)가 많은 순, 탈락한 사람은 늦게 탈락할수록 위
  function ranking(st) {
    const idx = [...Array(st.n).keys()];
    const have = s => st.decks[s].length + st.piles[s].length;
    return idx.sort((a, b) => {
      if (st.out[a] !== st.out[b]) return st.out[a] ? 1 : -1;
      if (!st.out[a]) return have(b) - have(a) || a - b;
      return st.outAt[b] - st.outAt[a] || have(b) - have(a);
    });
  }

  // ===== 화면 =====
  function stoneDots(k) {
    // 주사위처럼 놓는 자리 (카드 안 % 좌표)
    return ({
      1: [[50, 50]], 2: [[32, 30], [68, 70]], 3: [[28, 26], [50, 50], [72, 74]],
      4: [[30, 30], [70, 30], [30, 70], [70, 70]], 5: [[28, 26], [72, 26], [50, 50], [28, 74], [72, 74]]
    })[k] || [];
  }
  function cardHtml(c, cls = "") {
    if (!c) return `<div class="bt-card empty ${cls}"></div>`;
    const col = c[0], k = +c.slice(1);
    return `<div class="bt-card ${cls}" title="${COLOR_KO[col]} ${k}개">${stoneDots(k).map(([x, y]) =>
      `<i class="bt-fruit" style="left:${x}%;top:${y}%">${FRUIT_SVG[col]}</i>`).join("")}</div>`;
  }
  const BELL_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="50" cy="86" rx="40" ry="9" fill="#00000030"/>
      <ellipse cx="50" cy="80" rx="40" ry="10" fill="#7d5a14"/>
      <path d="M14 78q0-38 36-44q36 6 36 44z" fill="#eebd36" stroke="#7a5510" stroke-width="2.5"/>
      <path d="M20 76q2-30 30-37q-14 12-16 37z" fill="#ffe27a" opacity=".8"/>
      <ellipse cx="50" cy="78" rx="36" ry="7" fill="#f6cf5a" stroke="#7a5510" stroke-width="2"/>
      <rect x="44" y="22" width="12" height="13" rx="4" fill="#d9a72a" stroke="#7a5510" stroke-width="2"/>
      <circle cx="50" cy="20" r="7" fill="#c9302c" stroke="#7a1a16" stroke-width="2"/>
      <path d="M28 64q4-18 18-22" stroke="#fff6" stroke-width="5" fill="none" stroke-linecap="round"/>
    </svg>`;

  // 귀여운 종 캐릭터 '딸랑이' (직접 그린 SVG)
  function buddyBell(mood) {
    const happy = mood === "happy";
    const eyes = happy ? `<path d="M36 58q5-7 10 0M58 58q5-7 10 0" stroke="#3a2a10" stroke-width="4" fill="none" stroke-linecap="round"/>`
      : `<circle cx="41" cy="58" r="4.5" fill="#3a2a10"/><circle cx="63" cy="58" r="4.5" fill="#3a2a10"/><path d="M34 49l10 4M70 49l-10 4" stroke="#3a2a10" stroke-width="3.5" stroke-linecap="round"/><path d="M68 64q-3 7 0 10q3-3 0-10z" fill="#6ec6ff"/>`;
    const mouth = happy ? `<path d="M42 70q10 12 20 0z" fill="#d9483b" stroke="#3a2a10" stroke-width="3" stroke-linejoin="round"/>`
      : `<path d="M44 76q8-7 16 0" stroke="#3a2a10" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
    const arms = happy ? `<path d="M16 66q-10-10-8-24M88 66q10-10 8-24" stroke="#b8860b" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="8" cy="40" r="6" fill="#f6cf5a" stroke="#7a5510" stroke-width="2.5"/><circle cx="96" cy="40" r="6" fill="#f6cf5a" stroke="#7a5510" stroke-width="2.5"/>`
      : `<path d="M18 70q-8 6-8 14M86 70q8 6 8 14" stroke="#b8860b" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    return `<svg viewBox="0 0 104 112" aria-hidden="true">${arms}
      <ellipse cx="52" cy="104" rx="30" ry="5" fill="#0003"/>
      <path d="M18 92q-2-52 34-58q36 6 34 58z" fill="#f2c23a" stroke="#7a5510" stroke-width="3.5"/>
      <path d="M26 84q0-36 22-44q-14 14-14 44z" fill="#ffe58a" opacity=".9"/>
      <rect x="12" y="88" width="80" height="11" rx="5.5" fill="#d9a72a" stroke="#7a5510" stroke-width="3"/>
      <circle cx="52" cy="26" r="8" fill="#e0453a" stroke="#7a1a16" stroke-width="3"/>
      ${eyes}<ellipse cx="32" cy="68" rx="5" ry="3.2" fill="#f49a8f" opacity=".85"/><ellipse cx="72" cy="68" rx="5" ry="3.2" fill="#f49a8f" opacity=".85"/>${mouth}
    </svg>`;
  }

  let audio = null;
  function sound(kind) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime, o = audio.createOscillator(), gn = audio.createGain();
      o.connect(gn); gn.connect(audio.destination);
      if (kind === "ok") {
        o.type = "triangle"; o.frequency.setValueAtTime(1320, t); o.frequency.exponentialRampToValueAtTime(990, t + 0.6);
        gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.35, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.start(t); o.stop(t + 0.95);
      } else if (kind === "bad") {
        o.type = "square"; o.frequency.setValueAtTime(160, t);
        gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.18, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        o.start(t); o.stop(t + 0.5);
      } else {
        o.type = "sine"; o.frequency.setValueAtTime(520, t);
        gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.08, t + 0.005); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        o.start(t); o.stop(t + 0.13);
      }
    } catch {}
  }

  const POS = { 1: ["bottom"], 2: ["bottom", "top"], 3: ["bottom", "left", "right"], 4: ["bottom", "left", "top", "right"] };

  class BellBoardView {
    constructor(canvas, opts = {}) {
      this.canvas = canvas; this.opts = opts; this.busy = false;
      this.state = { moves: [], deal: null, players: [] };
      this.lastK = null;
      canvas.style.display = "none";
      this.el = document.createElement("div");
      this.el.className = "bt-table" + (opts.mini ? " mini" : "");
      canvas.parentElement.insertBefore(this.el, canvas);
      this._ro = new ResizeObserver(() => this._size()); this._ro.observe(this.el);
      if (!opts.mini) {
        this.el.addEventListener("pointerdown", e => {
          const b = e.target.closest("[data-act]"); if (!b) return;
          e.preventDefault();
          if (b.dataset.act === "ring") opts.onRing && opts.onRing();
          if (b.dataset.act === "flip") opts.onFlip && opts.onFlip();
        });
        this._key = e => {
          if (!this.el.isConnected || this.el.offsetParent === null) return;
          if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
          if (e.code === "Space") { e.preventDefault(); opts.onFlip && opts.onFlip(); }
          else if (e.code === "Enter" || e.key === "b" || e.key === "B") { e.preventDefault(); opts.onRing && opts.onRing(); }
        };
        window.addEventListener("keydown", this._key);
      }
      this.draw();
    }
    _size() { const w = this.el.clientWidth || 300; this.el.style.setProperty("--u", (w / 100) + "px"); }
    set(n) { Object.assign(this.state, n || {}); this.draw(); }
    destroy() {
      this._fxEl && this._fxEl.remove(); clearTimeout(this._fxT);
      this._ro && this._ro.disconnect();
      this._key && window.removeEventListener("keydown", this._key);
      this.el.remove(); this.canvas.style.display = "";
    }
    // 종을 친 결과를 크게 보여 주는 화면 (캐릭터 '딸랑이'가 나와요). 판을 다시 그려도 사라지지 않게 따로 둬요.
    _fx(ev, names) {
      const host = this.el.parentElement; if (!host) return;
      const esc = (window.App && window.App.esc) || (x => String(x));
      const nm = esc(names[ev.s] || "");
      let mood = "sad", title, sub, extra = "";
      if (ev.t === "q") { title = "기권"; sub = `${nm} 친구가 게임을 그만뒀어요`; }
      else if (ev.ok) {
        mood = "happy"; title = "점수 획득!";
        extra = `<div class="fx-fruits">${Array(5).fill(`<i>${FRUIT_SVG[ev.col]}</i>`).join("")}</div>`;
        sub = `${COLOR_KO[ev.col]} 5개 딱! · 카드 <b>+${ev.gain}장</b>`;
      } else if (ev.to != null) { title = "땡! 아쉬워요"; sub = `펼쳐진 카드 <b>${ev.gain}장</b>은 ${esc(names[ev.to] || "")}에게!`; }
      else if (ev.outNow) { title = "땡! 탈락"; sub = "줄 카드가 없어서 탈락했어요"; }
      else { title = "땡! 아쉬워요"; sub = `5개가 아니었어요 · 카드 <b>${ev.give}장</b>을 나눠 줘요`; }
      if (this._fxEl) this._fxEl.remove();
      clearTimeout(this._fxT);
      const el = document.createElement("div");
      el.className = `bt-fx ${mood}`;
      el.style.setProperty("--u", this.el.style.getPropertyValue("--u") || "5.4px");
      el.innerHTML = `${mood === "happy" ? `<div class="fx-confetti">${Array.from({ length: 18 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i % 6) * 0.08}s;--c:${["#ff5a5f", "#ffd43b", "#7cc243", "#8e44c9", "#3fa9f5"][i % 5]}"></i>`).join("")}</div>` : ""}
        <div class="fx-card">
          <div class="fx-char">${buddyBell(mood)}</div>
          <div class="fx-text"><div class="fx-name">${nm}</div><div class="fx-title">${title}</div>${extra}<div class="fx-sub">${sub}</div></div>
        </div>`;
      host.appendChild(el);
      this._fxEl = el;
      this._fxT = setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 400); }, 2600);
    }
    draw() {
      this._size();
      const s = this.state, mini = !!this.opts.mini;
      if (!s.deal) {   // 게임 고르기 그림용 맛보기 판
        this.el.innerHTML = `<div class="bt-demo">${["r2", "b3", "y1", "g4"].map((c, i) => `<div class="bt-demo-c p${i}">${cardHtml(c)}</div>`).join("")}<div class="bt-bell">${BELL_SVG}</div></div>`;
        return;
      }
      const st = replay(s), n = st.n, me = s.mySeat >= 0 ? s.mySeat : 0;
      const pos = POS[n] || POS[4];
      const names = s.names || (s.players || []).map(u => (window.App && window.App.nameOf) ? window.App.nameOf(u, { level: String(u).split(":")[1] }) : u);
      const newEv = this.lastK !== null && st.last && st.last.k >= this.lastK ? st.last : null;
      const animate = !mini && newEv;
      let html = "";
      for (let seat = 0; seat < n; seat++) {
        const rel = (seat - me + n) % n, where = pos[rel];
        const pile = st.piles[seat], top = pile[pile.length - 1];
        const isTurn = s.status === "active" && st.turn === seat && !st.out[seat] && !st.done;
        const myFlip = !mini && s.canFlip && seat === s.mySeat && isTurn;
        const flipAnim = animate && newEv.t === "f" && newEv.s === seat ? " flip-in" : "";
        const ringAnim = animate && newEv.t === "r" && newEv.s === seat ? (newEv.ok ? " ring-ok" : " ring-bad") : "";
        html += `<div class="bt-seat pos-${where}${isTurn ? " turn" : ""}${st.out[seat] ? " out" : ""}${seat === s.mySeat ? " me" : ""}${ringAnim}">
          <div class="bt-name">${isTurn ? "▶ " : ""}${(window.App && window.App.esc) ? window.App.esc(names[seat] || "") : names[seat] || ""}${st.out[seat] ? " · 탈락" : !st.decks[seat].length ? " · 카드 없음" : ""}</div>
          <div class="bt-row">
            <div class="bt-deck${myFlip ? " can" : ""}" ${myFlip ? 'data-act="flip" role="button" tabindex="0"' : ""}>
              ${st.decks[seat].length ? `<div class="bt-back"></div><div class="bt-back b2"></div>` : ""}<span class="bt-cnt">${st.decks[seat].length}</span>
              ${myFlip ? `<span class="bt-tap">내 차례!</span>` : ""}
            </div>
            <div class="bt-pile">${cardHtml(top, flipAnim)}${pile.length > 1 ? `<span class="bt-pcnt">${pile.length}</span>` : ""}</div>
          </div>
        </div>`;
      }
      const canRing = !mini && s.canRing;
      html += `<div class="bt-center"><div class="bt-bell${canRing ? " can" : ""}${animate && newEv.t === "r" ? (newEv.ok ? " shake" : " buzz") : ""}" ${canRing ? 'data-act="ring" role="button" tabindex="0" aria-label="종 치기"' : ""}>${BELL_SVG}</div>
        ${!mini && s.status === "active" && canRing ? `<div class="bt-hint">${st.finalTwo ? "🔥 마지막 대결! 다음 종으로 끝나요" : "같은 과일이 <b>딱 5개</b>면 종을 쳐요!"}</div>` : ""}</div>`;
      if (animate && (newEv.t === "r" || newEv.t === "q")) {
        this._fx(newEv, names);
        sound(newEv.t === "r" && newEv.ok ? "ok" : "bad");
      } else if (animate && newEv.t === "f") sound("flip");
      this.el.innerHTML = html;
      this.lastK = st.ver;
    }
  }

  // 선생님 화면: 실시간 경기 카드 / 경기 기록 줄
  const BellUI = {
    liveCard(card, a) {
      const App = window.App, st = a.deal ? replay(a) : null;
      const list = (a.players || []).map((u, i) => `<div class="row">${App.nameTag(u, "", { level: String(u).split(":")[1] })}${st ? ` <span class="muted">${st.out[i] ? "탈락" : st.decks[i].length + "장"}</span>` : ""}</div>`).join("");
      card.querySelector(".vs").innerHTML = list;
      const mode = a.mode === "rank" ? "🏆 랭크" : "🎮 일반";
      const stTxt = a.status === "waiting" ? `⏳ 대기 ${(a.players || []).length}/${a.n || 2}` : a.status === "active" ? (st && st.finalTwo ? "🔥 마지막 대결" : `${(a.moves || []).length}번째 진행`) : a.status === "finished" ? "종료" : "취소";
      card.querySelector(".meta").innerHTML = `<span>${mode} · ${(a.players || []).length}인 갈리할리</span><span>${stTxt}</span>`;
    },
    logRow(s, m) {
      const App = window.App, ranks = s.ranks || s.players || [];
      const d = uid => { const x = s.deltas && s.deltas[uid]; return x ? `<span class="delta ${x.delta > 0 ? "up" : x.delta < 0 ? "down" : ""}">${x.delta > 0 ? "+" : ""}${x.delta}</span>${x.counted ? "" : ' <span class="muted">(연습)</span>'}` : ""; };
      return `<tr style="${s.voided ? "opacity:.5" : ""}"><td>${App.fmtTime(s.ts)}</td>
        <td>${s.mode === "rank" ? "🏆 랭크" : "🎮 일반"} · ${ranks.length}인 갈리할리</td>
        <td colspan="2">${ranks.map((u, i) => `<span style="white-space:nowrap;margin-right:8px"><b>${i + 1}등</b> ${App.nameTag(u, "", { level: String(u).split(":")[1] })} ${d(u)}</span>`).join("")}</td>
        <td>${s.reason === "void" ? "<b>경기 무효</b>" : `<b>${App.esc(App.nameOf(s.winner, { level: String(s.winner || "").split(":")[1] }))} 1등</b>`}</td>
        <td class="num">${s.moves || 0}</td><td></td></tr>`;
    }
  };

  window.Bell = { COLORS, COLOR_KO, LIMIT_MS, TURN_MS, AI_CFG, newDeal, replay, ranking, sums, fiveOf, cardHtml };
  window.BellBoardView = BellBoardView;
  window.BellUI = BellUI;
})();
