/*! © 2026 삼대710. 교실 내 비영리 사용 외 복제·수정·상업적 이용 금지 */
/* 바둑돌 스킨: 플래티넘 이상 티어 학생의 돌(오목·알까기)에 티어 표시를 그려요.
   StoneSkin.draw(ctx, cx, cy, r, color(1=흑, 2=백), skinId) — 돌을 그린 바로 뒤에 불러요. */
(function () {
  const SKINS = ["gold", "platinum", "diamond", "master", "challenger", "champion"];
  const NAME = { gold: "골드", platinum: "플래티넘", diamond: "다이아", master: "마스터", challenger: "챌린저", champion: "챔피언" };

  function rim(ctx, cx, cy, r, stops, w) {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    ctx.strokeStyle = g; ctx.lineWidth = Math.max(1.2, r * w);
    ctx.beginPath(); ctx.arc(cx, cy, r * (1 - w / 2) - 0.3, 0, Math.PI * 2); ctx.stroke();
  }
  function star(ctx, cx, cy, ro, ri, n, rot = -Math.PI / 2) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const rr = i % 2 ? ri : ro, a = rot + (i * Math.PI) / n;
      ctx[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
  }
  function outline(ctx, color, r) { ctx.lineJoin = "round"; ctx.strokeStyle = color; ctx.lineWidth = Math.max(0.8, r * 0.07); ctx.stroke(); }

  // [수정] 가운데 그림 없이 테두리 색만 (위로 갈수록 테두리가 굵고 화려해져요)
  const RIM = {
    gold: { c: ["#fff0a3", "#c99700", "#ffe27a", "#a87900"], w: 0.12 },
    platinum: { c: ["#e6fffb", "#13a594", "#7ee8dc", "#0f877b"], w: 0.16 },
    diamond: { c: ["#d6e8ff", "#3d63c9", "#9cc0ff", "#1d3f9e"], w: 0.18 },
    master: { c: ["#f0d2ff", "#8b3dff", "#d8a8ff", "#521899"], w: 0.19, glow: "#b06bff" },
    challenger: { c: ["#ffd84a", "#e02858", "#1a8cff", "#ffd84a"], w: 0.2, glow: "#ff4f7c" },
    champion: { c: ["#fff3b0", "#ffb02e", "#fffbe0", "#c98a00", "#ffd24a"], w: 0.22, glow: "#ffcf4a" }
  };
  // 양옆 작은 날개 (깃털 3갈래)
  function wings(ctx, cx, cy, r, cols, sides = [-1, 1], size = 0.74) {
    const q = r * size;   // 작게
    for (const side of sides) {
      const x0 = cx + side * r * 0.92, y0 = cy - r * 0.05;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + q * 0.22);
      ctx.quadraticCurveTo(x0 + side * q * 0.25, y0 - q * 0.45, x0 + side * q * 0.62, y0 - q * 0.42);
      ctx.lineTo(x0 + side * q * 0.42, y0 - q * 0.22);
      ctx.lineTo(x0 + side * q * 0.6, y0 - q * 0.14);
      ctx.lineTo(x0 + side * q * 0.38, y0 + q * 0.02);
      ctx.lineTo(x0 + side * q * 0.5, y0 + q * 0.1);
      ctx.quadraticCurveTo(x0 + side * q * 0.2, y0 + q * 0.3, x0, y0 + q * 0.22);
      ctx.closePath();
      const g = ctx.createLinearGradient(x0, y0 - q * 0.45, x0 + side * q * 0.6, y0 + q * 0.2);
      g.addColorStop(0, "#ffffff"); g.addColorStop(.5, cols[2] || cols[0]); g.addColorStop(1, cols[1]);
      ctx.fillStyle = g; ctx.fill();
      ctx.lineJoin = "round"; ctx.strokeStyle = cols[cols.length - 1]; ctx.lineWidth = Math.max(0.6, r * 0.05); ctx.stroke();
    }
  }
  // 머리 위 작은 왕관
  function crown(ctx, cx, cy, r, id) {
    const w = r * 0.46, b = cy - r * 0.74, t = cy - r * 1.16;
    ctx.beginPath();
    ctx.moveTo(cx - w, b); ctx.lineTo(cx - w * 1.05, t + r * 0.12); ctx.lineTo(cx - w * 0.45, b - r * 0.2); ctx.lineTo(cx, t);
    ctx.lineTo(cx + w * 0.45, b - r * 0.2); ctx.lineTo(cx + w * 1.05, t + r * 0.12); ctx.lineTo(cx + w, b); ctx.closePath();
    const g = ctx.createLinearGradient(cx, t, cx, b); g.addColorStop(0, "#fff6c4"); g.addColorStop(.55, "#ffc72e"); g.addColorStop(1, "#c98a00");
    ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = r * 0.15; ctx.shadowOffsetY = r * 0.05;
    ctx.fillStyle = g; ctx.fill(); ctx.shadowColor = "transparent";
    ctx.lineJoin = "round"; ctx.strokeStyle = "#8a5a00"; ctx.lineWidth = Math.max(0.7, r * 0.055); ctx.stroke();
    ctx.fillStyle = id === "master" ? "#9b5cff" : id === "challenger" ? "#e02858" : "#1a8cff";
    ctx.beginPath(); ctx.arc(cx, b - r * 0.1, r * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; [[-w * 1.05, t + r * 0.12], [0, t], [w * 1.05, t + r * 0.12]].forEach(([dx, y]) => { ctx.beginPath(); ctx.arc(cx + dx, y, r * 0.065, 0, Math.PI * 2); ctx.fill(); });
  }
  function draw(ctx, cx, cy, r, color, id) {
    if (id === "victory") return victoryStone(ctx, cx, cy, r, color);
    const k = RIM[id]; if (!k || r < 3) return;
    ctx.save();
    if (k.glow) { ctx.shadowColor = k.glow; ctx.shadowBlur = r * 0.45; }
    rim(ctx, cx, cy, r, k.c, k.w);
    ctx.shadowBlur = 0;
    if (id === "gold") wings(ctx, cx, cy, r, k.c, [-1, 1], 0.45);                 // 골드: 양쪽에 아주 작은 날개
    if (id === "platinum" || id === "diamond" || id === "champion") wings(ctx, cx, cy, r, k.c);
    if (id === "master" || id === "challenger" || id === "champion") crown(ctx, cx, cy, r, id);
    // 테두리 안쪽 가는 빛줄
    ctx.strokeStyle = color === 1 ? "#ffffff33" : "#ffffff99"; ctx.lineWidth = Math.max(0.6, r * 0.035);
    ctx.beginPath(); ctx.arc(cx, cy, r * (1 - k.w) - 0.5, Math.PI * 1.05, Math.PI * 1.65); ctx.stroke();
    ctx.restore();
  }
  // [추가] 체스 기물 스킨 (기물을 100×100 좌표로 그리는 중에 불러요)
  //  받침에 티어 색 띠 + 킹에 날개/왕관 (바둑돌과 같은 규칙)
  function piece(ctx, id, type, basePath, bodyPath) {
    if (id === "victory") {
      ctx.save(); ctx.shadowColor = "#ffd76a"; ctx.shadowBlur = 5;
      ctx.strokeStyle = goldGrad(ctx, 20, 10, 80, 94); ctx.lineWidth = 2.2; ctx.lineJoin = "round";
      ctx.stroke(basePath); if (bodyPath) ctx.stroke(bodyPath); ctx.restore();
      if (type === "k") { wings(ctx, 50, 52, 30, ["#fff3c4", "#8b5cf6", "#c4b5fd", "#2f6bff"]); crown(ctx, 50, 24, 22, "victory"); }
      return;
    }
    const k = RIM[id]; if (!k) return;
    ctx.save();
    const g = ctx.createLinearGradient(20, 10, 80, 94);
    k.c.forEach((c, i) => g.addColorStop(i / (k.c.length - 1), c));
    if (k.glow) { ctx.shadowColor = k.glow; ctx.shadowBlur = 5; }
    // [수정] 얇은 테두리로 기물 전체를 감싸요
    ctx.strokeStyle = g; ctx.lineWidth = 1.3 + k.w * 2.5; ctx.lineJoin = "round";
    ctx.stroke(basePath); if (bodyPath) ctx.stroke(bodyPath);
    ctx.shadowColor = "transparent";
    if (type === "k") {
      if (id === "gold") wings(ctx, 50, 52, 30, k.c, [-1, 1], 0.45);
      if (id === "platinum" || id === "diamond" || id === "champion") wings(ctx, 50, 52, 30, k.c);
      if (id === "master" || id === "challenger" || id === "champion") crown(ctx, 50, 24, 22, id);
    }
    ctx.restore();
  }
  // ===== [추가] 승리의 스킨 (시즌을 다이아 이상으로 마친 학생) — 보라·파랑·금 =====
  const V = { gold: ["#fff3c4", "#f2c94c", "#b8860b", "#ffe9a0"], deep: "#160f3d", mid: "#3a2a9c", blue: "#2f6bff", violet: "#8b5cf6" };
  function goldGrad(ctx, x0, y0, x1, y1) { const g = ctx.createLinearGradient(x0, y0, x1, y1); V.gold.forEach((c, i) => g.addColorStop(i / 3, c)); return g; }
  // 바둑돌: 돌 전체를 다시 칠해요 (흑 = 깊은 보라·파랑, 백 = 연보라 진주) + 금 테두리 + 작은 별빛
  function victoryStone(ctx, cx, cy, r, color) {
    ctx.save();
    const g = ctx.createRadialGradient(cx - r * .35, cy - r * .4, r * .05, cx, cy, r);
    if (color === 1) { g.addColorStop(0, "#9d8cff"); g.addColorStop(.35, "#4b37c9"); g.addColorStop(.75, "#1d1563"); g.addColorStop(1, "#0b0827"); }
    else { g.addColorStop(0, "#ffffff"); g.addColorStop(.5, "#ece6ff"); g.addColorStop(.85, "#c7bdf5"); g.addColorStop(1, "#9c8fe0"); }
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = goldGrad(ctx, cx - r, cy - r, cx + r, cy + r); ctx.lineWidth = Math.max(1.2, r * .13);
    ctx.shadowColor = "#ffd76a"; ctx.shadowBlur = r * .35;
    ctx.beginPath(); ctx.arc(cx, cy, r * .93, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.strokeStyle = color === 1 ? "#6fa0ff" : "#8b5cf6"; ctx.lineWidth = Math.max(.7, r * .05);
    ctx.beginPath(); ctx.arc(cx, cy, r * .78, 0, Math.PI * 2); ctx.stroke();
    // 별빛 하나
    ctx.fillStyle = "#fff6d0"; ctx.beginPath();
    const sx = cx - r * .32, sy = cy - r * .32, a = r * .2, b = r * .06;
    ctx.moveTo(sx, sy - a); ctx.lineTo(sx + b, sy - b); ctx.lineTo(sx + a, sy); ctx.lineTo(sx + b, sy + b); ctx.lineTo(sx, sy + a); ctx.lineTo(sx - b, sy + b); ctx.lineTo(sx - a, sy); ctx.lineTo(sx - b, sy - b); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // 바둑판 바탕 (오목·알까기 공통): 밤하늘 보라·파랑 + 가운데 빛
  function victoryBoardBg(ctx, x, y, w, h) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#7d70d2"); g.addColorStop(.5, "#6a7fd8"); g.addColorStop(1, "#6250b8");
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    const rg = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w * .7);
    rg.addColorStop(0, "rgba(255,255,255,.22)"); rg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rg; ctx.fillRect(x, y, w, h);
    // 금빛 가장자리
    ctx.strokeStyle = goldGrad(ctx, x, y, x + w, y + h); ctx.lineWidth = Math.max(2, w * .012);
    ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  }
  const VICTORY = { line: "rgba(255,246,220,.55)", star: "#ffc928", label: "#ffc928", sqDark: ["#6f62c8", "#5a4db3"], sqLight: ["#efeaff", "#d9d1f7"], frame: ["#6658c2", "#4e42a6", "#30287c"] };
  const skinOf = tierId => SKINS.includes(tierId) ? tierId : null;

  // ===== [추가] 시즌 0 한정판 승리의 스킨: 짙은 남색 + 흑백 용 그림이 은은하게 =====
  const S0IMG = new Image(); let s0ok = false;
  S0IMG.onload = () => { s0ok = true; try { window.App && window.App.render && window.App.render(); } catch (e) {} };
  S0IMG.src = "img/s0-dragon.jpg?v=1";
  function s0Dragon(ctx, x, y, w, h, alpha) {
    if (!s0ok) return;
    const iw = S0IMG.width, ih = S0IMG.height, sc = Math.max(w / iw, h / ih), dw = iw * sc, dh = ih * sc;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.globalAlpha = alpha; ctx.globalCompositeOperation = "screen";
    ctx.drawImage(S0IMG, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  }
  function s0BoardBg(ctx, x, y, w, h) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#2a1f7a"); g.addColorStop(.5, "#1b2a8a"); g.addColorStop(1, "#160f3d");
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    s0Dragon(ctx, x, y, w, h, .3);
    const rg = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w * .7);
    rg.addColorStop(0, "rgba(139,92,246,.22)"); rg.addColorStop(1, "rgba(139,92,246,0)");
    ctx.fillStyle = rg; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = goldGrad(ctx, x, y, x + w, y + h); ctx.lineWidth = Math.max(2, w * .012);
    ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  }
  const THEMES = {
    victory: Object.assign({ bg: victoryBoardBg }, VICTORY),
    s0: { bg: s0BoardBg, overlay: (ctx, x, y, w, h) => s0Dragon(ctx, x, y, w, h, .26),
          line: "rgba(255,214,120,.62)", star: "#ffd76a", label: "#ffd76a",
          sqDark: ["#3b2fa0", "#241c6e"], sqLight: ["#cfc6f2", "#a99fdc"], frame: ["#3a2a9c", "#1d1563", "#0b0827"] }
  };
  const theme = id => THEMES[id] || null;

  window.StoneSkin = { draw, piece, skinOf, SKINS, NAME, victoryStone, victoryBoardBg, goldGrad, VICTORY, theme, s0BoardBg, s0Dragon };
})();
