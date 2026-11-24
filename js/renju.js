/*! © 2026 삼대710. 교실 내 비영리 사용 외 복제·수정·상업적 이용 금지 */
(function(){
  const N = 15;
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const REASON_KO = {
    "33": "삼삼 (쌍삼)",
    "44": "사사 (쌍사)",
    "overline": "장목 (6목 이상)"
  };

  const inBounds = (x, y) => x >= 0 && x < N && y >= 0 && y < N;
  const idxOf = (x, y) => y * N + x;
  const xyOf = idx => [idx % N, Math.floor(idx / N)];

  function boardFromMoves(moves) {
    const b = new Int8Array(N * N);
    (moves || []).forEach((m, i) => {
      if (m >= 0 && m < N * N) b[m] = (i % 2 === 0) ? 1 : 2;
    });
    return b;
  }

  function countLine(board, x, y, dx, dy, color) {
    let c = 1;
    let nx = x + dx, ny = y + dy;
    while (inBounds(nx, ny) && board[idxOf(nx, ny)] === color) { c++; nx += dx; ny += dy; }
    nx = x - dx; ny = y - dy;
    while (inBounds(nx, ny) && board[idxOf(nx, ny)] === color) { c++; nx -= dx; ny -= dy; }
    return c;
  }

  function hasExactFive(board, idx) {
    const [x, y] = xyOf(idx);
    for (const [dx, dy] of DIRS) {
      if (countLine(board, x, y, dx, dy, 1) === 5) return true;
    }
    return false;
  }

  function countDirFours(board, idx, dx, dy) {
    const [x, y] = xyOf(idx);
    const winCells = new Set();
    for (let shift = -4; shift <= 0; shift++) {
      let blacks = 0, emptyCell = -1, blocked = false;
      for (let k = 0; k < 5; k++) {
        const cx = x + (shift + k) * dx, cy = y + (shift + k) * dy;
        if (!inBounds(cx, cy)) { blocked = true; break; }
        const ci = idxOf(cx, cy);
        const v = ci === idx ? 1 : board[ci];
        if (v === 1) blacks++;
        else if (v === 0) {
          if (emptyCell !== -1) { blocked = true; break; }
          emptyCell = ci;
        } else { blocked = true; break; }
      }
      if (!blocked && blacks === 4 && emptyCell !== -1) {
        const bx = x + (shift - 1) * dx, by = y + (shift - 1) * dy;
        const ax = x + (shift + 5) * dx, ay = y + (shift + 5) * dy;
        const prevSame = inBounds(bx, by) && (idxOf(bx, by) === idx || board[idxOf(bx, by)] === 1);
        const nextSame = inBounds(ax, ay) && (idxOf(ax, ay) === idx || board[idxOf(ax, ay)] === 1);
        if (!prevSame && !nextSame) winCells.add(emptyCell);
      }
    }
    // [수정] 열린 4(_XXXX_)는 이길 자리가 양 끝 두 곳이지만 '4 하나'예요. 사사(44)로 잘못 세던 문제
    if (winCells.size === 2) {
      const [a, b] = [...winCells].map(c => { const [cx, cy] = xyOf(c); return dx ? (cx - x) / dx : (cy - y) / dy; });
      if (Math.abs(a - b) === 5) return 1;
    }
    return winCells.size;
  }

  function isOpenFourAt(board, idx, dx, dy) {
    const [x, y] = xyOf(idx);
    let l = 0, r = 0;
    while (inBounds(x - (l + 1) * dx, y - (l + 1) * dy) && board[idxOf(x - (l + 1) * dx, y - (l + 1) * dy)] === 1) l++;
    while (inBounds(x + (r + 1) * dx, y + (r + 1) * dy) && board[idxOf(x + (r + 1) * dx, y + (r + 1) * dy)] === 1) r++;
    if (l + r + 1 !== 4) return false;
    const lx = x - (l + 1) * dx, ly = y - (l + 1) * dy;
    const rx = x + (r + 1) * dx, ry = y + (r + 1) * dy;
    if (!inBounds(lx, ly) || !inBounds(rx, ry)) return false;
    if (board[idxOf(lx, ly)] !== 0 || board[idxOf(rx, ry)] !== 0) return false;
    const llx = lx - dx, lly = ly - dy;
    const rrx = rx + dx, rry = ry + dy;
    if (inBounds(llx, lly) && board[idxOf(llx, lly)] === 1) return false;
    if (inBounds(rrx, rry) && board[idxOf(rrx, rry)] === 1) return false;
    return true;
  }

  function hasDirOpenThree(board, idx, dx, dy) {
    const [x, y] = xyOf(idx);
    for (let step = -3; step <= 3; step++) {
      if (step === 0) continue;
      const ex = x + step * dx, ey = y + step * dy;
      if (!inBounds(ex, ey)) continue;
      const ei = idxOf(ex, ey);
      if (board[ei] !== 0) continue;
      board[ei] = 1;
      const ok = isOpenFourAt(board, ei, dx, dy);
      board[ei] = 0;
      if (ok && !forbidden(board, ei)) return true;
    }
    return false;
  }

  function forbidden(board, idx) {
    if (idx < 0 || idx >= N * N || board[idx] !== 0) return null;
    board[idx] = 1;
    if (hasExactFive(board, idx)) {
      board[idx] = 0;
      return null;
    }
    const [x, y] = xyOf(idx);
    for (const [dx, dy] of DIRS) {
      if (countLine(board, x, y, dx, dy, 1) >= 6) {
        board[idx] = 0;
        return "overline";
      }
    }
    let fours = 0;
    for (const [dx, dy] of DIRS) fours += countDirFours(board, idx, dx, dy);
    if (fours >= 2) {
      board[idx] = 0;
      return "44";
    }
    let threes = 0;
    for (const [dx, dy] of DIRS) {
      if (hasDirOpenThree(board, idx, dx, dy)) threes++;
    }
    board[idx] = 0;
    if (threes >= 2) return "33";
    return null;
  }

  function forbiddenPoints(board) {
    const out = [];
    for (let i = 0; i < N * N; i++) {
      if (board[i] === 0 && forbidden(board, i)) out.push(i);
    }
    return out;
  }

  function evaluateMove(board, idx, color) {
    if (color === 1) {
      const f = forbidden(board, idx);
      if (f) return { end: "foul", reason: f };
      const [x, y] = xyOf(idx);
      for (const [dx, dy] of DIRS) {
        if (countLine(board, x, y, dx, dy, 1) === 5) return { end: "five" };
      }
      return { end: null };
    } else {
      const [x, y] = xyOf(idx);
      for (const [dx, dy] of DIRS) {
        if (countLine(board, x, y, dx, dy, 2) >= 5) return { end: "five" };
      }
      return { end: null };
    }
  }

  function winningLine(board, lastIdx) {
    if (lastIdx < 0 || lastIdx >= N * N) return [];
    const color = board[lastIdx];
    if (!color) return [];
    const [x, y] = xyOf(lastIdx);
    for (const [dx, dy] of DIRS) {
      const line = [lastIdx];
      let nx = x + dx, ny = y + dy;
      while (inBounds(nx, ny) && board[idxOf(nx, ny)] === color) { line.push(idxOf(nx, ny)); nx += dx; ny += dy; }
      nx = x - dx; ny = y - dy;
      while (inBounds(nx, ny) && board[idxOf(nx, ny)] === color) { line.push(idxOf(nx, ny)); nx -= dx; ny -= dy; }
      if (color === 1 ? line.length === 5 : line.length >= 5) return line;
    }
    return [];
  }

  window.Renju = {
    N,
    DIRS,
    REASON_KO,
    boardFromMoves,
    forbidden,
    forbiddenPoints,
    evaluateMove,
    winningLine
  };
})();