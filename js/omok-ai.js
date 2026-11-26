/*! © 2026 삼대710. 교실 내 비영리 사용 외 복제·수정·상업적 이용 금지 */
(function(){
  const R = window.Renju;
  const N = R.N;

  function candidates(board, aiColor) {
    const set = new Set();
    let hasStone = false;
    for (let i = 0; i < N * N; i++) {
      if (board[i] === 0) continue;
      hasStone = true;
      const x = i % N, y = Math.floor(i / N);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
          const ni = ny * N + nx;
          if (board[ni] !== 0) continue;
          if (aiColor === 1 && R.forbidden(board, ni)) continue;
          set.add(ni);
        }
      }
    }
    if (!hasStone) return [Math.floor(N / 2) * N + Math.floor(N / 2)];
    if (!set.size) {
      for (let i = 0; i < N * N; i++) {
        if (board[i] === 0 && !(aiColor === 1 && R.forbidden(board, i))) set.add(i);
      }
    }
    return [...set];
  }

  function scorePoint(board, idx, color) {
    const x = idx % N, y = Math.floor(idx / N);
    let total = 0;
    for (const [dx, dy] of R.DIRS) {
      let c = 1, openEnds = 0;
      let nx = x + dx, ny = y + dy;
      while (nx >= 0 && nx < N && ny >= 0 && ny < N && board[ny * N + nx] === color) { c++; nx += dx; ny += dy; }
      if (nx >= 0 && nx < N && ny >= 0 && ny < N && board[ny * N + nx] === 0) openEnds++;
      nx = x - dx; ny = y - dy;
      while (nx >= 0 && nx < N && ny >= 0 && ny < N && board[ny * N + nx] === color) { c++; nx -= dx; ny -= dy; }
      if (nx >= 0 && nx < N && ny >= 0 && ny < N && board[ny * N + nx] === 0) openEnds++;

      if (color === 1 ? c === 5 : c >= 5) total += 100000;
      else if (c === 4 && openEnds === 2) total += 12000;
      else if (c === 4 && openEnds === 1) total += 2500;
      else if (c === 3 && openEnds === 2) total += 2200;
      else if (c === 3 && openEnds === 1) total += 350;
      else if (c === 2 && openEnds === 2) total += 250;
      else if (c === 2 && openEnds === 1) total += 40;
    }
    const centerDist = Math.abs(x - 7) + Math.abs(y - 7);
    return total + (14 - centerDist) * 2;
  }

  function pick(moves, level = 'normal') {
    const board = R.boardFromMoves(moves);
    const aiColor = (moves || []).length % 2 === 0 ? 1 : 2;
    const oppColor = 3 - aiColor;
    const cands = candidates(board, aiColor);
    if (!cands.length) return -1;
    if (cands.length === 1) return cands[0];

    const defWeight = level === 'easy' ? 0.65 : level === 'hard' ? 1.15 : 0.95;
    const scored = cands.map(idx => {
      const atk = scorePoint(board, idx, aiColor);
      const def = (oppColor === 1 && R.forbidden(board, idx)) ? 0 : scorePoint(board, idx, oppColor);
      let s = atk + def * defWeight;
      if (level === 'hard' && atk < 100000 && def < 100000) {
        board[idx] = aiColor;
        const nextCands = candidates(board, oppColor).slice(0, 8);
        let maxReply = 0;
        for (const r of nextCands) {
          const rs = scorePoint(board, r, oppColor);
          if (rs > maxReply) maxReply = rs;
        }
        board[idx] = 0;
        s -= maxReply * 0.45;
      }
      return { idx, s };
    }).sort((a, b) => b.s - a.s);

    if (scored[0].s >= 90000) return scored[0].idx;
    const pool = level === 'easy' ? Math.min(5, scored.length) : level === 'normal' ? Math.min(2, scored.length) : 1;
    return scored[Math.floor(Math.random() * pool)].idx;
  }

  window.OmokAI = { pick };
})();
