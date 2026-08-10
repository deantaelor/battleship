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
const delegatedControls = document.getElementById('delegated-controls');
const orderInput = document.getElementById('order-input');
const orderFireBtn = document.getElementById('order-fire');
const gunnerResponse = document.getElementById('gunner-response');

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

  delegatedControls.style.display = 'none';
  gunnerResponse.textContent = '';
  orderInput.value = '';
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

function executePlayerFire(shooter, r, c, reason) {
  if (state.gameOver || state.turn !== 'player') return false;

  const result = fire(state.enemyBoard, state.enemyShips, r, c);
  if (result.alreadyFired) {
    updateStatus(`${shooter} already fired there. Pick another cell.`);
    return false;
  }

  const verb = shooter === 'You' ? 'fire' : 'fires';
  let msg = `${shooter} ${verb} at ${coordLabel(r, c)}`;
  if (result.hit && result.sunk) {
    msg += ` — hit and sunk the ${result.ship.name}!`;
    updateStatus(`${shooter} sank the ${result.ship.name}! Enemy turn...`);
  } else if (result.hit) {
    msg += ` — hit.`;
    updateStatus(`${shooter} hit! Enemy turn...`);
  } else {
    msg += ` — miss.`;
    updateStatus(`${shooter} missed. Enemy turn...`);
  }
  if (reason) msg += ` (${reason})`;
  log(msg);

  render();

  if (allSunk(state.enemyShips)) {
    endGame('Player');
    return true;
  }

  state.turn = 'enemy';
  setTimeout(aiTurn, 600);
  return true;
}

function handlePlayerFire(r, c) {
  if (state.gameOver || state.turn !== 'player' || state.mode !== 'manual') return;
  executePlayerFire('You', r, c, null);
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

function isUnknown(cell) {
  return cell.status !== STATUS.HIT && cell.status !== STATUS.MISS && cell.status !== STATUS.SUNK;
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

function computeShipHeat(board, ship) {
  const heat = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
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

function parseCoordinate(text) {
  const match = text.match(/\b([a-jA-J])\s*(\d{1,2})\b/);
  if (match) {
    const r = match[1].toUpperCase().charCodeAt(0) - 65;
    const c = parseInt(match[2], 10) - 1;
    if (c >= 0 && c < BOARD_SIZE) return { r, c };
  }
  const match2 = text.match(/\b(\d{1,2})\s*([a-jA-J])\b/);
  if (match2) {
    const c = parseInt(match2[1], 10) - 1;
    const r = match2[2].toUpperCase().charCodeAt(0) - 65;
    if (c >= 0 && c < BOARD_SIZE) return { r, c };
  }
  return null;
}

function filterAvailable(board, filter) {
  const cells = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (filter(r, c) && isUnknown(board[r][c])) cells.push({ r, c });
    }
  }
  return cells;
}

function parseQuadrant(text) {
  if (/top\s*right|upper\s*right/.test(text)) return { name: 'top-right quadrant', filter: (r, c) => r < 5 && c >= 5 };
  if (/top\s*left|upper\s*left/.test(text)) return { name: 'top-left quadrant', filter: (r, c) => r < 5 && c < 5 };
  if (/bottom\s*right|lower\s*right/.test(text)) return { name: 'bottom-right quadrant', filter: (r, c) => r >= 5 && c >= 5 };
  if (/bottom\s*left|lower\s*left/.test(text)) return { name: 'bottom-left quadrant', filter: (r, c) => r >= 5 && c < 5 };
  if (/\btop\b/.test(text)) return { name: 'top half', filter: (r, c) => r < 5 };
  if (/\bbottom\b/.test(text)) return { name: 'bottom half', filter: (r, c) => r >= 5 };
  if (/\bleft\b/.test(text)) return { name: 'left half', filter: (r, c) => c < 5 };
  if (/\bright\b/.test(text)) return { name: 'right half', filter: (r, c) => c >= 5 };
  return null;
}

function pickBestFromHeat(board, ships) {
  const heat = computeProbabilityHeat(board, ships);
  let best = null;
  let bestScore = -1;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!isUnknown(board[r][c])) continue;
      if (heat[r][c] > bestScore) {
        bestScore = heat[r][c];
        best = { r, c };
      }
    }
  }
  return { best, bestScore };
}

function gunnerPick(order) {
  const board = state.enemyBoard;
  const ships = state.enemyShips;
  const text = order.toLowerCase();

  // Finish off wounded ships
  if (/finish|wound|wounded|hurt|hurting|sink|sinking|kill|killing/.test(text)) {
    const hits = getUnsunkHits(board);
    if (hits.length > 0) {
      const candidates = [];
      for (const { r, c } of hits) {
        for (const cell of getAdjacentCells(r, c)) {
          if (isUnknown(board[cell.r][cell.c])) candidates.push(cell);
        }
      }
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        return { ...pick, reason: 'finishing off a wounded ship' };
      }
    }
    const { best, bestScore } = pickBestFromHeat(board, ships);
    if (best) return { ...best, reason: `no wounded targets, highest-probability cell (score ${bestScore})` };
    const cell = pickRandomCell(board);
    return { ...cell, reason: 'no wounded targets, firing randomly' };
  }

  // Hunt a specific ship
  const shipMatch = text.match(/\b(carrier|battleship|cruiser|submarine|destroyer)\b/);
  if (shipMatch) {
    const shipId = shipMatch[1];
    const ship = findShip(ships, shipId);
    if (ship.sunk) {
      const { best, bestScore } = pickBestFromHeat(board, ships);
      if (best) return { ...best, reason: `${ship.name} already sunk, using next-best probability (score ${bestScore})` };
      const cell = pickRandomCell(board);
      return { ...cell, reason: `${ship.name} already sunk, firing randomly` };
    }
    const heat = computeShipHeat(board, ship);
    let best = null;
    let bestScore = -1;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!isUnknown(board[r][c])) continue;
        if (heat[r][c] > bestScore) {
          bestScore = heat[r][c];
          best = { r, c };
        }
      }
    }
    if (best) return { ...best, reason: `hunting the ${ship.name}` };
    const cell = pickRandomCell(board);
    return { ...cell, reason: `could not place the ${ship.name}, firing randomly` };
  }

  // Around a coordinate
  const coord = parseCoordinate(text);
  if (coord && /around|near|close|adjacent|next to/.test(text)) {
    const candidates = getAdjacentCells(coord.r, coord.c).filter(cell => isUnknown(board[cell.r][cell.c]));
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      return { ...pick, reason: `searching around ${coordLabel(coord.r, coord.c)}` };
    }
    const { best, bestScore } = pickBestFromHeat(board, ships);
    if (best) return { ...best, reason: `no open cells near ${coordLabel(coord.r, coord.c)}, using probability (score ${bestScore})` };
    const cell = pickRandomCell(board);
    return { ...cell, reason: `no open cells near ${coordLabel(coord.r, coord.c)}, firing randomly` };
  }

  // Quadrant / half
  const quad = parseQuadrant(text);
  if (quad) {
    const candidates = filterAvailable(board, quad.filter);
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      return { ...pick, reason: `working the ${quad.name}` };
    }
    const { best, bestScore } = pickBestFromHeat(board, ships);
    if (best) return { ...best, reason: `${quad.name} is empty, using probability (score ${bestScore})` };
    const cell = pickRandomCell(board);
    return { ...cell, reason: `${quad.name} is empty, firing randomly` };
  }

  // Center
  if (/center|middle/.test(text)) {
    const candidates = filterAvailable(board, (r, c) => r >= 3 && r <= 6 && c >= 3 && c <= 6);
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      return { ...pick, reason: 'working the center' };
    }
    const { best, bestScore } = pickBestFromHeat(board, ships);
    if (best) return { ...best, reason: `center is empty, using probability (score ${bestScore})` };
    const cell = pickRandomCell(board);
    return { ...cell, reason: 'center is empty, firing randomly' };
  }

  // Random / anywhere
  if (/random|anywhere|whatever|surprise/.test(text)) {
    const cell = pickRandomCell(board);
    return { ...cell, reason: 'firing at random' };
  }

  // Default: highest probability
  const { best, bestScore } = pickBestFromHeat(board, ships);
  if (best) return { ...best, reason: `highest-probability cell (score ${bestScore})` };
  const cell = pickRandomCell(board);
  return { ...cell, reason: 'falling back to random' };
}

function handleDelegatedFire() {
  if (!state || state.gameOver || state.turn !== 'player' || state.mode !== 'delegated') return;
  const order = orderInput.value.trim();
  if (!order) {
    updateStatus('Type an order for the gunner first.');
    return;
  }
  const pick = gunnerPick(order);
  if (!pick) {
    updateStatus('Gunner could not interpret that order.');
    return;
  }
  gunnerResponse.textContent = `Aye aye, ${pick.reason}. Firing at ${coordLabel(pick.r, pick.c)}.`;
  orderInput.value = '';
  executePlayerFire('Gunner', pick.r, pick.c, pick.reason);
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
  delegatedControls.style.display = state.mode === 'delegated' ? 'flex' : 'none';
  gunnerResponse.textContent = '';
  if (state.mode === 'delegated') {
    updateStatus('Delegated mode. Type an order for the gunner and press Fire.');
    orderInput.focus();
  } else {
    updateStatus('Manual mode. Click a cell on the enemy board to fire.');
  }
});

orderFireBtn.addEventListener('click', handleDelegatedFire);
orderInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleDelegatedFire();
});

initGame();
