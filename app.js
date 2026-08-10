const BOARD_SIZE = 10;
const SHIPS = [
  { id: 'carrier', name: 'Carrier', size: 5 },
  { id: 'battleship', name: 'Battleship', size: 4 },
  { id: 'cruiser', name: 'Cruiser', size: 3 },
  { id: 'submarine', name: 'Submarine', size: 3 },
  { id: 'destroyer', name: 'Destroyer', size: 2 }
];

const STATUS = {
  EMPTY: 'empty',
  SHIP: 'ship',
  HIT: 'hit',
  MISS: 'miss',
  SUNK: 'sunk'
};

let state = null;

const playerBoardEl = document.getElementById('player-board');
const enemyBoardEl = document.getElementById('enemy-board');
const statusEl = document.getElementById('status');
const logListEl = document.getElementById('log-list');
const difficultySelect = document.getElementById('difficulty');
const modeToggleBtn = document.getElementById('mode-toggle');

function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => ({ status: STATUS.EMPTY, shipId: null }))
  );
}

function cloneShips() {
  return SHIPS.map(s => ({ ...s, hits: 0, sunk: false, cells: [] }));
}

function canPlace(board, ship, row, col, horizontal) {
  for (let i = 0; i < ship.size; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    if (r >= BOARD_SIZE || c >= BOARD_SIZE) return false;
    if (board[r][c].status !== STATUS.EMPTY) return false;
  }
  return true;
}

function placeShip(board, ship, row, col, horizontal) {
  const cells = [];
  for (let i = 0; i < ship.size; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    board[r][c] = { status: STATUS.SHIP, shipId: ship.id };
    cells.push({ r, c });
  }
  ship.cells = cells;
}

function placeShipsRandomly(board, ships) {
  for (const ship of ships) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 1000) {
      attempts++;
      const horizontal = Math.random() < 0.5;
      const row = Math.floor(Math.random() * BOARD_SIZE);
      const col = Math.floor(Math.random() * BOARD_SIZE);
      if (canPlace(board, ship, row, col, horizontal)) {
        placeShip(board, ship, row, col, horizontal);
        placed = true;
      }
    }
    if (!placed) throw new Error(`Could not place ${ship.name}`);
  }
}

function initGame() {
  const playerBoard = createEmptyBoard();
  const enemyBoard = createEmptyBoard();
  const playerShips = cloneShips();
  const enemyShips = cloneShips();

  try {
    placeShipsRandomly(playerBoard, playerShips);
    placeShipsRandomly(enemyBoard, enemyShips);
  } catch (e) {
    log('Setup error: ' + e.message);
    return;
  }

  state = {
    playerBoard,
    enemyBoard,
    playerShips,
    enemyShips,
    turn: 'player',
    gameOver: false,
    difficulty: difficultySelect.value,
    mode: 'manual',
    heat: null,
    heatMax: 0
  };

  logListEl.innerHTML = '';
  log('New game started. Click the enemy board to fire.');
  updateStatus('Your turn. Click a cell on the enemy board to fire.');
  updateHeatmap();
  render();
}

function render() {
  renderBoard(playerBoardEl, state.playerBoard, false, state.heat, state.heatMax);
  renderBoard(enemyBoardEl, state.enemyBoard, true, null, 0);
}

function renderBoard(element, board, hideShips, heat, heatMax) {
  element.innerHTML = '';
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      const cellState = board[r][c].status;

      if (cellState === STATUS.HIT) cell.classList.add('hit');
      else if (cellState === STATUS.MISS) cell.classList.add('miss');
      else if (cellState === STATUS.SUNK) cell.classList.add('sunk');
      else if (cellState === STATUS.SHIP && !hideShips) cell.classList.add('ship');

      if (heat && (cellState === STATUS.EMPTY || cellState === STATUS.SHIP)) {
        const h = heat[r][c];
        const max = heatMax || 1;
        const factor = h / max;
        const hue = 220 - factor * 220;
        const opacity = 0.25 + factor * 0.55;
        cell.classList.add('heat');
        cell.style.setProperty('--heat-color', `hsl(${hue}, 85%, 55%)`);
        cell.style.setProperty('--heat-opacity', opacity.toFixed(2));
      }

      element.appendChild(cell);
    }
  }
}

function coordLabel(r, c) {
  return `${String.fromCharCode(65 + r)}${c + 1}`;
}

function log(msg) {
  const li = document.createElement('li');
  li.textContent = msg;
  logListEl.prepend(li);
}

function updateStatus(msg) {
  statusEl.textContent = msg;
}

function findShip(ships, shipId) {
  return ships.find(s => s.id === shipId);
}

function fire(board, ships, r, c) {
  const target = board[r][c];
  if (target.status === STATUS.HIT || target.status === STATUS.MISS || target.status === STATUS.SUNK) {
    return { alreadyFired: true };
  }

  if (target.status === STATUS.SHIP) {
    const ship = findShip(ships, target.shipId);
    target.status = STATUS.HIT;
    ship.hits += 1;
    if (ship.hits === ship.size) {
      ship.sunk = true;
      ship.cells.forEach(({ r, c }) => { board[r][c].status = STATUS.SUNK; });
      return { hit: true, sunk: true, ship };
    }
    return { hit: true, sunk: false, ship };
  }

  target.status = STATUS.MISS;
  return { hit: false, sunk: false, ship: null };
}

function allSunk(ships) {
  return ships.every(s => s.sunk);
}

function endGame(winner) {
  state.gameOver = true;
  updateStatus(`Game over — ${winner} wins!`);
  log(`Game over — ${winner} wins!`);
}

function handlePlayerFire(r, c) {
  if (state.gameOver || state.turn !== 'player' || state.mode !== 'manual') return;

  const result = fire(state.enemyBoard, state.enemyShips, r, c);
  if (result.alreadyFired) {
    updateStatus('You already fired there. Pick another cell.');
    return;
  }

  if (result.hit && result.sunk) {
    log(`You fire at ${coordLabel(r, c)} — hit and sunk the ${result.ship.name}!`);
    updateStatus(`You sank the ${result.ship.name}! Enemy turn...`);
  } else if (result.hit) {
    log(`You fire at ${coordLabel(r, c)} — hit.`);
    updateStatus('Hit! Enemy turn...');
  } else {
    log(`You fire at ${coordLabel(r, c)} — miss.`);
    updateStatus('Miss. Enemy turn...');
  }

  render();

  if (allSunk(state.enemyShips)) {
    endGame('Player');
    return;
  }

  state.turn = 'enemy';
  setTimeout(aiTurn, 600);
}

function getAvailableCells(board) {
  const cells = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const s = board[r][c].status;
      if (s !== STATUS.HIT && s !== STATUS.MISS && s !== STATUS.SUNK) cells.push({ r, c });
    }
  }
  return cells;
}

function getUnsunkHits(board) {
  const hits = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].status === STATUS.HIT) hits.push({ r, c });
    }
  }
  return hits;
}

function getAdjacentCells(r, c) {
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const result = [];
  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) result.push({ r: nr, c: nc });
  }
  return result;
}

function pickRandomCell(board) {
  const cells = getAvailableCells(board);
  if (cells.length === 0) return null;
  return cells[Math.floor(Math.random() * cells.length)];
}

function canPlaceForProbability(board, ship, row, col, horizontal) {
  for (let i = 0; i < ship.size; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    if (r >= BOARD_SIZE || c >= BOARD_SIZE) return false;
    const s = board[r][c].status;
    if (s === STATUS.MISS || s === STATUS.SUNK) return false;
  }
  return true;
}

function computeProbabilityHeat(board, ships) {
  const heat = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  const remaining = ships.filter(s => !s.sunk);
  for (const ship of remaining) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        for (const horizontal of [true, false]) {
          if (canPlaceForProbability(board, ship, r, c, horizontal)) {
            for (let i = 0; i < ship.size; i++) {
              const rr = horizontal ? r : r + i;
              const cc = horizontal ? c + i : c;
              heat[rr][cc] += 1;
            }
          }
        }
      }
    }
  }
  return heat;
}

function updateHeatmap() {
  if (!state) return;
  const { playerBoard, playerShips, difficulty } = state;
  let heat = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  let max = 1;

  if (difficulty === 'hunt') {
    const hits = getUnsunkHits(playerBoard);
    for (const { r, c } of hits) {
      for (const { r: nr, c: nc } of getAdjacentCells(r, c)) {
        const s = playerBoard[nr][nc].status;
        if (s !== STATUS.HIT && s !== STATUS.MISS && s !== STATUS.SUNK) heat[nr][nc] += 1;
      }
    }
    max = Math.max(1, ...heat.flat());
  } else if (difficulty === 'probability') {
    heat = computeProbabilityHeat(playerBoard, playerShips);
    max = Math.max(1, ...heat.flat());
  } else {
    // Random: uniform faint heat
    max = 1;
  }

  state.heat = heat;
  state.heatMax = max;
}

function chooseShot() {
  const { playerBoard, playerShips, difficulty } = state;

  if (difficulty === 'random') {
    const cell = pickRandomCell(playerBoard);
    return { ...cell, reason: 'random search' };
  }

  if (difficulty === 'hunt') {
    const hits = getUnsunkHits(playerBoard);
    if (hits.length > 0) {
      const candidates = [];
      for (const { r, c } of hits) {
        for (const { r: nr, c: nc } of getAdjacentCells(r, c)) {
          const s = playerBoard[nr][nc].status;
          if (s !== STATUS.HIT && s !== STATUS.MISS && s !== STATUS.SUNK) candidates.push({ r: nr, c: nc });
        }
      }
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        return { ...pick, reason: 'hunting around a known hit' };
      }
    }
    const cell = pickRandomCell(playerBoard);
    return { ...cell, reason: 'no known targets, choosing random' };
  }

  if (difficulty === 'probability') {
    const heat = computeProbabilityHeat(playerBoard, playerShips);
    let best = null;
    let bestScore = -1;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const s = playerBoard[r][c].status;
        if (s === STATUS.HIT || s === STATUS.MISS || s === STATUS.SUNK) continue;
        if (heat[r][c] > bestScore) {
          bestScore = heat[r][c];
          best = { r, c };
        }
      }
    }
    if (!best) {
      const cell = pickRandomCell(playerBoard);
      return { ...cell, reason: 'fallback random' };
    }
    return { ...best, reason: `highest probability cell (score ${bestScore})` };
  }

  const cell = pickRandomCell(playerBoard);
  return { ...cell, reason: 'default random' };
}

function aiTurn() {
  if (state.gameOver) return;

  const shot = chooseShot();
  if (!shot) return;

  const { r, c, reason } = shot;
  const result = fire(state.playerBoard, state.playerShips, r, c);
  updateHeatmap();
  render();

  const why = reason ? `, ${reason}` : '';
  if (result.hit && result.sunk) {
    log(`Enemy fires at ${coordLabel(r, c)} — hit and sunk your ${result.ship.name}${why}!`);
    updateStatus(`Enemy sank your ${result.ship.name}! Your turn.`);
  } else if (result.hit) {
    log(`Enemy fires at ${coordLabel(r, c)} — hit${why}.`);
    updateStatus('Enemy hit! Your turn.');
  } else {
    log(`Enemy fires at ${coordLabel(r, c)} — miss${why}.`);
    updateStatus('Enemy missed. Your turn.');
  }

  if (allSunk(state.playerShips)) {
    endGame('Enemy');
    return;
  }

  state.turn = 'player';
}

enemyBoardEl.addEventListener('click', e => {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  const r = parseInt(cell.dataset.r, 10);
  const c = parseInt(cell.dataset.c, 10);
  handlePlayerFire(r, c);
});

document.getElementById('new-game').addEventListener('click', initGame);

difficultySelect.addEventListener('change', e => {
  if (!state) return;
  state.difficulty = e.target.value;
  updateHeatmap();
  render();
});

modeToggleBtn.addEventListener('click', () => {
  if (!state) return;
  state.mode = state.mode === 'manual' ? 'delegated' : 'manual';
  modeToggleBtn.textContent = `Mode: ${state.mode === 'manual' ? 'Manual' : 'Delegated'}`;
  updateStatus(state.mode === 'manual'
    ? 'Switched to manual mode. Click a cell to fire.'
    : 'Switched to delegated mode. Type an order below. (not yet implemented)');
});

initGame();
