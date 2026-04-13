import assert from "node:assert/strict";

import { DIRECTIONS, createInitialState, listOpenCells, pointKey, stepGame } from "../lib/snake.mjs";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("createInitialState places food on an open cell", () => {
  const state = createInitialState({ boardSize: 8, random: () => 0 });
  const snakeCells = new Set(state.snake.map(pointKey));

  assert.equal(state.snake.length, 3);
  assert.ok(state.food);
  assert.equal(snakeCells.has(pointKey(state.food)), false);
});

runTest("stepGame moves the snake forward without changing score", () => {
  const state = createInitialState({ boardSize: 8, random: () => 0 });
  const nextState = stepGame(state, { nextDirection: DIRECTIONS.RIGHT, random: () => 0 });

  assert.deepEqual(nextState.snake[0], {
    x: state.snake[0].x + 1,
    y: state.snake[0].y
  });
  assert.equal(nextState.snake.length, state.snake.length);
  assert.equal(nextState.score, 0);
  assert.equal(nextState.gameOver, false);
});

runTest("stepGame grows the snake and respawns food after eating", () => {
  const state = {
    boardSize: 6,
    snake: [
      { x: 2, y: 2 },
      { x: 1, y: 2 },
      { x: 0, y: 2 }
    ],
    direction: DIRECTIONS.RIGHT,
    food: { x: 3, y: 2 },
    score: 0,
    tick: 0,
    collision: null,
    hasWon: false,
    gameOver: false
  };

  const nextState = stepGame(state, { nextDirection: DIRECTIONS.RIGHT, random: () => 0 });
  const snakeCells = new Set(nextState.snake.map(pointKey));

  assert.equal(nextState.snake.length, 4);
  assert.equal(nextState.score, 1);
  assert.equal(snakeCells.has(pointKey(nextState.food)), false);
});

runTest("stepGame detects wall collisions", () => {
  const state = {
    boardSize: 4,
    snake: [
      { x: 3, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 1 }
    ],
    direction: DIRECTIONS.RIGHT,
    food: { x: 0, y: 0 },
    score: 0,
    tick: 0,
    collision: null,
    hasWon: false,
    gameOver: false
  };

  const nextState = stepGame(state, { nextDirection: DIRECTIONS.RIGHT, random: () => 0 });

  assert.equal(nextState.gameOver, true);
  assert.equal(nextState.collision, "wall");
});

runTest("stepGame detects self collisions", () => {
  const state = {
    boardSize: 6,
    snake: [
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 2, y: 3 }
    ],
    direction: DIRECTIONS.UP,
    food: { x: 5, y: 5 },
    score: 0,
    tick: 3,
    collision: null,
    hasWon: false,
    gameOver: false
  };

  const nextState = stepGame(state, { nextDirection: DIRECTIONS.RIGHT, random: () => 0 });

  assert.equal(nextState.gameOver, true);
  assert.equal(nextState.collision, "self");
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
