/*! © 2026 삼대710. 교실 내 비영리 사용 외 복제·수정·상업적 이용 금지 — 체스 이식판 */
(function(){
  const e = window.T;
  const B = window.Backend;
  const R = window.Rating;
  const CR = window.ChessRules;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const fmt = ms => { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

  const CODE_RE = /^[a-z0-9][a-z0-9-]{1,11}$/;
  const accountKey = (cid, loginId) => `${String(cid).trim().toLowerCase()}.${String(loginId).trim().toLowerCase()}`;

  const AI_NAMES = { easy: e("쉬움"), normal: e("보통"), hard: e("어려움") };
  const MATCH_NAMES = { random: e("랜덤 매치"), select: e("1:1 선택 매치"), assigned: e("선생님 배정"), ai: e("AI 대전") };
  const REASON_NAMES = {
    checkmate: e("체크메이트"), stalemate: e("스테일메이트"), repetition: e("3회 동형 반복"),
    insufficient: e("기물 부족"), fifty: e("50수 규칙"), resign: e("기권"), timeout: e("시간 초과"),
    cancel: e("취소"), draw: e("무승부"),
    five: e("오목 완성"), foul: e("금수 반칙"), full: e("판이 가득 참"), void: e("선생님 무효 처리"), out: e("모든 알 탈락"), limit: e("수 제한 (남은 알이 많은 쪽 승리)"),
    bell_last: e("마지막까지 살아남음"), bell_time: e("시간 종료 (카드가 많은 순)"), bell: e("갈리할리"),
    bell_final: e("마지막 두 명의 종 대결 (카드가 많은 순)"), draw_end: e("모든 라운드 끝 (점수가 높은 순)"), bell_stuck: e("더 뒤집을 카드가 없음 (카드가 많은 순)")
  };
  const STATUS_KO = { game: e("경기 중"), queue: e("매칭 중"), idle: e("접속 중"), away: e("다른 게임 접속"), off: e("오프라인") };
  const GAME_KO = { alkkagi: e("알까기"), omok: e("오목"), chess: e("체스"), bell: e("갈리할리"), draw: e("그림 맞히기"), pick: e("게임 고르는 중") };

  const S = {
    view: "connect", uid: null, cid: null, isSuper: false, isMaster: false, masterName: e("선생님"),
    loginKey: "", classList: {}, classMeta: {}, users: {}, active: {}, presence: {}, queue: {},
    seasons: {}, settingsRaw: {}, champion: null, stuSideTab: "rank",
    curGameId: null, curGame: null, spectate: false,
    selSq: -1, ghost: null, showNumbers: false
  };

  let classUnsubs = [];
  let gameUnsub = null;
  let inviteUnsub = null;
  let userGamesUnsub = null;
  let userGames = {};
  let boardView = null;
  let boardKind = null;
  let timerInterval = null;
  let queueInterval = null;
  let aiTimeout = null;
  let handledInviteId = null;
  let lastKnownTier = null;
  let lastPromoKey = undefined;   // [추가] 승급전 시작 알림용
  let registering = false;   // [수정] 처음 설정·새 반 만들기 진행 중 표시

  // [수정] 이전 시도에서 계정만 만들어지고 멈춘 경우, 같은 비밀번호로 이어서 진행
  async function signUpOrIn(key, pw) {
    try { return await B.signUpSelf(key, pw); }
    catch (err) {
      if (!err || err.kind !== "exists") throw err;
      try { return await B.signIn(key, pw); }
      catch { throw new Error(`이미 만들어진 계정이 있어요. 처음 만들 때 입력한 비밀번호를 그대로 넣으면 이어서 진행돼요. 비밀번호가 기억나지 않으면 Firebase 콘솔 → Authentication → 사용자에서 ${String(key).toLowerCase()}@omok.example.com 계정을 삭제한 뒤 다시 시도하세요.`); }
    }
  }
  const friendlyErr = err => /PERMISSION_DENIED|permission/i.test(String((err && (err.code || err.message)) || err))
    ? "Firebase 규칙이 최신이 아니에요. Firebase 콘솔 → Realtime Database → 규칙 탭에 새 규칙을 붙여넣고 [게시]한 뒤 다시 시도하세요. (" + ((err && err.message) || err) + ")"
    : ((err && err.message) || String(err));

  const settings = () => R.mergeSettings(S.settingsRaw);

  // ===== [추가] 오목·체스 통합: 게임마다 점수·경기·설정을 따로 저장 =====
  //  학생 계정(이름·아이디·비밀번호)과 접속 상태는 함께 쓰고,
  //  체스는 기존 위치 그대로, 오목·알까기는 classes/반/x/게임이름/ 아래에 따로 저장해요.
  const KINDS = ["alkkagi", "omok", "chess", "bell", "draw"];
  let GAME = (() => { try { const g = localStorage.getItem("arenaGame"); return KINDS.includes(g) ? g : null; } catch { return null; } })();
  const game = () => GAME || "chess";
  const PER_GAME = new Set(["games", "live", "active", "queue", "invites", "userGames", "log", "seasons", "settings", "rooms", "draws"]);
  const RF = new Set(["score", "placed", "wins", "losses", "draws", "rankGames", "day", "week", "recentOpp", "scoreAt", "placedAt", "promo", "nWins", "nLosses", "shield", "vskin"]);
  const sep = () => game() !== "chess";            // 따로 저장하는 게임인지
  const opOf = k => `x/${k}/`;
  function mapOne(p) {
    if (!sep()) return p;
    const OP = opOf(game()), a = String(p).split("/");
    if (PER_GAME.has(a[0])) return OP + p;
    if (a[0] === "users" && a[1] && a[2] && RF.has(a[2])) return `${OP}rating/${a[1]}/${a.slice(2).join("/")}`;
    return p;
  }
  function expand(p, v, out) {
    const a = String(p).split("/").filter(Boolean);
    if (a[0] === "users" && a.length === 2) {
      if (v == null) { out[p] = null; for (const k of KINDS) if (k !== "chess") out[`${opOf(k)}rating/${a[1]}`] = null; return; }   // 학생 삭제 → 모든 게임 기록 정리
      if (!sep()) { out[p] = v; return; }
      const OP = opOf(game());
      const rt = {};
      for (const [k, x] of Object.entries(v)) { if (RF.has(k)) rt[k] = x; else out[`${p}/${k}`] = x; }
      out[`${OP}rating/${a[1]}`] = rt;
      return;
    }
    out[mapOne(p)] = v;
  }
  function mergeUsers(base, rating) {
    const out = {}, start = Number(settings().startScore) || R.START_SCORE;
    for (const [uid, u] of Object.entries(base || {})) {
      if (!u || typeof u !== "object") continue;
      let m;
      if (sep()) {
        m = {};
        for (const [k, x] of Object.entries(u)) if (!RF.has(k)) m[k] = x;
        Object.assign(m, (rating && rating[uid]) || {});
      } else m = Object.assign({}, u);
      if (m.score == null) m.score = start;
      if (m.placed == null) m.placed = 0;
      out[uid] = m;
    }
    return out;
  }
  const D = {
    path: p => `classes/${S.cid}/${mapOne(p)}`,
    get: p => B.get(`classes/${S.cid}/${mapOne(p)}`),
    set: (p, v) => D.update("", { [p]: v }),
    update: (p, u) => {
      const pref = p ? `${p.replace(/\/$/, "")}/` : "";
      const rel = {}, out = {};
      for (const [k, v] of Object.entries(u || {})) expand(pref + k, v, rel);
      for (const [k, v] of Object.entries(rel)) out[`classes/${S.cid}/${k}`] = v;
      return B.update("", out);
    },
    remove: p => D.update("", { [p]: null }),
    on: (p, cb) => {
      if (p !== "users") return B.on(`classes/${S.cid}/${mapOne(p)}`, cb);
      let base = null, rating = null, gotB = false, gotR = !sep();
      const emit = () => { if (gotB && gotR) cb(mergeUsers(base, rating)); };
      const u1 = B.on(`classes/${S.cid}/users`, v => { base = v; gotB = true; emit(); });
      const u2 = sep() ? B.on(`classes/${S.cid}/${opOf(game())}rating`, v => { rating = v; gotR = true; emit(); }) : () => {};
      return () => { u1(); u2(); };
    },
    tx: (p, fn) => {
      const a = String(p).split("/");
      const path = (sep() && a[0] === "users" && a.length === 2) ? `${opOf(game())}rating/${a[1]}` : mapOne(p);
      return B.tx(`classes/${S.cid}/${path}`, fn);
    }
  };

  // ===== [추가] 게임 고르기 =====
  Object.defineProperty(window, "BoardView", { configurable: true, get: () => ({ omok: window.OmokBoardView, alkkagi: window.AlkkagiBoardView, bell: window.BellBoardView, draw: window.DrawBoardView })[game()] || window.ChessBoardView });
  const GAME_TITLE = { alkkagi: e("알까기 아레나"), omok: e("오목 아레나"), chess: e("체스 아레나"), bell: e("갈리할리"), draw: e("내가 그린 기린 그림") };
  function applyGameLook() {
    $$(".brand").forEach(b => { b.textContent = GAME_TITLE[game()]; });
    document.title = `${GAME_TITLE[game()]} · ${e("보드게임 아레나")}`;
    document.body.dataset.game = game();
  }
  let pickedThisLogin = false;   // 로그인할 때마다 시작 메뉴에서 게임을 골라요 (지난번 게임은 표시만)
  function goHome() {
    if (!GAME || !pickedThisLogin) { show("pick"); return; }
    applyGameLook();
    show(S.isMaster ? "admin" : "student");
  }
  async function setGame(kind) {
    if (!KINDS.includes(kind)) return;
    if (kind !== GAME) {
      lastKnownTier = null; lastPromoKey = undefined; userGames = {};
      if (gameUnsub) { gameUnsub(); gameUnsub = null; }
      S.curGameId = null; S.curGame = null; S.selSq = -1; S.ghost = null; S.users = {};
    }
    GAME = kind; pickedThisLogin = true;
    try { localStorage.setItem("arenaGame", kind); } catch {}
    applyGameLook();
    if (S.cid) await enterClass(S.cid);
    goHome();
  }
  let pickDrawn = false;
  function renderPick() {
    if (!pickDrawn && window.OmokBoardView && window.ChessBoardView) {
      pickDrawn = true;
      const om = $('.gc-canvas[data-art="omok"]'), ch = $('.gc-canvas[data-art="chess"]'), ak = $('.gc-canvas[data-art="alkkagi"]'), bl = $('.gc-canvas[data-art="bell"]');
      if (bl && window.BellBoardView) new window.BellBoardView(bl, { mini: true }).set({ moves: [] });
      const dw = $('.gc-canvas[data-art="draw"]'); if (dw && window.DrawBoardView) new window.DrawBoardView(dw, { mini: true });
      if (ak && window.AlkkagiBoardView) new window.AlkkagiBoardView(ak, { mini: true }).set({ moves: [] });
      if (om) new window.OmokBoardView(om, { mini: true }).set({ moves: [112, 113, 97, 127, 82, 98, 128, 67, 126] });
      if (ch) new window.ChessBoardView(ch, { mini: true }).set({ moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"] });
    }
    $$(".game-card").forEach(b => b.classList.toggle("on", b.dataset.game === GAME));
    $("#pick-logout").classList.toggle("hidden", !S.uid);
    if (!S.isMaster && S.uid && S.cid) {
      const show1 = (kind, u) => {
        const el = $(`.gc-tier[data-tier="${kind}"]`); if (!el) return;
        if (!u || u.score == null) { el.textContent = e("아직 경기 없음 · 배치고사 0/{0}", R.PLACEMENT_GAMES); return; }
        el.textContent = (u.placed || 0) < R.PLACEMENT_GAMES ? e("배치고사 {0}/{1}", u.placed || 0, R.PLACEMENT_GAMES) : e("{0} · {1}점", R.tierOf(u.score).id === "challenger" ? e("마스터 이상") : R.tierOf(u.score).name, u.score);
      };
      B.get(`classes/${S.cid}/users/${S.uid}`).then(u => show1("chess", u)).catch(() => {});
      for (const k of KINDS) if (k !== "chess") B.get(`classes/${S.cid}/${opOf(k)}rating/${S.uid}`).then(u => show1(k, u)).catch(() => {});
    } else $$(".gc-tier").forEach(el => { el.textContent = S.isMaster ? e("선생님 화면도 게임별로 따로 관리돼요") : ""; });
  }

  function emblem(tierId, div) {
    return window.TierEmblem ? window.TierEmblem.svg(tierId, div) : `<svg class="emb" viewBox="0 0 48 48" aria-hidden="true"></svg>`;
  }

  // [수정] 챌린저는 챌린저 점수 이상인 학생 중 상위 3명만, 챔피언은 그 챌린저 중 1위
  const CHALLENGER_MAX = 3;
  function rankKey(u) { return [u.score ?? 0, u.wins || 0, -(u.losses || 0), -(u.scoreAt || u.placedAt || 0)]; }
  function cmpKey(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i]; return 0; }
  function computeTop(users) {
    const ch = R.TIERS.find(t => t.id === "challenger"), min = ch ? ch.min : Infinity;
    return Object.entries(users || {})
      .filter(([, u]) => u && (u.placed || 0) >= R.PLACEMENT_GAMES && (u.score ?? 0) >= min)
      .sort((a, b) => cmpKey(rankKey(a[1]), rankKey(b[1])))
      .slice(0, CHALLENGER_MAX).map(([uid]) => uid);
  }
  function tierOfUid(uid) {
    if (!uid || String(uid).startsWith("ai:")) return { id: "ai", name: "AI" };
    const t = R.displayTier(S.users[uid], uid, S.champion);
    if (t.id === "challenger" && !(S.challengers || []).includes(uid)) return R.TIERS.find(x => x.id === "master") || t;   // 4위부터는 마스터
    return t;
  }
  // 이름 칸 테두리용 작은 날개·왕관 (바둑돌 스킨과 같은 규칙)
  function skinDeco(sk) {
    const w = ["gold", "platinum", "diamond", "champion"].includes(sk) ? `<i class="sk-w l"></i><i class="sk-w r"></i>` : "";
    const c = ["master", "challenger", "champion"].includes(sk) ? `<i class="sk-c">👑</i>` : "";
    return w + c;
  }
  // ===== [추가] 승리의 스킨: 이 게임에서 시즌을 다이아 이상으로 마친 적이 있으면 받아요 =====
  const VICTORY_TIERS = ["diamond", "master", "challenger", "champion"];
  const VSKIN_OPTS = {
    omok: [["", "기본 바둑판"], ["board", "승리의 바둑판"]],
    alkkagi: [["", "기본 바둑판"], ["board", "승리의 바둑판"]],
    chess: [["", "기본 체스판"], ["board", "승리의 체스판"]],
    bell: [["", "기본 카드 뒷면"], ["card", "승리의 카드 뒷면"]],
    draw: [["", "기본 스케치북"], ["board", "승리의 스케치북"]]
  };
  function victorySeasons(uid) {
    const out = [];
    for (const se of Object.values(S.seasons || {})) {
      if (!se) continue;
      let id = se.tiers && se.tiers[uid];
      if (!id) { if (se.champion === uid) id = "champion"; else { const row = (se.top || []).find(r => r && r.uid === uid); const t = row && R.TIERS.find(x => x.name === row.tier); id = t && t.id; } }
      if (VICTORY_TIERS.includes(id)) out.push(se.name || "");
    }
    return out;
  }
  const S0_LABEL = { omok: "시즌0 바둑판", alkkagi: "시즌0 바둑판", chess: "시즌0 체스판", bell: "시즌0 카드 뒷면", draw: "시즌0 스케치북" };
  function s0Granted(uid) { return !!(S.s0grants || {})[uid]; }   // 시즌 0 한정판: 선생님이 준 학생만 (자동 지급 없음)
  function vGranted(uid, kind) { const v = (S.vgrants || {})[uid]; return !!(v && v[kind || game()]); }   // 선생님이 직접 준 승리의 스킨
  function hasVictory(uid) { return vGranted(uid) || victorySeasons(uid).length > 0; }
  function myVskin(g) {
    if (!g || S.spectate || !S.uid || !myColor(g)) return null;
    const u = S.users[S.uid]; if (!u || !u.vskin) return null;
    if (u.vskin === "s0") return s0Granted(S.uid) ? "s0" : null;
    return hasVictory(S.uid) ? u.vskin : null;
  }
  function drawVictoryPreview(cv, kind, v) {
    const ctx = cv.getContext("2d"), W = cv.width, SK = window.StoneSkin; if (!SK) return;
    ctx.clearRect(0, 0, W, W);
    if (v === "s0") {   // 시즌 0 한정판 미리보기
      const T = SK.theme("s0");
      if (kind === "chess") {
        const c = W / 4; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { ctx.fillStyle = (x + y) % 2 ? T.sqDark[0] : T.sqLight[0]; ctx.fillRect(x * c, y * c, c, c); }
        T.overlay(ctx, 0, 0, W, W); ctx.strokeStyle = SK.goldGrad(ctx, 0, 0, W, W); ctx.lineWidth = 4; ctx.strokeRect(2, 2, W - 4, W - 4);
        if (window.ChessPiece) window.ChessPiece(ctx, "k", "w", W * .5, W * .46, W * .78, null);
      } else if (kind === "bell") {
        ctx.fillStyle = "#e9c995"; ctx.fillRect(0, 0, W, W); SK.s0BoardBg(ctx, W * .25, W * .12, W * .5, W * .76);
      } else if (kind === "draw") {
        SK.s0BoardBg(ctx, 0, 0, W, W); ctx.fillStyle = "#fffdf6"; ctx.fillRect(14, 14, W - 28, W - 28);
        ctx.strokeStyle = "#1b2a8a"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(W * .25, W * .65); ctx.quadraticCurveTo(W * .45, W * .25, W * .72, W * .5); ctx.stroke();
      } else {
        SK.s0BoardBg(ctx, 0, 0, W, W); ctx.strokeStyle = T.line; ctx.lineWidth = 1;
        for (let i = 1; i < 6; i++) { const q = i * W / 6; ctx.beginPath(); ctx.moveTo(q, 0); ctx.lineTo(q, W); ctx.moveTo(0, q); ctx.lineTo(W, q); ctx.stroke(); }
      }
      return;
    }
    const plain = (cx, cy, r, col) => { const g = ctx.createRadialGradient(cx - r * .3, cy - r * .3, r * .08, cx, cy, r);
      if (col === 1) { g.addColorStop(0, "#626268"); g.addColorStop(.55, "#19191c"); g.addColorStop(1, "#050507"); } else { g.addColorStop(0, "#fff"); g.addColorStop(.65, "#ece9e2"); g.addColorStop(1, "#bab5aa"); }
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); };
    const wood = () => { const g = ctx.createLinearGradient(0, 0, W, W); g.addColorStop(0, "#e5bd78"); g.addColorStop(1, "#c69546"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, W); };
    const grid = col => { ctx.strokeStyle = col; ctx.lineWidth = 1; for (let i = 1; i < 6; i++) { const p = i * W / 6; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, W); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke(); } };
    if (kind === "omok" || kind === "alkkagi") {
      if (v === "board") { SK.victoryBoardBg(ctx, 0, 0, W, W); grid(SK.VICTORY.line); plain(W * .33, W * .5, W * .14, 1); plain(W * .67, W * .5, W * .14, 2); }
      else { wood(); grid("rgba(42,26,8,.5)");
        if (v === "stone") { SK.victoryStone(ctx, W * .33, W * .5, W * .17, 1); SK.victoryStone(ctx, W * .67, W * .5, W * .17, 2); }
        else { plain(W * .33, W * .5, W * .17, 1); plain(W * .67, W * .5, W * .17, 2); } }
    } else if (kind === "chess") {
      const c = W / 4;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const d = (x + y) % 2; ctx.fillStyle = v === "board" ? (d ? SK.VICTORY.sqDark[0] : SK.VICTORY.sqLight[0]) : (d ? "#a86b3a" : "#f0d6a8"); ctx.fillRect(x * c, y * c, c, c); }
      if (v === "board") { ctx.strokeStyle = SK.goldGrad(ctx, 0, 0, W, W); ctx.lineWidth = 4; ctx.strokeRect(2, 2, W - 4, W - 4); }
      if (window.ChessPiece) window.ChessPiece(ctx, "k", "w", W * .5, W * .46, W * .78, v === "piece" ? "victory" : null);
    } else if (kind === "draw") {
      ctx.fillStyle = v === "board" ? "#6a6fd2" : "#c9b48a"; ctx.fillRect(0, 0, W, W);
      if (v === "board") { ctx.strokeStyle = SK.goldGrad(ctx, 0, 0, W, W); ctx.lineWidth = 5; ctx.strokeRect(6, 6, W - 12, W - 12); }
      ctx.fillStyle = "#fffdf6"; ctx.fillRect(12, 12, W - 24, W - 24);
      ctx.strokeStyle = v === "board" ? "#5a4db3" : "#6d4c1d"; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(W * .25, W * .65); ctx.quadraticCurveTo(W * .45, W * .25, W * .72, W * .5); ctx.stroke();
      if (v === "board") { ctx.fillStyle = "#ffc928"; [[16, 16], [W - 16, 16], [16, W - 16], [W - 16, W - 16]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); }); }
    } else if (kind === "bell") {
      const el = document.createElement("div");
      ctx.fillStyle = "#e9c995"; ctx.fillRect(0, 0, W, W);
      const x = W * .25, y = W * .12, w = W * .5, h = W * .76;
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      if (v === "card") { g.addColorStop(0, "#3a2a9c"); g.addColorStop(.5, "#2f6bff"); g.addColorStop(1, "#8b5cf6"); } else { g.addColorStop(0, "#7b3fa0"); g.addColorStop(1, "#6a318c"); }
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = v === "card" ? SK.goldGrad(ctx, x, y, x + w, y + h) : "#fff"; ctx.lineWidth = 4; ctx.strokeRect(x, y, w, h);
      if (v === "card") { ctx.strokeStyle = "rgba(255,214,120,.55)"; ctx.lineWidth = 1; for (let k = -h; k < w + h; k += 10) { ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + k + h, y + h); ctx.moveTo(x + k + h, y); ctx.lineTo(x + k, y + h); ctx.stroke(); } ctx.strokeRect(x, y, w, h); }
    }
  }
  async function setVskin(v) {
    try { await D.update("", { [`users/${S.uid}/vskin`]: v || null }); toast(v ? e("승리의 스킨을 장착했어요 ✨") : e("기본 모습으로 바꿨어요"), "good"); }
    catch (err) { toast(friendlyErr(err), "bad"); }
  }
  function stoneSkinOf(uid) {
    if (!uid || isAiUid(uid) || !window.StoneSkin) return null;
    const u = S.users[uid]; if (!u || (u.placed || 0) < R.PLACEMENT_GAMES) return null;
    return window.StoneSkin.skinOf(tierOfUid(uid).id);
  }
  const tierRank = id => id === "champion" ? R.TIERS.length : R.TIERS.findIndex(t => t.id === id);

  function nameOf(uid, extra = {}) {
    if (!uid) return "-";
    if (uid === "ai" || String(uid).startsWith("ai:")) return `AI (${AI_NAMES[extra.level || "normal"] || ""})`;
    return (S.users[uid] && S.users[uid].name) || e("알 수 없음");
  }

  // [추가] 지난 시즌 티어 테두리: 가장 최근에 끝난 시즌의 최종 티어로 이름표 바깥에 테두리를 달아요 (게임마다 따로)
  let lastSeasonCache = { src: null, season: null };
  function lastSeason() {
    if (lastSeasonCache.src !== S.seasons) {
      const list = Object.values(S.seasons || {}).filter(x => x && x.endedAt).sort((a, b) => b.endedAt - a.endedAt);
      lastSeasonCache = { src: S.seasons, season: list[0] || null };
    }
    return lastSeasonCache.season;
  }
  function prevTierOf(uid) {
    const se = lastSeason(); if (!se) return null;
    let id = se.tiers && se.tiers[uid];
    if (!id) {                                                // 예전에 끝난 시즌: 상위 10명 기록으로 찾아요
      if (se.champion && se.champion === uid) id = "champion";
      else { const row = (se.top || []).find(r => r && r.uid === uid); const t = row && R.TIERS.find(x => x.name === row.tier); id = t && t.id; }
    }
    if (!id) return null;
    const name = id === "champion" ? e("챔피언") : ((R.TIERS.find(x => x.id === id) || {}).name || "");
    return { id, name, season: se.name || "" };
  }
  function nameTag(uid, size = "", extra = {}) {
    if (!uid) return "";
    if (uid === "ai" || String(uid).startsWith("ai:")) {
      return `<span class="ntag t-ai ${size}">${emblem("ai")}<span class="nm">${esc(nameOf(uid, extra))}</span></span>`;
    }
    const t = tierOfUid(uid);
    const tag = `<span class="ntag t-${t.id} ${size}">${emblem(t.id, t.div)}<span class="nm">${esc(nameOf(uid))}</span></span>`;
    const pt = prevTierOf(uid);
    if (!pt) return tag;
    return `<span class="pframe pf-${pt.id}" title="${esc(e("지난 시즌({0}) {1}", pt.season, pt.name))}">${pt.id === "champion" ? `<i class="pf-crown" aria-hidden="true">👑</i>` : ""}${["master", "challenger", "champion"].includes(pt.id) ? `<i class="pf-wing pf-wl" aria-hidden="true"></i><i class="pf-wing pf-wr" aria-hidden="true"></i>` : ""}${["platinum", "diamond", "master", "challenger", "champion"].includes(pt.id) ? `<i class="pf-sp s1" aria-hidden="true"></i><i class="pf-sp s2" aria-hidden="true"></i>${pt.id !== "platinum" ? '<i class="pf-sp s3" aria-hidden="true"></i>' : ""}` : ""}${tag}</span>`;
  }

  function scoreText(uid) {
    const u = S.users[uid];
    if (!u) return "";
    return (u.placed || 0) < R.PLACEMENT_GAMES ? e("배치고사 {0}/{1}", u.placed || 0, R.PLACEMENT_GAMES) : e("{0}점", u.score);
  }

  // 접속 표시: 30초마다 접속 시각을 새로 쓰고, 2분 30초 안에 소식이 있으면 '접속 중'으로 봐요
  const PRESENCE_TTL = 150000, PRESENCE_BEAT = 30000;
  let presenceStop = null, presenceTimer = null, presencePath = "";
  function beatPresence() {
    if (!presencePath || B.mode === "demo") return;
    B.set(presencePath, presenceData()).catch(() => {});
  }
  // 지금 어느 게임 화면에 있는지도 함께 적어요 (pick = 게임 고르는 화면)
  function presenceData() { return { at: B.now(), g: S.view === "pick" ? "pick" : game() }; }
  function stopPresence() {
    if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = null; }
    let done = Promise.resolve();
    if (presenceStop) { try { done = Promise.resolve(presenceStop()).catch(() => {}); } catch {} presenceStop = null; }
    presencePath = "";
    return done;
  }
  // 로그아웃: 접속 표시를 먼저 지운 뒤(최대 1.5초 기다림) 로그아웃해요
  async function logout() {
    const done = stopPresence();
    await Promise.race([done, new Promise(r => setTimeout(r, 1500))]);
    clearClassListeners();
    B.signOut();
  }
  function startPresence(cid) {
    stopPresence();
    presencePath = `classes/${cid}/presence/${S.uid}`;
    presenceStop = B.setupPresence(presencePath, presenceData) || null;
    beatPresence();
    presenceTimer = setInterval(beatPresence, PRESENCE_BEAT);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { beatPresence(); render(); } });
  window.addEventListener("online", beatPresence);
  window.addEventListener("focus", beatPresence);

  function status(uid) {
    if (S.active && S.active[uid]) return "game";
    if (S.queue && S.queue[uid]) return "queue";
    if (B.mode === "demo" && S.uid === uid) return "idle";
    const p = S.presence && S.presence[uid];
    if (p && (B.now() - (p.at || 0) < PRESENCE_TTL)) return (!p.g || p.g === game()) ? "idle" : "away";
    return "off";
  }
  // 어디에 접속했는지까지 붙인 글자: "접속 중 (오목)", "경기 중 (알까기)" 등
  function presenceGame(uid) {
    const p = S.presence && S.presence[uid];
    return p && (B.now() - (p.at || 0) < PRESENCE_TTL) && p.g ? p.g : "";
  }
  function statusText(uid) {
    const st = status(uid);
    if (st === "off") return STATUS_KO.off;
    if (st === "game" || st === "queue") return `${STATUS_KO[st]} (${GAME_KO[game()]})`;
    const g = presenceGame(uid) || game();
    return `${STATUS_KO.idle} (${GAME_KO[g] || g})`;
  }

  function statusDot(uid) {
    const st = status(uid);
    const cls = st === "game" ? "game" : st === "queue" ? "queue" : st === "idle" ? "on" : st === "away" ? "away" : "";
    return `<span class="dot ${cls}" title="${statusText(uid)}"></span>`;
  }

  function fmtTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function toast(msg, type = "") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    $("#toast-root").appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function modal(html) {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal">${html}</div>`;
    const close = () => bg.remove();
    bg.addEventListener("click", ev => {
      if (ev.target === bg || ev.target.closest("[data-close]")) close();
    });
    $("#modal-root").appendChild(bg);
    return { el: bg, close };
  }

  function confirmBox(title, bodyHtml, okLabel = e("확인"), danger = false) {
    return new Promise(res => {
      const m = modal(`<h3>${esc(title)}</h3>
        <div style="line-height:1.6;font-size:.94em">${bodyHtml}</div>
        <div class="foot">
          <button type="button" class="btn ghost" data-no>${e("취소")}</button>
          <button type="button" class="btn ${danger ? "danger" : "primary"}" data-yes>${esc(okLabel)}</button>
        </div>`);
      m.el.querySelector("[data-no]").onclick = () => { m.close(); res(false); };
      m.el.querySelector("[data-yes]").onclick = () => { m.close(); res(true); };
    });
  }

  function show(view) {
    if (S.view === "admin" && view !== "admin" && window.Admin) window.Admin.leave();
    S.view = view;
    $$(".screen").forEach(el => el.classList.add("hidden"));
    const target = $(`#view-${view}`);
    if (target) target.classList.remove("hidden");
    if (view === "admin" && window.Admin) window.Admin.enter();
    beatPresence();
    render();
  }

  function clearClassListeners() {
    stopPresence();
    classUnsubs.forEach(fn => fn());
    classUnsubs = [];
    if (inviteUnsub) { inviteUnsub(); inviteUnsub = null; }
    if (userGamesUnsub) { userGamesUnsub(); userGamesUnsub = null; }
    S.users = {}; S.active = {}; S.presence = {}; S.queue = {}; S.seasons = {}; S.vgrants = {}; S.s0grants = {}; S.settingsRaw = {}; S.champion = null;
  }

  async function enterClass(cid) {
    clearClassListeners();
    S.cid = cid || null;
    if (!cid) { S.classMeta = {}; refreshAdminListeners(); render(); return; }
    S.classMeta = (await B.get(`classes/${cid}/meta`)) || (S.classList && S.classList[cid]) || { name: cid };

    classUnsubs.push(D.on("settings", v => {
      S.settingsRaw = v || {};
      R.applyTiers(S.settingsRaw);
      if (!S.isMaster && v && v.lang && v.lang !== window.I18N.lang) window.I18N.set(v.lang);
      render();
    }));

    classUnsubs.push(D.on("users", v => {
      S.users = v || {};
      for (const u of Object.values(S.users)) if (u && u.promo && u.promo.to === "challenger") delete u.promo;   // 예전 '챌린저 승급전'은 더 이상 없어요
      S.challengers = computeTop(S.users);
      S.champion = S.challengers[0] || null;            // 챔피언 = 챌린저 중 1위 (챌린저가 없으면 챔피언도 없어요)
      if (!S.isMaster && S.uid && S.users[S.uid]) {
        const curTier = tierOfUid(S.uid).id;
        if (lastKnownTier && (S.users[S.uid].placed || 0) >= R.PLACEMENT_GAMES && tierRank(curTier) > tierRank(lastKnownTier) && tierRank(lastKnownTier) >= 0) {
          window.TierUp && window.TierUp.show(lastKnownTier === "champion" ? "challenger" : lastKnownTier, curTier === "champion" ? "challenger" : curTier);
        }
        lastKnownTier = curTier;
        const pNow = S.users[S.uid].promo;
        if (pNow && lastPromoKey === null) toast(e("🔥 승급전이 시작됐어요! 3판 중 2판을 이기면 승급해요."), "good");
        lastPromoKey = pNow ? pNow.to : null;
      }
      render();
    }));

    classUnsubs.push(D.on("active", v => {
      S.active = v || {};
      if (!S.isMaster && S.uid) {
        const agid = S.active[S.uid];
        if (agid && S.curGameId !== agid) openGame(agid, { spectate: false });
      }
      render();
    }));

    classUnsubs.push(D.on("presence", v => { S.presence = v || {}; render(); }));
    classUnsubs.push(D.on("queue", v => { S.queue = v || {}; render(); }));
    classUnsubs.push(D.on("seasons", v => { S.seasons = v || {}; render(); }));
    classUnsubs.push(D.on("vgrants", v => { S.vgrants = v || {}; render(); }));
    classUnsubs.push(D.on("s0grants", v => { S.s0grants = v || {}; render(); }));   // [추가] 시즌 0 한정판 승리의 스킨   // [추가] 선생님이 준 승리의 스킨 (게임 5개 공통 경로)
    if (game() === "bell" || game() === "draw") classUnsubs.push(D.on("rooms", v => { bellRooms = v || {}; render(); }));

    if (!S.isMaster && S.uid) {
      startPresence(cid);
      userGamesUnsub = D.on(`userGames/${S.uid}`, v => { userGames = v || {}; render(); });
      inviteUnsub = D.on(`invites/${S.uid}`, inv => {
        if (!inv || !inv.id || handledInviteId === inv.id) return;
        handledInviteId = inv.id;
        showIncomingInvite(inv);
      });
    }
    refreshAdminListeners();
    render();
  }

  // [수정] 선생님 화면이 먼저 열리고 반이 나중에 정해지면, 실시간 경기·경기 기록이 빈 반(null)을 보고 있던 문제.
  // 반이 바뀔 때마다 선생님 화면의 실시간 구독을 새 반으로 다시 연결해요.
  function refreshAdminListeners() {
    if (S.view === "admin" && window.Admin) { window.Admin.leave(); window.Admin.enter(); }
  }

  function rankingOrder() {
    const placed = [], placing = [];
    for (const [uid, u] of Object.entries(S.users || {})) {
      if ((u.placed || 0) >= R.PLACEMENT_GAMES) placed.push(uid); else placing.push(uid);
    }
    placed.sort((a, b) => {
      const ua = S.users[a], ub = S.users[b];
      return (ub.score - ua.score) || ((ub.wins || 0) - (ua.wins || 0)) || ((ua.losses || 0) - (ub.losses || 0));
    });
    placing.sort((a, b) => String(S.users[a].name).localeCompare(String(S.users[b].name)));
    return { placed, placing };
  }

  // --- 대국 생성 · 진행 · 종료 (black = 선공 = 체스의 백) ---
  async function createPvp(blackUid, whiteUid, mode, matchType, autoStart = true) {
    if (!blackUid || !whiteUid || blackUid === whiteUid) throw new Error("서로 다른 두 학생이 필요해요.");
    if (game() === "bell") return createBellGame([blackUid, whiteUid], mode, matchType, autoStart);
    if (game() === "draw") return createDrawGame([blackUid, whiteUid], mode, matchType, autoStart);
    const gid = B.newKey();
    const now = B.now();
    const uB = S.users[blackUid] || {};
    const uW = S.users[whiteUid] || {};
    const st = settings();
    const isOmok = game() !== "chess";   // 오목·알까기: 한 수 제한 시간
    const tmMin = isOmok ? 0 : (mode === "rank" ? st.clockRank : st.clockNormal);
    const tm = tmMin > 0 ? { f: tmMin * 60000, s: tmMin * 60000 } : null;   // 체스: f=선공, s=후공 남은 시간(ms)
    const mvSec = isOmok ? Number(mode === "rank" ? st.moveTimeRank : st.moveTimeNormal) || 0 : 0;   // 오목: 한 수 제한 시간
    const gm = Object.assign({
      id: gid, mode, matchType, black: blackUid, white: whiteUid, moves: [],
      status: autoStart ? "active" : "waiting",
      ready: autoStart ? { [blackUid]: true, [whiteUid]: true } : {},
      pre: {
        [blackUid]: { score: uB.score ?? R.START_SCORE, placed: uB.placed || 0 },
        [whiteUid]: { score: uW.score ?? R.START_SCORE, placed: uW.placed || 0 }
      },
      createdAt: now, turnAt: now, kind: game()
    }, tm ? { tm, tm0: tmMin * 60000 } : {}, mvSec > 0 ? { moveLimit: mvSec * 1000 } : {});
    await D.update("", {
      [`games/${gid}`]: gm,
      [`live/${gid}`]: { createdAt: now },
      [`active/${blackUid}`]: gid,
      [`active/${whiteUid}`]: gid
    });
    return gid;
  }

  async function startAiGame(mode, level) {
    const gid = B.newKey();
    const now = B.now();
    const isBlack = Math.random() < 0.5;
    const black = isBlack ? S.uid : `ai:${level}`;
    const white = isBlack ? `ai:${level}` : S.uid;
    const gm = { id: gid, mode: mode === "rank" ? "rank" : "normal", matchType: "ai", aiLevel: level, black, white, moves: [], status: "active", createdAt: now, turnAt: now, kind: game() };
    await D.update("", {
      [`games/${gid}`]: gm,
      [`live/${gid}`]: { createdAt: now },
      [`active/${S.uid}`]: gid
    });
    openGame(gid, { spectate: false });
  }

  async function cancelGame(gid) {
    const g = await D.get(`games/${gid}`);
    if (!g) return;
    const updates = { [`games/${gid}/status`]: "cancelled", [`live/${gid}`]: null };
    if (g.black && !String(g.black).startsWith("ai:")) updates[`active/${g.black}`] = null;
    if (g.white && !String(g.white).startsWith("ai:")) updates[`active/${g.white}`] = null;
    await D.update("", updates);
  }

  async function finalize(gid) {
    const g = await D.get(`games/${gid}`);
    if (!g) { await D.remove(`live/${gid}`); return; }
    const updates = { [`live/${gid}`]: null };
    if (g.black && !String(g.black).startsWith("ai:") && S.active[g.black] === gid) updates[`active/${g.black}`] = null;
    if (g.white && !String(g.white).startsWith("ai:") && S.active[g.white] === gid) updates[`active/${g.white}`] = null;
    await D.update("", updates);
  }

  function openGame(gid, opts = {}) {
    if (gameUnsub) { gameUnsub(); gameUnsub = null; }
    if (aiTimeout) { clearTimeout(aiTimeout); aiTimeout = null; }
    S.curGameId = gid;
    S.curGame = null;
    S.spectate = !!opts.spectate;
    S.selSq = -1; S.ghost = null;
    const ov = $("#board-overlay");
    if (ov) delete ov.dataset.dismissed;   // [수정] 이전 경기에서 닫은 결과창 상태가 다음 경기로 넘어가지 않게
    show("game");

    if (!boardView || boardKind !== game()) {
      if (boardView) boardView.destroy();
      const cv = $("#game-canvas"), fresh = cv.cloneNode(false);   // 캔버스를 새로 만들어 이전 판의 그림·이벤트를 지워요
      cv.replaceWith(fresh);
      boardView = new window.BoardView(fresh, { interactive: true, labels: true, onTap: onBoardTap, onShot, onAnimEnd: () => renderGame(), onFlip: bellFlip, onRing: bellRing, onStroke: drawSendStroke, newKey: () => B.newKey() });
      boardKind = game();
    }

    emoSeen = null;   // 이 경기를 열기 전에 보낸 이모티콘은 다시 띄우지 않아요
    gameUnsub = D.on(`games/${gid}`, g => {
      S.curGame = g;
      if (!g) return;
      showNewEmojis(g);
      renderGame();
      maybeTriggerAiMove(g);
    });
  }

  function myColor(g) {
    if (!g || S.spectate) return 0;
    if (g.kind === "bell" || g.players) { const i = (g.players || []).indexOf(S.uid); return i >= 0 ? i + 1 : 0; }
    if (g.black === S.uid) return 1;
    if (g.white === S.uid) return 2;
    return 0;
  }

  function askPromo(cb) {
    const m = modal(`<h3>승급할 기물</h3><div class="pick-list">${[["q", "♕ 퀸"], ["r", "♖ 룩"], ["b", "♗ 비숍"], ["n", "♘ 나이트"]].map(([k, l]) => `<button type="button" class="pick-item" data-p="${k}">${l}</button>`).join("")}</div>`);
    m.el.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { m.close(); cb(b.dataset.p); });
  }

  function onBoardTap(idx) {
    if (game() === "omok") return omokTap(idx);
    const g = S.curGame;
    if (!g || g.status !== "active" || S.spectate) return;
    const mc = myColor(g), moves = g.moves || [], turn = moves.length % 2 === 0 ? 1 : 2;
    if (mc !== turn) return;
    const c = CR.from(moves), sq = CR.sq(idx), p = c.get(sq);
    const mine = p && ((p.color === "w") === (mc === 1));
    if (S.selSq >= 0 && CR.targets(c, CR.sq(S.selSq)).includes(sq)) {
      const from = CR.sq(S.selSq);
      if (settings().confirmMove && !(S.ghost && S.ghost.to === idx)) {   // 두 번 눌러 착수
        S.ghost = { from: S.selSq, to: idx }; renderGame(); return;
      }
      S.selSq = -1; S.ghost = null;
      CR.isPromo(c, from, sq) ? askPromo(pr => commitUci(from + sq + pr)) : commitUci(from + sq);
      return;
    }
    S.ghost = null; S.selSq = mine ? idx : -1; renderGame();
  }

  async function commitUci(uci) {
    const g = S.curGame;
    if (!g || g.status !== "active") return;
    const prev = g.moves || [], color = prev.length % 2 === 0 ? 1 : 2, now = B.now();
    const r = CR.play(prev, uci.slice(0, 2), uci.slice(2, 4), uci[4]);
    if (!r) return;
    const moves = prev.concat(r.uci);
    const mover = color === 1 ? g.black : g.white, other = color === 1 ? g.white : g.black;
    let tm = null;
    if (g.tm) {
      tm = Object.assign({}, g.tm);
      const k = color === 1 ? "f" : "s";
      tm[k] = tm[k] - (now - (g.turnAt || g.createdAt)) + (settings().increment || 0) * 1000;
      if (tm[k] <= 0) return finishGame(g, prev, { winner: other, reason: "timeout", moves: prev.length });
    }
    if (r.end === "checkmate") await finishGame(g, moves, { winner: mover, reason: "checkmate", moves: moves.length });
    else if (r.end) await finishGame(g, moves, { winner: null, reason: r.end, moves: moves.length });
    else await D.update(`games/${g.id}`, Object.assign({ moves, turnAt: now }, tm ? { tm } : {}));
  }

  // ===== [추가] 오목 진행 (렌주룰: 흑은 삼삼·사사·장목 금지) =====
  const OMOK_N = 15;
  function forbidShown(g) {
    const v = settings().showForbidden || "normal";
    return v === "all" || (v === "normal" && g.mode !== "rank");
  }
  function omokTap(idx) {
    const g = S.curGame;
    if (!g || g.status !== "active" || S.spectate) return;
    const mc = myColor(g), moves = g.moves || [], turn = moves.length % 2 === 0 ? 1 : 2;
    if (mc !== turn) return;
    const board = window.Renju.boardFromMoves(moves);
    if (board[idx]) return;
    if (turn === 1 && forbidShown(g)) {
      const f = window.Renju.forbidden(board, idx);
      if (f) { toast(e("금수 자리예요: {0}", window.Renju.REASON_KO[f] || f), "bad"); return; }
    }
    if (settings().confirmMove && S.ghost !== idx) { S.ghost = idx; renderGame(); return; }
    S.ghost = null;
    commitOmok(idx);
  }
  async function commitOmok(idx) {
    const g = S.curGame;
    if (!g || g.status !== "active") return;
    const prev = g.moves || [], color = prev.length % 2 === 0 ? 1 : 2, now = B.now();
    if (prev.includes(idx) || idx < 0 || idx >= OMOK_N * OMOK_N) return;
    const mover = color === 1 ? g.black : g.white, other = color === 1 ? g.white : g.black;
    if (g.moveLimit && now - (g.turnAt || g.createdAt) > g.moveLimit + 1500) return finishGame(g, prev, { winner: other, reason: "timeout", moves: prev.length });
    const ev = window.Renju.evaluateMove(window.Renju.boardFromMoves(prev), idx, color);
    const moves = prev.concat(idx);
    if (ev.end === "foul") return finishGame(g, moves, { winner: other, reason: "foul", detail: ev.reason, moves: moves.length });
    if (ev.end === "five") return finishGame(g, moves, { winner: mover, reason: "five", moves: moves.length });
    if (moves.length >= OMOK_N * OMOK_N) return finishGame(g, moves, { winner: null, reason: "full", moves: moves.length });
    await D.update(`games/${g.id}`, { moves, turnAt: now });
  }

  // ===== [추가] 알까기 진행: 드래그해서 놓으면(onShot) 물리 계산 결과까지 함께 저장 =====
  const AK = () => window.Alkkagi;
  function onShot(sIdx, vx, vy) {
    const g = S.curGame;
    if (!g || g.status !== "active" || S.spectate || game() !== "alkkagi") return;
    const mc = myColor(g), turn = (g.moves || []).length % 2 === 0 ? 1 : 2;
    if (mc !== turn || AK().colorOf(sIdx, AK().posOf(g.moves).length) !== mc) return;
    commitShot({ s: sIdx, vx, vy });
  }
  async function commitShot(shot) {
    const g = S.curGame;
    if (!g || g.status !== "active") return;
    const prev = g.moves || [], color = prev.length % 2 === 0 ? 1 : 2, now = B.now();
    const pos = AK().posOf(prev);
    if (!pos[shot.s] || !pos[shot.s].a || AK().colorOf(shot.s, pos.length) !== color) return;
    const mover = color === 1 ? g.black : g.white, other = color === 1 ? g.white : g.black;
    if (g.moveLimit && now - (g.turnAt || g.createdAt) > g.moveLimit + 1500) return finishGame(g, prev, { winner: other, reason: "timeout", moves: prev.length });
    const after = AK().simulate(pos, shot.s, shot.vx, shot.vy, false).after;
    const moves = prev.concat({ s: shot.s, vx: shot.vx, vy: shot.vy, after });
    const me = AK().aliveCount(after, color), op = AK().aliveCount(after, 3 - color);
    if (!op || !me) return finishGame(g, moves, { winner: op === 0 && me > 0 ? mover : me === 0 && op > 0 ? other : null, reason: "out", moves: moves.length });
    if (moves.length >= 100) {
      const b = AK().aliveCount(after, 1), w = AK().aliveCount(after, 2);
      return finishGame(g, moves, { winner: b > w ? g.black : w > b ? g.white : null, reason: "limit", moves: moves.length });
    }
    await D.update(`games/${g.id}`, { moves, turnAt: now });
  }

  function maybeTriggerAiMove(g) {
    if (!g || g.kind === "bell" || g.status !== "active" || g.matchType !== "ai" || S.spectate) return;
    const moves = g.moves || [];
    const turnUid = moves.length % 2 === 0 ? g.black : g.white;
    if (!String(turnUid).startsWith("ai:")) return;
    if (aiTimeout) return;
    aiTimeout = setTimeout(async () => {
      aiTimeout = null;
      const cur = S.curGame;
      if (cur === null) return null;   // 처음엔 서버 값을 모를 수 있어요 → null을 돌려주면 서버 값으로 다시 시도해요
      if (!cur || cur.id !== g.id || cur.status !== "active") return;
      if ((cur.moves || []).length !== moves.length) return;
      if (game() === "alkkagi") {
        if (boardView && boardView.busy) { aiTimeout = null; setTimeout(() => maybeTriggerAiMove(S.curGame), 300); return; }   // 알이 다 멈춘 뒤에 쏴요
        const shot = window.Alkkagi.pickShot(moves, cur.aiLevel || "normal");
        if (shot) await commitShot(shot);
      } else if (game() === "omok") {
        const idx = window.OmokAI.pick(moves, cur.aiLevel || "normal");
        if (idx >= 0) await commitOmok(idx);
      } else {
        const pick = window.ChessAI.pick(moves, cur.aiLevel || "normal");
        if (pick) await commitUci(pick);
      }
    }, 450);
  }

  // [수정] 같은 경기를 두 번 끝내지 않도록 막는 표시 (시계가 0.25초마다 돌면서 점수가 여러 번 반영되던 문제)
  const finishing = new Set();
  // ===== [추가] 승급전: 다음 티어 점수에 닿으면 바로 올라가지 않고 3판 2선승 승급전 =====
  //  - 승급전 동안은 점수가 바뀌지 않아요. 2승 → 다음 티어 시작 점수로 승급 / 2패 → 승급전 실패, 설정한 만큼 점수 하락
  //  - 무승부·하루 한도 초과(연습 처리)·배치고사 경기는 승급전에 세지 않아요.
  function promoOn() { const st = settings(); return st.promoSeries !== false && st.promoSeries !== "false"; }
  // [추가] 강등 보호: 지고 나서 아래 티어로 떨어질 점수가 되면, 처음 한 번은 그 티어 최저 점수(예: 플래티넘 1100점)에서 멈춰요.
  //  그 상태(보호 중)에서 한 판 더 지면 그때 강등돼요. 이기면 보호가 풀려요.
  function demoteShield(prev, next, d, won, draw, now) {
    if (!d || !d.counted || d.placement || prev.promo || next.promo) { if (won) delete next.shield; return null; }
    const ps = prev.score ?? R.START_SCORE, ns = next.score ?? ps;
    // [수정] 다이아 3·2·1 단계도 강등 방어전이 있어요 (승급전은 없음)
    const cur = R.tierOf(ps), ci = R.divLevel(ps), ni = R.divLevel(ns), key = cur.id + (cur.div || "");
    if (won || ns >= ps) { if (next.shield) delete next.shield; return null; }
    if (draw) return null;
    if (ni >= ci || R.tierIndex(ps) <= 0) return null;                          // 같은 단계 안이거나 브론즈면 그대로
    if (prev.shield && prev.shield.tier === key) {                               // 이미 방어전 상태에서 또 짐 → 강등
      delete next.shield;
      const lowMin = R.tierOf(cur.min - 1).min;                                   // 한 번에 한 단계만 내려가요 (아래 단계 가운데쯤)
      if (isFinite(lowMin)) next.score = Math.max(ns, Math.round((lowMin + cur.min) / 2));
      return { state: "demoted", note: e("강등… {0} → {1}", cur.name, R.tierOf(next.score).name) };
    }
    next.score = cur.min; next.shield = { tier: key, at: now };
    return { state: "shield", note: e("🛡️ 강등 방어전! {0} {1}점에서 멈췄어요. 한 판 더 지면 강등돼요", cur.name, cur.min) };
  }
  function applyPromoShield(prev, next, d, won, draw, now) {
    // [추가] 다이아 3·2·1은 승급전 없이 바로 올라가지만, 한 판에 한 단계씩만 올라가요
    if (won && d && d.counted && !d.placement && !prev.promo && R.tierOf(prev.score ?? R.START_SCORE).id === "diamond") {
      const steps = R.diamondDivs().concat((R.TIERS.find(t => t.id === "master") || {}).min), ps = prev.score ?? R.START_SCORE;
      const i = steps.findIndex((m, k) => ps >= m && (k === steps.length - 1 || ps < steps[k + 1]));
      if (i >= 0 && steps[i + 2] != null && (next.score ?? ps) >= steps[i + 2]) next.score = steps[i + 2] - 1;
    }
    const pr = applyPromo(prev, next, d, won, draw, now);
    if (pr) { delete next.shield; return pr; }
    return demoteShield(prev, next, d, won, draw, now);
  }
  function applyPromo(prev, next, d, won, draw, now) {
    if (!promoOn() || !d || !d.counted || d.placement || (prev.placed || 0) < R.PLACEMENT_GAMES) {
      if (next.promo && !promoOn()) delete next.promo;
      return null;
    }
    const prevScore = prev.score ?? R.START_SCORE;
    if (prev.promo && prev.promo.to === "challenger") { delete next.promo; return null; }   // [수정] 챌린저는 승급전 없이 점수 순위로 바로 바뀌어요
    if (prev.promo) {
      const p = { to: prev.promo.to, w: prev.promo.w || 0, l: prev.promo.l || 0, at: prev.promo.at || now };
      const to = R.TIERS.find(t => t.id === p.to);
      next.score = prevScore;                         // 승급전 중에는 점수 고정
      if (!to) { delete next.promo; return null; }
      if (draw) { next.promo = p; return { state: "draw", to: p.to, w: p.w, l: p.l, note: e("승급전 무승부 — 다시 한 판") }; }
      won ? p.w++ : p.l++;
      if (p.w >= 2) {
        next.score = Math.max(prevScore, to.min); delete next.promo; next.scoreAt = now;
        return { state: "pass", to: p.to, w: p.w, l: p.l, note: e("{0} 승급전 통과!", to.name) };
      }
      if (p.l >= 2) {
        const drop = Math.max(0, Number(settings().promoFailDrop) || 0);
        next.score = Math.max(0, to.min - 1 - drop); delete next.promo; next.scoreAt = now;
        return { state: "fail", to: p.to, w: p.w, l: p.l, note: e("{0} 승급전 실패 (−{1}점)", to.name, drop) };
      }
      next.promo = p;
      return { state: "on", to: p.to, w: p.w, l: p.l, note: e("{0} 승급전 {1}승 {2}패", to.name, p.w, p.l) };
    }
    const ci = R.tierIndex(prevScore), ni = R.tierIndex(next.score ?? prevScore);
    if (ni > ci && R.TIERS[ci + 1] && R.TIERS[ci + 1].id !== "challenger") {
      const to = R.TIERS[ci + 1];
      next.score = to.min - 1;
      next.promo = { to: to.id, w: 0, l: 0, at: now };
      return { state: "start", to: to.id, w: 0, l: 0, note: e("{0} 승급전 시작! (3판 2선승)", to.name) };
    }
    return null;
  }
  function promoDots(p) {
    const cells = [];
    for (let i = 0; i < p.w; i++) cells.push('<i class="pd w">✓</i>');
    for (let i = 0; i < p.l; i++) cells.push('<i class="pd l">✕</i>');
    while (cells.length < 3) cells.push('<i class="pd"></i>');
    return `<span class="promo-dots">${cells.join("")}</span>`;
  }

  // ===== [추가] 선생님: 관전 중인 경기를 무효 처리 (점수·배치고사·승급전·하루 판수에 반영하지 않음) =====
  async function voidGame(g) {
    if (!S.isMaster || !g) return;
    const fresh = await D.get(`games/${g.id}`).catch(() => null);
    if (!fresh || (fresh.status !== "active" && fresh.status !== "waiting")) { toast(e("이미 끝난 경기예요."), "bad"); return; }
    const now = B.now(), moves = fresh.moves || [];
    const result = { winner: null, reason: "void", moves: moves.length, by: S.uid };
    const updates = {
      [`games/${g.id}/status`]: "finished", [`games/${g.id}/result`]: result, [`games/${g.id}/endedAt`]: now,
      [`games/${g.id}/voided`]: true, [`live/${g.id}`]: null
    };
    const humans = (fresh.players || [fresh.black, fresh.white]).filter(u => u && !String(u).startsWith("ai:"));
    if (fresh.players) { updates[`rooms/${g.id}`] = null; if (fresh.kind === "draw") updates[`draws/${g.id}`] = null; }
    for (const uid of humans) {
      if (S.active[uid] === g.id) updates[`active/${uid}`] = null;
      const opp = uid === fresh.black ? fresh.white : fresh.black;
      updates[`userGames/${uid}/${g.id}`] = { ts: now, mode: fresh.mode, opp, won: false, draw: true, delta: 0, counted: false, note: e("선생님 무효") };
    }
    if (humans.length >= 2) {
      updates[`log/${g.id}`] = Object.assign({ ts: now, mode: fresh.mode, matchType: fresh.matchType, aiLevel: fresh.aiLevel || null,
        black: fresh.black, white: fresh.white || null, winner: null, reason: "void", detail: null, moves: moves.length, deltas: null, voided: true }, fresh.players ? { players: fresh.players, ranks: fresh.players } : {});
    }
    await D.update("", updates);
    toast(e("경기를 무효 처리했어요. 점수에는 반영되지 않아요."), "good");
  }

  // ===== [추가] 이모티콘 채팅: 글자 없이 정해진 이모티콘만 (교실에서 놀리는 말·다툼 방지) =====
  const EMOJIS = ["👍", "👏", "😄", "😮", "😅", "😢", "🔥", "🤝", "🙏", "😎"];
  let emoSeen = null, emoLast = 0;
  function renderEmojiBar(g) {
    const bar = $("#emo-bar"); if (!bar) return;
    const can = !!g && myColor(g) && !S.spectate && (g.status === "active" || g.status === "finished" || g.status === "waiting");
    bar.classList.toggle("hidden", !can);
    if (can && !bar.dataset.ready) {
      bar.innerHTML = EMOJIS.map(x => `<button type="button" class="emo-btn" data-emo="${x}">${x}</button>`).join("");
      bar.dataset.ready = "1";
    }
  }
  async function sendEmoji(x) {
    const g = S.curGame;
    if (!g || !myColor(g) || S.spectate || !EMOJIS.includes(x)) return;
    const now = Date.now();
    if (now - emoLast < 1500) { toast(e("이모티콘은 잠깐 쉬었다가 보낼 수 있어요."), "bad"); return; }   // 도배 방지
    emoLast = now;
    await D.update(`games/${g.id}/chat`, { [B.newKey()]: { u: S.uid, e: x, t: B.now() } });
  }
  function showNewEmojis(g) {
    const chat = g.chat || {}, keys = Object.keys(chat).sort((a, b) => (chat[a].t || 0) - (chat[b].t || 0));
    if (emoSeen === null) { emoSeen = new Set(keys); renderEmojiLog(g); return; }
    for (const k of keys) {
      if (emoSeen.has(k)) continue;
      emoSeen.add(k);
      const c = chat[k]; if (!c || !EMOJIS.includes(c.e)) continue;
      const card = c.u === g.black ? $("#pcard-black") : c.u === g.white ? $("#pcard-white") : null;
      if (card) {   // 선수 카드는 화면을 그릴 때마다 새로 그려지니, 말풍선은 카드 위에 따로 띄워요
        const r = card.getBoundingClientRect(), bub = document.createElement("div");
        bub.className = "emo-bubble"; bub.textContent = c.e;
        bub.style.left = (r.left + r.width / 2) + "px"; bub.style.top = (r.top + r.height * .55) + "px";
        document.body.appendChild(bub);
        setTimeout(() => bub.remove(), 2600);
      }
    }
    renderEmojiLog(g);
  }
  function renderEmojiLog(g) {
    const log = $("#emo-log"); if (!log) return;
    const chat = g.chat || {}, list = Object.values(chat).filter(c => c && EMOJIS.includes(c.e)).sort((a, b) => (a.t || 0) - (b.t || 0)).slice(-12);
    log.innerHTML = list.map(c => `<span class="emo-item"><b>${esc(nameOf(c.u, { level: g.aiLevel }))}</b> ${c.e}</span>`).join("");
    log.classList.toggle("hidden", !list.length);
  }

  async function finishGame(g, finalMoves, result) {
    if (finishing.has(g.id)) return;
    finishing.add(g.id);
    const fresh = await D.get(`games/${g.id}/status`).catch(() => null);
    if (fresh !== "active") { if (fresh == null) finishing.delete(g.id); return; }   // 이미 끝난 경기면 중단 (읽기 실패 시엔 다시 시도 가능)
    const now = B.now();
    const isPvp = !String(g.black).startsWith("ai:") && !String(g.white).startsWith("ai:");
    const updates = {
      [`games/${g.id}/moves`]: finalMoves,
      [`games/${g.id}/status`]: "finished",
      [`games/${g.id}/result`]: result,
      [`games/${g.id}/endedAt`]: now,
      [`live/${g.id}`]: null
    };
    if (!String(g.black).startsWith("ai:")) updates[`active/${g.black}`] = null;
    if (!String(g.white).startsWith("ai:")) updates[`active/${g.white}`] = null;

    let deltas = null;
    if (isPvp && g.mode === "rank") {
      const fakeGame = Object.assign({}, g, { result });
      deltas = R.computeRank(fakeGame, S.users, settings(), now);
      updates[`games/${g.id}/deltas`] = deltas;
      for (const uid of [g.black, g.white]) {
        const opp = uid === g.black ? g.white : g.black;
        const won = result.winner === uid;
        const draw = !result.winner;
        const nextUser = R.applyToUser(S.users[uid], deltas[uid], won, draw, opp, now);
        const pr = applyPromoShield(S.users[uid], nextUser, deltas[uid], won, draw, now);   // [추가] 승급전
        if (pr) deltas[uid] = Object.assign({}, deltas[uid], { delta: (nextUser.score ?? 0) - (S.users[uid].score ?? R.START_SCORE), promo: pr });
        updates[`users/${uid}`] = nextUser;
        updates[`userGames/${uid}/${g.id}`] = { ts: now, mode: "rank", opp, won, draw, delta: deltas[uid].delta, counted: deltas[uid].counted, note: (deltas[uid].promo && deltas[uid].promo.note) || deltas[uid].note || "" };
      }
    } else if (isPvp && g.mode === "normal") {
      for (const uid of [g.black, g.white]) {
        const opp = uid === g.black ? g.white : g.black;
        const won = result.winner === uid;
        const u = Object.assign({}, S.users[uid]);
        if (result.winner) {
          if (won) u.nWins = (u.nWins || 0) + 1; else u.nLosses = (u.nLosses || 0) + 1;
        }
        updates[`users/${uid}`] = u;
        updates[`userGames/${uid}/${g.id}`] = { ts: now, mode: "normal", opp, won, draw: !result.winner, delta: 0, counted: false };
      }
    } else if (!isPvp && S.uid && g.mode === "rank" && S.users[S.uid]) {
      // [추가] AI 랭크전: 플래티넘까지만. 이기면 보통 +15 / 어려움 +30, 지면 −10. 다이아 승급전은 친구와만!
      const me = S.uid, prev = S.users[me], won = result.winner === me, draw = !result.winner, opp = `ai:${g.aiLevel || "normal"}`;
      const v = "__ai_v";
      const fake = { black: me, white: v, matchType: "random", result: { winner: won ? me : draw ? null : v, reason: result.reason, moves: result.moves || 30 } };
      const base = R.computeRank(fake, { [me]: prev, [v]: { score: prev.score, placed: R.PLACEMENT_GAMES } }, settings(), now)[me];
      const elig = aiRankCheck(prev);
      let delta = !elig.ok ? 0 : draw ? 0 : won ? aiRankWin(prev)[g.aiLevel] || 0 : -AI_RANK_LOSS;
      let note = elig.ok ? "" : elig.why;
      let counted = elig.ok && base.counted;
      if (!counted) { delta = 0; note = note || base.note || e("연습 경기로 기록"); }
      else if (won && /이겨도 점수 없음/.test(base.note || "")) { delta = 0; note = base.note; }
      const dMin = aiRankCap();
      if (delta > 0 && (prev.score ?? R.START_SCORE) + delta >= dMin) { delta = Math.max(0, dMin - 1 - (prev.score ?? R.START_SCORE)); note = e("다이아 승급전은 친구와의 랭크전에서만 할 수 있어요"); }
      const dObj = { delta, counted, placement: false, note };
      const nextUser = R.applyToUser(prev, dObj, won, draw, opp, now);
      const pr = counted ? applyPromoShield(prev, nextUser, dObj, won, draw, now) : null;
      if (pr) Object.assign(dObj, { delta: (nextUser.score ?? 0) - (prev.score ?? R.START_SCORE), promo: pr });
      updates[`users/${me}`] = nextUser;
      updates[`games/${g.id}/deltas`] = { [me]: dObj };
      updates[`userGames/${me}/${g.id}`] = { ts: now, mode: "rank", opp, won, draw, delta: dObj.delta, counted, note: (dObj.promo && dObj.promo.note) || (note ? note : e("AI 랭크전")) };
      updates[`log/${g.id}`] = { ts: now, mode: "rank", matchType: "ai", aiLevel: g.aiLevel || null, black: g.black, white: g.white, winner: result.winner || null,
        reason: result.reason, detail: result.detail || null, moves: result.moves, deltas: { [me]: dObj } };
    } else if (!isPvp && S.uid) {
      const won = result.winner === S.uid;
      updates[`userGames/${S.uid}/${g.id}`] = { ts: now, mode: "normal", opp: `ai:${g.aiLevel || "normal"}`, won, draw: !result.winner, delta: 0, counted: false };
    }

    if (isPvp) {
      updates[`log/${g.id}`] = {
        ts: now, mode: g.mode, matchType: g.matchType, aiLevel: g.aiLevel || null,
        black: g.black, white: g.white, winner: result.winner || null,
        reason: result.reason, detail: result.detail || null, moves: result.moves, deltas
      };
    }
    await D.update("", updates);
  }

  // ===== [추가] 갈리할리 (2~4인) =====
  //  방 만들기 → 친구 참가(또는 AI로 빈자리 채우기) → 방장이 시작.
  //  카드 뒤집기·종 치기는 모두 '거래(transaction)'로 기록해서, 동시에 쳐도 가장 먼저 친 한 명만 인정돼요.
  const BL = () => window.Bell;
  let bellRooms = {}, bellRoomsUnsub = null, bellTick = null, bellTimers = new Map(), bellSeenVer = -1, bellLobbyN = 4, bellLobbyMode = "normal", bellAiLevel = "normal";
  const isAiUid = u => String(u || "").startsWith("ai:");
  function bellRoomInfo(g) { return { n: g.n, mode: g.mode, host: g.host, cnt: (g.players || []).length, createdAt: g.createdAt }; }

  async function createBellGame(players, mode, matchType, autoStart = true, n = players.length) {
    const gid = B.newKey(), now = B.now();
    const full = players.length >= n;
    const gm = {
      id: gid, kind: "bell", mode, matchType, n, players, host: players.find(u => !isAiUid(u)) || players[0],
      black: players[0], white: players[1] || null, moves: [], first: 0, deal: null,
      status: full && autoStart ? "active" : "waiting", ready: full && autoStart ? Object.fromEntries(players.map(u => [u, true])) : {},
      pre: Object.fromEntries(players.filter(u => !isAiUid(u)).map(u => [u, { score: (S.users[u] || {}).score ?? R.START_SCORE, placed: (S.users[u] || {}).placed || 0 }])),
      createdAt: now, turnAt: now, limitMs: BL().LIMIT_MS
    };
    if (full) { gm.first = Math.floor(Math.random() * n); gm.deal = BL().newDeal(n, gm.first); }   // 첫 번째 사람은 무작위
    if (gm.status === "active") gm.startedAt = now;
    const up = { [`games/${gid}`]: gm, [`live/${gid}`]: { createdAt: now } };
    for (const u of players) if (!isAiUid(u)) up[`active/${u}`] = gid;
    if (matchType === "room" && !full) up[`rooms/${gid}`] = bellRoomInfo(gm);
    await D.update("", up);
    return gid;
  }

  async function bellCreateRoom() {
    if (S.active[S.uid]) { toast(e("이미 참여 중인 경기가 있어요."), "bad"); return; }
    try { await createBellGame([S.uid], bellLobbyMode, "room", true, bellLobbyN); }
    catch (err) { toast(friendlyErr(err), "bad"); }
  }
  async function bellPractice() {
    if (S.active[S.uid]) { toast(e("이미 참여 중인 경기가 있어요."), "bad"); return; }
    const pl = [S.uid]; for (let i = 1; i < bellLobbyN; i++) pl.push(`ai:${bellAiLevel}`);
    try { const gid = await createBellGame(pl, "normal", "ai", true, bellLobbyN); await D.update("", { [`games/${gid}/aiLevel`]: bellAiLevel }); }
    catch (err) { toast(friendlyErr(err), "bad"); }
  }
  async function bellJoin(gid) {
    if (S.active[S.uid]) { toast(e("이미 참여 중인 경기가 있어요."), "bad"); return; }
    const r = await D.tx(`games/${gid}`, cur => {
      if (cur === null) return null;   // 처음엔 서버 값을 모를 수 있어요 → null을 돌려주면 서버 값으로 다시 시도해요
      if (!cur || cur.status !== "waiting") return;
      const pl = cur.players || [];
      if (pl.includes(S.uid) || pl.length >= cur.n) return;
      cur.players = pl.concat(S.uid);
      cur.white = cur.players[1] || null;
      if (cur.kind === "draw") drawAutoAt(cur);
      cur.pre = Object.assign({}, cur.pre, { [S.uid]: { score: (S.users[S.uid] || {}).score ?? R.START_SCORE, placed: (S.users[S.uid] || {}).placed || 0 } });
      return cur;
    }).catch(() => ({ committed: false }));
    if (!r || !r.committed) { toast(e("방에 들어갈 수 없어요. (꽉 찼거나 이미 시작했어요)"), "bad"); return; }
    const g = await D.get(`games/${gid}`);
    await D.update("", { [`active/${S.uid}`]: gid, [`rooms/${gid}`]: g && g.status === "waiting" ? bellRoomInfo(g) : null });
  }
  async function bellFillAi(g) {
    if (g.mode === "rank") { toast(e("랭크전 방은 AI로 채울 수 없어요. (친구끼리만)"), "bad"); return; }
    const r = await D.tx(`games/${g.id}`, cur => {
      if (cur === null) return null;   // 처음엔 서버 값을 모를 수 있어요 → null을 돌려주면 서버 값으로 다시 시도해요
      if (!cur || cur.status !== "waiting") return;
      const pl = (cur.players || []).slice();
      while (pl.length < cur.n) pl.push(`ai:${bellAiLevel}`);
      cur.players = pl; cur.white = pl[1]; cur.aiLevel = bellAiLevel;
      return cur;
    });
    if (r && r.committed) { const fresh = await D.get(`games/${g.id}`); if (fresh) await D.update("", { [`rooms/${g.id}`]: bellRoomInfo(fresh) }); }
  }
  async function bellStart(g) {
    const r = await D.tx(`games/${g.id}`, cur => {
      if (cur === null) return null;   // 처음엔 서버 값을 모를 수 있어요 → null을 돌려주면 서버 값으로 다시 시도해요
      if (!cur || cur.status !== "waiting" || cur.host !== S.uid) return;
      const pl = cur.players || [];
      if (pl.length < 2) return;
      cur.n = pl.length;                               // 정한 인원보다 적어도 2명 이상이면 시작할 수 있어요
      cur.first = Math.floor(Math.random() * cur.n); cur.deal = BL().newDeal(cur.n, cur.first); cur.moves = [];
      cur.status = "active"; cur.startedAt = B.now(); cur.turnAt = B.now();
      if (pl.some(isAiUid)) { cur.mode = "normal"; cur.matchType = cur.matchType === "room" ? "room" : cur.matchType; }
      return cur;
    });
    if (r && r.committed) await D.update("", { [`rooms/${g.id}`]: null });
  }
  async function bellLeave(g) {
    const seat = myColor(g) - 1;
    if (g.status === "waiting") {
      let left = null;
      await D.tx(`games/${g.id}`, cur => {
        if (cur === null) return null;   // 처음엔 서버 값을 모를 수 있어요 → null을 돌려주면 서버 값으로 다시 시도해요
        if (!cur || cur.status !== "waiting") return;
        const pl = (cur.players || []).filter(u => u !== S.uid);
        const humans = pl.filter(u => !isAiUid(u));
        if (!humans.length) { cur.status = "cancelled"; cur.players = pl; left = cur; return cur; }
        cur.players = pl; cur.white = pl[1] || null; cur.black = pl[0];
        if (cur.host === S.uid) cur.host = humans[0];
        if (cur.kind === "draw") drawAutoAt(cur);
        left = cur; return cur;
      });
      const up = { [`active/${S.uid}`]: null };
      if (left && left.status === "cancelled") { up[`rooms/${g.id}`] = null; up[`live/${g.id}`] = null; }
      else if (left) up[`rooms/${g.id}`] = bellRoomInfo(left);
      await D.update("", up);
      leaveGame(); return;
    }
    if (g.status === "active" && seat >= 0) {
      const st = BL().replay(g);
      if (!st.out[seat]) {
        if (!await confirmBox(e("갈리할리를 그만둘까요?"), e("나가면 기권 처리되고, 내 카드는 사라져요."), e("기권하고 나가기"), true)) return;
        await bellAct("q" + seat, null);
      }
    }
    leaveGame();
  }
  async function bellResign(g) {
    const seat = myColor(g) - 1;
    if (seat < 0) return;
    if (!await confirmBox(e("기권할까요?"), e("기권하면 내 카드가 모두 사라지고 탈락해요."), e("기권하기"), true)) return;
    await bellAct("q" + seat, null);
  }

  // 사건 하나를 기록 (seenVer: 내가 본 판의 사건 수 — 그 사이 판이 바뀌었으면 취소)
  async function bellAct(ev, seenVer, check) {
    const g = S.curGame; if (!g) return { committed: false };
    try {
      return await D.tx(`games/${g.id}`, cur => {
        if (cur === null) return null;   // 처음엔 서버 값을 모를 수 있어요 → null을 돌려주면 서버 값으로 다시 시도해요
        if (!cur || cur.status !== "active") return;
        const mv = cur.moves || [];
        if (seenVer != null && mv.length !== seenVer) return;
        const st = BL().replay(cur);
        if (check && !check(st, cur)) return;
        if (ev[0] === "q" && st.out[+ev.slice(1)]) return;
        cur.moves = mv.concat(ev); cur.turnAt = B.now();
        return cur;
      });
    } catch (err) { return { committed: false }; }
  }
  async function bellFlip() {
    const g = S.curGame; if (!g || g.status !== "active" || S.spectate) return;
    const seat = myColor(g) - 1, st = BL().replay(g);
    if (seat < 0 || st.turn !== seat || st.out[seat]) return;
    await bellAct("f", st.ver, s2 => s2.turn === seat && !s2.out[seat]);
  }
  let bellRingLock = 0;
  async function bellRing() {
    const g = S.curGame; if (!g || g.status !== "active" || S.spectate) return;
    const seat = myColor(g) - 1, st = BL().replay(g);
    if (seat < 0 || st.out[seat] || Date.now() - bellRingLock < 400) return;
    bellRingLock = Date.now();
    const r = await bellAct("r" + seat, st.ver);
    if (!r || !r.committed) toast(st.five ? e("앗, 다른 친구가 먼저 쳤어요! 🐢") : e("그 사이 카드가 바뀌었어요."), "");
  }

  // 방장(첫 번째 사람) 화면이 AI 차례·시간 초과·게임 끝을 대신 처리해요. 방장이 없으면 다른 친구 화면이 조금 늦게 대신해요.
  function bellDriverRank(g) {
    const humans = (g.players || []).filter(u => !isAiUid(u));
    const i = humans.indexOf(S.uid);
    return i < 0 ? -1 : i;
  }
  function bellSchedule(key, ms, fn) {
    if (bellTimers.has(key)) return;
    bellTimers.set(key, setTimeout(() => { bellTimers.delete(key); fn(); }, ms));
  }
  function bellClearTimers() { for (const t of bellTimers.values()) clearTimeout(t); bellTimers.clear(); }
  const rnd = ([a, b]) => a + Math.random() * (b - a);
  function bellDrive() {
    const g = S.curGame;
    if (!g || g.kind !== "bell" || g.status !== "active" || S.spectate || !g.deal) return;
    const rank = bellDriverRank(g); if (rank < 0) return;
    const st = BL().replay(g), late = rank * 2500, now = B.now();
    if (st.ver !== bellSeenVer) { bellClearTimers(); bellSeenVer = st.ver; }
    // 끝났나?
    const endAt = (g.startedAt || g.createdAt) + (g.limitMs || BL().LIMIT_MS);
    if (st.done || now >= endAt + late) { finishBell(g, st, st.done ? ({ final: "bell_final", last: "bell_last", stuck: "bell_stuck" })[st.done] : "bell_time"); return; }
    const turnUid = st.turn >= 0 ? g.players[st.turn] : null;
    // AI 카드 뒤집기
    if (!turnUid) { /* 뒤집을 사람이 없어요 (종만 칠 수 있는 상황) */ }
    else if (isAiUid(turnUid)) {
      const cfg = BL().AI_CFG[String(turnUid).split(":")[1]] || BL().AI_CFG.normal;
      bellSchedule(`f${st.ver}`, rnd(cfg.flip) + late, () => bellAct("f", st.ver));
    } else if (now - (g.turnAt || now) > BL().TURN_MS + late) {
      bellSchedule(`t${st.ver}`, 50, () => bellAct("f", st.ver));            // 15초 동안 안 내면 자동으로 내요
    }
    // AI 종 치기
    g.players.forEach((u, seat) => {
      if (!isAiUid(u) || st.out[seat]) return;
      const cfg = BL().AI_CFG[String(u).split(":")[1]] || BL().AI_CFG.normal;
      if (st.five) {
        if (Math.random() < cfg.miss && !bellTimers.has(`m${st.ver}:${seat}`)) { bellTimers.set(`m${st.ver}:${seat}`, 0); return; }
        if (bellTimers.get(`m${st.ver}:${seat}`) === 0) return;
        bellSchedule(`r${st.ver}:${seat}`, rnd(cfg.ring) + late, () => bellAct("r" + seat, st.ver));
      } else if (Object.values(st.sums).some(v => v === 4 || v === 6) && !bellTimers.has(`w${st.ver}:${seat}`)) {
        bellTimers.set(`w${st.ver}:${seat}`, 0);
        if (Math.random() < cfg.wrong) bellSchedule(`wr${st.ver}:${seat}`, rnd(cfg.ring) + late, () => bellAct("r" + seat, st.ver));
      }
    });
  }
  function bellStartTick() {
    if (bellTick) return;
    bellTick = setInterval(() => {
      if (S.view !== "game" || !S.curGame) return;
      if (game() === "draw") { drawWaitDrive(S.curGame); drawDrive(); renderDrawStatus(S.curGame); if (S.curGame.status === "waiting") renderDrawWait(S.curGame); return; }
      if (game() !== "bell") return;
      bellDrive();
      renderBellStatus(S.curGame);
    }, 250);
  }

  // [공통] 여러 명이 하는 게임(갈리할리·그림 맞히기)의 등수 → 점수 반영
  //  랭크전: 등수를 '모든 상대와 1:1로 붙은 결과'로 바꿔서 기존 점수 계산의 평균을 써요.
  function rateMulti(fresh, gid, ranks, humans, now, updates) {
    let deltas = null;
    const g = { id: gid };
    const place = u => ranks.indexOf(u) + 1, N = ranks.length;
    const others = u => ranks.filter(x => x !== u);
    const isRank = fresh.mode === "rank" && humans.length >= 2 && humans.length === fresh.players.length;
    if (isRank) {
      deltas = {};
      // 순위를 '모든 상대와 1:1로 붙은 결과'로 바꿔서 기존 점수 계산을 그대로 써요 (평균)
      for (const u of humans) {
        let sum = 0, base = null;
        for (const v of others(u)) {
          const fake = { black: u, white: v, matchType: fresh.matchType === "assigned" ? "assigned" : "random", pre: fresh.pre, result: { winner: place(u) < place(v) ? u : v, reason: "bell", moves: 30 } };
          const d = R.computeRank(fake, S.users, settings(), now)[u];
          sum += d.delta; base = base || d;
        }
        const delta = Math.round(sum / (N - 1));
        deltas[u] = Object.assign({}, base, { delta: base.counted ? (base.note && /이겨도 점수 없음/.test(base.note) ? Math.min(0, delta) : delta) : 0, place: place(u), n: N });
      }
      for (const u of humans) {
        const won = place(u) <= N / 2, draw = N % 2 === 1 && place(u) === (N + 1) / 2;
        const opp = others(u)[0];
        const nextUser = R.applyToUser(S.users[u], deltas[u], won && !draw, draw, opp, now);
        const pr = applyPromoShield(S.users[u], nextUser, deltas[u], won && !draw, draw, now);
        if (pr) deltas[u] = Object.assign({}, deltas[u], { delta: (nextUser.score ?? 0) - (S.users[u].score ?? R.START_SCORE), promo: pr });
        updates[`users/${u}`] = nextUser;
        updates[`userGames/${u}/${g.id}`] = { ts: now, mode: "rank", opp, won: place(u) === 1, draw: false, delta: deltas[u].delta, counted: deltas[u].counted, note: `${N}인 중 ${place(u)}등` + ((deltas[u].promo && " · " + deltas[u].promo.note) || (deltas[u].note ? " · " + deltas[u].note : "")) };
      }
      updates[`games/${g.id}/deltas`] = deltas;
    } else {
      for (const u of humans) {
        const usr = Object.assign({}, S.users[u]);
        if (humans.length >= 2) { if (place(u) === 1) usr.nWins = (usr.nWins || 0) + 1; else usr.nLosses = (usr.nLosses || 0) + 1; updates[`users/${u}`] = usr; }
        const opp = others(u).find(x => !isAiUid(x)) || others(u)[0];
        updates[`userGames/${u}/${g.id}`] = { ts: now, mode: "normal", opp, won: place(u) === 1, draw: false, delta: 0, counted: false, note: `${N}인 중 ${place(u)}등` };
      }
    }
    return deltas;
  }

  async function finishBell(g, st, reason) {
    if (finishing.has(g.id)) return;
    finishing.add(g.id);
    const fresh = await D.get(`games/${g.id}`).catch(() => null);
    if (!fresh || fresh.status !== "active") { if (!fresh) finishing.delete(g.id); return; }
    st = BL().replay(fresh);
    const now = B.now(), order = BL().ranking(st), ranks = order.map(i => fresh.players[i]);
    const winner = ranks[0];
    const humans = fresh.players.filter(u => !isAiUid(u));
    const result = { winner, reason, moves: st.ver, ranks, seats: order };
    const updates = {
      [`games/${g.id}/status`]: "finished", [`games/${g.id}/result`]: result, [`games/${g.id}/endedAt`]: now,
      [`live/${g.id}`]: null, [`rooms/${g.id}`]: null
    };
    for (const u of humans) updates[`active/${u}`] = null;
    const deltas = rateMulti(fresh, g.id, ranks, humans, now, updates);
    if (humans.length >= 2) {
      updates[`log/${g.id}`] = { ts: now, mode: fresh.mode, matchType: fresh.matchType, aiLevel: fresh.aiLevel || null,
        black: ranks[0], white: ranks[1] || null, players: fresh.players, ranks, winner, reason, moves: st.ver, deltas, kind: "bell" };
    }
    await D.update("", updates);
  }

  // --- 갈리할리 화면 ---
  function bellNames(g) {
    let k = 0;
    return (g.players || []).map(u => isAiUid(u) ? `🤖 AI ${++k} (${AI_NAMES[String(u).split(":")[1]] || ""})` : nameOf(u));
  }
  function renderBellStatus(g) {
    const el = $("#g-status"); if (!el || !g) return;
    if (g.status === "waiting") return;
    if (g.status !== "active" || !g.deal) return;
    const st = BL().replay(g), seat = myColor(g) - 1;
    const left = Math.max(0, (g.startedAt || g.createdAt) + (g.limitMs || BL().LIMIT_MS) - B.now());
    const turnName = bellNames(g)[st.turn];
    const tLeft = Math.max(0, Math.ceil((BL().TURN_MS - (B.now() - (g.turnAt || B.now()))) / 1000));
    const msg = seat >= 0 && st.out[seat] ? e("탈락했어요. 친구들 경기를 구경해요 👀")
      : st.finalTwo && seat >= 0 ? (st.turn === seat ? e("🔥 마지막 대결! 내 차례 — [카드 내기]를 눌러요 · {0}초", tLeft) : e("🔥 마지막 대결! 다음에 종을 맞게 친 사람이 카드를 가져가고 끝나요"))
      : seat >= 0 && st.turn === seat ? e("내 차례! 아래 [카드 내기]를 눌러요 · {0}초 뒤 자동으로 나가요", tLeft)
      : seat >= 0 && !st.decks[seat].length ? e("내 카드는 없지만 종은 칠 수 있어요! 카드를 되찾아 보세요")
      : st.turn < 0 ? e("뒤집을 카드가 없어요")
      : e("{0} 차례", turnName);
    const html = `<b>⏱ ${fmt(left)}</b> · ${esc(msg)}`;
    if (el._h !== html) { el._h = html; el.innerHTML = html; }
    const fb = $("#bell-flip-btn");
    if (fb && !fb.disabled) { const t = e("🃏 카드 내기") + ` (${tLeft})`; if (fb.textContent !== t) fb.textContent = t; }
  }
  function renderBell(g) {
    bellStartTick();
    const mc = myColor(g), seat = mc - 1, names = bellNames(g);
    const modeTxt = g.mode === "rank" ? e("🏆 랭크전") : e("🎮 일반전");
    $("#g-title").textContent = `${modeTxt} · ${(g.players || []).length}${e("인 갈리할리")}`;
    $("#g-spec-tag").classList.toggle("hidden", !S.spectate);
    $("#g-num-btn").classList.add("hidden");
    $("#g-resign-btn").classList.toggle("hidden", S.spectate || g.status !== "active" || !mc);
    $("#g-void-btn").classList.toggle("hidden", !(S.isMaster && (g.status === "active" || g.status === "waiting")));
    $("#g-confirm-btn").classList.add("hidden");
    $("#g-moves")?.classList.add("hidden");
    $("#g-guide")?.classList.add("hidden"); $("#g-buddy")?.classList.add("hidden");
    renderEmojiBar(g);
    const rb = $("#g-ready-btn");
    if (rb) rb.classList.toggle("hidden", !(g.status === "waiting" && g.matchType !== "room" && mc && !(g.ready && g.ready[S.uid])));
    const stEl = $("#g-status"), foot = $("#g-foot");
    let room = $("#bell-room");
    if (!room) { room = document.createElement("div"); room.id = "bell-room"; room.className = "bell-room"; foot.parentElement.insertBefore(room, foot); }
    if (g.status === "waiting" && g.matchType === "room") {
      stEl._h = ""; stEl.textContent = e("친구를 기다리는 중… ({0}/{1}명)", (g.players || []).length, g.n);
      const isHost = g.host === S.uid;
      const seats = [];
      for (let i = 0; i < g.n; i++) { const u = (g.players || [])[i]; seats.push(`<div class="br-seat${u ? "" : " empty"}">${u ? (isAiUid(u) ? esc(names[i]) : nameTag(u)) : e("빈자리")}${u && u === g.host ? ` <span class="pill">${e("방장")}</span>` : ""}</div>`); }
      const html = `<div class="panel"><h3>${g.mode === "rank" ? "🏆" : "🎮"} ${esc(nameOf(g.host))}${e("의 방")} · ${g.n}${e("인")}</h3>
        <div class="br-seats">${seats.join("")}</div>
        ${isHost ? `<div class="foot" style="justify-content:center;flex-wrap:wrap">
          ${g.mode !== "rank" && (g.players || []).length < g.n ? `<button type="button" class="btn" id="br-ai">🤖 ${e("빈자리 AI로 채우기")}</button>` : ""}
          <button type="button" class="btn primary" id="br-start" ${(g.players || []).length < 2 ? "disabled" : ""}>${e("시작하기")} (${(g.players || []).length}${e("명")})</button></div>
          <p class="muted" style="text-align:center;font-size:.85em">${e("2명 이상이면 바로 시작할 수 있어요. 시작하면 더는 들어올 수 없어요.")}</p>`
          : `<p class="muted" style="text-align:center">${e("방장이 시작하면 게임이 시작돼요.")}</p>`}</div>`;
      if (room._h !== html) {
        room._h = html; room.innerHTML = html;
        $("#br-ai")?.addEventListener("click", () => bellFillAi(g));
        $("#br-start")?.addEventListener("click", () => bellStart(g));
      }
      room.classList.remove("hidden");
    } else { room.classList.add("hidden"); room._h = ""; }
    if (g.status === "waiting" && g.matchType !== "room") {
      const rd = g.ready || {}, hs = (g.players || []).filter(u => !isAiUid(u));
      stEl._h = ""; stEl.textContent = e("모두 [준비 완료]를 누르면 시작해요. ({0}/{1}명 준비)", hs.filter(u => rd[u]).length, hs.length) + "  " + hs.map(u => `${nameOf(u)}${rd[u] ? " ✓" : ""}`).join(" · ");
    }

    const st = g.deal ? BL().replay(g) : null;
    // [카드 내기] 버튼: 내 차례일 때만 눌려요
    let fb = $("#bell-flip-btn");
    if (!fb) {
      fb = document.createElement("button"); fb.type = "button"; fb.id = "bell-flip-btn"; fb.className = "btn primary lg bell-flip-btn";
      fb.addEventListener("click", bellFlip); foot.prepend(fb);
    }
    const inGame = !!st && g.status === "active" && seat >= 0 && !st.out[seat] && !S.spectate;
    const myTurn = inGame && st.turn === seat && !st.done;
    fb.classList.toggle("hidden", !inGame);
    fb.disabled = !myTurn;
    fb.classList.toggle("go", myTurn);
    fb.textContent = myTurn ? e("🃏 카드 내기") + ` (${Math.max(0, Math.ceil((BL().TURN_MS - (B.now() - (g.turnAt || B.now()))) / 1000))})` : !st || !st.decks[seat] || st.decks[seat].length ? e("🃏 카드 내기 (내 차례를 기다려요)") : e("🃏 낼 카드가 없어요 — 종은 칠 수 있어요");
    boardView && boardView.set({ moves: g.moves || [], deal: g.deal, first: g.first || 0, players: g.players, names, status: g.status, mySeat: seat,
      canFlip: !!st && g.status === "active" && seat >= 0 && st.turn === seat && !st.out[seat] && !st.done,
      cardBack: ({ card: "victory", s0: "s0" })[myVskin(g)] || null,
      canRing: !!st && g.status === "active" && seat >= 0 && !st.out[seat] });
    if (g.status === "active") renderBellStatus(g);
    else if (g.status === "finished") { stEl._h = ""; stEl.textContent = e("게임이 끝났어요!"); }

    const ov = $("#board-overlay");
    if (g.status === "finished" && !ov.dataset.dismissed) {
      const res = g.result || {}, ranks = res.ranks || g.players || [];
      const myPlace = ranks.indexOf(S.uid) + 1;
      const d = g.deltas && S.uid && g.deltas[S.uid];
      const pm = d && d.promo, pmTxt = pm ? `<div class="promo-result ${pm.state}">${esc(pm.note)}${pm.state === "start" || pm.state === "on" || pm.state === "draw" ? promoDots(pm) : ""}</div>` : "";
      const scHtml = d ? `<div class="score-box">${pmTxt}${d.counted ? `${d.delta >= 0 ? "+" : ""}${d.delta}점 (현재 ${S.users[S.uid]?.score ?? ""}점)` : esc(d.note || "연습 경기")}</div>` : "";
      const medal = ["🥇", "🥈", "🥉", "4️⃣"];
      const nm = bellNames(g);
      ov.classList.remove("hidden", "loss");
      if (myPlace > 1 && myPlace === ranks.length) ov.classList.add("loss");
      $("#ov-card").innerHTML = `
        <h2 class="${myPlace === 1 ? "win" : ""}">${res.reason === "void" ? e("경기 무효") : myPlace ? e("{0}등!", myPlace) : e("경기 끝")}</h2>
        <p class="muted" style="margin:4px 0">${esc(REASON_NAMES[res.reason] || "")}</p>
        ${res.reason === "void" ? "" : `<ol class="bell-rank">${(res.seats || ranks.map(u => (g.players || []).indexOf(u))).map((seat, i) => `<li class="${(g.players || [])[seat] === S.uid ? "me" : ""}">${medal[i] || i + 1} ${esc(nm[seat] || "")}</li>`).join("")}</ol>`}
        ${scHtml}
        <div class="foot" style="justify-content:center">
          <button type="button" class="btn" id="ov-view">${e("판 보기")}</button>
          <button type="button" class="btn primary" id="ov-home">${e("홈으로")}</button>
        </div>`;
      $("#ov-view").onclick = () => { ov.dataset.dismissed = "1"; ov.classList.add("hidden"); };
      $("#ov-home").onclick = () => leaveGame();
    } else if (g.status !== "finished") { delete ov.dataset.dismissed; ov.classList.add("hidden"); }
    bellDrive();
  }

  // --- 갈리할리 로비 ---
  function renderBellLobby() {
    const box = $("#bell-lobby"); if (!box) return;
    const rooms = Object.entries(bellRooms || {}).filter(([, r]) => r && r.cnt < r.n).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
    const seg = (id, items, cur) => `<div class="seg" id="${id}">${items.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(cur) === String(v) ? "on" : ""}">${l}</button>`).join("")}</div>`;
    const html = `
      <div class="panel bl-main">
        <h3 style="margin-top:0">🔔 ${e("갈리할리")}</h3>
        <p class="muted" style="margin:0 0 10px;font-size:.88em">${e("차례대로 카드를 내다가 같은 과일이 딱 5개가 되면 종을 쳐요!")}</p>
        <div class="bl-row"><span>${e("인원")}</span>${seg("bl-n", [[2, "2인"], [3, "3인"], [4, "4인"]], bellLobbyN)}</div>
        <div class="bl-row"><span>${e("방 종류")}</span>${seg("bl-mode", [["rank", "🏆 랭크전"], ["normal", "🎮 일반전"]], bellLobbyMode)}</div>
        <div class="bl-row"><span>${e("AI 실력")}</span>${seg("bl-ai", [["easy", AI_NAMES.easy], ["normal", AI_NAMES.normal], ["hard", AI_NAMES.hard]], bellAiLevel)}</div>
        <div class="mode-grid" style="margin-top:12px">
          <button class="mode-btn" id="bl-create" type="button"><b>${e("방 만들기")}</b><small>${e("친구들이 들어오면 시작")}</small></button>
          <button class="mode-btn" id="bl-practice" type="button"><b>${e("AI와 연습")}</b><small>${e("나 + AI {0}명 (점수 없음)", bellLobbyN - 1)}</small></button>
        </div>
        <p class="muted" style="margin:10px 0 0;font-size:.82em">${e("랭크전 방은 친구끼리만 할 수 있고, 등수에 따라 점수가 바뀌어요. 일반전 방은 빈자리를 AI로 채울 수 있어요.")}</p>
      </div>
      <div class="panel">
        <h3 style="margin-top:0">🚪 ${e("들어갈 수 있는 방")} <span class="muted">${rooms.length}</span></h3>
        ${rooms.length ? `<div class="bl-rooms">${rooms.map(([gid, r]) => `<div class="bl-room"><span>${r.mode === "rank" ? "🏆" : "🎮"} ${nameTag(r.host)}${e("의 방")}</span><span class="sp"></span><span class="pill">${r.cnt}/${r.n}${e("명")}</span><button type="button" class="btn sm primary" data-join="${esc(gid)}">${e("참가")}</button></div>`).join("")}</div>`
          : `<p class="empty">${e("열린 방이 없어요. 방을 만들어 친구를 불러 보세요!")}</p>`}
      </div>`;
    if (box._h === html) return;
    box._h = html; box.innerHTML = html;
    box.querySelectorAll("#bl-n button").forEach(b => b.onclick = () => { bellLobbyN = +b.dataset.v; renderBellLobby(); });
    box.querySelectorAll("#bl-mode button").forEach(b => b.onclick = () => { bellLobbyMode = b.dataset.v; renderBellLobby(); });
    box.querySelectorAll("#bl-ai button").forEach(b => b.onclick = () => { bellAiLevel = b.dataset.v; renderBellLobby(); });
    $("#bl-create").onclick = bellCreateRoom;
    $("#bl-practice").onclick = bellPractice;
    box.querySelectorAll("[data-join]").forEach(b => b.onclick = () => bellJoin(b.dataset.join));
  }

  // ===== [추가] 내가 그린 기린 그림 (그림 맞히기, 2~8인) =====
  //  방장이 시작 → 차례대로 한 명이 단어를 골라 그리고, 나머지는 글자로 맞혀요.
  //  먼저 맞힐수록 점수가 높고, 그린 사람도 맞힌 친구 1명마다 2점을 받아요.
  const DR = () => window.Draw;
  let drawLobbyN = 6, drawLobbyMode = "normal", drawLobbyRounds = 1;
  let drawSub = null, drawChatSub = null, drawChat = {}, drawSeenChat = null, drawRoundKey = "";
  const drawTotal = g => (g.rounds || 1) * Math.max(1, (g.players || []).length);
  // 나간 사람 차례는 건너뛰어요. 더 그릴 사람이 없으면 -1
  function drawNextRound(cur, from) {
    const pl = cur.players || [], left = cur.left || {}, total = drawTotal(cur);
    for (let r = from; r < total; r++) if (!left[pl[r % pl.length]]) return r;
    return -1;
  }
  function drawRoundInit(cur, round) {
    const pl = cur.players || [];
    const r2 = drawNextRound(cur, round); if (r2 >= 0) round = r2;
    cur.round = round; cur.drawer = pl[round % pl.length];
    // [수정] 단어 고르기 없이 바로 다음 문제: 단어를 자동으로 정하고 곧바로 그리기 시작
    const word = DR().pick3(cur.used || [])[0];
    cur.options = null; cur.correct = {}; cur.word = null; cur.gone = null;
    cur.w = DR().enc(word); cur.wl = [...word].length; cur.ch = DR().chosung(word);
    cur.used = (cur.used || []).concat(word);
    cur.phase = "draw"; cur.phaseAt = B.now();
  }
  async function createDrawGame(players, mode, matchType, autoStart = true, n = players.length, rounds = 1) {
    const gid = B.newKey(), now = B.now(), full = players.length >= n;
    const gm = {
      id: gid, kind: "draw", mode, matchType, n, players, host: players[0], black: players[0], white: players[1] || null,
      status: full && autoStart ? "active" : "waiting", ready: {}, rounds, used: [], scores: {}, hist: [],
      pre: Object.fromEntries(players.map(u => [u, { score: (S.users[u] || {}).score ?? R.START_SCORE, placed: (S.users[u] || {}).placed || 0 }])),
      createdAt: now, turnAt: now
    };
    if (full) drawRoundInit(gm, 0);
    if (gm.status === "active") gm.startedAt = now;
    const up = { [`games/${gid}`]: gm, [`live/${gid}`]: { createdAt: now } };
    for (const u of players) up[`active/${u}`] = gid;
    if (matchType === "room" && !full) up[`rooms/${gid}`] = bellRoomInfo(gm);
    await D.update("", up);
    return gid;
  }
  function createMultiGame(players, mode, matchType, autoStart) {
    return game() === "draw" ? createDrawGame(players, mode, matchType, autoStart) : createBellGame(players, mode, matchType, autoStart);
  }
  async function drawCreateRoom() {
    if (S.active[S.uid]) { toast(e("이미 참여 중인 경기가 있어요."), "bad"); return; }
    try { const gid = await createDrawGame([S.uid], drawLobbyMode, "room", true, drawLobbyN, drawLobbyRounds); await D.update("", { [`games/${gid}/rounds`]: drawLobbyRounds }); }
    catch (err) { toast(friendlyErr(err), "bad"); }
  }
  // [추가] 3명 이상 모이면 10초 뒤 자동 시작 (방이 꽉 차면 3초 뒤). 방장은 언제든 바로 시작할 수 있어요.
  const DRAW_AUTO_MIN = 3, DRAW_AUTO_MS = 10000;
  function drawAutoAt(cur) {
    const c = (cur.players || []).length;
    if (c >= cur.n) cur.autoAt = B.now() + 3000;
    else if (c >= DRAW_AUTO_MIN) { if (!cur.autoAt) cur.autoAt = B.now() + DRAW_AUTO_MS; }
    else cur.autoAt = null;
  }
  function drawWaitDrive(g) {
    if (!g || g.kind !== "draw" || g.status !== "waiting" || g.matchType !== "room" || !g.autoAt) return;
    const i = (g.players || []).indexOf(S.uid); if (i < 0) return;
    const hi = (g.players || []).indexOf(g.host), rank = i === hi ? 0 : 1 + i;     // 방장이 먼저, 없으면 다른 친구가 조금 늦게
    if (B.now() >= g.autoAt + rank * 2000) bellSchedule(`as${g.id}`, 50, () => drawStart(g, true));
  }
  async function drawStart(g, auto = false) {
    const r = await D.tx(`games/${g.id}`, cur => {
      if (cur === null) return null;
      if (cur.status !== "waiting" || (cur.players || []).length < 2) return;
      if (!auto && cur.host !== S.uid) return;
      if (auto && !(cur.autoAt && B.now() >= cur.autoAt && (cur.players || []).includes(S.uid))) return;
      cur.n = cur.players.length; cur.status = "active"; cur.startedAt = B.now(); cur.turnAt = B.now(); cur.scores = {}; cur.hist = []; cur.used = [];
      drawRoundInit(cur, 0);
      return cur;
    });
    if (r && r.committed) await D.update("", { [`rooms/${g.id}`]: null });
  }
  async function drawLeave(g) {
    if (g.status === "waiting") return bellLeave(g);      // 대기실 나가기는 갈리할리와 같아요
    if (g.status === "active" && myColor(g)) {
      if (!await confirmBox(e("그림 맞히기를 그만둘까요?"), e("나가면 이 판에서 가장 낮은 순위가 되고, 다시 들어올 수 없어요."), e("나가기"), true)) return;
      await drawMarkLeft([S.uid]);
    }
    leaveGame();
  }
  async function drawTx(fn) {
    const g = S.curGame; if (!g) return { committed: false };
    try {
      return await D.tx(`games/${g.id}`, cur => {
        if (cur === null) return null;
        if (cur.status !== "active") return;
        return fn(cur) === false ? undefined : cur;
      });
    } catch { return { committed: false }; }
  }
  function drawReveal(cur) {
    const word = DR().dec(cur.w);
    cur.hist = (cur.hist || []).concat({ r: cur.round, d: cur.drawer, word, ok: Object.keys(cur.correct || {}) });
    cur.phase = "reveal"; cur.phaseAt = B.now(); cur.word = word;
  }
  async function drawChoose(word) {
    const g = S.curGame; if (!g || g.drawer !== S.uid) return;
    await drawTx(cur => {
      if (cur.phase !== "choose" || cur.drawer !== S.uid || cur.round !== g.round) return false;
      cur.w = DR().enc(word); cur.wl = [...word].length; cur.ch = DR().chosung(word);
      cur.used = (cur.used || []).concat(word); cur.phase = "draw"; cur.phaseAt = B.now(); cur.word = null;
    });
  }
  let drawGuessLock = 0;
  async function drawGuess(text) {
    const g = S.curGame; text = String(text || "").trim();
    if (!g || !text || g.status !== "active" || S.spectate || !myColor(g)) return;
    if ((g.left || {})[S.uid]) { toast(e("접속이 끊겨서 이 판에서 나간 상태예요."), "bad"); return; }
    if (g.drawer === S.uid) { toast(e("그리는 사람은 맞힐 수 없어요 ✏️"), ""); return; }
    if (g.phase !== "draw") { toast(e("아직 그리는 시간이 아니에요."), ""); return; }
    if ((g.correct || {})[S.uid]) { toast(e("이미 맞혔어요! 친구들을 기다려요 😊"), "good"); return; }
    if (Date.now() - drawGuessLock < 700) return;
    drawGuessLock = Date.now();
    const word = DR().dec(g.w);
    if (DR().norm(text) === DR().norm(word)) {
      const round = g.round;
      const r = await drawTx(cur => {
        if (cur.phase !== "draw" || cur.round !== round || (cur.correct || {})[S.uid]) return false;
        const order = Object.keys(cur.correct || {}).length + 1;
        cur.correct = Object.assign({}, cur.correct, { [S.uid]: order });
        cur.scores = Object.assign({}, cur.scores);
        cur.scores[S.uid] = (cur.scores[S.uid] || 0) + 10;              // [수정] 한 명이 맞히면 바로 다음 문제: 맞힌 사람 10점
        cur.scores[cur.drawer] = (cur.scores[cur.drawer] || 0) + 5;      //        그린 사람 5점
        drawReveal(cur);
      });
      if (r && r.committed) await D.update(`draws/${g.id}/c`, { [B.newKey()]: { u: S.uid, t: B.now(), ok: 1 } });
      else toast(e("앗, 친구가 한 발 먼저 맞혔어요! 🐢"), "");
    } else {
      if (DR().close(text, word)) toast(e("거의 맞았어요! 🤏 한 글자만 다시 생각해 봐요"), "good");
      await D.update(`draws/${g.id}/c`, { [B.newKey()]: { u: S.uid, t: B.now(), m: DR().clean(text) } });
    }
  }
  // [추가] 접속이 끊긴 친구는 '나감' 처리 → 차례 건너뛰고, 끝나면 가장 낮은 순위
  const DRAW_GONE_MS = 8000;                    // 새로고침처럼 잠깐 끊긴 건 봐줘요 (8초)
  const drawOffSince = {};
  async function drawMarkLeft(uids) {
    const g = S.curGame; if (!g || !uids.length) return;
    let after = null;
    await drawTx(cur => {
      const left = Object.assign({}, cur.left);
      let changed = false;
      for (const u of uids) if ((cur.players || []).includes(u) && !left[u]) { left[u] = B.now(); changed = true; }
      if (!changed) return false;
      cur.left = left;
      if (uids.includes(cur.drawer) && cur.phase !== "reveal") {
        // 그리던 사람이 나가면 바로 정답 공개 후 다음 문제
        const word = cur.w ? DR().dec(cur.w) : "";
        cur.hist = (cur.hist || []).concat({ r: cur.round, d: cur.drawer, word, ok: [], gone: true });
        cur.phase = "reveal"; cur.phaseAt = B.now(); cur.word = word; cur.gone = true;
      }
      after = cur;
    });
    const up = {};
    for (const u of uids) { up[`active/${u}`] = null; up[`draws/${g.id}/c/${B.newKey()}`] = { u, t: B.now(), gone: 1 }; }
    await D.update("", up).catch(() => {});
    if (after && (after.players || []).filter(u => !(after.left || {})[u]).length < 2) finishDraw(after);
  }
  function drawCheckGone(g) {
    const left = g.left || {}, now = Date.now();
    const gone = [];
    for (const u of g.players || []) {
      if (u === S.uid || left[u]) { delete drawOffSince[u]; continue; }
      const p = S.presence && S.presence[u];
      const online = p && (B.now() - (p.at || 0) < PRESENCE_TTL) && S.active[u] === g.id;
      if (online) { delete drawOffSince[u]; continue; }
      drawOffSince[u] = drawOffSince[u] || now;
      if (now - drawOffSince[u] > DRAW_GONE_MS) gone.push(u);
    }
    return gone;
  }
  function drawDrive() {
    const g = S.curGame;
    if (!g || g.kind !== "draw" || g.status !== "active" || S.spectate) return;
    const alivePl = (g.players || []).filter(u => !(g.left || {})[u]);
    const humans = alivePl, rank = humans.indexOf(S.uid); if (rank < 0) return;
    const late = rank * 2500, now = B.now(), D2 = DR();
    const gone = drawCheckGone(g);
    if (gone.length && !bellTimers.has(`gone${gone.join()}`)) { bellSchedule(`gone${gone.join()}`, 50 + late, () => drawMarkLeft(gone)); return; }
    if (alivePl.length < 2) { finishDraw(g); return; }
    if (g.phase === "choose" && now > (g.phaseAt || 0) + D2.CHOOSE_MS + late) {
      bellSchedule(`dc${g.round}`, 50, () => drawTx(cur => {
        if (cur.phase !== "choose" || cur.round !== g.round) return false;
        const word = (cur.options || [])[0] || D2.pick3([])[0];
        cur.w = D2.enc(word); cur.wl = [...word].length; cur.ch = D2.chosung(word);
        cur.used = (cur.used || []).concat(word); cur.phase = "draw"; cur.phaseAt = B.now(); cur.word = null;
      }));
    } else if (g.phase === "draw" && now > (g.phaseAt || 0) + D2.DRAW_MS + late) {
      bellSchedule(`dr${g.round}`, 50, () => drawTx(cur => { if (cur.phase !== "draw" || cur.round !== g.round) return false; drawReveal(cur); }));
    } else if (g.phase === "reveal" && now > (g.phaseAt || 0) + D2.REVEAL_MS + late) {
      if (drawNextRound(g, g.round + 1) < 0) { finishDraw(g); return; }
      bellSchedule(`dn${g.round}`, 50, () => drawTx(cur => { if (cur.phase !== "reveal" || cur.round !== g.round) return false; cur.gone = null; drawRoundInit(cur, cur.round + 1); }));
    }
  }
  async function finishDraw(g) {
    if (finishing.has(g.id)) return;
    finishing.add(g.id);
    const fresh = await D.get(`games/${g.id}`).catch(() => null);
    if (!fresh || fresh.status !== "active") { if (!fresh) finishing.delete(g.id); return; }
    const now = B.now(), sc = fresh.scores || {}, pl = fresh.players || [];
    const lf = fresh.left || {};
    // 나간 사람은 점수와 상관없이 맨 아래 (먼저 나간 사람이 더 아래)
    const ranks = pl.slice().sort((a, b) => (!!lf[a] - !!lf[b]) || (lf[a] && lf[b] ? lf[b] - lf[a] : 0) || (sc[b] || 0) - (sc[a] || 0) || pl.indexOf(a) - pl.indexOf(b));
    const result = { winner: ranks[0], reason: "draw_end", moves: (fresh.hist || []).length, ranks, scores: sc };
    const updates = {
      [`games/${g.id}/status`]: "finished", [`games/${g.id}/result`]: result, [`games/${g.id}/endedAt`]: now,
      [`live/${g.id}`]: null, [`rooms/${g.id}`]: null, [`draws/${g.id}`]: null
    };
    for (const u of pl) updates[`active/${u}`] = null;
    const deltas = rateMulti(fresh, g.id, ranks, pl, now, updates);
    if (pl.length >= 2) updates[`log/${g.id}`] = { ts: now, mode: fresh.mode, matchType: fresh.matchType, black: ranks[0], white: ranks[1] || null, players: pl, ranks, winner: ranks[0], reason: "draw_end", moves: (fresh.hist || []).length, deltas, kind: "draw", scores: sc };
    await D.update("", updates);
  }

  // --- 그림 맞히기 화면 ---
  function drawSubscribe(g) {
    const key = `${g.id}:${g.round}`;
    if (drawRoundKey !== key) {
      drawRoundKey = key;
      if (drawSub) { drawSub(); drawSub = null; }
      boardView && boardView.reset && boardView.reset();
      if (g.status === "active") drawSub = D.on(`draws/${g.id}/s${g.round}`, v => { boardView && boardView.feed && boardView.feed(v); });
    }
    if (!drawChatSub || drawChatSub.gid !== g.id) {
      if (drawChatSub) drawChatSub.off();
      drawChat = {}; drawSeenChat = null;
      const off = D.on(`draws/${g.id}/c`, v => { drawChat = v || {}; renderDrawChat(S.curGame); });
      drawChatSub = { gid: g.id, off };
    }
  }
  function drawUnsubscribe() {
    if (drawSub) { drawSub(); drawSub = null; }
    if (drawChatSub) { drawChatSub.off(); drawChatSub = null; }
    drawRoundKey = ""; drawChat = {};
  }
  function drawSendStroke(key, s) {
    const g = S.curGame; if (!g || g.drawer !== S.uid || g.phase !== "draw") return;
    D.update(`draws/${g.id}/s${g.round}`, { [key]: s }).catch(() => {});
  }
  function renderDrawChat(g) {
    const box = $("#dr-chat"); if (!box || !g) return;
    const list = Object.entries(drawChat || {}).map(([k, c]) => Object.assign({ k }, c)).sort((a, b) => (a.t || 0) - (b.t || 0)).slice(-40);
    const bub = (c, inner, cls = "") => { const sk = stoneSkinOf(c.u); return `<div class="dc-row${c.u === S.uid ? " mine" : ""}"><div class="dc bub ${cls}${sk ? " sk sk-" + sk : ""}">${sk ? skinDeco(sk) : ""}${inner}</div></div>`; };
    box.innerHTML = list.map(c => c.gone ? `<div class="dc gone">🚪 <b>${esc(nameOf(c.u))}</b> ${e("접속이 끊겨서 나갔어요 (가장 낮은 순위)")}</div>`
      : c.ok ? bub(c, `🎉 <b>${esc(nameOf(c.u))}</b> 정답!`, "ok")
      : bub(c, `<b>${esc(nameOf(c.u))}</b> ${esc(c.m || "")}`)).join("") || `<p class="muted" style="margin:6px 0">${e("맞힌 답과 틀린 답이 여기에 나와요")}</p>`;
    box.scrollTop = box.scrollHeight;
    // 새 정답 알림 소리
    const okKeys = list.filter(c => c.ok).map(c => c.k);
    if (drawSeenChat === null) drawSeenChat = new Set(okKeys);
    for (const k of okKeys) if (!drawSeenChat.has(k)) { drawSeenChat.add(k); drawDing(); }
  }
  let drawAudio = null;
  function drawDing() {
    try {
      drawAudio = drawAudio || new (window.AudioContext || window.webkitAudioContext)();
      const t = drawAudio.currentTime;
      [880, 1320].forEach((f, i) => { const o = drawAudio.createOscillator(), gn = drawAudio.createGain(); o.connect(gn); gn.connect(drawAudio.destination); o.type = "triangle"; o.frequency.value = f; gn.gain.setValueAtTime(0.0001, t + i * .12); gn.gain.exponentialRampToValueAtTime(0.25, t + i * .12 + .01); gn.gain.exponentialRampToValueAtTime(0.0001, t + i * .12 + .35); o.start(t + i * .12); o.stop(t + i * .12 + .4); });
    } catch {}
  }
  function renderDrawWait(g) {
    const el = $("#g-status"); if (!el || !g || g.status !== "waiting" || g.matchType !== "room") return;
    const c = (g.players || []).length;
    const txt = g.autoAt ? e("🎨 {0}명 모였어요! {1}초 뒤 자동으로 시작해요 ({0}/{2}명)", c, Math.max(0, Math.ceil((g.autoAt - B.now()) / 1000)), g.n)
      : e("친구를 기다리는 중… ({0}/{1}명) · 3명이 모이면 자동 시작", c, g.n);
    if (el._h !== txt) { el._h = txt; el.textContent = txt; }
  }
  function renderDrawStatus(g) {
    const el = $("#g-status"); if (!el || !g || g.status !== "active") return;
    const D2 = DR(), now = B.now(), me = S.uid, isDrawer = g.drawer === me;
    if ((g.left || {})[me]) { const t = e("🚪 접속이 끊겨서 이 판에서 나갔어요 (가장 낮은 순위). [나가기]로 돌아가요."); if (el._h !== t) { el._h = t; el.textContent = t; } return; }
    const lim = g.phase === "choose" ? D2.CHOOSE_MS : g.phase === "draw" ? D2.DRAW_MS : D2.REVEAL_MS;
    const left = Math.max(0, Math.ceil(((g.phaseAt || now) + lim - now) / 1000));
    const rTxt = `${(g.round || 0) + 1}/${drawTotal(g)}`;
    let msg;
    if (g.phase === "choose") msg = isDrawer ? e("✏️ 그릴 단어를 골라요! ({0}초)", left) : e("{0}이(가) 그릴 단어를 고르는 중… ({1}초)", nameOf(g.drawer), left);
    else if (g.phase === "draw") {
      if (isDrawer) msg = e("✏️ 그릴 단어: 「{0}」 · 글자나 숫자는 쓰면 안 돼요! ({1}초)", D2.dec(g.w), left);
      else if ((g.correct || {})[me]) msg = e("✅ 정답! 「{0}」", D2.dec(g.w));
      else {
        const half = now > (g.phaseAt || now) + D2.DRAW_MS / 2;
        msg = e("❓ {0} ({1}글자){2} · {3}초", "○".repeat(g.wl || 0), g.wl || 0, half ? e(" · 힌트: {0}", g.ch || "") : "", left);
      }
    } else msg = g.gone ? e("그리던 친구가 나갔어요. 다음 문제 준비 중…") : e("정답은 「{0}」! 다음 라운드 준비 중…", g.word || "");
    const html = `<b>🎨 ${rTxt}</b> · ${esc(msg)}`;
    if (el._h !== html) { el._h = html; el.innerHTML = html; }
  }
  function renderDraw(g) {
    bellStartTick();
    const mc = myColor(g), isDrawer = g.drawer === S.uid && !S.spectate;
    const modeTxt = g.mode === "rank" ? e("🏆 랭크전") : e("🎮 일반전");
    $("#g-title").textContent = `${modeTxt} · ${(g.players || []).length}${e("인 그림 맞히기")}`;
    $("#g-spec-tag").classList.toggle("hidden", !S.spectate);
    $("#g-num-btn").classList.add("hidden"); $("#g-resign-btn").classList.add("hidden");
    $("#g-void-btn").classList.toggle("hidden", !(S.isMaster && (g.status === "active" || g.status === "waiting")));
    $("#g-confirm-btn").classList.add("hidden"); $("#g-moves")?.classList.add("hidden");
    $("#g-guide")?.classList.add("hidden"); $("#g-buddy")?.classList.add("hidden"); $("#bell-flip-btn")?.classList.add("hidden");
    renderEmojiBar(g);
    const rb = $("#g-ready-btn");
    if (rb) rb.classList.toggle("hidden", !(g.status === "waiting" && g.matchType !== "room" && mc && !(g.ready && g.ready[S.uid])));
    const stEl = $("#g-status"), foot = $("#g-foot");
    // 대기실
    let room = $("#bell-room");
    if (!room) { room = document.createElement("div"); room.id = "bell-room"; room.className = "bell-room"; foot.parentElement.insertBefore(room, foot); }
    if (g.status === "waiting" && g.matchType === "room") {
      renderDrawWait(g);
      const isHost = g.host === S.uid, seats = [];
      for (let i = 0; i < g.n; i++) { const u = (g.players || [])[i]; seats.push(`<div class="br-seat${u ? "" : " empty"}">${u ? nameTag(u) : e("빈자리")}${u && u === g.host ? ` <span class="pill">${e("방장")}</span>` : ""}</div>`); }
      const html = `<div class="panel"><h3>${g.mode === "rank" ? "🏆" : "🎮"} ${esc(nameOf(g.host))}${e("의 방")} · ${g.n}${e("인")} · ${g.rounds || 1}${e("바퀴")}</h3>
        <div class="br-seats">${seats.join("")}</div>
        ${isHost ? `<div class="foot" style="justify-content:center"><button type="button" class="btn primary" id="br-start" ${(g.players || []).length < 2 ? "disabled" : ""}>${e("시작하기")} (${(g.players || []).length}${e("명")})</button></div>
          <p class="muted" style="text-align:center;font-size:.85em">${e("2명 이상이면 바로 시작할 수 있어요. 3명이 모이면 10초 뒤 자동으로 시작해요.")}</p>` : `<p class="muted" style="text-align:center">${e("3명이 모이면 10초 뒤 자동으로 시작해요. (방장은 바로 시작 가능)")}</p>`}</div>`;
      if (room._h !== html) { room._h = html; room.innerHTML = html; $("#br-start")?.addEventListener("click", () => drawStart(g)); }
      room.classList.remove("hidden");
    } else { room.classList.add("hidden"); room._h = ""; }
    if (g.status === "waiting" && g.matchType !== "room") {
      const rd = g.ready || {}, hs = g.players || [];
      stEl._h = ""; stEl.textContent = e("모두 [준비 완료]를 누르면 시작해요. ({0}/{1}명 준비)", hs.filter(u => rd[u]).length, hs.length);
    }
    if (g.status === "active") drawSubscribe(g);
    boardView && boardView.set && boardView.set({ canDraw: g.status === "active" && g.phase === "draw" && isDrawer });
    { const bw = $("#view-game .board-wrap"); bw && bw.classList.toggle("vic-sketch", myVskin(g) === "board"); bw.classList.toggle("s0-sketch", myVskin(g) === "s0"); }   // 승리의 스케치북 (내 화면에만)
    // 단어 고르기 / 정답 공개 (판 위에)
    const wrap = $("#view-game .board-wrap");
    let pick = $("#dr-pick");
    if (!pick) { pick = document.createElement("div"); pick.id = "dr-pick"; pick.className = "dr-over"; wrap.appendChild(pick); }
    let ph = "";
    if (g.status === "active" && g.phase === "choose") {
      ph = isDrawer ? `<div class="dr-card"><div class="dr-big">✏️ ${e("내가 그릴 차례!")}</div><p>${e("그릴 단어를 하나 골라요")}</p><div class="dr-opts">${(g.options || []).map(w => `<button type="button" class="btn primary lg" data-word="${esc(w)}">${esc(w)}</button>`).join("")}</div></div>`
        : `<div class="dr-card"><div class="dr-big">🤔</div><p><b>${esc(nameOf(g.drawer))}</b>${e("이(가) 그릴 단어를 고르고 있어요")}</p></div>`;
    } else if (g.status === "active" && g.phase === "reveal") {
      const last = (g.hist || [])[(g.hist || []).length - 1] || {}, ok = last.ok || [];
      ph = `<div class="dr-card reveal"><div class="dr-sub">${e("정답은")}</div><div class="dr-word">${esc(g.word || last.word || "")}</div>
        <p>${last.gone ? `🚪 ${e("그리던 친구가 나가서 다음 문제로 넘어가요")}` : ok.length ? `🎉 ${ok.map(u => `<b>${esc(nameOf(u))}</b>`).join(", ")} ${e("정답!")}` : e("아무도 못 맞혔어요 😢")}</p><p class="muted">${e("그린 사람")}: ${esc(nameOf(last.d))}</p></div>`;
    }
    if (pick._h !== ph) {
      pick._h = ph; pick.innerHTML = ph; pick.classList.toggle("hidden", !ph);
      pick.querySelectorAll("[data-word]").forEach(b => b.onclick = () => drawChoose(b.dataset.word));
    }
    // 그리기 도구 + 맞히기 입력 + 점수판
    let side = $("#dr-side");
    if (!side) {
      side = document.createElement("div"); side.id = "dr-side"; side.className = "dr-side"; foot.parentElement.insertBefore(side, foot);
      side.innerHTML = `<div class="dr-tools" id="dr-tools">${DR().COLORS.map((c, i) => `<button type="button" class="dr-col${i === 0 ? " on" : ""}" data-col="${c}" style="background:${c}" aria-label="색"></button>`).join("")}
          <span class="dr-sep"></span>${DR().SIZES.map((w, i) => `<button type="button" class="dr-size${i === 1 ? " on" : ""}" data-size="${w}"><i style="width:${w + 2}px;height:${w + 2}px"></i></button>`).join("")}
          <span class="dr-sep"></span><button type="button" class="btn sm" data-eraser>🧽 ${e("지우개")}</button><button type="button" class="btn sm danger" data-clear>🗑️ ${e("전체 지우기")}</button></div>
        <div class="dr-scores" id="dr-scores"></div>
        <form class="dr-guess" id="dr-guess" autocomplete="off"><input id="dr-input" maxlength="14" placeholder="${e("정답을 입력하세요")}" enterkeyhint="send"><button class="btn primary" type="submit">${e("맞히기")}</button></form>
        <div class="dr-chat" id="dr-chat"></div>`;
      side.querySelector("#dr-guess").addEventListener("submit", ev => { ev.preventDefault(); const i = $("#dr-input"); const v = i.value; i.value = ""; drawGuess(v); i.focus(); });
      side.querySelectorAll("[data-col]").forEach(b => b.onclick = () => { side.querySelectorAll(".dr-col").forEach(x => x.classList.toggle("on", x === b)); side.querySelector("[data-eraser]").classList.remove("on"); boardView && boardView.set({ color: b.dataset.col }); });
      side.querySelectorAll("[data-size]").forEach(b => b.onclick = () => { side.querySelectorAll(".dr-size").forEach(x => x.classList.toggle("on", x === b)); boardView && boardView.set({ size: +b.dataset.size }); });
      side.querySelector("[data-eraser]").onclick = ev => { ev.currentTarget.classList.add("on"); side.querySelectorAll(".dr-col").forEach(x => x.classList.remove("on")); boardView && boardView.set({ color: "#fffdf6", size: 24 }); };
      side.querySelector("[data-clear]").onclick = () => { if (boardView && boardView.clearAll && boardView.state.canDraw) boardView.clearAll(); };
    }
    side.classList.toggle("hidden", g.status !== "active");
    $("#dr-tools").classList.toggle("hidden", !(isDrawer && g.phase === "draw"));
    $("#dr-guess").classList.toggle("hidden", !(mc && !isDrawer && !S.spectate));
    const inp = $("#dr-input"); if (inp) inp.disabled = g.phase !== "draw" || !!(g.correct || {})[S.uid];
    const sc = g.scores || {}, cor = g.correct || {};
    const lfs = g.left || {};
    const sh = (g.players || []).slice().sort((a, b) => (!!lfs[a] - !!lfs[b]) || (sc[b] || 0) - (sc[a] || 0)).map(u => lfs[u] ? `<span class="dr-sc gone">🚪 ${nameTag(u, "sm")} <small>${e("나감")}</small></span>` : (() => { const sk = stoneSkinOf(u); return `<span class="dr-sc${u === g.drawer ? " drawer" : ""}${cor[u] ? " ok" : ""}${u === S.uid ? " me" : ""}${sk ? " sk sk-" + sk : ""}">${sk ? skinDeco(sk) : ""}${u === g.drawer ? "✏️ " : cor[u] ? "✅ " : ""}${nameTag(u, "sm")} <b>${sc[u] || 0}</b></span>`; })()).join("");
    const scEl = $("#dr-scores"); if (scEl && scEl._h !== sh) { scEl._h = sh; scEl.innerHTML = sh; }
    if (g.status === "active") renderDrawStatus(g);
    else if (g.status === "finished") { stEl._h = ""; stEl.textContent = e("게임이 끝났어요!"); }
    renderDrawChat(g);
    // 끝
    const ov = $("#board-overlay");
    if (g.status === "finished" && !ov.dataset.dismissed) {
      const res = g.result || {}, ranks = res.ranks || g.players || [], rsc = res.scores || g.scores || {};
      const myPlace = ranks.indexOf(S.uid) + 1, d = g.deltas && S.uid && g.deltas[S.uid];
      const pm = d && d.promo, pmTxt = pm ? `<div class="promo-result ${pm.state}">${esc(pm.note)}${pm.state === "start" || pm.state === "on" || pm.state === "draw" ? promoDots(pm) : ""}</div>` : "";
      const scHtml = d ? `<div class="score-box">${pmTxt}${d.counted ? `${d.delta >= 0 ? "+" : ""}${d.delta}점 (현재 ${S.users[S.uid]?.score ?? ""}점)` : esc(d.note || "연습 경기")}</div>` : "";
      const medal = ["🥇", "🥈", "🥉"];
      ov.classList.remove("hidden", "loss");
      $("#ov-card").innerHTML = `<h2 class="${myPlace === 1 ? "win" : ""}">${res.reason === "void" ? e("경기 무효") : myPlace ? e("{0}등!", myPlace) : e("경기 끝")}</h2>
        ${res.reason === "void" ? "" : `<ol class="bell-rank">${ranks.map((u, i) => `<li class="${u === S.uid ? "me" : ""}">${medal[i] || (i + 1) + "."} ${nameTag(u, "sm")} · ${(g.left || {})[u] ? e("🚪 나감") : (rsc[u] || 0) + "점"}</li>`).join("")}</ol>`}
        ${scHtml}
        <div class="foot" style="justify-content:center"><button type="button" class="btn" id="ov-view">${e("닫기")}</button><button type="button" class="btn primary" id="ov-home">${e("홈으로")}</button></div>`;
      $("#ov-view").onclick = () => { ov.dataset.dismissed = "1"; ov.classList.add("hidden"); };
      $("#ov-home").onclick = () => leaveGame();
    } else if (g.status !== "finished") { delete ov.dataset.dismissed; ov.classList.add("hidden"); }
    drawDrive();
  }
  function renderDrawLobby() {
    const box = $("#bell-lobby"); if (!box) return;
    const rooms = Object.entries(bellRooms || {}).filter(([, r]) => r && r.cnt < r.n).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
    const seg = (id, items, cur) => `<div class="seg" id="${id}">${items.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(cur) === String(v) ? "on" : ""}">${l}</button>`).join("")}</div>`;
    const html = `
      <div class="panel bl-main">
        <h3 style="margin-top:0">🦒 ${e("내가 그린 기린 그림")}</h3>
        <p class="muted" style="margin:0 0 10px;font-size:.88em">${e("한 명이 그림을 그리면, 친구들이 무슨 그림인지 글자로 맞혀요! 가장 먼저 맞힌 사람이 점수를 받고 바로 다음 문제로 넘어가요.")}</p>
        <div class="bl-row"><span>${e("최대 인원")}</span>${seg("dl-n", [[3, "3인"], [4, "4인"], [6, "6인"], [8, "8인"]], drawLobbyN)}</div>
        <div class="bl-row"><span>${e("바퀴 수")}</span>${seg("dl-r", [[1, "1바퀴"], [2, "2바퀴"]], drawLobbyRounds)}</div>
        <div class="bl-row"><span>${e("방 종류")}</span>${seg("dl-mode", [["rank", "🏆 랭크전"], ["normal", "🎮 일반전"]], drawLobbyMode)}</div>
        <div class="mode-grid" style="margin-top:12px;grid-template-columns:1fr"><button class="mode-btn" id="dl-create" type="button"><b>${e("방 만들기")}</b><small>${e("3명이 모이면 10초 뒤 자동 시작 · 방장은 2명부터 바로 시작")}</small></button></div>
        <p class="muted" style="margin:10px 0 0;font-size:.82em">${e("1바퀴 = 모든 친구가 한 번씩 그려요. 그림은 {0}초 동안 그릴 수 있어요.", DR().DRAW_MS / 1000)}</p>
      </div>
      <div class="panel">
        <h3 style="margin-top:0">🚪 ${e("들어갈 수 있는 방")} <span class="muted">${rooms.length}</span></h3>
        ${rooms.length ? `<div class="bl-rooms">${rooms.map(([gid, r]) => `<div class="bl-room"><span>${r.mode === "rank" ? "🏆" : "🎮"} ${nameTag(r.host)}${e("의 방")}</span><span class="sp"></span><span class="pill">${r.cnt}/${r.n}${e("명")}</span><button type="button" class="btn sm primary" data-join="${esc(gid)}">${e("참가")}</button></div>`).join("")}</div>`
          : `<p class="empty">${e("열린 방이 없어요. 방을 만들어 친구를 불러 보세요!")}</p>`}
      </div>`;
    if (box._h === html) return;
    box._h = html; box.innerHTML = html;
    box.querySelectorAll("#dl-n button").forEach(b => b.onclick = () => { drawLobbyN = +b.dataset.v; renderDrawLobby(); });
    box.querySelectorAll("#dl-r button").forEach(b => b.onclick = () => { drawLobbyRounds = +b.dataset.v; renderDrawLobby(); });
    box.querySelectorAll("#dl-mode button").forEach(b => b.onclick = () => { drawLobbyMode = b.dataset.v; renderDrawLobby(); });
    $("#dl-create").onclick = drawCreateRoom;
    box.querySelectorAll("[data-join]").forEach(b => b.onclick = () => bellJoin(b.dataset.join));
  }

  // --- 화면 렌더링 ---
  function render() {
    if (S.view === "auth") {
      const isDemo = B.mode === "demo";
      $("#demo-banner").classList.toggle("hidden", !isDemo);
      const savedCid = localStorage.getItem("omokClassCode");
      if (savedCid && !$("#login-cid").value) $("#login-cid").value = savedCid;
    } else if (S.view === "pick") {
      renderPick();
    } else if (S.view === "student") {
      renderStudent();
    } else if (S.view === "game") {
      renderGame();
    } else if (S.view === "admin" && window.Admin) {
      window.Admin.render();
    }
    window.I18N && window.I18N.apply();
  }

  function renderStudent() {
    const me = S.users[S.uid];
    if (!me) return;
    $("#stu-class-name").textContent = (S.classMeta && S.classMeta.name) || S.cid || "";
    $("#stu-me-tag").innerHTML = nameTag(S.uid);

    const st = settings();
    const dCount = R.dayCount(me, B.now());
    $("#stu-daily-pill").textContent = st.dailyLimit > 0 ? `오늘 ${dCount}/${st.dailyLimit}판` : "무제한";
    $("#stu-rank-desc").textContent = `랜덤 매치 ×${st.multRandom} · 1:1 선택 매치 ×${st.multSelect}`;
    { const b = $("#btn-rank-ai"), c = aiRankCheck(S.users[S.uid]);
      if (b) { b.classList.toggle("locked", !c.ok); b.querySelector("small").textContent = c.ok ? e("플래티넘까지 · 이기면 쉬움 +{0} · 보통 +{1} · 어려움 +{2}", aiRankWin(S.users[S.uid]).easy, aiRankWin(S.users[S.uid]).normal, aiRankWin(S.users[S.uid]).hard) : c.why; } }

    const disp = tierOfUid(S.uid);
    const placing = (me.placed || 0) < R.PLACEMENT_GAMES;
    let pct = 100, subText = "";
    if (!placing && me.promo) {
      const to = R.TIERS.find(t => t.id === me.promo.to);
      pct = 100;
      subText = e("{0} 승급전 진행 중 — 3판 중 2판을 이기면 승급!", to ? to.name : "");
    } else if (placing) {
      pct = Math.round(((me.placed || 0) / R.PLACEMENT_GAMES) * 100);
      subText = `${e("배치고사 진행 중")} (${me.placed || 0}/${R.PLACEMENT_GAMES}판 완료)`;
    } else {
      const idx = Math.max(0, R.TIERS.findIndex(t => t.id === (disp.id === "champion" ? "challenger" : disp.id)));
      const curTier = R.TIERS[idx];
      const nextTier = R.TIERS[idx + 1];
      const chs = S.challengers || [];
      if (disp.id === "master" && R.tierOf(me.score).id === "challenger") {
        // 챌린저 점수는 넘었지만 상위 3명 밖
        const third = S.users[chs[CHALLENGER_MAX - 1]];
        pct = 96; subText = e("챌린저는 {0}명까지! 3위 {1}({2}점)보다 높아지면 바로 챌린저", CHALLENGER_MAX, nameOf(chs[CHALLENGER_MAX - 1]), third ? third.score : "");
      } else if (disp.id === "challenger") {
        const top = S.users[chs[0]];
        pct = 90; subText = e("챔피언 {0}까지 {1}점 · 챌린저는 상위 {2}명만!", nameOf(chs[0]), Math.max(1, (top ? top.score : me.score) - me.score), CHALLENGER_MAX);
      } else if (nextTier && nextTier.id === "challenger" && disp.id === "master") {
        const chMin = nextTier.min, third = chs.length >= CHALLENGER_MAX ? S.users[chs[CHALLENGER_MAX - 1]] : null;
        const need = Math.max(chMin, third ? third.score + 1 : chMin);
        const base = curTier.min;
        pct = Math.max(4, Math.min(100, Math.round(((me.score - base) / (need - base)) * 100)));
        subText = e("챌린저까지 {0}점 (승급전 없이 바로! 상위 {1}명만)", Math.max(0, need - me.score), CHALLENGER_MAX);
      } else if (nextTier && disp.id !== "champion") {   // [수정] 챔피언에게 "다이아까지 ○점"이 뜨던 문구 정리
        const base = curTier.min === -Infinity ? Math.min(me.score, nextTier.min - 100) : curTier.min;
        pct = Math.max(4, Math.min(100, Math.round(((me.score - base) / (nextTier.min - base)) * 100)));
        subText = e("{0}까지 {1}점", nextTier.name, Math.max(0, nextTier.min - me.score));
      } else {
        subText = disp.id === "champion" ? e("챌린저 중 1위 — 우리 반 챔피언!") : e("최고 티어 달성!");
      }
    }

    $("#stu-profile").innerHTML = `
      <div class="profile-top">
        <div class="big-emb">${emblem(disp.id, disp.div)}</div>
        <div>
          <div class="muted" style="font-size:.82em;font-weight:700">${e("현재 티어")}</div>
          <div class="tier-name tier-color-${disp.id}">${esc(disp.id === "diamond" ? String(disp.name).replace("다이아", e("다이아몬드")) : disp.name)}</div>
          <div class="score-num">${placing ? e("배치고사 {0}/{1}", me.placed || 0, R.PLACEMENT_GAMES) : e("{0}점", me.score)}</div>
        </div>
      </div>
      <div class="progress${me.promo ? " promo" : ""}"><i style="width:${pct}%"></i></div>
      ${me.promo && !placing ? `<div class="promo-box"><b class="tier-color-${esc(me.promo.to)}">🔥 ${esc((R.TIERS.find(t => t.id === me.promo.to) || {}).name || "")} ${e("승급전")}</b>${promoDots(me.promo)}</div>` : ""}
      ${me.shield && !placing && !me.promo ? `<div class="shield-box">🛡️ ${(() => { const nm = R.tierOf(Math.max(0, (me.score ?? R.START_SCORE) - 1)).name || "", last = nm.slice(-1); const c = nm.charCodeAt(nm.length - 1) - 0xac00, j = /[IVX]$/.test(nm) ? (/III$/.test(nm) ? 1 : 0) : (c >= 0 ? c % 28 : 0); return e("강등 방어전 — 다음 랭크전에서 지면 {0}{1} 내려가요. 이기면 방어 성공!", nm, j === 0 || j === 8 ? "로" : "으로"); })()}</div>` : ""}
      <div class="muted" style="font-size:.84em">${esc(subText)}</div>
      <div class="stats">
        <div><b>${me.wins || 0}승 ${me.losses || 0}패</b><span>랭크 전적</span></div>
        <div><b>${me.nWins || 0}승 ${me.nLosses || 0}패</b><span>일반 전적</span></div>
        <div><b>${(me.wins || 0) + (me.losses || 0) ? Math.round(((me.wins || 0) / ((me.wins || 0) + (me.losses || 0))) * 100) + "%" : "-"}</b><span>랭크 승률</span></div>
      </div>`;
    // [추가] 바둑돌 스킨 미리보기 (오목·알까기)
    if ((game() === "omok" || game() === "alkkagi" || game() === "chess") && window.StoneSkin) {
      const mySkin = stoneSkinOf(S.uid);
      const row = window.StoneSkin.SKINS.map(id => `<span class="skin-item${id === mySkin ? " on" : ""}" title="${esc(window.StoneSkin.NAME[id])}"><canvas data-skin="${id}" width="64" height="64"></canvas><small>${esc(window.StoneSkin.NAME[id])}</small></span>`).join("");
      const isChess = game() === "chess";
      $("#stu-profile").insertAdjacentHTML("beforeend", `<div class="skin-box"><div class="skin-head"><b>${isChess ? e("기물 스킨") : e("바둑돌 스킨")}</b><span class="muted">${mySkin ? e(isChess ? "지금 내 기물: {0} 스킨 ✨" : "지금 내 돌: {0} 스킨 ✨", window.StoneSkin.NAME[mySkin]) : (isChess ? e("골드부터 내 기물에 티어 표시가 생겨요") : e("골드부터 내 돌에 티어 표시가 생겨요"))}</span></div><div class="skin-row">${row}</div></div>`);
      $$("#stu-profile canvas[data-skin]").forEach(cv => {
        if (isChess && window.ChessPiece) { window.ChessPiece(cv.getContext("2d"), "k", "w", 32, 36, 46, cv.dataset.skin); return; }
        const ctx = cv.getContext("2d"), r = 17, cx = 32, cy = 37, black = true;
        const sg = ctx.createRadialGradient(cx - r * .3, cy - r * .3, r * .08, cx, cy, r);
        sg.addColorStop(0, "#6a6a70"); sg.addColorStop(.55, "#19191c"); sg.addColorStop(1, "#050507");
        ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowColor = "transparent";
        window.StoneSkin.draw(ctx, cx, cy, r, 1, cv.dataset.skin);
      });
    }

    // [추가] 승리의 스킨 고르기
    if (VSKIN_OPTS[game()]) {
      const vsea = victorySeasons(S.uid), gift = vGranted(S.uid), s0 = s0Granted(S.uid), vic = vsea.length > 0 || gift;
      const opts = [VSKIN_OPTS[game()][0]].concat(vic ? VSKIN_OPTS[game()].slice(1) : [], s0 ? [["s0", "🐉 " + S0_LABEL[game()]]] : []);
      const cur = (opts.some(o => o[0] === me.vskin) && me.vskin) || "";
      const why = [vsea.length ? `${esc(vsea.join(", "))} ${e("시즌 다이아 이상 달성!")}` : "", gift ? e("선생님이 주신 스킨 🎁") : "", s0 ? e("🐉 시즌 0 한정판") : ""].filter(Boolean).join(" · ");
      const html = (vic || s0)
        ? `<div class="vic-box"><div class="vic-head"><b>🏆 ${e("승리의 스킨")}</b><span>${why}</span></div>
            <div class="vic-opts">${opts.map(([v, l]) => `<button type="button" class="vic-opt${cur === v ? " on" : ""}${v === "s0" ? " s0" : ""}" data-vskin="${v}"><canvas data-vprev="${v}" width="96" height="96"></canvas><small>${esc(l)}</small></button>`).join("")}</div>
            <p class="vic-note">${e("고른 스킨은 내 화면에서만 보여요.")}</p></div>`
        : `<div class="vic-box locked"><div class="vic-head"><b>🔒 ${e("승리의 스킨")}</b><span>${e("시즌을 다이아 이상으로 마치면 받을 수 있어요")}</span></div></div>`;
      $("#stu-profile").insertAdjacentHTML("beforeend", html);
      $$("#stu-profile [data-vskin]").forEach(b => b.onclick = () => setVskin(b.dataset.vskin));
      $$("#stu-profile canvas[data-vprev]").forEach(cv => drawVictoryPreview(cv, game(), cv.dataset.vprev));
    }

    const isBell = game() === "bell" || game() === "draw";
    $$("#view-student .panel.mode").forEach(el => el.classList.toggle("hidden", isBell));
    $("#bell-lobby")?.classList.toggle("hidden", !isBell);
    if (isBell) (game() === "draw" ? renderDrawLobby() : renderBellLobby());

    const side = $("#stu-side-body");
    if (S.stuSideTab === "rank") {
      const { placed, placing: pl } = rankingOrder();
      side.innerHTML = `<ul class="rank-list">
        ${placed.map((uid, i) => {
          const u = S.users[uid];
          return `<li class="${uid === S.uid ? "me" : ""}"><span class="no">${i + 1}</span>${statusDot(uid)}${nameTag(uid)}<span class="sp"></span>${u.promo ? `<span class="pill promo-pill">${e("승급전 {0}-{1}", u.promo.w || 0, u.promo.l || 0)}</span>` : ""}<b>${e("{0}점", u.score)}</b></li>`;
        }).join("")}
        ${pl.map(uid => `<li class="${uid === S.uid ? "me" : ""}"><span class="no muted">-</span>${statusDot(uid)}${nameTag(uid)}<span class="sp"></span><span class="muted">${e("배치고사 {0}/{1}", S.users[uid].placed || 0, R.PLACEMENT_GAMES)}</span></li>`).join("")}
      </ul>${!placed.length && !pl.length ? `<p class="empty">등록된 학생이 없습니다.</p>` : ""}`;
    } else if (S.stuSideTab === "hist") {
      const list = Object.entries(userGames || {}).map(([gid, r]) => Object.assign({ gid }, r)).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 30);
      side.innerHTML = list.length ? `<ul class="hist">
        ${list.map(r => {
          const cls = r.draw ? "draw" : r.won ? "win" : "loss";
          const lbl = r.draw ? "무" : r.won ? "승" : "패";
          const dStr = r.mode === "rank" ? (r.counted ? `${r.note ? `<span class="muted" style="font-size:.8em">${esc(r.note)}</span> ` : ""}<span class="delta ${r.delta > 0 ? "up" : r.delta < 0 ? "down" : ""}">${r.delta > 0 ? "+" : ""}${r.delta}</span>` : `<span class="muted">${esc(r.note || "연습")}</span>`) : `<span class="muted">${r.note ? esc(r.note) + " · " : ""}일반</span>`;
          return `<li><span class="res ${cls}">${lbl}</span>${nameTag(r.opp, "", { level: String(r.opp).split(":")[1] })}<span class="sp"></span>${dStr}<button type="button" class="btn xs ghost" data-replay="${esc(r.gid)}">기보</button></li>`;
        }).join("")}
      </ul>` : `<p class="empty">아직 완료한 경기가 없습니다.</p>`;
    } else if (game() === "draw") {
      side.innerHTML = `<div class="rules">
        <p><b>내가 그린 기린 그림 규칙</b> — 한 명이 그리고, 나머지가 맞혀요!</p>
        <ul>
          <li><b>차례:</b> 한 사람씩 돌아가며 그려요. 그릴 단어는 자동으로 정해져서 그리는 사람 화면 위에만 보여요.</li>
          <li><b>그리기:</b> 80초 동안 그려요. <b>글자·숫자·손가락으로 가리키기는 반칙!</b> 색·굵기·지우개를 쓸 수 있어요.</li>
          <li><b>맞히기:</b> 아래 칸에 답을 쓰고 [맞히기]를 눌러요. <b>가장 먼저 맞힌 사람만</b> 점수를 받고, 정답을 3초 보여 준 뒤 자동으로 다음 문제로 넘어가요! 한 글자만 틀리면 "거의 맞았어요!"라고 알려 줘요.</li>
          <li><b>힌트:</b> 처음부터 글자 수를 보여 주고, 40초가 지나면 초성(예: ㄱㄹ)을 보여 줘요.</li>
          <li><b>점수:</b> 가장 먼저 맞힌 한 사람이 10점, 그린 사람이 5점! 누군가 맞히면 바로 다음 문제로 넘어가요.</li>
          <li><b>끝:</b> 모두 정해진 바퀴만큼 그리면 끝나요. 랭크전 방에서는 등수에 따라 티어 점수가 바뀌어요.</li>
        </ul>
      </div>`;
    } else if (game() === "bell") {
      side.innerHTML = `<div class="rules">
        <p><b>갈리할리 규칙</b> — 보드게임 할리갈리와 같은 규칙이에요. 카드를 가장 많이 모으면 이겨요.</p>
        <ul>
          <li><b>카드:</b> 딸기(빨강)·바나나(노랑)·라임(초록)·포도(보라)가 1~5개 그려진 카드 한 사람당 15장씩 나눠 가져요(4명이면 14장씩). 첫 번째 사람은 무작위로 정해져요.</li>
          <li><b>카드 내기:</b> 내 차례가 되면 <b>[카드 내기]</b> 버튼(또는 스페이스바)을 눌러 맨 위 카드를 앞에 펼쳐요. 15초 동안 안 누르면 자동으로 나가요.</li>
          <li><b>종 치기:</b> 모두의 맨 위 카드에서 <b>같은 과일이 딱 5개</b>면 종을 쳐요! 가장 먼저 친 사람이 펼쳐진 카드를 모두 가져가고, 그 사람부터 다시 카드를 내요.</li>
          <li><b>틀리면:</b> 다른 사람에게 카드를 1장씩 줘요. 줄 카드가 없는데 틀리면 탈락이에요.</li>
          <li><b>카드가 떨어지면:</b> 바로 탈락하지 않아요! 카드 내기는 건너뛰지만 종은 칠 수 있어요. 앞에 펼친 카드까지 모두 빼앗기면 탈락이에요.</li>
          <li><b>마지막 두 명:</b> 3~4명이 하다가 2명만 남으면, 다음에 맞게 친 사람이 카드를 가져가고 끝나요. 틀리게 치면 상대가 펼쳐진 카드를 가져가고 끝나요.</li>
          <li><b>2명이 할 때:</b> 틀리게 치면 상대가 펼쳐진 카드를 모두 가져가요. 한 사람이 카드를 다 가질 때까지 계속해요.</li>
          <li><b>교실용 추가 규칙:</b> 한 판은 최대 5분이에요. 시간이 끝나면 카드(손 + 앞에 펼친 카드)가 많은 순서로 등수를 정해요.</li>
          <li><b>점수:</b> 랭크전 방에서는 등수에 따라 점수가 바뀌어요.</li>
          <li><b>키보드:</b> 스페이스바 = 카드 내기, 엔터 또는 B = 종 치기</li>
        </ul>
      </div>`;
    } else if (game() === "alkkagi") {
      side.innerHTML = `<div class="rules">
        <p><b>알까기 규칙</b> — 흑과 백이 4개씩 가지고, 상대 알을 모두 판 밖으로 떨어뜨리면 이겨요.</p>
        <ul>
          <li><b>튕기기:</b> 내 알(초록 테두리)을 누른 채 <b>뒤로 당겨 방향</b>을 정해요. 누르고 있는 동안 파워 게이지가 1~100%로 빠르게 오르내리니, <b>원하는 파워일 때 손을 떼세요!</b> 당긴 거리는 힘과 상관없어요.</li>
          <li><b>게이지 속도:</b> 처음엔 아주 빠르고, 내 알이 적게 남을수록 느려져서 맞추기 쉬워져요. (4개 0.7초 → 3개 0.8초 → 2개 1.0초 → 1개 1.2초에 한 바퀴)</li>
          <li><b>차례:</b> 한 번 튕기면 상대 차례예요. 흑이 먼저 해요.</li>
          <li><b>탈락:</b> 판 밖으로 나간 알은 내 알이든 상대 알이든 사라져요. 너무 세게 쏘면 내 알도 떨어져요!</li>
          <li><b>무승부:</b> 한 번에 두 사람 알이 모두 떨어지면 무승부예요.</li>
          <li><b>시간:</b> 한 번 튕길 때마다 제한 시간이 있고, 넘기면 시간 초과로 져요.</li>
        </ul>
      </div>`;
    } else if (game() === "omok") {
      side.innerHTML = `<div class="rules">
        <p><b>렌주룰 요약</b> — 흑이 먼저 두고, 가로·세로·대각선으로 정확히 5개를 먼저 이으면 이깁니다.</p>
        <ul>
          <li><b>흑의 금수:</b> 삼삼(열린 3을 두 개 동시에), 사사(4를 두 개 동시에), 장목(6개 이상)은 둘 수 없어요. 두면 반칙패예요.</li>
          <li><b>백:</b> 금수가 없고, 6개 이상 이어도 이겨요.</li>
          <li><b>금수 표시:</b> 설정에 따라 빨간 X로 금수 자리가 표시돼요.</li>
          <li><b>시간:</b> 한 수마다 제한 시간이 있고, 넘기면 시간 초과로 져요.</li>
        </ul>
      </div>`;
    } else {
      side.innerHTML = `<div class="rules">
        <p><b>체스 규칙 요약</b> — 선공(백)이 먼저 두고, 상대 킹을 잡을 수 없게 몰면(체크메이트) 이깁니다.</p>
        <ul>
          <li><b>이동:</b> 기물을 한 번 눌러 고르면 갈 수 있는 칸이 초록색으로 표시돼요. 도착할 칸을 눌러 두세요 (설정에 따라 한 번 더 눌러 확정).</li>
          <li><b>특수 규칙:</b> 캐슬링, 앙파상, 폰 승급(퀸·룩·비숍·나이트 중 선택)이 모두 가능해요.</li>
          <li><b>무승부:</b> 스테일메이트, 같은 모양 3번 반복, 기물 부족, 50수 규칙.</li>
          <li><b>시계:</b> 한 사람당 정해진 시간이 있고, 다 쓰면 시간 초과로 져요.</li>
        </ul>
      </div>`;
    }
  }

  // ===== [추가] 체스 배우기 가이드 (AI 대전에서만) =====
  let guideOn = true, guideHint = null, guideBusy = false;
  try { guideOn = localStorage.getItem("chessGuideOff") !== "1"; } catch {}
  function renderChessGuide(g, c, mc) {
    const box = $("#g-guide"), bud = $("#g-buddy"), none = { danger: [], risky: [], hint: null };
    const show = !!(box && window.ChessGuide && g.matchType === "ai" && g.mode !== "rank" && mc && !S.spectate && g.status === "active");   // 랭크전(AI 포함)에는 가이드·추천 수 없음
    if (box) box.classList.toggle("hidden", !show);
    if (bud) bud.classList.toggle("hidden", !show || !guideOn);
    $(".board-stage")?.classList.toggle("with-buddy", show && guideOn);
    if (!show) return none;
    const G = window.ChessGuide, me = mc === 1 ? "w" : "b", n = (g.moves || []).length;
    if (guideHint && guideHint.n !== n) guideHint = null;
    const head = `<div class="g-guide-head"><b>♟ 체스 배우기 가이드</b><span class="sp"></span>
      ${guideOn ? `<button type="button" class="btn sm good" id="gd-hint" ${c.turn() !== me || guideBusy ? "disabled" : ""}>${guideBusy ? "생각 중…" : "💡 추천 수 보기"}</button>` : ""}
      <button type="button" class="btn sm ghost" id="gd-toggle">${guideOn ? "가이드 끄기" : "가이드 켜기"}</button></div>`;
    if (!guideOn) { setGuideHtml(box, head, g); return none; }
    const sel = S.selSq >= 0 ? CR.sq(S.selSq) : null;
    const t = G.tips(c, me, sel);
    const risky = sel ? G.riskyTargets(c, sel).map(CR.idx) : [];
    setGuideHtml(box, head + `<details class="g-more"${S.guideMoreOpen ? " open" : ""}><summary>자세한 설명 보기</summary><div class="g-guide-body">${t.html}</div></details>` + G.RULES, g);
    // 말풍선 캐릭터
    const say = guideBusy ? "어디가 좋을까… 같이 생각해 볼게요! 🤔" : guideHint ? guideHint.text : t.bubble;
    const mood = guideBusy ? "think" : guideHint ? "happy" : t.mood;
    if (bud && bud._say !== say + mood) {
      bud._say = say + mood;
      bud.innerHTML = `<div class="bd-char bd-${mood}">${G.buddySvg(mood)}<div class="bd-name">폰폰 선생님</div></div><div class="bd-bubble">${say}</div>`;
      bud.classList.remove("pop"); void bud.offsetWidth; bud.classList.add("pop");
    }
    return { danger: t.danger.map(CR.idx), risky, hint: guideHint ? { from: guideHint.from, to: guideHint.to } : null };
  }
  // 내용이 같으면 다시 그리지 않아요 (규칙 펼침·버튼 눌림이 풀리지 않게)
  function setGuideHtml(box, html, g) {
    if (box._html === html) return;
    box._html = html; box.innerHTML = html; bindGuide(g);
  }
  function bindGuide(g) {
    const box = $("#g-guide");
    const rules = box.querySelector(".g-rules"); if (rules) { rules.open = !!S.guideRulesOpen; rules.addEventListener("toggle", () => { S.guideRulesOpen = rules.open; }); }
    const more = box.querySelector(".g-more"); if (more) more.addEventListener("toggle", () => { S.guideMoreOpen = more.open; box._html = ""; });
    box.querySelector("#gd-toggle")?.addEventListener("click", () => {
      guideOn = !guideOn; guideHint = null;
      try { localStorage.setItem("chessGuideOff", guideOn ? "0" : "1"); } catch {}
      renderGame();
    });
    box.querySelector("#gd-hint")?.addEventListener("click", () => {
      if (guideBusy) return;
      guideBusy = true; renderGame();
      setTimeout(() => {
        try {
          const cur = S.curGame, moves = (cur && cur.moves) || [];
          const u = window.ChessAI.pick(moves, "hard");
          if (u && cur) {
            const c = CR.from(moves), me = myColor(cur) === 1 ? "w" : "b";
            guideHint = { n: moves.length, from: CR.idx(u.slice(0, 2)), to: CR.idx(u.slice(2, 4)), text: window.ChessGuide.reason(c, u, me) };
          }
        } catch (err) { console.warn(err); }
        guideBusy = false; renderGame();
      }, 30);
    });
  }

  function renderGame() {
    const g = S.curGame;
    if (!g) return;
    if (game() === "bell") { $(".players-row")?.classList.add("hidden"); $("#dr-side")?.classList.add("hidden"); $("#dr-pick")?.classList.add("hidden"); return renderBell(g); }
    if (game() === "draw") { $(".players-row")?.classList.add("hidden"); return renderDraw(g); }
    $("#dr-side")?.classList.add("hidden"); $("#dr-pick")?.classList.add("hidden");
    $(".players-row")?.classList.remove("hidden");
    const moves = g.moves || [];
    const turnColor = moves.length % 2 === 0 ? 1 : 2;
    const mc = myColor(g);
    const st = settings();
    const kind = game(), isOmok = kind === "omok", isAk = kind === "alkkagi";
    const c = kind === "chess" ? CR.from(moves) : null;
    $("#g-num-btn").textContent = isOmok ? e("번호") : e("기보");
    $("#g-num-btn").classList.toggle("hidden", isAk);

    const modeTxt = g.mode === "rank" ? e("🏆 랭크전") : e("🎮 일반전");
    const typeTxt = g.matchType === "ai" ? `AI ${AI_NAMES[g.aiLevel] || ""}` : (MATCH_NAMES[g.matchType] || "");
    $("#g-title").textContent = `${modeTxt} · ${typeTxt}`;
    $("#g-spec-tag").classList.toggle("hidden", !S.spectate);
    $("#g-num-btn").classList.toggle("on", S.showNumbers);
    $("#g-resign-btn").classList.toggle("hidden", S.spectate || g.status !== "active" || !mc);
    $("#g-void-btn").classList.toggle("hidden", !(S.isMaster && (g.status === "active" || g.status === "waiting")));
    renderEmojiBar(g);

    const renderPcard = (el, uid, color) => {
      const isTurn = g.status === "active" && turnColor === color;
      el.classList.toggle("turn", isTurn);
      const isMe = !S.spectate && uid === S.uid;
      const left = g.tm ? g.tm[color === 1 ? "f" : "s"] - (isTurn ? B.now() - (g.turnAt || g.createdAt) : 0)
        : g.moveLimit ? (isTurn ? g.moveLimit - (B.now() - (g.turnAt || g.createdAt)) : g.moveLimit) : null;
      const full = g.tm ? (g.tm0 || 600000) : (g.moveLimit || 1);
      const pct = left === null ? 100 : Math.max(0, Math.min(100, Math.round(left / full * 100)));
      el.innerHTML = `
        <div class="top">
          <span class="stone ${(color === 1) === (kind !== "chess") ? "b" : "w"}"></span>${isAk ? `<span class="ak-left">×${window.Alkkagi.aliveCount(window.Alkkagi.posOf(moves), color)}</span>` : ""}
          ${nameTag(uid, "", { level: g.aiLevel })}
          ${isMe ? `<span class="you">나</span>` : ""}
          <span class="sp"></span>
          <span class="muted" style="font-size:.82em">${scoreText(uid)}</span>
          <span class="clk">${left === null ? "∞" : fmt(left)}</span>
        </div>
        <div class="timer"><i style="width:${pct}%"></i></div>`;
    };
    renderPcard($("#pcard-black"), g.black, 1);
    renderPcard($("#pcard-white"), g.white, 2);

    const statusEl = $("#g-status");
    statusEl.classList.remove("warn");
    if (g.status === "waiting") {
      const iAmReady = !!(g.ready && g.ready[S.uid]);
      statusEl.textContent = !mc ? "선수들의 준비를 기다리는 중…" : iAmReady ? "상대방의 준비 완료를 기다리는 중…" : "경기가 배정되었어요! 아래 [준비 완료!]를 눌러 시작하세요.";
    } else if (g.status === "active") {
      const turnUid = turnColor === 1 ? g.black : g.white;
      const chk = c && c.in_check() ? " · 체크!" : "";
      if (isAk) {
        statusEl.textContent = mc === turnColor ? e("내 차례예요! 알을 뒤로 당겨 방향을 정하고, 게이지가 원하는 파워일 때 놓으세요 ({0}수)", moves.length + 1)
          : e("{0} 차례예요 ({1}수)", nameOf(turnUid, { level: g.aiLevel }), moves.length + 1);
      } else if (mc === turnColor) {
        statusEl.textContent = S.ghost != null ? (isOmok ? "같은 자리를 한 번 더 누르거나 아래 [착수]를 누르세요!" : "도착 칸을 한 번 더 누르거나 아래 [착수]를 누르세요!") : `내 차례입니다 (${moves.length + 1}수)${chk}`;
      } else {
        statusEl.textContent = `${nameOf(turnUid, { level: g.aiLevel })} 차례입니다 (${moves.length + 1}수)${chk}`;
      }
    } else if (g.status === "finished") {
      const res = g.result || {};
      statusEl.textContent = res.reason === "void" ? e("선생님이 이 경기를 무효 처리했어요. 점수에 반영되지 않아요.") : res.winner ? `${nameOf(res.winner, { level: g.aiLevel })} 승리! (${REASON_NAMES[res.reason] || ""})` : `무승부로 종료되었습니다. (${REASON_NAMES[res.reason] || ""})`;
    } else {
      statusEl.textContent = "취소된 경기입니다.";
    }

    const hints = st.showHints !== false;
    if (kind !== "chess") { $("#g-guide")?.classList.add("hidden"); $("#g-buddy")?.classList.add("hidden"); $(".board-stage")?.classList.remove("with-buddy"); }
    // [추가] 바둑돌 스킨: 플래티넘 이상 티어면 돌에 티어 표시
    const skins = { 1: stoneSkinOf(g.black), 2: stoneSkinOf(g.white) };
    const vs = myVskin(g);                          // 승리의 스킨은 내 화면에서만 보여요
    { const bw = $("#view-game .board-wrap"); bw && bw.classList.remove("vic-sketch", "s0-sketch"); }
    const boardTheme = vs === "board" ? "victory" : vs === "s0" ? "s0" : null;
    if (isAk) {
      boardView && boardView.set({ moves, myColor: mc, canShoot: g.status === "active" && mc === turnColor && !S.spectate, flip: mc === 2, skins, boardTheme });
    } else if (isOmok) {
      const showF = g.status === "active" && turnColor === 1 && mc === 1 && forbidShown(g);
      boardView && boardView.set({ moves, forbidden: showF ? window.Renju.forbiddenPoints(window.Renju.boardFromMoves(moves)) : [],
        ghost: g.status === "active" && S.ghost != null ? S.ghost : -1, ghostColor: turnColor, numbers: S.showNumbers, skins, boardTheme });
    } else {
      const tg = (hints && S.selSq >= 0 && g.status === "active") ? CR.targets(c, CR.sq(S.selSq)).map(CR.idx) : [];
      const gd = renderChessGuide(g, c, mc);
      boardView && boardView.set({ moves, flip: mc === 2, sel: (S.selSq >= 0 && g.status === "active") ? S.selSq : null, targets: tg, ghost: g.status === "active" ? S.ghost : null, skins: { w: skins[1], b: skins[2] }, boardTheme,
        danger: gd.danger, risky: gd.risky, hint: gd.hint });
    }

    $("#g-confirm-btn").classList.toggle("hidden", !(g.status === "active" && mc === turnColor && st.confirmMove && S.ghost != null));
    const rb = $("#g-ready-btn");
    if (rb) rb.classList.toggle("hidden", !(g.status === "waiting" && mc && !(g.ready && g.ready[S.uid])));

    const mvBox = $("#g-moves");
    if (mvBox) {
      mvBox.classList.toggle("hidden", kind !== "chess" || !S.showNumbers);
      if (kind === "chess" && S.showNumbers) {
        const hs = c.history();
        mvBox.innerHTML = hs.length ? hs.map((m, i) => `${i % 2 === 0 ? `<span class="mn">${i / 2 + 1}.</span>` : ""}<span class="${i === hs.length - 1 ? "last" : ""}">${esc(m)}</span>`).join(" ") : "아직 둔 수가 없어요.";
        mvBox.scrollTop = mvBox.scrollHeight;
      }
    }

    const ov = $("#board-overlay");
    if (g.status === "finished" && isAk && boardView && boardView.busy) {
      ov.classList.add("hidden");               // 알이 다 멈춘 뒤에 결과 창을 보여 줘요
    } else if (g.status === "finished" && !ov.dataset.dismissed) {
      const res = g.result || {};
      const iWon = mc && res.winner === S.uid;
      const iLost = mc && res.winner && res.winner !== S.uid;
      ov.classList.remove("hidden", "loss");
      if (iLost) ov.classList.add("loss");
      const title = res.reason === "void" ? e("경기 무효") : !mc ? (res.winner ? `${nameOf(res.winner, { level: g.aiLevel })} 승리` : "무승부") : (iWon ? e("승리!") : iLost ? e("패배") : e("무승부"));
      const d = g.deltas && S.uid && g.deltas[S.uid];
      const pm = d && d.promo, pmTxt = pm ? `<div class="promo-result ${pm.state}">${esc(pm.note)}${pm.state === "start" || pm.state === "on" || pm.state === "draw" ? promoDots(pm) : ""}</div>` : "";
      const scHtml = d ? `<div class="score-box">${pmTxt}${d.counted ? `${d.delta >= 0 ? "+" : ""}${d.delta}점 (현재 ${S.users[S.uid]?.score ?? ""}점)` : esc(d.note || "연습 경기")}</div>` : "";
      $("#ov-card").innerHTML = `
        <h2 class="${iWon ? "win" : iLost ? "loss" : ""}">${esc(title)}</h2>
        <p class="muted" style="margin:4px 0">${esc(REASON_NAMES[res.reason] || "")}</p>
        ${scHtml}
        <div class="foot" style="justify-content:center">
          <button type="button" class="btn" id="ov-view">${e("판 보기")}</button>
          <button type="button" class="btn primary" id="ov-home">${e("홈으로")}</button>
        </div>`;
      $("#ov-view").onclick = () => { ov.dataset.dismissed = "1"; ov.classList.add("hidden"); };
      $("#ov-home").onclick = () => leaveGame();
    } else if (g.status !== "finished") {
      delete ov.dataset.dismissed;
      ov.classList.add("hidden");
    }
  }

  function leaveGame() {
    bellClearTimers(); drawUnsubscribe(); $("#bell-room")?.classList.add("hidden"); $("#bell-flip-btn")?.classList.add("hidden"); $("#dr-side")?.classList.add("hidden"); $("#dr-pick")?.classList.add("hidden");
    if (gameUnsub) { gameUnsub(); gameUnsub = null; }
    if (aiTimeout) { clearTimeout(aiTimeout); aiTimeout = null; }
    S.curGameId = null; S.curGame = null; S.selSq = -1; S.ghost = null;
    show(S.isMaster ? "admin" : "student");
  }

  // --- 매칭 · 초대 모달 ---
  function startRandomQueue() {
    if (!S.cid || !S.uid || queueInterval) return;   // [수정] 버튼을 여러 번 눌러도 매칭이 겹치지 않게
    D.set(`queue/${S.uid}`, { at: B.now(), score: S.users[S.uid]?.score ?? R.START_SCORE });
    const m = modal(`<div class="searching">
      <div class="rings"><i></i><i></i></div>
      <h3>상대를 찾는 중…</h3>
      <p class="muted" style="font-size:.9em">비슷한 티어의 학생이 들어오면 바로 대국이 시작됩니다.</p>
      <button type="button" class="btn ghost" id="q-cancel">매칭 취소</button>
    </div>`);
    const stop = () => {
      if (queueInterval) { clearInterval(queueInterval); queueInterval = null; }
      D.remove(`queue/${S.uid}`).catch(() => {});
      m.close();
    };
    m.el.querySelector("#q-cancel").onclick = stop;
    // [수정] 바깥을 눌러 창이 닫혀도 매칭이 몰래 계속되던 문제 → 함께 취소
    m.el.addEventListener("click", ev => { if (ev.target === m.el) stop(); });
    queueInterval = setInterval(async () => {
      if (S.active[S.uid]) { stop(); return; }
      const entries = Object.entries(S.queue || {}).filter(([u]) => u !== S.uid && !S.active[u]);
      if (!entries.length) return;
      entries.sort((a, b) => a[0].localeCompare(b[0]));
      const [opp] = entries[0];
      if (S.uid < opp) {
        await D.update("", { [`queue/${S.uid}`]: null, [`queue/${opp}`]: null });
        const meFirst = Math.random() < 0.5;   // 동전은 한 번만 던져야 해요 (원본은 두 번 던져 "나 vs 나"가 생기는 버그가 있었음)
        const gid = await createPvp(meFirst ? S.uid : opp, meFirst ? opp : S.uid, "rank", "random", true);
        stop();
        openGame(gid, { spectate: false });
      }
    }, 1200);
  }

  function openChallengeModal(mode) {
    const idleList = Object.keys(S.users).filter(u => u !== S.uid && status(u) === "idle");
    const m = modal(`<h3>${mode === "rank" ? "1:1 선택 매치 상대 고르기" : "친구와 대전 상대 고르기"}</h3>
      <div class="pick-list">
        ${idleList.length ? idleList.map(u => `<button type="button" class="pick-item" data-opp="${u}"><span>${nameTag(u)}</span><span class="muted">${scoreText(u)}</span></button>`).join("") : `<p class="empty">지금 도전할 수 있는 접속 중인 친구가 없습니다.</p>`}
      </div>
      <div class="foot"><button type="button" class="btn ghost" data-close>${e("닫기")}</button></div>`);
    m.el.querySelectorAll("[data-opp]").forEach(btn => {
      btn.onclick = async () => {
        const opp = btn.dataset.opp;
        m.close();
        const invId = B.newKey();
        await D.set(`invites/${opp}`, { id: invId, from: S.uid, mode, at: B.now() });
        toast(`${nameOf(opp)} 학생에게 대결 신청을 보냈습니다!`, "good");
      };
    });
  }

  function showIncomingInvite(inv) {
    D.remove(`invites/${S.uid}`).catch(() => {});
    if (!S.users[inv.from] || S.active[S.uid] || S.active[inv.from]) return;
    const m = modal(`<h3>대결 신청이 왔어요!</h3>
      <p style="line-height:1.6">${nameTag(inv.from)} 학생이 <b>${inv.mode === "rank" ? "🏆 랭크전 (1:1 선택 매치)" : "🎮 일반전"}</b>을 신청했습니다.</p>
      <div class="foot">
        <button type="button" class="btn ghost" id="inv-no">거절</button>
        <button type="button" class="btn primary" id="inv-yes">수락하고 시작!</button>
      </div>`);
    m.el.querySelector("#inv-no").onclick = () => m.close();
    m.el.querySelector("#inv-yes").onclick = async () => {
      m.close();
      if (S.active[inv.from]) return toast("상대방이 이미 다른 경기를 시작했습니다.", "bad");
      const blackFirst = Math.random() < 0.5;
      const gid = await createPvp(blackFirst ? inv.from : S.uid, blackFirst ? S.uid : inv.from, inv.mode, "select", true);
      openGame(gid, { spectate: false });
    };
  }

  // [추가] AI 랭크전 (플래티넘까지)
  // 이기면 얻는 점수: 브론즈·실버는 초급 15 / 중급 30 / 고급 40, 골드부터는 초급 0 / 중급 17 / 고급 30
  const AI_RANK_WIN_LOW = { easy: 15, normal: 30, hard: 40 }, AI_RANK_WIN_HIGH = { easy: 0, normal: 17, hard: 30 }, AI_RANK_LOSS = 10;
  const aiGoldMin = () => (R.TIERS.find(t => t.id === "gold") || { min: 1000 }).min;
  const aiRankWin = u => ((u && u.score != null ? u.score : R.START_SCORE) < aiGoldMin() ? AI_RANK_WIN_LOW : AI_RANK_WIN_HIGH);
  const aiRankCap = () => (R.TIERS.find(t => t.id === "diamond") || { min: Infinity }).min;
  function aiRankCheck(u) {
    if (!u) return { ok: false, why: e("학생 정보가 없어요.") };
    if ((u.placed || 0) < R.PLACEMENT_GAMES) return { ok: false, why: e("배치고사({0}판)는 친구와의 랭크전으로 먼저 끝내요.", R.PLACEMENT_GAMES) };
    if (u.promo && tierRank(u.promo.to) >= tierRank("diamond")) return { ok: false, why: e("다이아 이상 승급전은 친구와의 랭크전에서만 할 수 있어요.") };
    if ((u.score ?? R.START_SCORE) >= aiRankCap() - 1) return { ok: false, why: e("다이아부터는 친구와의 랭크전에서만 점수를 올릴 수 있어요.") };
    return { ok: true };
  }
  function openAiRankModal() {
    if (S.active[S.uid]) return toast(e("이미 참여 중인 경기가 있어요."), "bad");
    const c = aiRankCheck(S.users[S.uid]);
    if (!c.ok) return toast(c.why, "bad");
    const W = aiRankWin(S.users[S.uid]), low = W === AI_RANK_WIN_LOW;
    const m = modal(`<h3>${e("AI 랭크전")}</h3>
      <p class="muted" style="margin:0 0 10px">${e("플래티넘까지는 AI를 이겨도 승급할 수 있어요. 지면 {0}점이 깎여요.", AI_RANK_LOSS)}<br>${low ? e("브론즈·실버는 AI를 이기면 점수를 더 많이 받아요.") : e("골드부터는 쉬움 AI를 이겨도 점수가 오르지 않아요.")}</p>
      <div class="pick-list">
        <button type="button" class="pick-item" data-lv="easy"><b>🌱 ${e("쉬움")} · ${W.easy ? e("이기면 +{0}점", W.easy) : e("이겨도 점수 없음")}</b><span class="muted">${e("초급 · 가끔 실수해요")}</span></button>
        <button type="button" class="pick-item" data-lv="normal"><b>⚔️ ${e("보통")} · ${e("이기면 +{0}점", W.normal)}</b><span class="muted">${e("중급 · 몇 수 앞을 읽어요")}</span></button>
        <button type="button" class="pick-item" data-lv="hard"><b>🔥 ${e("어려움")} · ${e("이기면 +{0}점", W.hard)}</b><span class="muted">${e("고급 · 깊게 읽는 강한 AI")}</span></button>
      </div>
      <p class="muted" style="font-size:.85em;margin:8px 0 0">${e("다이아 승급전부터는 친구와의 랭크전에서만 할 수 있어요.")}</p>
      <div class="foot"><button type="button" class="btn ghost" data-close>${e("닫기")}</button></div>`);
    m.el.querySelectorAll("[data-lv]").forEach(btn => { btn.onclick = () => { m.close(); startAiGame("rank", btn.dataset.lv); }; });
  }
  function openAiModal() {
    const m = modal(`<h3>AI 난이도 선택</h3>
      <div class="pick-list">
        <button type="button" class="pick-item" data-lv="easy"><b>🌱 쉬움</b><span class="muted">입문 · 가끔 실수해요</span></button>
        <button type="button" class="pick-item" data-lv="normal"><b>⚔️ 보통</b><span class="muted">중급 · 몇 수 앞을 읽어요</span></button>
        <button type="button" class="pick-item" data-lv="hard"><b>🔥 어려움</b><span class="muted">고급 · 깊게 읽는 강한 AI</span></button>
      </div>
      <div class="foot"><button type="button" class="btn ghost" data-close>${e("닫기")}</button></div>`);
    m.el.querySelectorAll("[data-lv]").forEach(btn => {
      btn.onclick = () => { m.close(); startAiGame("normal", btn.dataset.lv); };
    });
  }

  // --- 이벤트 연결 & 부팅 ---
  window.addEventListener("DOMContentLoaded", async () => {
    // 체스 시계 갱신 (두 선수 중 누구 화면에서든 시간 초과 처리)
    timerInterval = setInterval(() => {
      const g = S.curGame;
      if (!g || g.status !== "active" || !(g.tm || g.moveLimit)) return;
      const moves = g.moves || [], turn = moves.length % 2 === 0 ? 1 : 2;
      const el = B.now() - (g.turnAt || g.createdAt);
      // 체스는 한 사람당 전체 시간, 오목은 한 수당 제한 시간
      const leftOf = c => g.tm ? g.tm[c === 1 ? "f" : "s"] - (c === turn ? el : 0) : (c === turn ? g.moveLimit - el : g.moveLimit);
      const full = g.tm ? (g.tm0 || 600000) : g.moveLimit;
      for (const c of [1, 2]) {
        const left = leftOf(c);
        const box = $(c === 1 ? "#pcard-black" : "#pcard-white");
        const t = box && box.querySelector(".clk"), bar = box && box.querySelector(".timer");
        const pct = Math.max(0, Math.min(100, Math.round(left / full * 100)));
        if (t) { t.textContent = fmt(left); t.classList.toggle("low", left < (g.tm ? 30000 : 10000)); }
        if (bar) {
          bar.classList.toggle("warn", pct <= 35 && pct > 15); bar.classList.toggle("crit", pct <= 15);
          const bi = bar.querySelector("i"); if (bi) bi.style.width = pct + "%";
        }
      }
      if (leftOf(turn) <= 0 && myColor(g)) {
        finishGame(g, moves, { winner: turn === 1 ? g.white : g.black, reason: "timeout", moves: moves.length });
      }
    }, 250);

    $("#auth-role-tabs")?.addEventListener("click", ev => {
      const btn = ev.target.closest("[data-role]");
      if (!btn) return;
      $$("#auth-role-tabs button").forEach(b => b.classList.toggle("on", b === btn));
      const role = btn.dataset.role;
      $("#login-form").classList.toggle("hidden", role === "join");
      $("#join-form").classList.toggle("hidden", role !== "join");
      $("#auth-cid-hint").textContent = role === "teacher" ? "(총관리자는 비워두세요)" : "";
      $("#login-id").placeholder = role === "teacher" ? "master (또는 admin)" : "예: kim01";
    });

    $("#demo-fill-master")?.addEventListener("click", () => {
      $("#auth-role-tabs [data-role='teacher']").click();
      $("#login-cid").value = ""; $("#login-id").value = "master"; $("#login-pw").value = "123456";
    });
    $("#demo-fill-stu")?.addEventListener("click", () => {
      $("#auth-role-tabs [data-role='student']").click();
      $("#login-cid").value = "3-2"; $("#login-id").value = "kim01"; $("#login-pw").value = "123456";
    });

    $("#setup-form")?.addEventListener("submit", async ev => {
      ev.preventDefault();
      const f = ev.target;
      const tname = f.tname.value.trim() || e("선생님");
      const pw = f.pw.value.trim();
      const cname = f.cname.value.trim();
      const cid = f.cid.value.trim().toLowerCase();
      const errEl = $("#setup-err");
      errEl.textContent = "";
      if (!CODE_RE.test(cid)) { errEl.textContent = "반 코드는 영문 소문자·숫자·하이픈(-) 2~12자여야 합니다."; return; }
      registering = true;
      try {
        const uid = await signUpOrIn("master", pw);
        const now = B.now();
        await B.update("", {
          "config/master": uid, "config/masterName": tname,
          [`classList/${cid}`]: { name: cname, teacherName: tname, createdAt: now },
          [`classes/${cid}/meta`]: { name: cname, teacherName: tname, createdAt: now },
          [`classes/${cid}/pub`]: { name: cname }
        });
        location.reload();
      } catch (err) { registering = false; errEl.textContent = friendlyErr(err); }
    });

    $("#login-form")?.addEventListener("submit", async ev => {
      ev.preventDefault();
      const f = ev.target;
      const cid = f.cid.value.trim().toLowerCase();
      const id = f.id.value.trim().toLowerCase();
      const pw = f.pw.value;
      const errEl = $("#login-err");
      errEl.textContent = "";
      const key = (id === "master" && !cid) ? "master" : accountKey(cid, id);
      try {
        if (cid) localStorage.setItem("omokClassCode", cid);
        await B.signIn(key, pw);
      } catch (err) { errEl.textContent = "로그인에 실패했습니다. 반 코드, 아이디, 비밀번호를 확인하세요."; }
    });

    $("#join-form")?.addEventListener("submit", async ev => {
      ev.preventDefault();
      const f = ev.target;
      const jcode = f.jcode.value.trim();
      const tname = f.tname.value.trim();
      const cname = f.cname.value.trim();
      const cid = f.cid.value.trim().toLowerCase();
      const pw = f.pw.value;
      const errEl = $("#join-err");
      errEl.textContent = "";
      if (!CODE_RE.test(cid)) { errEl.textContent = "반 코드 형식을 확인하세요."; return; }
      registering = true;
      try {
        if (await B.get(`classes/${cid}/pub`)) throw new Error("이미 사용 중인 반 코드입니다.");
        // [수정] 가입 코드는 로그인한 사람만 읽을 수 있어요 → 계정을 먼저 만들고 확인 (틀리면 방금 만든 계정 삭제)
        const uid = await signUpOrIn(accountKey(cid, "admin"), pw);
        const realCode = await B.get("config/joinCode");
        if (!realCode || realCode !== jcode) {
          await B.deleteSelf().catch(() => {});
          await B.signOut().catch(() => {});
          throw new Error("가입 코드가 올바르지 않습니다.");
        }
        const now = B.now();
        await B.update("", {
          [`members/${uid}`]: { cid, role: "admin" },
          [`classList/${cid}`]: { name: cname, teacherName: tname, createdAt: now },
          [`classes/${cid}/meta`]: { name: cname, teacherName: tname, owner: uid, createdAt: now },
          [`classes/${cid}/pub`]: { name: cname }
        });
        location.reload();
      } catch (err) { registering = false; errEl.textContent = friendlyErr(err); }
    });

    $$(".game-card").forEach(b => b.addEventListener("click", () => setGame(b.dataset.game)));
    $("#stu-switch")?.addEventListener("click", () => show("pick"));
    $("#admin-switch")?.addEventListener("click", () => show("pick"));
    $("#pick-logout")?.addEventListener("click", logout);
    applyGameLook();
    $("#stu-logout")?.addEventListener("click", logout);
    $("#admin-logout")?.addEventListener("click", logout);

    $("#btn-rank-random")?.addEventListener("click", startRandomQueue);
    $("#btn-rank-select")?.addEventListener("click", () => openChallengeModal("rank"));
    $("#btn-norm-ai")?.addEventListener("click", openAiModal);
    $("#btn-rank-ai")?.addEventListener("click", openAiRankModal);
    $("#btn-norm-friend")?.addEventListener("click", () => openChallengeModal("normal"));

    $("#stu-side-tabs")?.addEventListener("click", ev => {
      const btn = ev.target.closest("[data-stab]");
      if (!btn) return;
      $$("#stu-side-tabs button").forEach(b => b.classList.toggle("on", b === btn));
      S.stuSideTab = btn.dataset.stab;
      renderStudent();
    });

    $("#stu-side-body")?.addEventListener("click", ev => {
      const btn = ev.target.closest("[data-replay]");
      if (btn) openGame(btn.dataset.replay, { spectate: true });
    });

    $("#g-leave")?.addEventListener("click", async () => {
      const g = S.curGame;
      if (g && g.kind === "bell" && myColor(g)) { await bellLeave(g); return; }
      if (g && g.kind === "draw" && myColor(g)) { await drawLeave(g); return; }
      if (g && g.status === "waiting" && myColor(g)) {
        if (!await confirmBox("경기를 취소할까요?", "아직 시작하지 않은 배정 경기를 취소하고 나갑니다.", "취소하고 나가기", true)) return;
        await cancelGame(g.id);
      }
      // [수정] 진행 중인 AI 대전에서 나가면 경기가 '진행 중'으로 남아 랜덤 매치·대결 신청이 막히던 문제
      if (g && g.status === "active" && g.matchType === "ai" && myColor(g)) {
        if (!await confirmBox("AI 대전을 그만둘까요?", "진행 중인 AI 대전을 끝내고 나갑니다.", "그만두기", true)) return;
        await cancelGame(g.id);
      }
      leaveGame();
    });
    $("#g-ready-btn")?.addEventListener("click", async () => {
      const g = S.curGame;
      if (!g || g.status !== "waiting" || !myColor(g)) return;
      await D.tx(`games/${g.id}`, cur => {
        if (cur === null) return null;   // 처음엔 서버 값을 모를 수 있어요 → null을 돌려주면 서버 값으로 다시 시도해요
        if (!cur || cur.status !== "waiting") return;
        cur.ready = Object.assign({}, cur.ready, { [S.uid]: true });
        const need = cur.players ? cur.players.filter(u => !String(u).startsWith("ai:")) : [cur.black, cur.white];
        if (need.every(u => cur.ready[u])) { cur.status = "active"; cur.turnAt = B.now(); if (cur.kind === "bell" || cur.kind === "draw") cur.startedAt = B.now(); if (cur.kind === "draw") cur.phaseAt = B.now(); }
        return cur;
      });
    });
    $("#g-num-btn")?.addEventListener("click", () => { S.showNumbers = !S.showNumbers; renderGame(); });
    $("#g-confirm-btn")?.addEventListener("click", () => {
      if (S.ghost == null || !S.curGame) return;
      if (game() === "omok") { const idx = S.ghost; S.ghost = null; commitOmok(idx); return; }
      const gh = S.ghost, f = CR.sq(gh.from), t = CR.sq(gh.to), c = CR.from(S.curGame.moves || []);
      S.selSq = -1; S.ghost = null;
      CR.isPromo(c, f, t) ? askPromo(pr => commitUci(f + t + pr)) : commitUci(f + t);
    });
    $("#emo-bar")?.addEventListener("click", ev => { const b = ev.target.closest("[data-emo]"); if (b) sendEmoji(b.dataset.emo); });
    $("#g-void-btn")?.addEventListener("click", async () => {
      const g = S.curGame;
      if (!g || !S.isMaster) return;
      if (!await confirmBox(e("경기 무효"), e("{0} 대 {1} 경기를 지금 끝내고 무효로 처리할까요?<br>두 학생 모두 <b>점수·배치고사·승급전·하루 판수에 반영되지 않아요.</b>", esc(nameOf(g.black, { level: g.aiLevel })), esc(nameOf(g.white, { level: g.aiLevel }))), e("무효 처리"), true)) return;
      await voidGame(g);
    });
    $("#g-resign-btn")?.addEventListener("click", async () => {
      const g = S.curGame;
      if (!g || g.status !== "active") return;
      if (g.kind === "bell") { await bellResign(g); return; }
      if (!await confirmBox("기권할까요?", "기권하면 상대방의 승리로 경기가 종료됩니다.", "기권하기", true)) return;
      const winner = g.black === S.uid ? g.white : g.black;
      await finishGame(g, g.moves || [], { winner, reason: "resign", moves: (g.moves || []).length });
    });

    if (window.OMOK_NEEDS_CONNECT) { show("connect"); return; }

    await B.init();
    B.onAuth(async uid => {
      if (registering) return;   // [수정] 계정을 만드는 도중에 '모르는 계정'으로 보고 로그아웃시키던 문제
      clearClassListeners();
      S.uid = uid; S.isSuper = false; S.isMaster = false; lastKnownTier = null; lastPromoKey = undefined; pickedThisLogin = false;

      if (!uid) {
        const masterUid = await B.get("config/master").catch(() => null);
        if (!masterUid && B.mode !== "demo") show("setup"); else show("auth");
        return;
      }

      const masterUid = await B.get("config/master").catch(() => null);
      if (masterUid === uid) {
        S.isSuper = true; S.isMaster = true; S.loginKey = "master";
        S.masterName = (await B.get("config/masterName")) || e("선생님");
        B.on("classList", v => {
          S.classList = v || {};
          if (!S.cid && Object.keys(S.classList).length === 1) enterClass(Object.keys(S.classList)[0]);
          render();
        });
        window.Admin && window.Admin.boot();
        goHome();
        return;
      }

      const mem = await B.get(`members/${uid}`).catch(() => null);
      if (mem && mem.role === "admin" && mem.cid) {
        S.isMaster = true;
        S.loginKey = accountKey(mem.cid, "admin");
        await enterClass(mem.cid);
        window.Admin && window.Admin.boot();
        goHome();
        return;
      }
      if (mem && mem.cid) { await enterClass(mem.cid); goHome(); return; }

      await B.signOut();
      show("auth");
    });
  });

  window.App = {
    game, setGame,
    S, B, D, R, $, $$, esc,
    CODE_RE, accountKey, AI_NAMES, MATCH_NAMES, REASON_NAMES, STATUS_KO, GAME_KO, statusText,
    settings, emblem, tierOfUid, nameOf, nameTag, scoreText, status, statusDot, fmtTime,
    toast, modal, confirmBox, show, render, enterClass, rankingOrder,
    createPvp, cancelGame, finalize, openGame, createBellGame, createMultiGame
  };
})();
