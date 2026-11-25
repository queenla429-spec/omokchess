/*! © 2026 삼대710. 교실 내 비영리 사용 외 복제·수정·상업적 이용 금지 */
/* 체스 배우기 가이드 (AI 대전 전용): 말 설명, 위험한 말, 안전/위험 칸, 추천 수, AI 수 해설 */
(function () {
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  const NAME = { p: "폰", n: "나이트", b: "비숍", r: "룩", q: "퀸", k: "킹" };
  const ICON = { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" };
  const HOW = {
    p: "앞으로 한 칸 가요. 처음 움직일 때만 두 칸까지 갈 수 있어요. 상대 말을 잡을 때는 <b>대각선 앞 한 칸</b>으로 잡아요. 끝 줄에 닿으면 퀸 같은 말로 바뀌어요(승급).",
    n: "<b>L자</b>로 움직여요 (한 방향으로 두 칸 + 옆으로 한 칸). 다른 말을 <b>뛰어넘을 수 있는</b> 유일한 말이에요.",
    b: "<b>대각선</b>으로 원하는 만큼 가요. 다른 말을 넘을 수는 없어요. 처음 서 있던 칸 색깔만 계속 다녀요.",
    r: "<b>가로·세로</b>로 원하는 만큼 가요. 킹과 함께 '캐슬링'이라는 특별한 수를 할 수 있어요.",
    q: "<b>가로·세로·대각선</b> 모두 원하는 만큼 가요. 가장 강한 말이니 쉽게 잡히지 않게 조심!",
    k: "<b>모든 방향으로 한 칸</b>만 가요. 공격받는 칸으로는 갈 수 없어요. 킹이 피할 곳 없이 공격받으면(체크메이트) 져요."
  };
  const josa = (w, a, b) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return w + (c >= 0 && c % 28 ? a : b); };   // 받침에 따라 을/를
  const nm = t => NAME[t] || "";
  const ro = sq => ("36".includes(sq[1]) ? "으로" : "로");   // e3으로 / e4로

  function clone(c) { const o = new Chess(); o.load(c.fen()); return o; }
  // 상대 차례로 바꾼 판 (내 말이 지금 어떤 공격을 받는지 보려고)
  function flipTurn(c) {
    const f = c.fen().split(" "); f[1] = f[1] === "w" ? "b" : "w"; f[3] = "-";
    const o = new Chess(); return o.load(f.join(" ")) ? o : null;
  }
  // board(상대 차례)에서 sq에 있는 말이 손해 보며 잡히는지
  function losing(board, sq, pieceType) {
    const caps = board.moves({ verbose: true }).filter(m => m.to === sq && m.captured && m.captured !== "k");
    if (!caps.length) return false;
    const minAtt = Math.min(...caps.map(m => VAL[m.piece]));
    if (minAtt < VAL[pieceType]) return true;          // 더 싼 말에게 잡힘
    const m = caps.find(x => VAL[x.piece] === minAtt);
    board.move(m);
    const back = board.moves({ verbose: true }).some(x => x.to === sq);   // 내가 다시 잡을 수 있나?
    board.undo();
    return !back;
  }
  // 지금 잡힐 위험이 있는 내 말들 (칸 이름 목록)
  function dangers(c, me) {
    const o = flipTurn(c); if (!o) return [];
    const out = [];
    c.board().forEach((row, y) => row.forEach((p, x) => {
      if (!p || p.color !== me || p.type === "k") return;
      const sq = "abcdefgh"[x] + (8 - y);              // 이 chess.js 버전은 칸 이름을 주지 않아서 직접 계산
      if (losing(o, sq, p.type)) out.push(sq);
    }));
    return out;
  }
  // 고른 말이 갈 수 있는 칸 중 위험한 칸
  function riskyTargets(c, from) {
    const p = c.get(from); if (!p) return [];
    const out = [];
    for (const m of c.moves({ square: from, verbose: true })) {
      const t = clone(c); t.move(m);
      if (t.in_checkmate()) continue;
      if (losing(t, m.to, m.promotion || p.type)) out.push(m.to);
    }
    return out;
  }

  // 칸 이름(g1 같은)을 쓰지 않고, 학생 쪽에서 본 위치로 말해요
  function where(sq, me) {
    const f = "abcdefgh".indexOf(sq[0]), r = +sq[1];
    const col = me === "w" ? f + 1 : 8 - f, row = me === "w" ? r : 9 - r;
    return `<b class="sqw">왼쪽에서 ${col}번째 · 아래에서 ${row}번째</b> 칸`;
  }
  const short = {
    p: "폰은 앞으로 한 칸! 처음엔 두 칸도 돼요. 잡을 때만 대각선으로 잡아요.",
    n: "나이트는 L자로 뛰어요! 다른 말을 뛰어넘을 수 있어요.",
    b: "비숍은 대각선으로 쭉쭉 가요!",
    r: "룩은 가로·세로로 쭉쭉 가요!",
    q: "퀸은 가로·세로·대각선 다 돼요! 제일 소중한 말이에요.",
    k: "킹은 모든 방향으로 딱 한 칸! 킹이 잡히면 지니까 조심조심."
  };

  // 상대(AI)가 방금 둔 수 해설
  function explainLast(c, me) {
    const h = c.history({ verbose: true }); const m = h[h.length - 1];
    if (!m || m.color === me) return "";
    let t = `AI가 <b>${nm(m.piece)}</b>${josa(nm(m.piece), "을", "를").slice(-1)} ${where(m.to, me)}으로 옮겼어요. (노랗게 표시된 칸)`;
    if (m.flags.includes("k") || m.flags.includes("q")) t = `AI가 <b>캐슬링</b>을 했어요! 킹을 두 칸 옮기고 룩이 킹 옆으로 넘어오는 특별한 수예요.`;
    if (m.captured) t += ` 내 <b>${nm(m.captured)}</b>${josa(nm(m.captured), "을", "를").slice(-1)} 잡았어요 😢`;
    if (m.flags.includes("e")) t += ` (이건 '앙파상'이라는 특별한 폰 잡기예요.)`;
    if (m.promotion) t += ` 폰이 끝 줄에 닿아서 <b>${nm(m.promotion)}</b>${m.promotion === "n" ? "로" : "으로"} 변신했어요!`;
    if (m.san.includes("+")) t += ` <b class="g-red">체크!</b>`;
    return t;
  }

  function principle(c, me, n) {
    const castled = c.history({ verbose: true }).some(m => m.color === me && (m.flags.includes("k") || m.flags.includes("q")));
    if (n < 4) return "🎯 <b>시작 요령:</b> 가운데 폰(왼쪽에서 4번째, 5번째)을 두 칸 앞으로 내서 판 가운데를 차지해요.";
    if (n < 12) return "🐴 <b>말 꺼내기:</b> 맨 아랫줄의 나이트와 비숍을 앞으로 꺼내요. 같은 말만 움직이지 말고 여러 말을 골고루!";
    if (!castled && n < 24) return "🏰 <b>킹 지키기:</b> 킹과 룩 사이가 비면 킹을 눌러 두 칸 옆으로 <b>캐슬링</b>해서 킹을 구석에 숨겨요.";
    return "⚖️ <b>말의 가치:</b> 폰 1 · 나이트 3 · 비숍 3 · 룩 5 · 퀸 9. 싼 말로 비싼 말을 잡으면 이득이에요!";
  }

  // 추천 수의 이유
  function reason(c, uci, me) {
    const m = clone(c).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
    if (!m) return "";
    let why;
    if (m.san.includes("#")) why = "체크메이트! 이 수로 이길 수 있어요 🏆";
    else if (m.flags.includes("k") || m.flags.includes("q")) why = "캐슬링으로 킹을 안전하게 지켜요.";
    else if (m.promotion) why = "폰을 끝 줄로 보내서 퀸으로 변신시켜요!";
    else if (m.captured) why = `상대 <b>${nm(m.captured)}</b>${josa(nm(m.captured), "을", "를").slice(-1)} 잡을 수 있어요.`;
    else if (dangers(c, me).includes(m.from)) why = "잡힐 위험이 있는 말을 안전한 곳으로 피해요.";
    else if (m.san.includes("+")) why = "상대 킹을 공격해서(체크) 상대가 꼭 막아야 해요.";
    else if ((m.piece === "n" || m.piece === "b") && (m.from[1] === "1" || m.from[1] === "8")) why = "아랫줄에 있던 말을 꺼내서 더 많은 칸을 노릴 수 있어요.";
    else if (m.piece === "p" && "de".includes(m.to[0])) why = "가운데를 차지해서 내 말들이 움직일 길을 열어요.";
    else why = "지금 가장 좋은 자리로 보내는 수예요.";
    return `💡 ${where(m.from, me)}에 있는 <b>${nm(m.piece)}</b>${josa(nm(m.piece), "을", "를").slice(-1)} ${where(m.to, me)}으로 옮겨 보세요! <span class="g-arrow">초록 화살표</span>를 따라가면 돼요.<br>${why}`;
  }

  // 지금 상황 안내: bubble = 캐릭터 말풍선, html = 아래 자세한 설명
  function tips(c, me, selSq) {
    const out = [], say = [];
    let mood = "happy";
    const n = c.history().length;
    const myTurn = c.turn() === me;
    const lastM = c.history({ verbose: true }).slice(-1)[0];
    const last = explainLast(c, me);
    if (last) { say.push(last); if (lastM && lastM.captured) mood = "sad"; }
    if (!myTurn) { say.push("음… AI가 생각하고 있어요 🤔"); return { bubble: say.join("<br>"), mood: "think", html: `<p class="g-tip">${principle(c, me, n)}</p>`, danger: [] }; }
    const dg = dangers(c, me);
    if (c.in_check()) {
      mood = "worry";
      say.push(`<b class="g-red">체크!</b> 내 킹이 공격받고 있어요! 킹을 피하거나, 사이를 막거나, 공격한 말을 잡아요.`);
      out.push(`<p class="g-warn">⚠️ <b>체크 막는 3가지 방법</b><br>① 킹을 안전한 칸으로 옮기기 ② 사이에 내 말을 놓아 막기 ③ 공격한 말 잡기<br>지금 둘 수 있는 수는 <b>${c.moves().length}개</b>예요.</p>`);
    }
    const p = selSq ? c.get(selSq) : null;
    if (p) {
      const ms = c.moves({ square: selSq, verbose: true });
      if (!c.in_check()) say.push(ms.length ? `${short[p.type]} <span class="g-dot ok"></span>초록 점은 안전, <span class="g-dot bad"></span>주황 점은 잡힐 수 있는 칸이에요.` : `이 ${nm(p.type)}${p.type === "p" || p.type === "k" ? "은" : "는"} 지금 움직일 수 없어요. 다른 말을 골라 볼까요?`);
      let s = `<p class="g-piece"><span class="g-ico">${ICON[p.type]}</span><b>${nm(p.type)}</b> (가치 ${p.type === "k" ? "∞" : VAL[p.type]}) — ${HOW[p.type]}</p>`;
      s += ms.length ? `<p>지금 갈 수 있는 칸: <b>${ms.length}곳</b>` : `<p>지금은 움직일 수 없어요. (다른 말에 막혔거나, 움직이면 킹이 위험해져요)`;
      if (ms.some(m => m.flags.includes("k") || m.flags.includes("q"))) s += `<br>🏰 킹 옆으로 두 칸 떨어진 점을 누르면 <b>캐슬링</b>! 킹이 숨고 룩이 나와요.`;
      if (ms.some(m => m.flags.includes("e"))) s += `<br>✨ <b>앙파상</b>을 할 수 있어요: 방금 두 칸 온 상대 폰을 대각선으로 지나가며 잡아요.`;
      if (ms.some(m => m.promotion)) s += `<br>👑 끝 줄에 닿으면 <b>변신(승급)</b>! 보통 퀸을 골라요.`;
      s += "</p>";
      if (dg.includes(selSq)) { s += `<p class="g-warn">⚠️ 이 말은 지금 잡힐 위험이 있어요! 안전한 칸으로 옮기거나 다른 말로 지켜 주세요.</p>`; mood = "worry"; }
      out.push(s);
    } else {
      if (dg.length) {
        if (!c.in_check()) { say.push(`앗, <b class="g-red">빨간 동그라미</b> 말이 잡힐 수 있어요! 도망가거나 지켜 줘요.`); mood = "worry"; }
        out.push(`<p class="g-warn">⚠️ 잡힐 위험이 있는 말: ${dg.map(q => `<b>${nm(c.get(q).type)}</b>(${where(q, me)})`).join(", ")}</p>`);
      } else if (!c.in_check()) say.push("움직일 내 말을 눌러 보세요! 어떻게 움직이는지 알려 줄게요 👆");
    }
    out.push(`<p class="g-tip">${principle(c, me, n)}</p>`);
    return { bubble: say.join("<br>"), mood, html: out.join(""), danger: dg };
  }

  // 귀여운 안내 캐릭터 '폰폰 선생님' (직접 그린 SVG)
  function buddySvg(mood) {
    const eyes = mood === "think" ? `<path d="M40 52q5-4 10 0M62 52q5-4 10 0" class="bd-ln"/>`
      : mood === "sad" ? `<circle cx="45" cy="54" r="4.5" class="bd-eye"/><circle cx="67" cy="54" r="4.5" class="bd-eye"/><path d="M38 45l10 3M74 45l-10 3" class="bd-ln"/>`
      : mood === "worry" ? `<circle cx="45" cy="53" r="5.5" class="bd-eye"/><circle cx="67" cy="53" r="5.5" class="bd-eye"/><circle cx="46.5" cy="51" r="1.8" fill="#fff"/><circle cx="68.5" cy="51" r="1.8" fill="#fff"/>`
      : `<circle cx="45" cy="53" r="5" class="bd-eye"/><circle cx="67" cy="53" r="5" class="bd-eye"/><circle cx="46.5" cy="51" r="1.7" fill="#fff"/><circle cx="68.5" cy="51" r="1.7" fill="#fff"/>`;
    const mouth = mood === "sad" ? `<path d="M50 68q6-5 12 0" class="bd-ln"/>`
      : mood === "worry" ? `<ellipse cx="56" cy="67" rx="4" ry="5" fill="#6b2f25"/>`
      : mood === "think" ? `<path d="M51 66h10" class="bd-ln"/>`
      : `<path d="M49 64q7 8 14 0" class="bd-ln" fill="#e86a5a"/>`;
    return `<svg viewBox="0 0 112 132" class="bd-svg" aria-hidden="true">
      <ellipse cx="56" cy="124" rx="34" ry="6" fill="#00000022"/>
      <path d="M26 118q0-14 14-18l-4-20h40l-4 20q14 4 14 18z" class="bd-body"/>
      <rect x="20" y="112" width="72" height="10" rx="5" class="bd-base"/>
      <path d="M38 84h36" stroke="#3f6b46" stroke-width="7" stroke-linecap="round"/>
      <circle cx="56" cy="56" r="28" class="bd-body"/>
      <path d="M56 28q-2-12 8-16q2 10-8 16z" fill="#6fae5e"/><path d="M56 28q-4-9-13-9q2 9 13 9z" fill="#88c477"/>
      ${eyes}
      <ellipse cx="37" cy="63" rx="5" ry="3.2" fill="#f4a3a0" opacity=".8"/><ellipse cx="75" cy="63" rx="5" ry="3.2" fill="#f4a3a0" opacity=".8"/>
      ${mouth}
    </svg>`;
  }

  const RULES = `
    <details class="g-rules"><summary>📖 체스 기본 규칙 한눈에 보기</summary>
      <p><b>목표:</b> 상대 킹이 공격받고(체크) 피할 방법이 없게 만들면(<b>체크메이트</b>) 이겨요.</p>
      <ul>${Object.keys(HOW).map(k => `<li><span class="g-ico">${ICON[k]}</span><b>${NAME[k]}</b>${k === "k" ? "" : ` (가치 ${VAL[k]})`}: ${HOW[k]}</li>`).join("")}</ul>
      <p><b>체크:</b> 킹이 공격받는 상태. 다음 수에 반드시 피하거나 막아야 해요.<br>
      <b>스테일메이트:</b> 내 차례인데 체크는 아니면서 둘 수 있는 수가 하나도 없으면 무승부예요.<br>
      <b>캐슬링:</b> 킹과 룩이 한 번도 안 움직였고 사이가 비었을 때, 킹을 룩 쪽으로 두 칸 옮기면 룩이 킹 옆으로 넘어와요.<br>
      <b>앙파상:</b> 상대 폰이 두 칸 전진해 내 폰 바로 옆에 오면, 바로 다음 수에 대각선으로 지나가며 잡을 수 있어요.</p>
    </details>`;

  window.ChessGuide = { tips, dangers, riskyTargets, reason, where, buddySvg, RULES, VAL, NAME };
})();
