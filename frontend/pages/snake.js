import { useEffect, useMemo, useRef, useState } from "react";

import { BOARD_SIZE, DIRECTIONS, TICK_MS, canTurn, createInitialState, pointKey, stepGame } from "../lib/snake.mjs";

const LOCAL_BEST_KEY = "snake-2026-best";
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

function readStoredNumber(key, fallbackValue = 0) {
  if (typeof window === "undefined") {
    return fallbackValue;
  }

  const value = Number.parseInt(window.localStorage.getItem(key) || "", 10);
  return Number.isFinite(value) ? value : fallbackValue;
}

function formatScore(score) {
  return `${score ?? 0}`;
}

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
  const [game, setGame] = useState(() => createInitialState({ boardSize: BOARD_SIZE, playerCount: 1 }));
  const [isRunning, setIsRunning] = useState(true);
  const [bestScore, setBestScore] = useState(0);
  const [worldBest, setWorldBest] = useState(null);
  const [worldAvailable, setWorldAvailable] = useState(false);
  const pendingDirectionRef = useRef(DIRECTIONS.RIGHT);
  const gestureStartRef = useRef(null);
  const submittedWorldScoreRef = useRef(null);

  const player = game.players[0];

  function resetGame({ autoStart = true, nextDirection } = {}) {
    const nextGame = createInitialState({ boardSize: BOARD_SIZE, playerCount: 1 });
    const direction = canTurn(nextGame.players[0].direction, nextDirection) ? nextDirection : nextGame.players[0].direction;

    nextGame.players = [
      {
        ...nextGame.players[0],
        direction
      }
    ];

    pendingDirectionRef.current = direction;
    submittedWorldScoreRef.current = null;
    setGame(nextGame);
    setIsRunning(autoStart);
  }

  function queueDirection(direction) {
    const basisDirection = pendingDirectionRef.current || player.direction;
    if (!canTurn(basisDirection, direction)) {
      return;
    }

    pendingDirectionRef.current = direction;

    if (!game.gameOver) {
      setIsRunning(true);
    }
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
      if (game.gameOver) {
        resetGame({ autoStart: true });
      }
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
    setBestScore(readStoredNumber(LOCAL_BEST_KEY, 0));
  }, []);

  useEffect(() => {
    let active = true;

    async function loadWorldScore() {
      try {
        const response = await fetch("/api/snake-score");
        const payload = await response.json();
        if (!active) {
          return;
        }
        setWorldAvailable(Boolean(payload.available));
        setWorldBest(Number.isFinite(payload.score) ? payload.score : null);
      } catch {
        if (active) {
          setWorldAvailable(false);
          setWorldBest(null);
        }
      }
    }

    loadWorldScore();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (player.score <= bestScore || typeof window === "undefined") {
      return;
    }

    setBestScore(player.score);
    window.localStorage.setItem(LOCAL_BEST_KEY, String(player.score));
  }, [bestScore, player.score]);

  useEffect(() => {
    if (!game.gameOver || !worldAvailable || player.score <= 0) {
      return;
    }
    if (submittedWorldScoreRef.current === player.score) {
      return;
    }
    if (worldBest !== null && player.score <= worldBest) {
      return;
    }

    submittedWorldScoreRef.current = player.score;

    fetch("/api/snake-score", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ score: player.score })
    })
      .then((response) => response.json())
      .then((payload) => {
        setWorldAvailable(Boolean(payload.available));
        if (Number.isFinite(payload.score)) {
          setWorldBest(payload.score);
        }
      })
      .catch(() => {});
  }, [game.gameOver, player.score, worldAvailable, worldBest]);

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
        if (game.gameOver) {
          resetGame({ autoStart: true });
          return;
        }
        setIsRunning((currentValue) => !currentValue);
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
  }, [game.gameOver, player.direction]);

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
        pendingDirectionRef.current = nextGame.players[0].direction;
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

  const snakeIndexByCell = useMemo(
    () => new Map(player.snake.map((segment, index) => [pointKey(segment), index])),
    [player.snake]
  );
  const foodCellKey = game.food ? pointKey(game.food) : "";
  const headCellKey = player.snake[0] ? pointKey(player.snake[0]) : "";
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
        } else if (snakeIndexByCell.has(key)) {
          const depth = snakeIndexByCell.get(key);
          className += " snake-body";
          style = {
            "--segment-lightness": `${Math.max(52, 76 - depth * 3)}%`,
            "--segment-accent": `${Math.max(42, 58 - depth * 2)}%`,
            "--segment-glow": `${Math.max(8, 18 - depth)}%`
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
  }, [foodCellKey, game.boardSize, headCellKey, snakeIndexByCell]);

  return (
    <main className={`page-shell snake-screen snake-screen-solo${game.gameOver ? " is-game-over" : ""}`} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
      <nav className="snake-topnav snake-topnav-solo" aria-label="Snake status">
        <div className="snake-nav-group">
          <div className="snake-stat-pill">
            <span>SCORE</span>
            <strong>{formatScore(player.score)}</strong>
          </div>
          <div className="snake-stat-pill">
            <span>BEST</span>
            <strong>{formatScore(bestScore)}</strong>
          </div>
          {worldAvailable ? (
            <div className="snake-stat-pill">
              <span>WORLD</span>
              <strong>{formatScore(worldBest)}</strong>
            </div>
          ) : null}
        </div>
      </nav>

      <div className="snake-stage snake-stage-solo">
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
