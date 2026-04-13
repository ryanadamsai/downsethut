import { useEffect, useMemo, useRef, useState } from "react";

import { BOARD_SIZE, DIRECTIONS, TICK_MS, canTurn, createInitialState, pointKey, stepGame } from "../lib/snake.mjs";

const AUTO_RESTART_MS = 1100;
const SWIPE_THRESHOLD = 18;

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

function getDirectionFromGesture(deltaX, deltaY) {
  if (Math.abs(deltaX) < SWIPE_THRESHOLD && Math.abs(deltaY) < SWIPE_THRESHOLD) {
    return null;
  }

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX > 0 ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT;
  }

  return deltaY > 0 ? DIRECTIONS.DOWN : DIRECTIONS.UP;
}

export default function SnakePage() {
  const [game, setGame] = useState(() => createInitialState({ boardSize: BOARD_SIZE }));
  const [isRunning, setIsRunning] = useState(true);
  const pendingDirectionRef = useRef(DIRECTIONS.RIGHT);
  const gestureStartRef = useRef(null);

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

  function resetGame({ autoStart = true, nextDirection } = {}) {
    const nextGame = createInitialState({ boardSize: BOARD_SIZE });
    const direction = canTurn(nextGame.direction, nextDirection) ? nextDirection : nextGame.direction;

    pendingDirectionRef.current = direction;
    setGame({
      ...nextGame,
      direction
    });
    setIsRunning(autoStart);
  }

  function togglePlayback() {
    if (game.gameOver) {
      resetGame({ autoStart: true });
      return;
    }

    setIsRunning((currentValue) => !currentValue);
  }

  function handlePointerDown(event) {
    gestureStartRef.current = {
      x: event.clientX,
      y: event.clientY
    };
  }

  function handlePointerUp(event) {
    const start = gestureStartRef.current;
    gestureStartRef.current = null;

    if (!start) {
      return;
    }

    const direction = getDirectionFromGesture(event.clientX - start.x, event.clientY - start.y);

    if (direction) {
      if (game.gameOver) {
        resetGame({ autoStart: true, nextDirection: direction });
      } else {
        queueDirection(direction);
      }
      return;
    }

    if (game.gameOver) {
      resetGame({ autoStart: true });
    }
  }

  useEffect(() => {
    function handleKeyDown(event) {
      const normalizedKey = event.key.toLowerCase();
      const direction = KEY_TO_DIRECTION[normalizedKey];

      if (direction) {
        event.preventDefault();
        if (game.gameOver) {
          resetGame({ autoStart: true, nextDirection: direction });
          return;
        }
        queueDirection(direction);
        return;
      }

      if (event.code === "Space" || normalizedKey === " ") {
        event.preventDefault();
        togglePlayback();
      }

      if (normalizedKey === "r") {
        event.preventDefault();
        resetGame({ autoStart: true });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [game.direction, game.gameOver]);

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

  useEffect(() => {
    if (!game.gameOver) {
      return undefined;
    }

    const restartTimer = window.setTimeout(() => {
      resetGame({ autoStart: true });
    }, AUTO_RESTART_MS);

    return () => {
      window.clearTimeout(restartTimer);
    };
  }, [game.gameOver]);

  const snakeIndexByCell = useMemo(
    () => new Map(game.snake.map((segment, index) => [pointKey(segment), index])),
    [game.snake]
  );
  const foodCellKey = game.food ? pointKey(game.food) : "";
  const headCellKey = pointKey(game.snake[0]);
  const boardCells = useMemo(() => {
    const cells = [];

    for (let y = 0; y < game.boardSize; y += 1) {
      for (let x = 0; x < game.boardSize; x += 1) {
        const key = `${x}:${y}`;
        let className = "snake-cell";
        let style;

        if (key === foodCellKey) {
          className += " food";
        } else if (key === headCellKey) {
          className += " snake-head";
          style = { "--cell-hue": `${(game.tick * 10) % 360}` };
        } else if (snakeIndexByCell.has(key)) {
          className += " snake-body";
          style = {
            "--cell-hue": `${(190 + snakeIndexByCell.get(key) * 26) % 360}`
          };
        }

        cells.push(
          <div
            key={key}
            className={className}
            style={style}
            role="gridcell"
            aria-label={className.replace("snake-cell ", "")}
          />
        );
      }
    }

    return cells;
  }, [foodCellKey, game.boardSize, game.tick, headCellKey, snakeIndexByCell]);

  return (
    <main
      className={`page-shell snake-screen${game.gameOver ? " is-game-over" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <div className="snake-stage">
        <div className="snake-board-frame">
          <div
            className="snake-board"
            style={{ gridTemplateColumns: `repeat(${game.boardSize}, minmax(0, 1fr))` }}
            role="grid"
            aria-label="Snake board"
          >
            {boardCells}
          </div>
        </div>
      </div>
    </main>
  );
}
