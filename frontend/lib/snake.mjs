export const BOARD_SIZE = 16;
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

export function pointKey(point) {
  return `${point.x}:${point.y}`;
}

export function pointsEqual(left, right) {
  return left?.x === right?.x && left?.y === right?.y;
}

export function isOutOfBounds(point, boardSize) {
  return point.x < 0 || point.y < 0 || point.x >= boardSize || point.y >= boardSize;
}

export function listOpenCells(boardSize, snake) {
  const occupied = new Set(snake.map(pointKey));
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

export function getRandomFoodPosition(boardSize, snake, random = Math.random) {
  const openCells = listOpenCells(boardSize, snake);
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

export function createInitialState({ boardSize = BOARD_SIZE, random = Math.random } = {}) {
  const middleRow = Math.floor(boardSize / 2);
  const startColumn = Math.max(2, Math.floor(boardSize / 2));
  const snake = [
    { x: startColumn, y: middleRow },
    { x: startColumn - 1, y: middleRow },
    { x: startColumn - 2, y: middleRow }
  ];

  return {
    boardSize,
    snake,
    direction: DIRECTIONS.RIGHT,
    food: getRandomFoodPosition(boardSize, snake, random),
    score: 0,
    tick: 0,
    collision: null,
    hasWon: false,
    gameOver: false
  };
}

export function stepGame(state, { nextDirection, random = Math.random } = {}) {
  if (!state || state.gameOver) {
    return state;
  }

  const direction = resolveDirection(state.direction, nextDirection);
  const vector = DIRECTION_VECTORS[direction];
  const nextHead = {
    x: state.snake[0].x + vector.x,
    y: state.snake[0].y + vector.y
  };

  if (isOutOfBounds(nextHead, state.boardSize)) {
    return {
      ...state,
      direction,
      collision: "wall",
      gameOver: true
    };
  }

  const willEat = pointsEqual(nextHead, state.food);
  const collisionSegments = willEat ? state.snake : state.snake.slice(0, -1);
  const hitSelf = collisionSegments.some((segment) => pointsEqual(segment, nextHead));

  if (hitSelf) {
    return {
      ...state,
      direction,
      collision: "self",
      gameOver: true
    };
  }

  const snake = [nextHead, ...state.snake];
  if (!willEat) {
    snake.pop();
  }

  const food = willEat ? getRandomFoodPosition(state.boardSize, snake, random) : state.food;
  const hasWon = willEat && !food;

  return {
    ...state,
    snake,
    direction,
    food,
    score: state.score + (willEat ? 1 : 0),
    tick: state.tick + 1,
    collision: null,
    hasWon,
    gameOver: hasWon
  };
}
