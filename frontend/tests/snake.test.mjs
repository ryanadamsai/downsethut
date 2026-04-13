import assert from "node:assert/strict";

import { DIRECTIONS, createInitialState, getTotalScore, listOpenCells, pointKey, stepGame } from "../lib/snake.mjs";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function createPlayer({
  id = "p1",
  label = "P1",
  hue = 191,
  snake,
  direction = DIRECTIONS.RIGHT,
  score = 0,
  collision = null,
  alive = true
}) {
  return {
    id,
    label,
    hue,
    snake,
    direction,
    score,
    collision,
    alive
  };
}

function createState({ boardSize = 8, players, food, tick = 0, gameOver = false, playerCount } = {}) {
  return {
    boardSize,
    playerCount: playerCount || players.length,
    players,
    food,
    tick,
    winnerIds: [],
    hasWinner: false,
    gameOver
  };
}

runTest("createInitialState places food on an open cell for every player", () => {
  const state = createInitialState({ boardSize: 12, playerCount: 4, random: () => 0 });
  const snakeCells = new Set(state.players.flatMap((player) => player.snake).map(pointKey));

  assert.equal(state.players.length, 4);
  assert.ok(state.food);
  assert.equal(snakeCells.has(pointKey(state.food)), false);
});

runTest("stepGame moves a solo snake forward without changing score", () => {
  const state = createInitialState({ boardSize: 8, random: () => 0 });
  const nextState = stepGame(state, { nextDirection: DIRECTIONS.RIGHT, random: () => 0 });
  const player = nextState.players[0];

  assert.deepEqual(player.snake[0], {
    x: state.players[0].snake[0].x + 1,
    y: state.players[0].snake[0].y
  });
  assert.equal(player.snake.length, state.players[0].snake.length);
  assert.equal(getTotalScore(nextState), 0);
  assert.equal(nextState.gameOver, false);
});

runTest("stepGame grows the snake and respawns food after eating", () => {
  const state = createState({
    boardSize: 6,
    players: [
      createPlayer({
        snake: [
          { x: 2, y: 2 },
          { x: 1, y: 2 },
          { x: 0, y: 2 }
        ]
      })
    ],
    food: { x: 3, y: 2 }
  });

  const nextState = stepGame(state, { nextDirection: DIRECTIONS.RIGHT, random: () => 0 });
  const snakeCells = new Set(nextState.players[0].snake.map(pointKey));

  assert.equal(nextState.players[0].snake.length, 4);
  assert.equal(nextState.players[0].score, 1);
  assert.equal(snakeCells.has(pointKey(nextState.food)), false);
});

runTest("stepGame detects wall collisions in solo play", () => {
  const state = createState({
    boardSize: 4,
    players: [
      createPlayer({
        snake: [
          { x: 3, y: 1 },
          { x: 2, y: 1 },
          { x: 1, y: 1 }
        ]
      })
    ],
    food: { x: 0, y: 0 }
  });

  const nextState = stepGame(state, { nextDirection: DIRECTIONS.RIGHT, random: () => 0 });

  assert.equal(nextState.players[0].alive, false);
  assert.equal(nextState.players[0].collision, "wall");
  assert.equal(nextState.gameOver, true);
});

runTest("stepGame detects self collisions", () => {
  const state = createState({
    boardSize: 6,
    players: [
      createPlayer({
        snake: [
          { x: 2, y: 2 },
          { x: 3, y: 2 },
          { x: 3, y: 3 },
          { x: 2, y: 3 }
        ],
        direction: DIRECTIONS.UP
      })
    ],
    food: { x: 5, y: 5 },
    tick: 3
  });

  const nextState = stepGame(state, { nextDirection: DIRECTIONS.RIGHT, random: () => 0 });

  assert.equal(nextState.players[0].alive, false);
  assert.equal(nextState.players[0].collision, "self");
  assert.equal(nextState.gameOver, true);
});

runTest("stepGame can move multiple snakes at the same time", () => {
  const state = createInitialState({ boardSize: 12, playerCount: 2, random: () => 0 });
  const [playerOne, playerTwo] = state.players;
  const nextState = stepGame(state, {
    nextDirections: {
      p1: DIRECTIONS.RIGHT,
      p2: DIRECTIONS.LEFT
    },
    random: () => 0
  });

  assert.equal(nextState.players[0].snake[0].x, playerOne.snake[0].x + 1);
  assert.equal(nextState.players[1].snake[0].x, playerTwo.snake[0].x - 1);
  assert.equal(nextState.gameOver, false);
});

runTest("stepGame detects multiplayer head-on collisions", () => {
  const state = createState({
    boardSize: 8,
    playerCount: 2,
    players: [
      createPlayer({
        id: "p1",
        label: "P1",
        snake: [
          { x: 2, y: 2 },
          { x: 1, y: 2 },
          { x: 0, y: 2 }
        ]
      }),
      createPlayer({
        id: "p2",
        label: "P2",
        hue: 330,
        snake: [
          { x: 4, y: 2 },
          { x: 5, y: 2 },
          { x: 6, y: 2 }
        ],
        direction: DIRECTIONS.LEFT
      })
    ],
    food: { x: 7, y: 7 }
  });

  const nextState = stepGame(state, {
    nextDirections: {
      p1: DIRECTIONS.RIGHT,
      p2: DIRECTIONS.LEFT
    },
    random: () => 0
  });

  assert.equal(nextState.players[0].alive, false);
  assert.equal(nextState.players[1].alive, false);
  assert.equal(nextState.players[0].collision, "head");
  assert.equal(nextState.players[1].collision, "head");
  assert.equal(nextState.gameOver, true);
});

runTest("stepGame ends a multiplayer round when one player survives", () => {
  const state = createState({
    boardSize: 6,
    playerCount: 2,
    players: [
      createPlayer({
        id: "p1",
        label: "P1",
        snake: [
          { x: 5, y: 2 },
          { x: 4, y: 2 },
          { x: 3, y: 2 }
        ]
      }),
      createPlayer({
        id: "p2",
        label: "P2",
        hue: 330,
        snake: [
          { x: 2, y: 3 },
          { x: 2, y: 4 },
          { x: 2, y: 5 }
        ],
        direction: DIRECTIONS.UP
      })
    ],
    food: { x: 0, y: 0 }
  });

  const nextState = stepGame(state, {
    nextDirections: {
      p1: DIRECTIONS.RIGHT,
      p2: DIRECTIONS.UP
    },
    random: () => 0
  });

  assert.equal(nextState.players[0].alive, false);
  assert.equal(nextState.players[1].alive, true);
  assert.deepEqual(nextState.winnerIds, ["p2"]);
  assert.equal(nextState.gameOver, true);
});

runTest("listOpenCells omits every occupied position", () => {
  const openCells = listOpenCells(3, [
    { x: 0, y: 0 },
    { x: 1, y: 1 }
  ]);

  assert.equal(openCells.some((cell) => cell.x === 0 && cell.y === 0), false);
  assert.equal(openCells.some((cell) => cell.x === 1 && cell.y === 1), false);
  assert.equal(openCells.length, 7);
});
