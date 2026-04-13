export const BOARD_SIZE = 16;
export const MAX_PLAYERS = 4;
export const TICK_MS = 160;

export const DIRECTIONS = Object.freeze({
  UP: "UP",
  DOWN: "DOWN",
  LEFT: "LEFT",
  RIGHT: "RIGHT"
});

export const DIRECTION_VECTORS = Object.freeze({
  [DIRECTIONS.UP]: { x: 0, y: -1 },
  [DIRECTIONS.DOWN]: { x: 0, y: 1 },
  [DIRECTIONS.LEFT]: { x: -1, y: 0 },
  [DIRECTIONS.RIGHT]: { x: 1, y: 0 }
});

export const PLAYER_CONFIGS = Object.freeze([
  { id: "p1", label: "P1", hue: 191 },
  { id: "p2", label: "P2", hue: 330 },
  { id: "p3", label: "P3", hue: 44 },
  { id: "p4", label: "P4", hue: 139 }
]);

function clampPlayerCount(value) {
  return Math.min(Math.max(value || 1, 1), MAX_PLAYERS);
}

export function pointKey(point) {
  return `${point.x}:${point.y}`;
}

export function pointsEqual(left, right) {
  return left?.x === right?.x && left?.y === right?.y;
}

export function isOutOfBounds(point, boardSize) {
  return point.x < 0 || point.y < 0 || point.x >= boardSize || point.y >= boardSize;
}

export function listOpenCells(boardSize, occupiedSegments) {
  const occupied = new Set((occupiedSegments || []).map(pointKey));
  const openCells = [];

  for (let y = 0; y < boardSize; y += 1) {
    for (let x = 0; x < boardSize; x += 1) {
      const point = { x, y };
      if (!occupied.has(pointKey(point))) {
        openCells.push(point);
      }
    }
  }

  return openCells;
}

function pickRandomIndex(length, random) {
  const rawValue = typeof random === "function" ? random() : Math.random();
  const normalizedValue = Number.isFinite(rawValue) ? rawValue : 0;
  const boundedValue = Math.min(Math.max(normalizedValue, 0), 0.999999999);
  return Math.floor(boundedValue * length);
}

export function getRandomFoodPosition(boardSize, occupiedSegments, random = Math.random) {
  const openCells = listOpenCells(boardSize, occupiedSegments);
  if (!openCells.length) {
    return null;
  }
  return openCells[pickRandomIndex(openCells.length, random)];
}

export function canTurn(currentDirection, requestedDirection) {
  if (!requestedDirection || !DIRECTION_VECTORS[requestedDirection]) {
    return false;
  }
  if (!currentDirection || !DIRECTION_VECTORS[currentDirection]) {
    return true;
  }

  const currentVector = DIRECTION_VECTORS[currentDirection];
  const requestedVector = DIRECTION_VECTORS[requestedDirection];
  return currentVector.x + requestedVector.x !== 0 || currentVector.y + requestedVector.y !== 0;
}

export function resolveDirection(currentDirection, requestedDirection) {
  return canTurn(currentDirection, requestedDirection) ? requestedDirection : currentDirection;
}

function createSnakeFromHead(head, direction) {
  const vector = DIRECTION_VECTORS[direction];
  return [
    head,
    { x: head.x - vector.x, y: head.y - vector.y },
    { x: head.x - vector.x * 2, y: head.y - vector.y * 2 }
  ];
}

function createSoloPlayer(boardSize) {
  const middleRow = Math.floor(boardSize / 2);
  const startColumn = Math.max(2, Math.floor(boardSize / 2));
  const direction = DIRECTIONS.RIGHT;

  return {
    ...PLAYER_CONFIGS[0],
    snake: createSnakeFromHead({ x: startColumn, y: middleRow }, direction),
    direction,
    score: 0,
    collision: null,
    alive: true
  };
}

function createMultiplayerPlayer(config, index, boardSize) {
  const upperRow = Math.max(3, Math.floor(boardSize * 0.32));
  const lowerRow = Math.min(boardSize - 4, Math.ceil(boardSize * 0.68) - 1);
  const leftColumn = Math.max(3, Math.floor(boardSize * 0.32));
  const rightColumn = Math.min(boardSize - 4, Math.ceil(boardSize * 0.68) - 1);

  const presets = [
    { head: { x: 3, y: upperRow }, direction: DIRECTIONS.RIGHT },
    { head: { x: boardSize - 4, y: lowerRow }, direction: DIRECTIONS.LEFT },
    { head: { x: rightColumn, y: 3 }, direction: DIRECTIONS.DOWN },
    { head: { x: leftColumn, y: boardSize - 4 }, direction: DIRECTIONS.UP }
  ];
  const preset = presets[index];

  return {
    ...config,
    snake: createSnakeFromHead(preset.head, preset.direction),
    direction: preset.direction,
    score: 0,
    collision: null,
    alive: true
  };
}

function buildPlayers(playerCount, boardSize) {
  const count = clampPlayerCount(playerCount);
  if (count === 1) {
    return [createSoloPlayer(boardSize)];
  }

  return PLAYER_CONFIGS.slice(0, count).map((config, index) => createMultiplayerPlayer(config, index, boardSize));
}

export function getTotalScore(target) {
  const players = Array.isArray(target) ? target : target?.players;
  return (players || []).reduce((total, player) => total + (player.score || 0), 0);
}

export function createInitialState({ boardSize = BOARD_SIZE, playerCount = 1, random = Math.random } = {}) {
  const players = buildPlayers(playerCount, boardSize);
  const occupiedSegments = players.flatMap((player) => player.snake);

  return {
    boardSize,
    playerCount: players.length,
    players,
    food: getRandomFoodPosition(boardSize, occupiedSegments, random),
    tick: 0,
    winnerIds: [],
    hasWinner: false,
    gameOver: false
  };
}

function buildNextSnake(snake, nextHead, willEat) {
  const nextSnake = [nextHead, ...snake];
  if (!willEat) {
    nextSnake.pop();
  }
  return nextSnake;
}

function markDead(deadPlayers, playerId, collision) {
  if (!deadPlayers.has(playerId)) {
    deadPlayers.set(playerId, collision);
  }
}

function collectBodyOccupancy(candidates, excludedIds = new Set()) {
  const occupancy = new Map();

  candidates.forEach((candidate) => {
    if (excludedIds.has(candidate.player.id)) {
      return;
    }

    candidate.nextSnake.slice(1).forEach((segment) => {
      const key = pointKey(segment);
      const entries = occupancy.get(key) || [];
      entries.push(candidate.player.id);
      occupancy.set(key, entries);
    });
  });

  return occupancy;
}

function hasHeadSwap(leftCandidate, rightCandidate) {
  return (
    pointsEqual(leftCandidate.nextHead, rightCandidate.player.snake[0]) &&
    pointsEqual(rightCandidate.nextHead, leftCandidate.player.snake[0])
  );
}

export function stepGame(state, { nextDirection, nextDirections, random = Math.random } = {}) {
  if (!state || state.gameOver) {
    return state;
  }

  const requestedDirections = {
    ...(nextDirections || {})
  };

  if (nextDirection) {
    requestedDirections.p1 = nextDirection;
  }

  const alivePlayers = state.players.filter((player) => player.alive);
  if (!alivePlayers.length) {
    return {
      ...state,
      gameOver: true
    };
  }

  const candidates = alivePlayers.map((player) => {
    const direction = resolveDirection(player.direction, requestedDirections[player.id]);
    const vector = DIRECTION_VECTORS[direction];
    const nextHead = {
      x: player.snake[0].x + vector.x,
      y: player.snake[0].y + vector.y
    };

    return {
      player,
      direction,
      nextHead,
      outOfBounds: isOutOfBounds(nextHead, state.boardSize),
      willEat: false,
      nextSnake: player.snake
    };
  });

  const nonWallCandidates = candidates.filter((candidate) => !candidate.outOfBounds);
  const foodClaimants = nonWallCandidates.filter((candidate) => pointsEqual(candidate.nextHead, state.food));
  const eaterId = foodClaimants.length === 1 ? foodClaimants[0].player.id : null;

  candidates.forEach((candidate) => {
    candidate.willEat = candidate.player.id === eaterId;
    candidate.nextSnake = candidate.outOfBounds
      ? candidate.player.snake
      : buildNextSnake(candidate.player.snake, candidate.nextHead, candidate.willEat);
  });

  const deadPlayers = new Map();

  candidates.forEach((candidate) => {
    if (candidate.outOfBounds) {
      markDead(deadPlayers, candidate.player.id, "wall");
    }
  });

  const headPositions = new Map();
  nonWallCandidates.forEach((candidate) => {
    const key = pointKey(candidate.nextHead);
    const ids = headPositions.get(key) || [];
    ids.push(candidate.player.id);
    headPositions.set(key, ids);
  });

  headPositions.forEach((ids) => {
    if (ids.length > 1) {
      ids.forEach((id) => {
        markDead(deadPlayers, id, "head");
      });
    }
  });

  for (let index = 0; index < nonWallCandidates.length; index += 1) {
    for (let comparisonIndex = index + 1; comparisonIndex < nonWallCandidates.length; comparisonIndex += 1) {
      const leftCandidate = nonWallCandidates[index];
      const rightCandidate = nonWallCandidates[comparisonIndex];

      if (hasHeadSwap(leftCandidate, rightCandidate)) {
        markDead(deadPlayers, leftCandidate.player.id, "head");
        markDead(deadPlayers, rightCandidate.player.id, "head");
      }
    }
  }

  const bodyOccupancy = collectBodyOccupancy(candidates, new Set(deadPlayers.keys()));

  nonWallCandidates.forEach((candidate) => {
    if (deadPlayers.has(candidate.player.id)) {
      return;
    }

    const collisions = bodyOccupancy.get(pointKey(candidate.nextHead));
    if (!collisions?.length) {
      return;
    }

    const collision = collisions.some((ownerId) => ownerId === candidate.player.id) ? "self" : "snake";
    markDead(deadPlayers, candidate.player.id, collision);
  });

  const nextPlayers = state.players.map((player) => {
    const candidate = candidates.find((entry) => entry.player.id === player.id);
    if (!candidate) {
      return player;
    }

    if (deadPlayers.has(player.id)) {
      return {
        ...player,
        direction: candidate.direction,
        snake: [],
        collision: deadPlayers.get(player.id),
        alive: false
      };
    }

    return {
      ...player,
      direction: candidate.direction,
      snake: candidate.nextSnake,
      score: player.score + (candidate.willEat ? 1 : 0),
      collision: null,
      alive: true
    };
  });

  const survivingPlayers = nextPlayers.filter((player) => player.alive);
  const occupiedSegments = survivingPlayers.flatMap((player) => player.snake);
  const eaterSurvived = eaterId && survivingPlayers.some((player) => player.id === eaterId);
  const nextFood = eaterSurvived ? getRandomFoodPosition(state.boardSize, occupiedSegments, random) : state.food;
  const noFoodRemaining = !nextFood;
  const hasWinner = noFoodRemaining || (state.playerCount > 1 && survivingPlayers.length === 1);
  const winnerIds = hasWinner ? survivingPlayers.map((player) => player.id) : [];
  const gameOver = survivingPlayers.length === 0 || hasWinner;

  return {
    ...state,
    players: nextPlayers,
    food: nextFood,
    tick: state.tick + 1,
    winnerIds,
    hasWinner,
    gameOver
  };
}
