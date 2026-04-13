import { useEffect, useMemo, useRef, useState } from "react";

import { createArcadeMusicController } from "../lib/snakeMusic.mjs";
import { BOARD_SIZE, DIRECTIONS, TICK_MS, canTurn, createInitialState, pointKey, stepGame } from "../lib/snake.mjs";

const LOCAL_BEST_KEY = "snake-2026-best";
const MODE_KEY = "snake-2026-mode";
const MUSIC_KEY = "snake-2026-music";
const MODES = Object.freeze({
  ARCADE: "arcade",
  CHILL: "chill"
});
const TICK_BY_MODE = Object.freeze({
  [MODES.ARCADE]: Math.max(120, TICK_MS - 20),
  [MODES.CHILL]: TICK_MS + 40
});
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

function readStoredNumber(key, fallbackValue = 0) {
  if (typeof window === "undefined") {
    return fallbackValue;
  }

  const value = Number.parseInt(window.localStorage.getItem(key) || "", 10);
  return Number.isFinite(value) ? value : fallbackValue;
}

function readStoredFlag(key, fallbackValue = false) {
  if (typeof window === "undefined") {
    return fallbackValue;
  }

  const value = window.localStorage.getItem(key);
  if (value === null) {
    return fallbackValue;
  }

  return value === "true";
}

function formatScore(score) {
  return `${score ?? 0}`;
}

export default function SnakePage() {
  const [game, setGame] = useState(() => createInitialState({ boardSize: BOARD_SIZE }));
  const [isRunning, setIsRunning] = useState(true);
  const [mode, setMode] = useState(MODES.ARCADE);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [worldBest, setWorldBest] = useState(null);
  const [worldAvailable, setWorldAvailable] = useState(false);
  const pendingDirectionRef = useRef(DIRECTIONS.RIGHT);
  const gestureStartRef = useRef(null);
  const musicControllerRef = useRef(null);
  const submittedWorldScoreRef = useRef(null);

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
    setBestScore(readStoredNumber(LOCAL_BEST_KEY, 0));
    setMode(window.localStorage.getItem(MODE_KEY) || MODES.ARCADE);
    setMusicEnabled(readStoredFlag(MUSIC_KEY, false));
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
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(MUSIC_KEY, String(musicEnabled));
  }, [musicEnabled]);

  useEffect(() => {
    if (game.score <= bestScore || typeof window === "undefined") {
      return;
    }

    setBestScore(game.score);
    window.localStorage.setItem(LOCAL_BEST_KEY, String(game.score));
  }, [bestScore, game.score]);

  useEffect(() => {
    if (!musicControllerRef.current) {
      musicControllerRef.current = createArcadeMusicController();
    }

    return () => {
      musicControllerRef.current?.destroy();
      musicControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = musicControllerRef.current;
    if (!controller) {
      return;
    }

    if (mode === MODES.ARCADE && musicEnabled && isRunning && !game.gameOver) {
      controller.start();
    } else {
      controller.stop();
    }
  }, [game.gameOver, isRunning, mode, musicEnabled]);

  useEffect(() => {
    if (!game.gameOver || !worldAvailable || game.score <= 0) {
      return;
    }
    if (submittedWorldScoreRef.current === game.score) {
      return;
    }
    if (worldBest !== null && game.score <= worldBest) {
      return;
    }

    submittedWorldScoreRef.current = game.score;

    fetch("/api/snake-score", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ score: game.score })
    })
      .then((response) => response.json())
      .then((payload) => {
        setWorldAvailable(Boolean(payload.available));
        if (Number.isFinite(payload.score)) {
          setWorldBest(payload.score);
        }
      })
      .catch(() => {});
  }, [game.gameOver, game.score, worldAvailable, worldBest]);

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

      if (normalizedKey === "m" && mode === MODES.ARCADE) {
        event.preventDefault();
        setMusicEnabled((currentValue) => !currentValue);
      }

      if (normalizedKey === "c") {
        event.preventDefault();
        setMode((currentValue) => (currentValue === MODES.ARCADE ? MODES.CHILL : MODES.ARCADE));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [game.direction, game.gameOver, mode]);

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
    }, TICK_BY_MODE[mode]);

    return () => {
      window.clearInterval(timer);
    };
  }, [game.gameOver, isRunning, mode]);

  useEffect(() => {
    if (game.gameOver) {
      setIsRunning(false);
    }
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
      className={`page-shell snake-screen ${mode === MODES.CHILL ? "chill-mode" : "arcade-mode"}${game.gameOver ? " is-game-over" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <nav className="snake-topnav" aria-label="Snake scoreboard">
        <div className="snake-nav-group">
          <div className="snake-stat-pill">
            <span>SCORE</span>
            <strong>{formatScore(game.score)}</strong>
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

      <nav className="snake-bottomnav" aria-label="Snake controls">
        <div className="snake-nav-group">
          <button type="button" className="snake-control-pill" onClick={() => resetGame({ autoStart: true })}>
            Restart
          </button>
        </div>

        <div className="snake-mode-toggle" role="group" aria-label="Snake mode">
          <button
            type="button"
            className={`snake-mode-pill${mode === MODES.ARCADE ? " active" : ""}`}
            onClick={() => setMode(MODES.ARCADE)}
          >
            Arcade
          </button>
          <button
            type="button"
            className={`snake-mode-pill${mode === MODES.CHILL ? " active" : ""}`}
            onClick={() => setMode(MODES.CHILL)}
          >
            Chill
          </button>
        </div>

        <div className="snake-nav-group">
          <button
            type="button"
            className={`snake-control-pill${musicEnabled && mode === MODES.ARCADE ? " active" : ""}`}
            onClick={() => setMusicEnabled((currentValue) => !currentValue)}
            disabled={mode !== MODES.ARCADE}
          >
            Music
          </button>
        </div>
      </nav>
    </main>
  );
}
