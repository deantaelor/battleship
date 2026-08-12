const BOARD_SIZE = 10;
const SHIPS = [
  { id: 'carrier', name: 'Carrier', theme: 'The Vercelerator', size: 5, tagline: 'top-3 attainment, 12 quarters running' },
  { id: 'battleship', name: 'Battleship', theme: 'The Cipher', size: 4, tagline: 'internal competitive-intel app, built in v0' },
  { id: 'cruiser', name: 'Cruiser', theme: 'The Enablement Play', size: 3, tagline: 'opened the AI/Data buyer segment' },
  { id: 'submarine', name: 'Submarine', theme: 'The 228%', size: 3, tagline: 'single-month attainment record' },
  { id: 'destroyer', name: 'Destroyer', theme: 'Houston-to-Austin', size: 2, tagline: 'relocating for the hub' }
];

const STATUS = {
  EMPTY: 'empty',
  SHIP: 'ship',
  HIT: 'hit',
  MISS: 'miss',
  SUNK: 'sunk'
};

let state = null;
let lastReplay = null;
let prng = null;

function cyrb53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return h1 >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setSeed(seed) {
  const numeric = typeof seed === 'number' ? seed >>> 0 : cyrb53(String(seed));
  prng = mulberry32(numeric);
}

function rng() {
  if (!prng) setSeed(Math.floor(Math.random() * 0xffffffff));
  return prng();
}

function generateSeed() {
  return Math.random().toString(36).slice(2, 10);
}

const playerBoardEl = document.getElementById('player-board');
const enemyBoardEl = document.getElementById('enemy-board');
const statusEl = document.getElementById('status');
const logListEl = document.getElementById('log-list');
const difficultySelect = document.getElementById('difficulty-select');
const commandPanel = document.getElementById('command-panel');
const orderInput = document.getElementById('order-input');
const actionBtn = document.getElementById('action-btn');
const approveBtn = document.getElementById('approve-btn');
const abortBtn = document.getElementById('abort-btn');
const proposalEl = document.getElementById('proposal');
const reportEl = document.getElementById('report');
const reportBody = document.getElementById('report-body');
const autonomyTabs = document.querySelectorAll('[data-autonomy]');

function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => ({ status: STATUS.EMPTY, shipId: null }))
  );
}

function cloneShips() {
  return SHIPS.map(s => ({ ...s, hits: 0, sunk: false, cells: [] }));
}

function deepCloneShips(ships) {
  return ships.map(s => ({ ...s, cells: s.cells.map(c => ({ ...c })) }));
}

function snapshotShips(ships) {
  return ships.map(s => ({ ...s, hits: 0, sunk: false, cells: s.cells.map(c => ({ ...c })) }));
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
      const horizontal = rng() < 0.5;
      const row = Math.floor(rng() * BOARD_SIZE);
      const col = Math.floor(rng() * BOARD_SIZE);
      if (canPlace(board, ship, row, col, horizontal)) {
        placeShip(board, ship, row, col, horizontal);
        placed = true;
      }
    }
    if (!placed) throw new Error(`Could not place ${ship.name}`);
  }
}

function initGame() {
  const seed = generateSeed();
  setSeed(seed);

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
    processing: false,
    gameOver: false,
    autonomy: state ? state.autonomy : 'manual',
    difficulty: difficultySelect.value,
    heat: null,
    heatMax: 0,
    proposal: null,
    autonomousActive: false,
    abortAutonomous: false,
    autonomousOrder: null,
    shotCount: 0,
    seed,
    history: []
  };

  logListEl.innerHTML = '';
  proposalEl.textContent = '';
  orderInput.value = '';
  reportEl.style.display = 'none';

  updateAutonomyUI();
  log('New game started.');
  updateStatusForAutonomy();
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
        const opacity = 0.15 + factor * 0.5;
        cell.classList.add('heat');
        cell.style.setProperty('--heat-color', 'var(--heat)');
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function logTypewriter(msg, listEl = logListEl, charDelay = 30) {
  const li = document.createElement('li');
  listEl.prepend(li);
  return new Promise(resolve => {
    let i = 0;
    function step() {
      if (i < msg.length) {
        li.textContent += msg[i];
        i++;
        if (getComputedStyle(listEl).overflowY === 'auto' || getComputedStyle(listEl).overflowY === 'scroll') {
          listEl.scrollTop = 0;
        } else {
          li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        setTimeout(step, charDelay);
      } else {
        resolve();
      }
    }
    step();
  });
}

async function cinematicSink(msg, {
  boardsEl = document.querySelector('.boards'),
  logEl = logListEl,
  charDelay = 30,
  desaturateMs = 800,
  beatMs = 1500
} = {}) {
  if (boardsEl) boardsEl.classList.add('desaturated');
  const typePromise = logTypewriter(msg, logEl, charDelay);
  setTimeout(() => {
    if (boardsEl) boardsEl.classList.remove('desaturated');
  }, desaturateMs);
  await typePromise;
  await delay(beatMs);
}

function updateStatus(msg) {
  statusEl.textContent = msg;
}

function updateStatusForAutonomy() {
  if (state.autonomy === 'manual') {
    updateStatus('Manual mode: click a cell on the enemy board to fire.');
  } else if (state.autonomy === 'advised') {
    updateStatus('Advised mode: give an order, review the gunner’s proposal, then approve or override by clicking a cell.');
  } else {
    updateStatus('Autonomous mode: give an order and the gunner will fire repeatedly until it’s done or you stand it down.');
  }
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
  finishAutonomous();
  updateStatus(`Game over — ${winner === 'Player' ? 'you' : 'the enemy'} won.`);
  log(`Game over — ${winner === 'Player' ? 'you' : 'the enemy'} won.`);
  render();
  saveReplay(winner);
  setTimeout(() => showReplayPrompt(winner), 400);
}

function saveReplay(winner) {
  lastReplay = {
    winner,
    shotCount: state.shotCount,
    history: state.history.map(h => ({ ...h })),
    playerShips: deepCloneShips(state.playerShips),
    enemyShips: deepCloneShips(state.enemyShips),
    seed: state.seed,
    difficulty: state.difficulty
  };
}

function coordToCode(r, c) {
  return String.fromCharCode(65 + r) + c.toString();
}

function codeToCoord(code) {
  if (code.length < 2) return null;
  const r = code.toUpperCase().charCodeAt(0) - 65;
  const c = parseInt(code[1], 10);
  if (r < 0 || r >= BOARD_SIZE || isNaN(c) || c < 0 || c >= BOARD_SIZE) return null;
  return { r, c };
}

function encodeMoves(history) {
  return history
    .filter(h => h.actor === 'player')
    .map(h => coordToCode(h.r, h.c))
    .join('');
}

function decodeMoves(str) {
  const moves = [];
  for (let i = 0; i < str.length; i += 2) {
    const code = str.slice(i, i + 2);
    const coord = codeToCoord(code);
    if (coord) moves.push(coord);
  }
  return moves;
}

function simulateGame(seed, moves, difficulty) {
  setSeed(seed);
  const simState = {
    playerBoard: createEmptyBoard(),
    enemyBoard: createEmptyBoard(),
    playerShips: cloneShips(),
    enemyShips: cloneShips(),
    difficulty,
    shotCount: 0,
    history: []
  };

  placeShipsRandomly(simState.playerBoard, simState.playerShips);
  placeShipsRandomly(simState.enemyBoard, simState.enemyShips);

  const prevState = state;
  state = simState;

  let winner = null;
  for (const move of moves) {
    if (winner) break;

    simState.shotCount++;
    const pRes = fire(simState.enemyBoard, simState.enemyShips, move.r, move.c);
    if (pRes.alreadyFired) continue;
    if (pRes.hit && pRes.sunk) pRes.ship.sunkAt = simState.shotCount;
    simState.history.push({
      actor: 'player',
      r: move.r,
      c: move.c,
      result: pRes.hit ? (pRes.sunk ? 'sunk' : 'hit') : 'miss',
      shipName: pRes.ship ? pRes.ship.name : null,
      shipId: pRes.ship ? pRes.ship.id : null,
      reason: null,
      shotNumber: simState.shotCount
    });
    if (allSunk(simState.enemyShips)) {
      winner = 'Player';
      break;
    }

    const pick = chooseEnemyShot();
    if (pick) {
      simState.shotCount++;
      const eRes = fire(simState.playerBoard, simState.playerShips, pick.r, pick.c);
      if (eRes.hit && eRes.sunk) eRes.ship.sunkAt = simState.shotCount;
      simState.history.push({
        actor: 'enemy',
        r: pick.r,
        c: pick.c,
        result: eRes.hit ? (eRes.sunk ? 'sunk' : 'hit') : 'miss',
        shipName: eRes.ship ? eRes.ship.name : null,
        shipId: eRes.ship ? eRes.ship.id : null,
        reason: pick.reason,
        heatValue: pick.heatValue,
        shotNumber: simState.shotCount
      });
      if (allSunk(simState.playerShips)) {
        winner = 'Enemy';
        break;
      }
    }
  }

  state = prevState;

  return {
    winner,
    shotCount: simState.shotCount,
    history: simState.history,
    playerShips: deepCloneShips(simState.playerShips),
    enemyShips: deepCloneShips(simState.enemyShips),
    seed,
    difficulty
  };
}

function buildShareUrl(replay = lastReplay) {
  if (!replay) return null;
  const moves = replay.history ? encodeMoves(replay.history) : '';
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('s', replay.seed || '');
  url.searchParams.set('m', moves);
  if (replay.difficulty) url.searchParams.set('d', replay.difficulty);
  return url.toString();
}

async function copyToClipboard(text) {
  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))
    ]);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (err) {
      document.body.removeChild(ta);
      return false;
    }
  }
}

async function shareReplay() {
  const url = buildShareUrl();
  if (!url) {
    updateStatus('No replay available to share.');
    return;
  }
  const copied = await copyToClipboard(url);
  if (copied) {
    updateStatus('Replay link copied to clipboard.');
  } else {
    window.prompt('Copy this replay link:', url);
  }
}

function loadReplayFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const seed = params.get('s');
  const movesParam = params.get('m');
  if (!seed || !movesParam) return false;
  const moves = decodeMoves(movesParam);
  if (moves.length === 0) return false;
  const difficulty = params.get('d') || 'random';
  try {
    lastReplay = simulateGame(seed, moves, difficulty);
    if (!lastReplay.winner) {
      if (allSunk(lastReplay.enemyShips)) lastReplay.winner = 'Player';
      else if (allSunk(lastReplay.playerShips)) lastReplay.winner = 'Enemy';
      else lastReplay.winner = 'Player';
    }
    const hero = document.getElementById('hero');
    if (hero) hero.style.display = 'none';
    startReplay();
    return true;
  } catch (e) {
    console.error('Failed to load replay from URL:', e);
    return false;
  }
}

async function fireAtEnemy(shooter, r, c, reason) {
  if (state.gameOver || state.turn !== 'player' || state.processing) return false;
  state.processing = true;

  try {
    const result = fire(state.enemyBoard, state.enemyShips, r, c);
    if (result.alreadyFired) {
      updateStatus(`${shooter} already fired there. Pick another cell.`);
      return false;
    }

    state.shotCount++;
    state.history.push({
      actor: 'player',
      r,
      c,
      result: result.hit ? (result.sunk ? 'sunk' : 'hit') : 'miss',
      shipName: result.ship ? result.ship.name : null,
      shipId: result.ship ? result.ship.id : null,
      reason,
      shotNumber: state.shotCount
    });

    const verb = shooter === 'You' ? 'fire' : 'fires';
    let msg = `${shooter} ${verb} at ${coordLabel(r, c)}`;
    let statusMsg;
    AudioSys.playCannon();
    if (result.hit && result.sunk) {
      result.ship.sunkAt = state.shotCount;
      msg += ` — sunk ${result.ship.theme} — ${result.ship.tagline}`;
      statusMsg = `${shooter} sunk ${result.ship.theme}`;
      AudioSys.playSunk();
    } else if (result.hit) {
      msg += ` — hit.`;
      statusMsg = `${shooter} hit!`;
    } else {
      msg += ` — miss.`;
      statusMsg = `${shooter} missed.`;
    }
    if (reason) msg += ` (${reason})`;
    updateStatus(statusMsg);

    state.proposal = null;
    proposalEl.textContent = '';
    approveBtn.style.display = 'none';

    updateHeatmap();
    render();

    if (result.hit && result.sunk) {
      await cinematicSink(msg);
      if (allSunk(state.enemyShips)) {
        endGame('Player');
        return true;
      }
      state.turn = 'enemy';
      enemyTurn();
      return true;
    }

    log(msg);

    if (allSunk(state.enemyShips)) {
      endGame('Player');
      return true;
    }

    state.turn = 'enemy';
    setTimeout(enemyTurn, 600);
    return true;
  } finally {
    state.processing = false;
  }
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
  return cells[Math.floor(rng() * cells.length)];
}

function manhattan(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

function directionFrom(from, to) {
  if (to.r < from.r) return 'north';
  if (to.r > from.r) return 'south';
  if (to.c < from.c) return 'west';
  return 'east';
}

function regionName(r, c) {
  const v = r < 3 ? 'top' : r < 7 ? 'center' : 'bottom';
  const h = c < 3 ? 'left' : c < 7 ? 'middle' : 'right';
  if (v === 'center' && h === 'middle') return 'center';
  return `${v}-${h}`;
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

function chooseEnemyShot() {
  const { playerBoard, playerShips, difficulty } = state;
  const available = getAvailableCells(playerBoard);
  if (available.length === 0) return null;

  const heat = computeProbabilityHeat(playerBoard, playerShips);

  if (difficulty === 'random') {
    const cell = pickRandomCell(playerBoard);
    return { ...cell, reason: "no pattern yet, so I'm spreading fire randomly", heatValue: heat[cell.r][cell.c] };
  }

  const unsunkHits = getUnsunkHits(playerBoard);

  if (difficulty === 'hunt') {
    if (unsunkHits.length > 0) {
      const candidates = [];
      for (const hit of unsunkHits) {
        for (const cell of getAdjacentCells(hit.r, hit.c)) {
          if (isUnknown(playerBoard[cell.r][cell.c])) candidates.push({ cell, hit });
        }
      }
      if (candidates.length > 0) {
        const { cell, hit } = candidates[Math.floor(rng() * candidates.length)];
        const dir = directionFrom(hit, cell);
        return { ...cell, reason: `working outward from the hit at ${coordLabel(hit.r, hit.c)} toward the ${dir}`, heatValue: heat[cell.r][cell.c] };
      }
    }
    const cell = pickRandomCell(playerBoard);
    return { ...cell, reason: "no wounded ships, so I'm choosing a spread-out random shot", heatValue: heat[cell.r][cell.c] };
  }

  if (difficulty === 'probability') {
    let best = null, bestScore = -1;
    for (const cell of available) {
      if (heat[cell.r][cell.c] > bestScore) {
        bestScore = heat[cell.r][cell.c];
        best = cell;
      }
    }

    let reason;
    if (unsunkHits.length > 0) {
      const nearest = unsunkHits.reduce((a, b) => (manhattan(a, best) < manhattan(b, best) ? a : b));
      if (manhattan(nearest, best) <= 2) {
        reason = `extending the wounded ship at ${coordLabel(nearest.r, nearest.c)} through ${coordLabel(best.r, best.c)}`;
      } else {
        reason = `the area around ${coordLabel(best.r, best.c)} has the best fit for the remaining ships, while the hit at ${coordLabel(nearest.r, nearest.c)} is still open`;
      }
    } else {
      reason = `the ${regionName(best.r, best.c)} has the most room for the remaining ships; ${coordLabel(best.r, best.c)} is my best blind shot`;
    }
    return { ...best, reason, heatValue: bestScore };
  }

  const cell = pickRandomCell(playerBoard);
  return { ...cell, reason: 'falling back to a random shot', heatValue: heat[cell.r][cell.c] };
}

async function enemyTurn() {
  if (state.gameOver) return;
  if (state.autonomousActive && state.abortAutonomous) {
    finishAutonomous();
    return;
  }

  const shot = chooseEnemyShot();
  if (!shot) return;

  const { r, c, reason, heatValue } = shot;
  const result = fire(state.playerBoard, state.playerShips, r, c);
  state.shotCount++;
  state.history.push({
    actor: 'enemy',
    r,
    c,
    result: result.hit ? (result.sunk ? 'sunk' : 'hit') : 'miss',
    shipName: result.ship ? result.ship.name : null,
    shipId: result.ship ? result.ship.id : null,
    reason,
    shotNumber: state.shotCount,
    heatValue
  });

  updateHeatmap();
  render();

  const msgBase = `Enemy fires at ${coordLabel(r, c)}`;
  let msg;
  AudioSys.playCannon();
  if (result.hit && result.sunk) {
    msg = `${msgBase} — hit and sunk your ${result.ship.name}! (${reason})`;
    updateStatus(`Enemy sank your ${result.ship.name}!`);
    AudioSys.playSunk();
  } else if (result.hit) {
    msg = `${msgBase} — hit. (${reason})`;
    updateStatus('Enemy hit!');
  } else {
    msg = `${msgBase} — miss. (${reason})`;
    updateStatus('Enemy missed.');
  }

  if (result.hit && result.sunk) {
    await cinematicSink(msg);
    if (allSunk(state.playerShips)) {
      endGame('Enemy');
      return;
    }
    state.turn = 'player';
      if (state.autonomousActive && !state.abortAutonomous) {
      autonomousStep();
    }
    return;
  }

  log(msg);

  if (allSunk(state.playerShips)) {
    endGame('Enemy');
    return;
  }

  state.turn = 'player';

  if (state.autonomousActive && !state.abortAutonomous) {
    setTimeout(autonomousStep, 600);
  }
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
  if (/top\s*right|upper\s*right/.test(text)) return { name: 'top-right', filter: (r, c) => r < 5 && c >= 5 };
  if (/top\s*left|upper\s*left/.test(text)) return { name: 'top-left', filter: (r, c) => r < 5 && c < 5 };
  if (/bottom\s*right|lower\s*right/.test(text)) return { name: 'bottom-right', filter: (r, c) => r >= 5 && c >= 5 };
  if (/bottom\s*left|lower\s*left/.test(text)) return { name: 'bottom-left', filter: (r, c) => r >= 5 && c < 5 };
  if (/\btop\b/.test(text)) return { name: 'top', filter: (r, c) => r < 5 };
  if (/\bbottom\b/.test(text)) return { name: 'bottom', filter: (r, c) => r >= 5 };
  if (/\bleft\b/.test(text)) return { name: 'left', filter: (r, c) => c < 5 };
  if (/\bright\b/.test(text)) return { name: 'right', filter: (r, c) => c >= 5 };
  return null;
}

function gunnerReason(order, target, isOverride) {
  const board = state.enemyBoard;
  const ships = state.enemyShips;
  const text = order.toLowerCase();
  const label = coordLabel(target.r, target.c);
  const overridePrefix = isOverride ? 'using your override at ' : '';
  const overrideSuffix = isOverride ? ' as you directed' : '';

  if (/finish|wound|wounded|hurt|hurting|sink|sinking|kill|killing/.test(text)) {
    const hits = getUnsunkHits(board);
    const hit = hits.find(h => getAdjacentCells(h.r, h.c).some(c => c.r === target.r && c.c === target.c));
    if (hit) {
      if (isOverride) return `${overridePrefix}${label} to finish the ship wounded at ${coordLabel(hit.r, hit.c)}`;
      return `the ship hit at ${coordLabel(hit.r, hit.c)} is still open; ${label} should finish it`;
    }
    if (hits.length > 0) {
      if (isOverride) return `${overridePrefix}${label} to keep after the wounded ship${overrideSuffix}`;
      return `no open cells next to the wounded ship, so ${label} is the best next probe`;
    }
    if (isOverride) return `${overridePrefix}${label} to search for a wounded ship${overrideSuffix}`;
    return `${label} is the best place to look for an unfinished ship`;
  }

  const shipMatch = text.match(/\b(carrier|battleship|cruiser|submarine|destroyer)\b/);
  if (shipMatch) {
    const ship = findShip(ships, shipMatch[1]);
    if (ship && ship.sunk) {
      if (isOverride) return `${overridePrefix}${label}; the ${ship.name} is already sunk, so this is your choice${overrideSuffix}`;
      return `the ${ship.name} is already sunk; ${label} is the best remaining shot`;
    }
    if (isOverride) return `${overridePrefix}${label} still fits the ${ship.name}'s possible layout${overrideSuffix}`;
    return `the ${ship.name} needs ${ship.size} straight cells; ${label} is the best surviving fit`;
  }

  const coord = parseCoordinate(text);
  if (coord && /around|near|close|adjacent|next to/.test(text)) {
    if (isOverride) return `${overridePrefix}${label} while searching around ${coordLabel(coord.r, coord.c)}${overrideSuffix}`;
    return `searching around ${coordLabel(coord.r, coord.c)}; ${label} is the best open neighbor`;
  }

  const quad = parseQuadrant(text);
  if (quad && quad.filter(target.r, target.c)) {
    if (isOverride) return `${overridePrefix}${label} in the ${quad.name} quadrant${overrideSuffix}`;
    return `working the ${quad.name} quarter; ${label} is the best untested cell there`;
  }

  if (/center|middle/.test(text)) {
    if (isOverride) return `${overridePrefix}${label} in the center${overrideSuffix}`;
    return `the center still has the most room; ${label} is the best central probe`;
  }

  if (/random|anywhere|whatever/.test(text)) {
    if (isOverride) return `${overridePrefix}${label} at random${overrideSuffix}`;
    return `spreading random fire to ${label}`;
  }

  const heat = computeProbabilityHeat(board, ships);
  const max = Math.max(1, ...heat.flat());
  const score = heat[target.r][target.c];
  if (score === max && max > 0) {
    if (isOverride) return `${overridePrefix}${label} — it matches the highest-probability cell I had in mind${overrideSuffix}`;
    return `the area around ${label} has the best chance of hiding a remaining ship`;
  }
  if (score > 0) {
    if (isOverride) return `${overridePrefix}${label}; the density there is still solid${overrideSuffix}`;
    return `the density around ${label} is still promising`;
  }
  if (isOverride) return `${overridePrefix}${label} as your choice${overrideSuffix}`;
  return `no strong signal, so I'm trying ${label}`;
}

function gunnerPick(order) {
  const board = state.enemyBoard;
  const ships = state.enemyShips;
  const text = order.toLowerCase();

  if (/finish|wound|wounded|hurt|hurting|sink|sinking|kill|killing/.test(text)) {
    const hits = getUnsunkHits(board);
    if (hits.length > 0) {
      const candidates = [];
      for (const hit of hits) {
        for (const cell of getAdjacentCells(hit.r, hit.c)) {
          if (isUnknown(board[cell.r][cell.c])) candidates.push({ cell, hit });
        }
      }
      if (candidates.length > 0) {
        const { cell, hit } = candidates[Math.floor(rng() * candidates.length)];
        return { ...cell, reason: `the ship hit at ${coordLabel(hit.r, hit.c)} is still open; ${coordLabel(cell.r, cell.c)} should finish it` };
      }
    }
    const { best } = pickBestFromHeat(board, ships);
    if (best) return { ...best, reason: `no open cells next to a wounded ship, so ${coordLabel(best.r, best.c)} is the best fallback` };
    const cell = pickRandomCell(board);
    return { ...cell, reason: `no wounded ships and no strong signal; firing at ${coordLabel(cell.r, cell.c)} randomly` };
  }

  const shipMatch = text.match(/\b(carrier|battleship|cruiser|submarine|destroyer)\b/);
  if (shipMatch) {
    const ship = findShip(ships, shipMatch[1]);
    if (ship.sunk) {
      const { best } = pickBestFromHeat(board, ships);
      if (best) return { ...best, reason: `the ${ship.name} is already sunk; ${coordLabel(best.r, best.c)} is the best fallback` };
      const cell = pickRandomCell(board);
      return { ...cell, reason: `the ${ship.name} is sunk; firing randomly at ${coordLabel(cell.r, cell.c)}` };
    }
    const heat = computeShipHeat(board, ship);
    let best = null, bestScore = -1;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!isUnknown(board[r][c])) continue;
        if (heat[r][c] > bestScore) {
          bestScore = heat[r][c];
          best = { r, c };
        }
      }
    }
    if (best) return { ...best, reason: `the ${ship.name} needs ${ship.size} straight cells; ${coordLabel(best.r, best.c)} is the best surviving fit` };
    const cell = pickRandomCell(board);
    return { ...cell, reason: `no place left for the ${ship.name}; firing randomly at ${coordLabel(cell.r, cell.c)}` };
  }

  const coord = parseCoordinate(text);
  if (coord && /around|near|close|adjacent|next to/.test(text)) {
    const candidates = getAdjacentCells(coord.r, coord.c).filter(cell => isUnknown(board[cell.r][cell.c]));
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(rng() * candidates.length)];
      return { ...pick, reason: `searching around ${coordLabel(coord.r, coord.c)}; ${coordLabel(pick.r, pick.c)} is the best open neighbor` };
    }
    const { best } = pickBestFromHeat(board, ships);
    if (best) return { ...best, reason: `no open cells next to ${coordLabel(coord.r, coord.c)}; ${coordLabel(best.r, best.c)} is the best fallback` };
    const cell = pickRandomCell(board);
    return { ...cell, reason: `no open neighbors near ${coordLabel(coord.r, coord.c)}` };
  }

  const quad = parseQuadrant(text);
  if (quad) {
    const candidates = filterAvailable(board, quad.filter);
    if (candidates.length > 0) {
      const { best } = pickBestInFilter(board, ships, quad.filter);
      if (best) return { ...best, reason: `working the ${quad.name} quarter; ${coordLabel(best.r, best.c)} is the best untested cell there` };
      const pick = candidates[Math.floor(rng() * candidates.length)];
      return { ...pick, reason: `working the ${quad.name} quarter; ${coordLabel(pick.r, pick.c)} is open` };
    }
    const { best } = pickBestFromHeat(board, ships);
    if (best) return { ...best, reason: `the ${quad.name} quarter is exhausted; ${coordLabel(best.r, best.c)} is the best fallback` };
    const cell = pickRandomCell(board);
    return { ...cell, reason: `${quad.name} quarter is empty; firing randomly` };
  }

  if (/center|middle/.test(text)) {
    const candidates = filterAvailable(board, (r, c) => r >= 3 && r <= 6 && c >= 3 && c <= 6);
    if (candidates.length > 0) {
      const { best } = pickBestInFilter(board, ships, (r, c) => r >= 3 && r <= 6 && c >= 3 && c <= 6);
      if (best) return { ...best, reason: `the center still has the most room; ${coordLabel(best.r, best.c)} is the best central probe` };
      const pick = candidates[Math.floor(rng() * candidates.length)];
      return { ...pick, reason: `probing the center at ${coordLabel(pick.r, pick.c)}` };
    }
    const { best } = pickBestFromHeat(board, ships);
    if (best) return { ...best, reason: `the center is exhausted; ${coordLabel(best.r, best.c)} is the best fallback` };
    const cell = pickRandomCell(board);
    return { ...cell, reason: 'center is empty; firing randomly' };
  }

  if (/random|anywhere|whatever/.test(text)) {
    const cell = pickRandomCell(board);
    return { ...cell, reason: `spreading random fire to ${coordLabel(cell.r, cell.c)}` };
  }

  const { best, bestScore } = pickBestFromHeat(board, ships);
  if (best) return { ...best, reason: `the area around ${coordLabel(best.r, best.c)} has the best chance of hiding a remaining ship` };
  const cell = pickRandomCell(board);
  return { ...cell, reason: `no strong signal; firing at ${coordLabel(cell.r, cell.c)}` };
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

function pickBestInFilter(board, ships, filter) {
  const heat = computeProbabilityHeat(board, ships);
  let best = null, bestScore = -1;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!isUnknown(board[r][c])) continue;
      if (!filter(r, c)) continue;
      if (heat[r][c] > bestScore) {
        bestScore = heat[r][c];
        best = { r, c };
      }
    }
  }
  return { best, bestScore };
}

function planAdvised() {
  if (state.gameOver || state.turn !== 'player' || state.autonomy !== 'advised') return;
  const order = orderInput.value.trim();
  if (!order) {
    updateStatus('Type an order for the gunner first.');
    return;
  }
  const pick = gunnerPick(order);
  if (!pick) {
    updateStatus('Gunner could not find a target.');
    return;
  }
  state.proposal = pick;
  proposalEl.textContent = `Gunner proposes firing at ${coordLabel(pick.r, pick.c)}. “${pick.reason}” Click another cell to override, or Fire to approve.`;
  approveBtn.style.display = 'inline-block';
  updateStatus('Proposal ready. Approve or override.');
}

function startAutonomous() {
  if (state.gameOver || state.turn !== 'player' || state.autonomy !== 'autonomous') return;
  const order = orderInput.value.trim();
  if (!order) {
    updateStatus('Type an order for the gunner first.');
    return;
  }
  state.autonomousActive = true;
  state.abortAutonomous = false;
  state.autonomousOrder = order;
  updateAutonomyUI();
  log(`Gunner: “Engaging on order: ${order}”`);
  autonomousStep();
}

async function autonomousStep() {
  if (state.gameOver || state.abortAutonomous || !state.autonomousActive) {
    finishAutonomous();
    return;
  }
  const pick = gunnerPick(state.autonomousOrder);
  if (!pick) {
    log('Gunner: “Order complete. No valid targets remain.”');
    updateStatus('Gunner reports the order is complete.');
    finishAutonomous();
    return;
  }
  await fireAtEnemy('Gunner', pick.r, pick.c, pick.reason);
}

function finishAutonomous() {
  state.autonomousActive = false;
  state.autonomousOrder = null;
  state.abortAutonomous = false;
  updateAutonomyUI();
}

function updateAutonomyUI() {
  autonomyTabs.forEach(btn => {
    const active = btn.dataset.autonomy === state.autonomy;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active);
  });

  if (state.autonomy === 'manual') {
    commandPanel.style.display = 'none';
    approveBtn.style.display = 'none';
    abortBtn.style.display = 'none';
    proposalEl.textContent = '';
  } else if (state.autonomy === 'advised') {
    commandPanel.style.display = 'flex';
    actionBtn.textContent = 'Plan';
    abortBtn.style.display = 'none';
    if (!state.proposal) approveBtn.style.display = 'none';
  } else {
    commandPanel.style.display = 'flex';
    actionBtn.textContent = state.autonomousActive ? 'Engaged' : 'Engage';
    actionBtn.disabled = state.autonomousActive;
    abortBtn.style.display = state.autonomousActive ? 'inline-block' : 'none';
    approveBtn.style.display = 'none';
    proposalEl.textContent = '';
  }

  if (state.gameOver) {
    actionBtn.disabled = true;
    approveBtn.disabled = true;
    abortBtn.disabled = true;
  } else {
    actionBtn.disabled = false;
    approveBtn.disabled = false;
    abortBtn.disabled = false;
  }
}

function updateProposalWithOverride(r, c) {
  if (!state.proposal) return;
  const order = orderInput.value.trim() || state.autonomousOrder || '';
  const reason = gunnerReason(order, { r, c }, true);
  state.proposal = { r, c, reason };
  proposalEl.textContent = `Override accepted: firing at ${coordLabel(r, c)}. “${reason}” Click Fire to confirm or another cell to change.`;
  approveBtn.style.display = 'inline-block';
}

enemyBoardEl.addEventListener('click', e => {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  const r = parseInt(cell.dataset.r, 10);
  const c = parseInt(cell.dataset.c, 10);

  if (state.gameOver || state.turn !== 'player') return;

  if (state.autonomy === 'manual') {
    fireAtEnemy('You', r, c, null);
  } else if (state.autonomy === 'advised') {
    if (!state.proposal) {
      updateStatus('Plan a shot first by typing an order and clicking Plan.');
      return;
    }
    updateProposalWithOverride(r, c);
  }
});

document.getElementById('new-game').addEventListener('click', initGame);

autonomyTabs.forEach(btn => {
  btn.addEventListener('click', () => {
    if (state.autonomousActive) return;
    state.autonomy = btn.dataset.autonomy;
    state.proposal = null;
    proposalEl.textContent = '';
    updateAutonomyUI();
    updateStatusForAutonomy();
  });
});

difficultySelect.addEventListener('change', e => {
  if (!state) return;
  state.difficulty = e.target.value;
  updateHeatmap();
  render();
});

actionBtn.addEventListener('click', () => {
  if (state.autonomy === 'advised') planAdvised();
  else if (state.autonomy === 'autonomous') startAutonomous();
});

approveBtn.addEventListener('click', () => {
  if (!state.proposal) return;
  fireAtEnemy('Gunner', state.proposal.r, state.proposal.c, state.proposal.reason);
});

abortBtn.addEventListener('click', () => {
  state.abortAutonomous = true;
  updateStatus('Standing down...');
});

orderInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (state.autonomy === 'advised') planAdvised();
    else if (state.autonomy === 'autonomous') startAutonomous();
  }
});

reportEl.addEventListener('click', e => {
  if (e.target.matches('#report-close')) {
    reportEl.style.display = 'none';
  } else if (e.target.matches('#report-watch-again')) {
    startReplay();
  } else if (e.target.matches('#report-share')) {
    shareReplay();
  }
});

function showReplayPrompt(winner) {
  const promptWinner = document.getElementById('replay-prompt-winner');
  if (promptWinner) {
    promptWinner.textContent = `${winner === 'Player' ? 'You won' : 'The enemy won'}.`;
  }
  document.getElementById('replay-prompt').style.display = 'flex';
}

function showReport(winner, data = state) {
  const playerShots = data.history.filter(h => h.actor === 'player');
  const enemyShots = data.history.filter(h => h.actor === 'enemy');
  const playerHits = playerShots.filter(h => h.result === 'hit' || h.result === 'sunk').length;
  const enemyHits = enemyShots.filter(h => h.result === 'hit' || h.result === 'sunk').length;
  const playerSunk = data.enemyShips.filter(s => s.sunk).length;
  const enemySunk = data.playerShips.filter(s => s.sunk).length;

  const turnPairs = Math.floor(data.shotCount / 2);

  const enemyMisses = enemyShots.length - enemyHits;
  const wastedShots = enemyShots.filter(h => h.result === 'miss' && h.heatValue === 0).length;
  const drySpell = longestDrySpell(enemyShots);

  const insight = buildInsight(enemyShots, data.playerShips, wastedShots, drySpell);
  const longestEnemy = findLongestEnemyShip(data.enemyShips);

  reportBody.innerHTML = `
    <p class="report-winner">${winner === 'Player' ? 'You won' : 'The enemy won'} in ${turnPairs} turn${turnPairs === 1 ? '' : 's'}.</p>
    <div class="report-columns">
      <div>
        <h3>Your side</h3>
        <p>Shots: ${playerShots.length}</p>
        <p>Hits: ${playerHits}</p>
        <p>Misses: ${playerShots.length - playerHits}</p>
        <p>Enemy ships sunk: ${playerSunk}/5</p>
      </div>
      <div>
        <h3>Enemy AI</h3>
        <p>Shots: ${enemyShots.length}</p>
        <p>Hits: ${enemyHits}</p>
        <p>Misses: ${enemyMisses}</p>
        <p>Your ships sunk: ${enemySunk}/5</p>
      </div>
    </div>
    <p>${insight}</p>
    ${winner === 'Player' ? `<p>${longestEnemy} held out the longest.</p>` : ''}
    <div class="report-actions">
      <button id="report-close" class="pill-btn primary">Close</button>
      <button id="report-share" class="pill-btn">Share replay</button>
      <button id="report-watch-again" class="pill-btn">Watch again</button>
    </div>
  `;
  reportEl.style.display = 'flex';
}

function findLongestEnemyShip(ships = state.enemyShips) {
  const fallback = ships.find(s => s.id === 'carrier');
  let longest = fallback;
  let latest = -1;
  for (const ship of ships) {
    if (ship.sunk && ship.sunkAt > latest) {
      latest = ship.sunkAt;
      longest = ship;
    }
  }
  const name = longest.theme;
  return name.startsWith('The') ? name : `The ${name}`;
}

function longestDrySpell(shots) {
  let max = 0, current = 0;
  for (const s of shots) {
    if (s.result === 'miss') current++;
    else {
      if (current > max) max = current;
      current = 0;
    }
  }
  if (current > max) max = current;
  return max;
}

function buildInsight(enemyShots, playerShips, wasted, drySpell) {
  const parts = [];

  if (enemyShots.length === 0) return 'No shots were fired.';

  const firstHit = enemyShots.find(s => s.result === 'hit' || s.result === 'sunk');
  if (firstHit) {
    const firstShip = firstHit.shipName ? `your ${firstHit.shipName}` : 'one of your ships';
    parts.push(`It first found ${firstShip} on shot ${firstHit.shotNumber}.`);
  } else {
    parts.push('It never found a hit.');
  }

  const shipEfforts = playerShips.map(ship => {
    const first = enemyShots.find(s => (s.result === 'hit' || s.result === 'sunk') && s.shipName === ship.name);
    const sunk = enemyShots.find(s => s.result === 'sunk' && s.shipName === ship.name);
    return { ship, first, sunk };
  }).filter(s => s.first && s.sunk);

  if (shipEfforts.length > 0) {
    const worst = shipEfforts.reduce((a, b) => {
      const aLen = enemyShots.indexOf(a.sunk) - enemyShots.indexOf(a.first);
      const bLen = enemyShots.indexOf(b.sunk) - enemyShots.indexOf(b.first);
      return aLen > bLen ? a : b;
    });
    const shotsToSink = enemyShots.indexOf(worst.sunk) - enemyShots.indexOf(worst.first) + 1;
    parts.push(`Its longest hunt was the ${worst.ship.name}, taking ${shotsToSink} shots from first hit to sink.`);
  }

  if (wasted > 0) parts.push(`It wasted ${wasted} shot${wasted === 1 ? '' : 's'} on cells that couldn't fit any remaining ship.`);
  if (drySpell > 4) parts.push(`Its longest dry spell was ${drySpell} misses.`);

  const accuracy = Math.round((enemyShots.filter(s => s.result !== 'miss').length / enemyShots.length) * 100);
  parts.push(`Overall accuracy: ${accuracy}%.`);

  return parts.join(' ');
}

const AudioSys = (function () {
  let ctx = null;
  let master = null;
  let muted = false;
  let running = false;

  function init() {
    if (ctx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      startOcean();
      scheduleSeagulls();
    } catch (e) {
      // audio is optional atmosphere
    }
  }

  function resume() {
    init();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    running = true;
  }

  function noiseBuffer(duration, filterFreq = null) {
    const sampleRate = ctx.sampleRate;
    const frames = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frames, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    if (filterFreq) {
      // compute filtered in-place using simple lowpass approximation
      let last = 0;
      const a = 1 - Math.exp(-2 * Math.PI * filterFreq / sampleRate);
      for (let i = 0; i < frames; i++) {
        last += a * (data[i] - last);
        data[i] = last;
      }
    }
    return buffer;
  }

  function startOcean() {
    if (!ctx) return;
    const buffer = noiseBuffer(8);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 220;

    const swell = ctx.createGain();
    swell.gain.value = 0.12;

    source.connect(lowpass);
    lowpass.connect(swell);
    swell.connect(master);
    source.start();

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain);
    lfoGain.connect(swell.gain);
    lfo.start();
  }

  function scheduleSeagulls() {
    if (!ctx) return;
    const next = () => 12000 + Math.random() * 25000;
    const loop = () => {
      playSeagull();
      setTimeout(loop, next());
    };
    setTimeout(loop, next());
  }

  function playSeagull() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1300, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    osc.frequency.setValueAtTime(1200, t + 0.22);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.42);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.018, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.55);
  }

  function playCannon() {
    if (!ctx || muted) return;
    resume();
    const t = ctx.currentTime;
    const buffer = noiseBuffer(0.35, 1200);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 350;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    source.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(master);
    source.start(t);
    source.stop(t + 0.35);

    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(90, t);
    thud.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.12, t);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    thud.connect(thudGain);
    thudGain.connect(master);
    thud.start(t);
    thud.stop(t + 0.42);
  }

  function playBell() {
    if (!ctx || muted) return;
    resume();
    const t = ctx.currentTime;
    const fundamental = 880;
    [1, 1.5, 2].forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = fundamental * ratio;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.06 / (i + 1), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 2.3);
    });
  }

  function playExplosion() {
    if (!ctx || muted) return;
    resume();
    const t = ctx.currentTime;
    const buffer = noiseBuffer(1.2, 600);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(600, t);
    lowpass.frequency.exponentialRampToValueAtTime(80, t + 0.9);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    source.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(master);
    source.start(t);
    source.stop(t + 1.2);
  }

  function playSunk() {
    playBell();
    setTimeout(() => playExplosion(), 120);
  }

  function setMuted(m) {
    muted = m;
    if (master) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(muted ? 0 : 0.35, ctx.currentTime, 0.05);
    }
  }

  return {
    resume,
    playCannon,
    playSunk,
    setMuted,
    get muted() { return muted; }
  };
})();

const muteToggle = document.getElementById('mute-toggle');
if (muteToggle) {
  muteToggle.addEventListener('click', () => {
    AudioSys.resume();
    const nowMuted = !AudioSys.muted;
    AudioSys.setMuted(nowMuted);
    muteToggle.textContent = nowMuted ? 'Sound off' : 'Sound on';
    muteToggle.setAttribute('aria-pressed', String(nowMuted));
    muteToggle.setAttribute('aria-label', nowMuted ? 'Sound is off' : 'Sound is on');
  });
}

document.body.addEventListener('pointerdown', () => AudioSys.resume(), { once: true });

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseBuildLog(md) {
  const entries = [];
  const blocks = md.split(/\n##\s+/).slice(1);
  for (const block of blocks) {
    const lines = block.split('\n');
    const title = lines[0].replace(/^\d+\.\s*/, '').trim();
    let symptom = '';
    let fix = '';
    let file = '';
    for (const line of lines) {
      const s = line.match(/^-\s*\*\*Symptom\*\*:\s*(.+)$/);
      if (s) symptom = s[1].trim();
      const f = line.match(/^-\s*\*\*Fix\*\*:\s*(.+)$/);
      if (f) fix = f[1].trim();
      const fl = line.match(/^-\s*\*\*File\*\*:\s*`?([^`]+)`?$/);
      if (fl) file = fl[1].trim();
    }
    if (title || symptom || fix) {
      entries.push({ title, symptom, fix, file });
    }
  }
  return entries;
}

function renderBuildLog(entries) {
  const list = document.getElementById('build-log-list');
  const total = document.getElementById('build-log-total');
  const count = document.getElementById('build-log-count');
  if (!list) return;
  list.innerHTML = '';
  entries.forEach(entry => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="bug-title">${escapeHtml(entry.title)}</span>
      <span class="bug-line">${escapeHtml(entry.symptom)}</span>
      <span class="bug-line">${escapeHtml(entry.fix)}</span>
      ${entry.file && entry.file.toLowerCase() !== 'n/a' ? `<span class="bug-file">${escapeHtml(entry.file)}</span>` : ''}
    `;
    list.appendChild(li);
  });
  if (total) total.textContent = entries.length;
  if (count) count.textContent = `${entries.length} bug${entries.length === 1 ? '' : 's'} caught`;
}

async function loadBuildLog() {
  try {
    const res = await fetch('BUGS.md');
    if (!res.ok) return;
    const md = await res.text();
    renderBuildLog(parseBuildLog(md));
  } catch (e) {
    // build log is optional
  }
}

const buildLog = document.getElementById('build-log');
const buildLogToggle = document.getElementById('build-log-toggle');
if (buildLog && buildLogToggle) {
  buildLogToggle.addEventListener('click', () => {
    buildLog.classList.toggle('open');
    const open = buildLog.classList.contains('open');
    buildLog.setAttribute('aria-expanded', String(open));
  });
}

function exportBuildLog() {
  if (buildLog) buildLog.classList.add('open');
  window.print();
}

const buildLogExport = document.getElementById('build-log-export');
if (buildLogExport) {
  buildLogExport.addEventListener('click', exportBuildLog);
}

function initTilt() {
  const stage = document.getElementById('stage');
  const inner = stage ? stage.querySelector('.stage-inner') : null;
  if (!stage || !inner) return;

  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let raf = null;
  let hovering = false;

  function animate() {
    currentX += (targetX - currentX) * 0.12;
    currentY += (targetY - currentY) * 0.12;
    inner.style.transform = `rotateX(${currentY}deg) rotateY(${currentX}deg)`;

    if (!hovering && Math.abs(currentX) < 0.05 && Math.abs(currentY) < 0.05) {
      inner.style.transform = 'rotateX(0deg) rotateY(0deg)';
      raf = null;
      return;
    }
    raf = requestAnimationFrame(animate);
  }

  stage.addEventListener('mouseenter', () => {
    hovering = true;
    if (!raf) animate();
  }, { passive: true });

  stage.addEventListener('mousemove', (e) => {
    const rect = stage.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    targetX = x * 2.5;
    targetY = -y * 2.5;
  }, { passive: true });

  stage.addEventListener('mouseleave', () => {
    hovering = false;
    targetX = 0;
    targetY = 0;
  }, { passive: true });
}

let replay = null;
const replayOverlay = document.getElementById('replay-overlay');
const replayPrompt = document.getElementById('replay-prompt');
const replayPlayerBoardEl = document.getElementById('replay-player-board');
const replayEnemyBoardEl = document.getElementById('replay-enemy-board');
const replayLogListEl = document.getElementById('replay-log-list');
const replayStatusEl = document.getElementById('replay-status');
const replayReasonEl = document.getElementById('replay-reason');
const replayPlayPauseBtn = document.getElementById('replay-play-pause');
const replayRestartBtn = document.getElementById('replay-restart');
const replaySkipBtn = document.getElementById('replay-skip');
const replaySpeedInput = document.getElementById('replay-speed');
const replaySpeedLabel = document.getElementById('replay-speed-label');

function placeShipsFromSnapshot(board, ships) {
  for (const ship of ships) {
    for (const { r, c } of ship.cells) {
      board[r][c] = { status: STATUS.SHIP, shipId: ship.id };
    }
  }
}

function setupReplay() {
  const data = lastReplay;
  if (!data) return null;
  const playerBoard = createEmptyBoard();
  const enemyBoard = createEmptyBoard();
  const playerShips = snapshotShips(data.playerShips);
  const enemyShips = snapshotShips(data.enemyShips);
  placeShipsFromSnapshot(playerBoard, playerShips);
  placeShipsFromSnapshot(enemyBoard, enemyShips);
  return {
    history: data.history.slice(),
    playerBoard,
    enemyBoard,
    playerShips,
    enemyShips,
    index: 0,
    speed: parseInt(replaySpeedInput.value, 10) || 4,
    paused: false,
    cancelled: false,
    awaitingResume: null
  };
}

function renderReplay() {
  if (!replay) return;
  renderBoard(replayPlayerBoardEl, replay.playerBoard, false, null, 0);
  renderBoard(replayEnemyBoardEl, replay.enemyBoard, true, null, 0);
}

function updateReplayStatus(text) {
  if (replayStatusEl) replayStatusEl.textContent = text || '';
}

async function waitForReplayResume() {
  if (!replay || !replay.paused) return;
  if (replay.awaitingResume) return replay.awaitingResume;
  replay.awaitingResume = new Promise(resolve => {
    replay._resume = resolve;
  });
  await replay.awaitingResume;
  replay.awaitingResume = null;
  replay._resume = null;
}

function resumeReplay() {
  if (replay && replay._resume) {
    replay.paused = false;
    replay._resume();
  }
}

function setReplayPaused(paused) {
  if (!replay) return;
  replay.paused = paused;
  if (replayPlayPauseBtn) replayPlayPauseBtn.textContent = paused ? 'Play' : 'Pause';
  if (!paused) resumeReplay();
}

function replayStepDelay(ms) {
  if (!replay) return Promise.resolve();
  return delay(ms / replay.speed);
}

async function showReplayReason(reason, durationMs) {
  if (!replayReasonEl) return;
  replayReasonEl.textContent = reason || '';
  replayReasonEl.classList.add('visible');
  if (durationMs > 0) {
    await replayStepDelay(durationMs);
    replayReasonEl.classList.remove('visible');
  }
}

function logToReplay(msg) {
  if (!replayLogListEl) return;
  const li = document.createElement('li');
  li.textContent = msg;
  replayLogListEl.prepend(li);
  replayLogListEl.scrollTop = 0;
}

async function applyReplayShot(step) {
  if (!replay || replay.cancelled) return;
  const isPlayer = step.actor === 'player';
  const board = isPlayer ? replay.enemyBoard : replay.playerBoard;
  const ships = isPlayer ? replay.enemyShips : replay.playerShips;
  const shooter = isPlayer ? (step.reason ? 'Gunner' : 'You') : 'Enemy';
  const verb = shooter === 'You' ? 'fire' : 'fires';

  const result = fire(board, ships, step.r, step.c);
  if (result.alreadyFired) return;

  AudioSys.playCannon();

  let msg = `${shooter} ${verb} at ${coordLabel(step.r, step.c)}`;
  let statusMsg;
  if (result.hit && result.sunk) {
    result.ship.sunkAt = step.shotNumber;
    const shipLabel = isPlayer ? `${result.ship.theme} — ${result.ship.tagline}` : `your ${result.ship.name}`;
    msg += ` — sunk ${shipLabel}`;
    statusMsg = `${shooter} sunk ${isPlayer ? result.ship.theme : result.ship.name}`;
    AudioSys.playSunk();
  } else if (result.hit) {
    msg += ' — hit.';
    statusMsg = `${shooter} hit!`;
  } else {
    msg += ' — miss.';
    statusMsg = `${shooter} missed.`;
  }
  if (step.reason) msg += ` (${step.reason})`;

  updateReplayStatus(statusMsg);
  showReplayReason(step.reason, 600);
  renderReplay();

  if (result.hit && result.sunk) {
    await cinematicSink(msg, {
      boardsEl: document.getElementById('replay-boards'),
      logEl: replayLogListEl,
      charDelay: 30 / replay.speed,
      desaturateMs: 800 / replay.speed,
      beatMs: 1500 / replay.speed
    });
  } else {
    logToReplay(msg);
  }
}

async function runReplay() {
  if (!replay) return;
  replay.cancelled = false;
  replay.paused = false;
  if (replayPlayPauseBtn) replayPlayPauseBtn.textContent = 'Pause';

  while (replay.index < replay.history.length && !replay.cancelled) {
    if (replay.paused) {
      await waitForReplayResume();
      continue;
    }
    const step = replay.history[replay.index];
    await applyReplayShot(step);
    replay.index++;
    if (replay.index < replay.history.length && !replay.cancelled) {
      await replayStepDelay(1000);
    }
  }

  if (!replay.cancelled) {
    finishReplay();
  }
}

function startReplay() {
  if (replayOverlay) replayOverlay.style.display = 'flex';
  if (reportEl) reportEl.style.display = 'none';
  if (replayPrompt) replayPrompt.style.display = 'none';
  replay = setupReplay();
  if (replayLogListEl) replayLogListEl.innerHTML = '';
  if (replayReasonEl) {
    replayReasonEl.textContent = '';
    replayReasonEl.classList.remove('visible');
  }
  const replayCard = document.querySelector('.replay-card');
  if (replayCard) replayCard.scrollTop = 0;
  if (replayOverlay) replayOverlay.scrollTop = 0;
  updateReplayStatus('Replay starting…');
  renderReplay();
  runReplay();
}

function restartReplay() {
  if (!replay) return;
  replay.cancelled = true;
  setTimeout(() => {
    startReplay();
  }, 50);
}

function skipReplayToEnd() {
  if (!replay) return;
  replay.cancelled = true;
  for (let i = replay.index; i < replay.history.length; i++) {
    const step = replay.history[i];
    const isPlayer = step.actor === 'player';
    const board = isPlayer ? replay.enemyBoard : replay.playerBoard;
    const ships = isPlayer ? replay.enemyShips : replay.playerShips;
    const result = fire(board, ships, step.r, step.c);
    if (result.hit && result.sunk) result.ship.sunkAt = step.shotNumber;
  }
  replay.index = replay.history.length;
  renderReplay();
  finishReplay();
}

function finishReplay() {
  if (replayOverlay) replayOverlay.style.display = 'none';
  if (lastReplay) {
    showReport(lastReplay.winner, lastReplay);
  }
}

if (replayPrompt) {
  document.getElementById('watch-replay').addEventListener('click', () => {
    startReplay();
  });
  document.getElementById('skip-report').addEventListener('click', () => {
    if (replayPrompt) replayPrompt.style.display = 'none';
    if (lastReplay) showReport(lastReplay.winner, lastReplay);
  });
}

if (replayPlayPauseBtn) {
  replayPlayPauseBtn.addEventListener('click', () => {
    if (!replay) return;
    setReplayPaused(!replay.paused);
  });
}

if (replayRestartBtn) {
  replayRestartBtn.addEventListener('click', () => {
    restartReplay();
  });
}

if (replaySkipBtn) {
  replaySkipBtn.addEventListener('click', () => {
    skipReplayToEnd();
  });
}

if (replaySpeedInput) {
  replaySpeedInput.addEventListener('input', () => {
    const val = parseInt(replaySpeedInput.value, 10);
    if (replaySpeedLabel) replaySpeedLabel.textContent = val + 'x';
    if (replay) replay.speed = val;
  });
}

const evalRunBtn = document.getElementById('eval-run');
const evalResultsEl = document.getElementById('eval-results');
const evalTrialsInput = document.getElementById('eval-trials');

function deepCloneBoard(board) {
  return board.map(row => row.map(cell => ({ ...cell })));
}

function evaluateDifficulty(difficulty, playerBoard, playerShips) {
  const prevState = state;
  state = { playerBoard, playerShips, difficulty };
  let shots = 0, hits = 0, misses = 0, wasted = 0;
  while (!allSunk(playerShips) && shots < 200) {
    const pick = chooseEnemyShot();
    if (!pick) break;
    const res = fire(playerBoard, playerShips, pick.r, pick.c);
    if (res.alreadyFired) continue;
    shots++;
    if (res.hit) {
      hits++;
    } else {
      misses++;
      if (pick.heatValue === 0) wasted++;
    }
  }
  state = prevState;
  return { shots, hits, misses, wasted, won: allSunk(playerShips) };
}

async function runEvaluation() {
  const trials = parseInt(evalTrialsInput ? evalTrialsInput.value : 20, 10) || 20;
  const difficulties = ['random', 'hunt', 'probability'];
  const results = {};
  for (const d of difficulties) {
    results[d] = { shots: 0, hits: 0, misses: 0, wasted: 0, wins: 0, trials: 0 };
  }

  updateStatus('Running AI evaluation...');
  if (evalRunBtn) evalRunBtn.disabled = true;
  if (evalResultsEl) evalResultsEl.innerHTML = '<p>Running simulations...</p>';

  for (let i = 0; i < trials; i++) {
    setSeed(generateSeed());
    const board = createEmptyBoard();
    const ships = cloneShips();
    placeShipsRandomly(board, ships);

    for (const d of difficulties) {
      setSeed(generateSeed());
      const b = deepCloneBoard(board);
      const s = deepCloneShips(ships);
      const r = evaluateDifficulty(d, b, s);
      if (!r.won) continue;
      results[d].trials++;
      results[d].shots += r.shots;
      results[d].hits += r.hits;
      results[d].misses += r.misses;
      results[d].wasted += r.wasted;
      results[d].wins += 1;
    }

    if (i % 5 === 0 && evalResultsEl) {
      evalResultsEl.innerHTML = `<p>Running simulations… ${i + 1}/${trials}</p>`;
      await delay(0);
    }
  }

  if (evalRunBtn) evalRunBtn.disabled = false;
  updateStatus('AI evaluation complete.');
  renderEvalResults(results);
}

function renderEvalResults(results) {
  if (!evalResultsEl) return;
  const rows = ['random', 'hunt', 'probability'].map(d => {
    const r = results[d];
    const avg = r.trials ? (r.shots / r.trials).toFixed(1) : '—';
    const acc = r.shots ? Math.round((r.hits / r.shots) * 100) : 0;
    const wasted = r.trials ? (r.wasted / r.trials).toFixed(1) : '—';
    const name = d === 'random' ? 'Random' : d === 'hunt' ? 'Hunt & Target' : 'Probability Density';
    return `<tr><td>${name}</td><td>${r.trials}</td><td>${avg}</td><td>${acc}%</td><td>${wasted}</td></tr>`;
  }).join('');
  evalResultsEl.innerHTML = `<table><thead><tr><th>AI</th><th>Trials</th><th>Avg shots to sink</th><th>Accuracy</th><th>Avg wasted shots</th></tr></thead><tbody>${rows}</tbody></table>`;
}

if (evalRunBtn) evalRunBtn.addEventListener('click', runEvaluation);

if (!loadReplayFromUrl()) initGame();
loadBuildLog();
initTilt();
