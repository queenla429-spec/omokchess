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
    five: e("오목 완성"), foul: e("금수 반칙"), full: e("판이 가득 참")
  };
  const STATUS_KO = { game: e("경기 중"), queue: e("매칭 중"), idle: e("접속 중"), off: e("오프라인") };

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
  //  체스는 기존 위치 그대로, 오목은 classes/반/x/omok/ 아래에 따로 저장해요.
  let GAME = (() => { try { const g = localStorage.getItem("arenaGame"); return g === "omok" || g === "chess" ? g : null; } catch { return null; } })();
  const game = () => GAME || "chess";
  const PER_GAME = new Set(["games", "live", "active", "queue", "invites", "userGames", "log", "seasons", "settings"]);
  const RF = new Set(["score", "placed", "wins", "losses", "draws", "rankGames", "day", "week", "recentOpp", "scoreAt", "placedAt", "promo", "nWins", "nLosses"]);
  const OP = "x/omok/";
  function mapOne(p) {
    if (game() !== "omok") return p;
    const a = String(p).split("/");
    if (PER_GAME.has(a[0])) return OP + p;
    if (a[0] === "users" && a[1] && a[2] && RF.has(a[2])) return `${OP}rating/${a[1]}/${a.slice(2).join("/")}`;
    return p;
  }
  function expand(p, v, out) {
    const a = String(p).split("/").filter(Boolean);
    if (a[0] === "users" && a.length === 2) {
      if (v == null) { out[p] = null; out[`${OP}rating/${a[1]}`] = null; return; }   // 학생 삭제 → 두 게임 기록 모두 정리
      if (game() !== "omok") { out[p] = v; return; }
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
      if (game() === "omok") {
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
      let base = null, rating = null, gotB = false, gotR = game() !== "omok";
      const emit = () => { if (gotB && gotR) cb(mergeUsers(base, rating)); };
      const u1 = B.on(`classes/${S.cid}/users`, v => { base = v; gotB = true; emit(); });
      const u2 = game() === "omok" ? B.on(`classes/${S.cid}/${OP}rating`, v => { rating = v; gotR = true; emit(); }) : () => {};
      return () => { u1(); u2(); };
    },
    tx: (p, fn) => {
      const a = String(p).split("/");
      const path = (game() === "omok" && a[0] === "users" && a.length === 2) ? `${OP}rating/${a[1]}` : mapOne(p);
      return B.tx(`classes/${S.cid}/${path}`, fn);
    }
  };

  // ===== [추가] 게임 고르기 =====
  Object.defineProperty(window, "BoardView", { configurable: true, get: () => game() === "omok" ? window.OmokBoardView : window.ChessBoardView });
  const GAME_TITLE = { omok: e("오목 아레나"), chess: e("체스 아레나") };
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
    if (kind !== "omok" && kind !== "chess") return;
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
      const om = $('.gc-canvas[data-art="omok"]'), ch = $('.gc-canvas[data-art="chess"]');
      if (om) new window.OmokBoardView(om, { mini: true }).set({ moves: [112, 113, 97, 127, 82, 98, 128, 67, 126] });
      if (ch) new window.ChessBoardView(ch, { mini: true }).set({ moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"] });
    }
    $$(".game-card").forEach(b => b.classList.toggle("on", b.dataset.game === GAME));
    $("#pick-logout").classList.toggle("hidden", !S.uid);
    if (!S.isMaster && S.uid && S.cid) {
      const show1 = (kind, u) => {
        const el = $(`.gc-tier[data-tier="${kind}"]`); if (!el) return;
        if (!u || u.score == null) { el.textContent = e("아직 경기 없음 · 배치고사 0/{0}", R.PLACEMENT_GAMES); return; }
        el.textContent = (u.placed || 0) < R.PLACEMENT_GAMES ? e("배치고사 {0}/{1}", u.placed || 0, R.PLACEMENT_GAMES) : e("{0} · {1}점", R.tierOf(u.score).name, u.score);
      };
      B.get(`classes/${S.cid}/users/${S.uid}`).then(u => show1("chess", u)).catch(() => {});
      B.get(`classes/${S.cid}/${OP}rating/${S.uid}`).then(u => show1("omok", u)).catch(() => {});
    } else $$(".gc-tier").forEach(el => { el.textContent = S.isMaster ? e("선생님 화면도 게임별로 따로 관리돼요") : ""; });
  }

  function emblem(tierId) {
    return window.TierEmblem ? window.TierEmblem.svg(tierId) : `<svg class="emb" viewBox="0 0 48 48" aria-hidden="true"></svg>`;
  }

  function tierOfUid(uid) {
    if (!uid || String(uid).startsWith("ai:")) return { id: "ai", name: "AI" };
    return R.displayTier(S.users[uid], uid, S.champion);
  }

  function nameOf(uid, extra = {}) {
    if (!uid) return "-";
    if (uid === "ai" || String(uid).startsWith("ai:")) return `AI (${AI_NAMES[extra.level || "normal"] || ""})`;
    return (S.users[uid] && S.users[uid].name) || e("알 수 없음");
  }

  function nameTag(uid, size = "", extra = {}) {
    if (!uid) return "";
    if (uid === "ai" || String(uid).startsWith("ai:")) {
      return `<span class="ntag t-ai ${size}">${emblem("ai")}<span class="nm">${esc(nameOf(uid, extra))}</span></span>`;
    }
    const t = tierOfUid(uid);
    return `<span class="ntag t-${t.id} ${size}">${emblem(t.id)}<span class="nm">${esc(nameOf(uid))}</span></span>`;
  }

  function scoreText(uid) {
    const u = S.users[uid];
    if (!u) return "";
    return (u.placed || 0) < R.PLACEMENT_GAMES ? e("배치고사 {0}/{1}", u.placed || 0, R.PLACEMENT_GAMES) : e("{0}점", u.score);
  }

  function status(uid) {
    if (S.active && S.active[uid]) return "game";
    if (S.queue && S.queue[uid]) return "queue";
    if (B.mode === "demo" && S.uid === uid) return "idle";
    const p = S.presence && S.presence[uid];
    if (p && (B.now() - (p.at || 0) < 120000)) return "idle";
    return "off";
  }

  function statusDot(uid) {
    const st = status(uid);
    const cls = st === "game" ? "game" : st === "queue" ? "queue" : st === "idle" ? "on" : "";
    return `<span class="dot ${cls}"></span>`;
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
    render();
  }

  function clearClassListeners() {
    classUnsubs.forEach(fn => fn());
    classUnsubs = [];
    if (inviteUnsub) { inviteUnsub(); inviteUnsub = null; }
    if (userGamesUnsub) { userGamesUnsub(); userGamesUnsub = null; }
    S.users = {}; S.active = {}; S.presence = {}; S.queue = {}; S.seasons = {}; S.settingsRaw = {}; S.champion = null;
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
      S.champion = R.championOf(S.users);
      if (!S.isMaster && S.uid && S.users[S.uid]) {
        const curTier = R.tierOf(S.users[S.uid].score).id;
        if (lastKnownTier && (S.users[S.uid].placed || 0) >= R.PLACEMENT_GAMES && R.tierIndex(S.users[S.uid].score) > R.TIERS.findIndex(t => t.id === lastKnownTier)) {
          window.TierUp && window.TierUp.show(lastKnownTier, curTier);
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

    if (!S.isMaster && S.uid) {
      B.setupPresence(`classes/${cid}/presence/${S.uid}`, () => ({ at: B.now() }));
      B.set(`classes/${cid}/presence/${S.uid}`, { at: B.now() }).catch(() => {});
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
    const gid = B.newKey();
    const now = B.now();
    const uB = S.users[blackUid] || {};
    const uW = S.users[whiteUid] || {};
    const st = settings();
    const isOmok = game() === "omok";
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
    const gm = { id: gid, mode: "normal", matchType: "ai", aiLevel: level, black, white, moves: [], status: "active", createdAt: now, turnAt: now, kind: game() };
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
      boardView = new window.BoardView(fresh, { interactive: true, labels: true, onTap: onBoardTap });
      boardKind = game();
    }

    gameUnsub = D.on(`games/${gid}`, g => {
      S.curGame = g;
      if (!g) return;
      renderGame();
      maybeTriggerAiMove(g);
    });
  }

  function myColor(g) {
    if (!g || S.spectate) return 0;
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

  function maybeTriggerAiMove(g) {
    if (!g || g.status !== "active" || g.matchType !== "ai" || S.spectate) return;
    const moves = g.moves || [];
    const turnUid = moves.length % 2 === 0 ? g.black : g.white;
    if (!String(turnUid).startsWith("ai:")) return;
    if (aiTimeout) return;
    aiTimeout = setTimeout(async () => {
      aiTimeout = null;
      const cur = S.curGame;
      if (!cur || cur.id !== g.id || cur.status !== "active") return;
      if ((cur.moves || []).length !== moves.length) return;
      if (game() === "omok") {
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
  function applyPromo(prev, next, d, won, draw, now) {
    if (!promoOn() || !d || !d.counted || d.placement || (prev.placed || 0) < R.PLACEMENT_GAMES) {
      if (next.promo && !promoOn()) delete next.promo;
      return null;
    }
    const prevScore = prev.score ?? R.START_SCORE;
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
    if (ni > ci && R.TIERS[ci + 1]) {
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
        const pr = applyPromo(S.users[uid], nextUser, deltas[uid], won, draw, now);   // [추가] 승급전
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
      const idx = R.tierIndex(me.score);
      const curTier = R.TIERS[idx];
      const nextTier = R.TIERS[idx + 1];
      if (nextTier && disp.id !== "champion") {   // [수정] 챔피언에게 "다이아까지 ○점"이 뜨던 문구 정리
        const base = curTier.min === -Infinity ? Math.min(me.score, nextTier.min - 100) : curTier.min;
        pct = Math.max(4, Math.min(100, Math.round(((me.score - base) / (nextTier.min - base)) * 100)));
        subText = e("{0}까지 {1}점", nextTier.name, Math.max(0, nextTier.min - me.score));
      } else {
        subText = disp.id === "champion" ? "현재 우리 반 1위 챔피언!" : "최고 티어 달성!";
      }
    }

    $("#stu-profile").innerHTML = `
      <div class="profile-top">
        <div class="big-emb">${emblem(disp.id)}</div>
        <div>
          <div class="muted" style="font-size:.82em;font-weight:700">${e("현재 티어")}</div>
          <div class="tier-name tier-color-${disp.id}">${esc(disp.name)}</div>
          <div class="score-num">${placing ? e("배치고사 {0}/{1}", me.placed || 0, R.PLACEMENT_GAMES) : e("{0}점", me.score)}</div>
        </div>
      </div>
      <div class="progress${me.promo ? " promo" : ""}"><i style="width:${pct}%"></i></div>
      ${me.promo && !placing ? `<div class="promo-box"><b class="tier-color-${esc(me.promo.to)}">🔥 ${esc((R.TIERS.find(t => t.id === me.promo.to) || {}).name || "")} ${e("승급전")}</b>${promoDots(me.promo)}</div>` : ""}
      <div class="muted" style="font-size:.84em">${esc(subText)}</div>
      <div class="stats">
        <div><b>${me.wins || 0}승 ${me.losses || 0}패</b><span>랭크 전적</span></div>
        <div><b>${me.nWins || 0}승 ${me.nLosses || 0}패</b><span>일반 전적</span></div>
        <div><b>${(me.wins || 0) + (me.losses || 0) ? Math.round(((me.wins || 0) / ((me.wins || 0) + (me.losses || 0))) * 100) + "%" : "-"}</b><span>랭크 승률</span></div>
      </div>`;

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
          const dStr = r.mode === "rank" ? (r.counted ? `${r.note ? `<span class="muted" style="font-size:.8em">${esc(r.note)}</span> ` : ""}<span class="delta ${r.delta > 0 ? "up" : r.delta < 0 ? "down" : ""}">${r.delta > 0 ? "+" : ""}${r.delta}</span>` : `<span class="muted">${esc(r.note || "연습")}</span>`) : `<span class="muted">일반</span>`;
          return `<li><span class="res ${cls}">${lbl}</span>${nameTag(r.opp, "", { level: String(r.opp).split(":")[1] })}<span class="sp"></span>${dStr}<button type="button" class="btn xs ghost" data-replay="${esc(r.gid)}">기보</button></li>`;
        }).join("")}
      </ul>` : `<p class="empty">아직 완료한 경기가 없습니다.</p>`;
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

  function renderGame() {
    const g = S.curGame;
    if (!g) return;
    const moves = g.moves || [];
    const turnColor = moves.length % 2 === 0 ? 1 : 2;
    const mc = myColor(g);
    const st = settings();
    const isOmok = game() === "omok";
    const c = isOmok ? null : CR.from(moves);
    $("#g-num-btn").textContent = isOmok ? e("번호") : e("기보");

    const modeTxt = g.mode === "rank" ? e("🏆 랭크전") : e("🎮 일반전");
    const typeTxt = g.matchType === "ai" ? `AI ${AI_NAMES[g.aiLevel] || ""}` : (MATCH_NAMES[g.matchType] || "");
    $("#g-title").textContent = `${modeTxt} · ${typeTxt}`;
    $("#g-spec-tag").classList.toggle("hidden", !S.spectate);
    $("#g-num-btn").classList.toggle("on", S.showNumbers);
    $("#g-resign-btn").classList.toggle("hidden", S.spectate || g.status !== "active" || !mc);

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
          <span class="stone ${(color === 1) === isOmok ? "b" : "w"}"></span>
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
      if (mc === turnColor) {
        statusEl.textContent = S.ghost != null ? (isOmok ? "같은 자리를 한 번 더 누르거나 아래 [착수]를 누르세요!" : "도착 칸을 한 번 더 누르거나 아래 [착수]를 누르세요!") : `내 차례입니다 (${moves.length + 1}수)${chk}`;
      } else {
        statusEl.textContent = `${nameOf(turnUid, { level: g.aiLevel })} 차례입니다 (${moves.length + 1}수)${chk}`;
      }
    } else if (g.status === "finished") {
      const res = g.result || {};
      statusEl.textContent = res.winner ? `${nameOf(res.winner, { level: g.aiLevel })} 승리! (${REASON_NAMES[res.reason] || ""})` : `무승부로 종료되었습니다. (${REASON_NAMES[res.reason] || ""})`;
    } else {
      statusEl.textContent = "취소된 경기입니다.";
    }

    const hints = st.showHints !== false;
    if (isOmok) {
      const showF = g.status === "active" && turnColor === 1 && mc === 1 && forbidShown(g);
      boardView && boardView.set({ moves, forbidden: showF ? window.Renju.forbiddenPoints(window.Renju.boardFromMoves(moves)) : [],
        ghost: g.status === "active" && S.ghost != null ? S.ghost : -1, ghostColor: turnColor, numbers: S.showNumbers });
    } else {
      const tg = (hints && S.selSq >= 0 && g.status === "active") ? CR.targets(c, CR.sq(S.selSq)).map(CR.idx) : [];
      boardView && boardView.set({ moves, flip: mc === 2, sel: (S.selSq >= 0 && g.status === "active") ? S.selSq : null, targets: tg, ghost: g.status === "active" ? S.ghost : null });
    }

    $("#g-confirm-btn").classList.toggle("hidden", !(g.status === "active" && mc === turnColor && st.confirmMove && S.ghost != null));
    const rb = $("#g-ready-btn");
    if (rb) rb.classList.toggle("hidden", !(g.status === "waiting" && mc && !(g.ready && g.ready[S.uid])));

    const mvBox = $("#g-moves");
    if (mvBox) {
      mvBox.classList.toggle("hidden", isOmok || !S.showNumbers);
      if (!isOmok && S.showNumbers) {
        const hs = c.history();
        mvBox.innerHTML = hs.length ? hs.map((m, i) => `${i % 2 === 0 ? `<span class="mn">${i / 2 + 1}.</span>` : ""}<span class="${i === hs.length - 1 ? "last" : ""}">${esc(m)}</span>`).join(" ") : "아직 둔 수가 없어요.";
        mvBox.scrollTop = mvBox.scrollHeight;
      }
    }

    const ov = $("#board-overlay");
    if (g.status === "finished" && !ov.dataset.dismissed) {
      const res = g.result || {};
      const iWon = mc && res.winner === S.uid;
      const iLost = mc && res.winner && res.winner !== S.uid;
      ov.classList.remove("hidden", "loss");
      if (iLost) ov.classList.add("loss");
      const title = !mc ? (res.winner ? `${nameOf(res.winner, { level: g.aiLevel })} 승리` : "무승부") : (iWon ? e("승리!") : iLost ? e("패배") : e("무승부"));
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
    $("#pick-logout")?.addEventListener("click", () => { clearClassListeners(); B.signOut(); });
    applyGameLook();
    $("#stu-logout")?.addEventListener("click", () => { clearClassListeners(); B.signOut(); });
    $("#admin-logout")?.addEventListener("click", () => { clearClassListeners(); B.signOut(); });

    $("#btn-rank-random")?.addEventListener("click", startRandomQueue);
    $("#btn-rank-select")?.addEventListener("click", () => openChallengeModal("rank"));
    $("#btn-norm-ai")?.addEventListener("click", openAiModal);
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
        if (!cur || cur.status !== "waiting") return;
        cur.ready = Object.assign({}, cur.ready, { [S.uid]: true });
        if (cur.ready[cur.black] && cur.ready[cur.white]) { cur.status = "active"; cur.turnAt = B.now(); }
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
    $("#g-resign-btn")?.addEventListener("click", async () => {
      const g = S.curGame;
      if (!g || g.status !== "active") return;
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
    CODE_RE, accountKey, AI_NAMES, MATCH_NAMES, REASON_NAMES, STATUS_KO,
    settings, emblem, tierOfUid, nameOf, nameTag, scoreText, status, statusDot, fmtTime,
    toast, modal, confirmBox, show, render, enterClass, rankingOrder,
    createPvp, cancelGame, finalize, openGame
  };
})();
