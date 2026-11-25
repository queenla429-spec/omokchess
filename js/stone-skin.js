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
  const skinOf = tierId => SKINS.includes(tierId) ? tierId : null;

  window.StoneSkin = { draw, skinOf, SKINS, NAME };
})();
