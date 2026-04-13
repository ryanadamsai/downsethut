import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { BOARD_SIZE, DIRECTIONS, TICK_MS, canTurn, createInitialState, pointKey, stepGame } from "../lib/snake.mjs";

const KEY_TO_DIRECTION = {
  arrowup: DIRECTIONS.UP,
  w: DIRECTIONS.UP,
  arrowdown: DIRECTIONS.DOWN,
  s: DIRECTIONS.DOWN,
  arrowleft: DIRECTIONS.LEFT,
  a: DIRECTIONS.LEFT,
  arrowright: DIRECTIONS.RIGHT,
  d: DIRECTIONS.RIGHT
};

const CONTROL_LAYOUT = [
  { label: "Up", direction: DIRECTIONS.UP, className: "snake-control-up" },
  { label: "Left", direction: DIRECTIONS.LEFT, className: "snake-control-left" },
  { label: "Down", direction: DIRECTIONS.DOWN, className: "snake-control-down" },
  { label: "Right", direction: DIRECTIONS.RIGHT, className: "snake-control-right" }
];

function getStatusLabel(game, isRunning) {
  if (game.hasWon) {
    return "Peak elder-millennial form";
  }
  if (game.gameOver) {
    return game.collision === "self" ? "Game over: group chat spiral" : "Game over: hard boundary";
  }
  if (isRunning) {
    return "Running on iced coffee";
  }
  return game.tick === 0 ? "Ready for a microbreak" : "Paused for a calendar invite";
}

export default function SnakePage() {
  const [game, setGame] = useState(() => createInitialState({ boardSize: BOARD_SIZE }));
  const [isRunning, setIsRunning] = useState(false);
  const pendingDirectionRef = useRef(DIRECTIONS.RIGHT);

  function queueDirection(direction) {
    const basisDirection = pendingDirectionRef.current || game.direction;
    if (!canTurn(basisDirection, direction)) {
      return;
    }
    pendingDirectionRef.current = direction;
    if (!game.gameOver) {
      setIsRunning(true);
    }
  }

  function resetGame({ autoStart = false } = {}) {
    const nextGame = createInitialState({ boardSize: BOARD_SIZE });
    pendingDirectionRef.current = nextGame.direction;
    setGame(nextGame);
    setIsRunning(autoStart);
  }

  function togglePlayback() {
    if (game.gameOver) {
      resetGame({ autoStart: true });
      return;
    }
    setIsRunning((currentValue) => (game.tick === 0 ? true : !currentValue));
  }

  useEffect(() => {
    function handleKeyDown(event) {
      const normalizedKey = event.key.toLowerCase();
      const direction = KEY_TO_DIRECTION[normalizedKey];

      if (direction) {
        event.preventDefault();
        queueDirection(direction);
        return;
      }

      if (event.code === "Space" || normalizedKey === " ") {
        event.preventDefault();
        togglePlayback();
      }

      if (normalizedKey === "r") {
        event.preventDefault();
        resetGame({ autoStart: false });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [game.direction, game.gameOver, game.tick, isRunning]);

  useEffect(() => {
    if (!isRunning || game.gameOver) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setGame((currentGame) => {
        const nextGame = stepGame(currentGame, {
          nextDirection: pendingDirectionRef.current,
          random: Math.random
        });
        pendingDirectionRef.current = nextGame.direction;
        return nextGame;
      });
    }, TICK_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [game.gameOver, isRunning]);

  useEffect(() => {
    if (game.gameOver) {
      setIsRunning(false);
    }
  }, [game.gameOver]);

  const snakeCells = useMemo(() => new Set(game.snake.map(pointKey)), [game.snake]);
  const foodCellKey = game.food ? pointKey(game.food) : "";
  const headCellKey = pointKey(game.snake[0]);
  const boardCells = useMemo(() => {
    const cells = [];

    for (let y = 0; y < game.boardSize; y += 1) {
      for (let x = 0; x < game.boardSize; x += 1) {
        const key = `${x}:${y}`;
        let className = "snake-cell";

        if (key === foodCellKey) {
          className += " food";
        } else if (key === headCellKey) {
          className += " snake-head";
        } else if (snakeCells.has(key)) {
          className += " snake-body";
        }

        cells.push(<div key={key} className={className} role="gridcell" aria-label={className.replace("snake-cell ", "")} />);
      }
    }

    return cells;
  }, [foodCellKey, game.boardSize, headCellKey, snakeCells]);

  return (
    <main className="page-shell snake-page">
      <div className="page-top">
        <Link href="/" className="back-link">
          Back to dashboard
        </Link>
      </div>

      <section className="card snake-hero">
        <div>
          <p className="eyebrow">Arcade Therapy</p>
          <h1>Snake for 2026 Millennials</h1>
          <p className="hero-copy">
            Classic Snake for the browser-tab generation: muted colors, microbreak energy, and one more run before the next notification.
          </p>
          <p className="hero-copy compact-copy snake-copy-note">
            Same rules, same loop, just a little more elder-millennial-coded.
          </p>
        </div>
        <div className="snake-stats">
          <div className="metric-card">
            <span className="label">Score</span>
            <strong>{game.score}</strong>
          </div>
          <div className="metric-card">
            <span className="label">Snake Size</span>
            <strong>{game.snake.length}</strong>
          </div>
          <div className="metric-card">
            <span className="label">Mood</span>
            <strong>{getStatusLabel(game, isRunning)}</strong>
          </div>
        </div>
      </section>

      <div className="snake-layout">
        <section className="card snake-board-card">
          <div className="card-header">
            <h2>Board</h2>
            <span>{game.boardSize} x {game.boardSize}</span>
          </div>
          <div
            className="snake-board"
            style={{ gridTemplateColumns: `repeat(${game.boardSize}, minmax(0, 1fr))` }}
            role="grid"
            aria-label="Snake board"
          >
            {boardCells}
          </div>
        </section>

        <aside className="card snake-sidebar">
          <div className="card-header">
            <h2>Controls</h2>
            <span>{TICK_MS}ms focus cycle</span>
          </div>

          <div className="snake-button-row">
            <button type="button" className="primary-button" onClick={togglePlayback}>
              {game.gameOver ? "Play again" : isRunning ? "Pause" : game.tick === 0 ? "Start" : "Resume"}
            </button>
            <button type="button" className="tab-button" onClick={() => resetGame({ autoStart: false })}>
              Restart
            </button>
          </div>

          <div className="snake-instructions">
            <p className="label">Keyboard</p>
            <p>Arrow keys or WASD to steer. Space pauses. R restarts.</p>
            <p className="label">2026 Millennial Mode</p>
            <p>Still classic Snake: collect the coral snack, avoid the walls, and do not spiral into your own tail.</p>
          </div>

          <div className="snake-touchpad" aria-label="On-screen controls">
            {CONTROL_LAYOUT.map((control) => (
              <button
                key={control.direction}
                type="button"
                className={`snake-control ${control.className}`}
                onClick={() => queueDirection(control.direction)}
              >
                {control.label}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
