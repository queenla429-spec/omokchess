/*! 체스 규칙 래퍼 — chess.js 0.10.3(전역 Chess)이 먼저 로드되어야 합니다. */
(function(){
  const F = 'abcdefgh';
  const sq  = i => F[i & 7] + (8 - (i >> 3));             // 0..63 → "e4"  (a8=0, h1=63)
  const idx = s => (8 - Number(s[1])) * 8 + F.indexOf(s[0]); // "e4" → 0..63

  // moves = ["e2e4","e7e5","e7e8q", ...]  (홀수 번째=선공=체스의 백)
  function from(moves) {
    const c = new Chess();
    for (const u of moves || []) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    return c;
  }
  const targets = (c, s) => c.moves({ square: s, verbose: true }).map(m => m.to);
  const isPromo = (c, a, b) => {
    const p = c.get(a);
    return !!p && p.type === 'p' && (b[1] === '8' || b[1] === '1') && c.moves({ square: a, verbose: true }).some(m => m.to === b);
  };

  // 한 수를 두고 결과를 돌려줌. 불법 수면 null
  function play(moves, a, b, promo) {
    const c = from(moves), m = c.move({ from: a, to: b, promotion: promo || 'q' });
    if (!m) return null;
    let end = null;
    if (c.in_checkmate()) end = 'checkmate';
    else if (c.in_stalemate()) end = 'stalemate';
    else if (c.in_threefold_repetition()) end = 'repetition';
    else if (c.insufficient_material()) end = 'insufficient';
    else if (c.in_draw()) end = 'fifty';
    return { uci: a + b + (m.promotion || ''), san: m.san, end, check: c.in_check() };
  }

  window.ChessRules = {
    N: 8, sq, idx, from, targets, isPromo, play,
    REASON_KO: { checkmate: '체크메이트', stalemate: '스테일메이트', repetition: '3회 동형 반복', insufficient: '기물 부족', fifty: '50수 규칙' }
  };
  // 기존 코드(admin.js 등)가 Renju.REASON_KO를 참조해도 오류 나지 않게 하는 빈 껍데기
  window.Renju = window.Renju || { N: 8, REASON_KO: {} };
})();
