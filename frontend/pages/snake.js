import { useEffect, useMemo, useRef, useState } from "react";

import { createChillMusicController } from "../lib/snakeMusic.mjs";
import { BOARD_SIZE, DIRECTIONS, MAX_PLAYERS, PLAYER_CONFIGS, TICK_MS, canTurn, createInitialState, getTotalScore, pointKey, stepGame } from "../lib/snake.mjs";

const LOCAL_BEST_KEY = "snake-2026-best";
const PLAYER_COUNT_KEY = "snake-2026-players";
const SOUND_KEY = "snake-2026-sound";
const SWIPE_THRESHOLD = 18;

const SOLO_KEY_TO_DIRECTION = {
  arrowup: DIRECTIONS.UP,
  w: DIRECTIONS.UP,
  arrowdown: DIRECTIONS.DOWN,
  s: DIRECTIONS.DOWN,
  arrowleft: DIRECTIONS.LEFT,
  a: DIRECTIONS.LEFT,
  arrowright: DIRECTIONS.RIGHT,
  d: DIRECTIONS.RIGHT
};

const PLAYER_KEY_BINDINGS = Object.freeze({
  p1: {
    arrowup: DIRECTIONS.UP,
    arrowdown: DIRECTIONS.DOWN,
    arrowleft: DIRECTIONS.LEFT,
    arrowright: DIRECTIONS.RIGHT
  },
  p2: {
    w: DIRECTIONS.UP,
    s: DIRECTIONS.DOWN,
    a: DIRECTIONS.LEFT,
    d: DIRECTIONS.RIGHT
  },
  p3: {
    i: DIRECTIONS.UP,
    k: DIRECTIONS.DOWN,
    j: DIRECTIONS.LEFT,
    l: DIRECTIONS.RIGHT
  },
  p4: {
    t: DIRECTIONS.UP,
    g: DIRECTIONS.DOWN,
    f: DIRECTIONS.LEFT,
    h: DIRECTIONS.RIGHT
  }
});

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

function readStoredPlayerCount() {
  return Math.min(Math.max(readStoredNumber(PLAYER_COUNT_KEY, 1), 1), MAX_PLAYERS);
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

function getDirectionCommand(key, playerCount) {
  if (playerCount === 1) {
    const direction = SOLO_KEY_TO_DIRECTION[key];
    return direction ? { playerId: "p1", direction } : null;
  }

  return PLAYER_CONFIGS.slice(0, playerCount)
    .map((player) => {
      const direction = PLAYER_KEY_BINDINGS[player.id]?.[key];
      return direction ? { playerId: player.id, direction } : null;
    })
    .find(Boolean) || null;
}

function createPendingDirections(game) {
  return Object.fromEntries(game.players.filter((player) => player.alive).map((player) => [player.id, player.direction]));
}

export default function SnakePage() {
  const [playerCount, setPlayerCount] = useState(1);
  const [game, setGame] = useState(() => createInitialState({ boardSize: BOARD_SIZE, playerCount: 1 }));
  const [isRunning, setIsRunning] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [worldBest, setWorldBest] = useState(null);
  const [worldAvailable, setWorldAvailable] = useState(false);
  const pendingDirectionsRef = useRef(createPendingDirections(createInitialState({ boardSize: BOARD_SIZE, playerCount: 1 })));
  const gestureStartRef = useRef(null);
  const musicControllerRef = useRef(null);
  const submittedWorldScoreRef = useRef(null);

  const totalScore = useMemo(() => getTotalScore(game), [game]);

  function applyGame(nextGame, { autoStart = true } = {}) {
    pendingDirectionsRef.current = createPendingDirections(nextGame);
    setGame(nextGame);
    setIsRunning(autoStart);
  }

  function resetGame({ autoStart = true, playerCountOverride = playerCount, nextDirections } = {}) {
    const nextGame = createInitialState({
      boardSize: BOARD_SIZE,
      playerCount: playerCountOverride
    });
    submittedWorldScoreRef.current = null;

    if (nextDirections) {
      nextGame.players = nextGame.players.map((player) => {
        const requestedDirection = nextDirections[player.id];
        return canTurn(player.direction, requestedDirection)
          ? {
              ...player,
              direction: requestedDirection
            }
          : player;
      });
    }

    applyGame(nextGame, { autoStart });
  }

  function queueDirection(playerId, direction) {
    const player = game.players.find((entry) => entry.id === playerId && entry.alive);
    if (!player) {
      return;
    }

    const basisDirection = pendingDirectionsRef.current[playerId] || player.direction;
    if (!canTurn(basisDirection, direction)) {
      return;
    }

    pendingDirectionsRef.current = {
      ...pendingDirectionsRef.current,
      [playerId]: direction
    };

    if (!game.gameOver) {
      setIsRunning(true);
    }
  }

  function togglePlayback() {
    if (game.gameOver) {
      resetGame({ autoStart: true });
      return;
    }

    setIsRunning((currentValue) => !currentValue);
  }

  function handlePlayerCountChange(nextPlayerCount) {
    setPlayerCount(nextPlayerCount);
    resetGame({
      autoStart: true,
      playerCountOverride: nextPlayerCount
    });
  }

  function handlePointerDown(event) {
    if (playerCount !== 1) {
      return;
    }

    gestureStartRef.current = {
      x: event.clientX,
      y: event.clientY
    };
  }

  function handlePointerUp(event) {
    if (playerCount !== 1) {
      if (game.gameOver) {
        resetGame({ autoStart: true });
      }
      return;
    }

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
        resetGame({
          autoStart: true,
          nextDirections: { p1: direction }
        });
      } else {
        queueDirection("p1", direction);
      }
      return;
    }

    if (game.gameOver) {
      resetGame({ autoStart: true });
    }
  }

  useEffect(() => {
    const storedPlayerCount = readStoredPlayerCount();
    setBestScore(readStoredNumber(LOCAL_BEST_KEY, 0));
    setSoundEnabled(readStoredFlag(SOUND_KEY, false));
    setPlayerCount(storedPlayerCount);
    applyGame(
      createInitialState({
        boardSize: BOARD_SIZE,
        playerCount: storedPlayerCount
      }),
      { autoStart: true }
    );
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
    window.localStorage.setItem(PLAYER_COUNT_KEY, String(playerCount));
  }, [playerCount]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(SOUND_KEY, String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    if (totalScore <= bestScore || typeof window === "undefined") {
      return;
    }

    setBestScore(totalScore);
    window.localStorage.setItem(LOCAL_BEST_KEY, String(totalScore));
  }, [bestScore, totalScore]);

  useEffect(() => {
    if (!musicControllerRef.current) {
      musicControllerRef.current = createChillMusicController();
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

    if (soundEnabled && isRunning && !game.gameOver) {
      controller.start();
    } else {
      controller.stop();
    }
  }, [game.gameOver, isRunning, soundEnabled]);

  useEffect(() => {
    if (!game.gameOver || !worldAvailable || totalScore <= 0) {
      return;
    }
    if (submittedWorldScoreRef.current === totalScore) {
      return;
    }
    if (worldBest !== null && totalScore <= worldBest) {
      return;
    }

    submittedWorldScoreRef.current = totalScore;

    fetch("/api/snake-score", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ score: totalScore })
    })
      .then((response) => response.json())
      .then((payload) => {
        setWorldAvailable(Boolean(payload.available));
        if (Number.isFinite(payload.score)) {
          setWorldBest(payload.score);
        }
      })
      .catch(() => {});
  }, [game.gameOver, totalScore, worldAvailable, worldBest]);

  useEffect(() => {
    function handleKeyDown(event) {
      const normalizedKey = event.key.toLowerCase();
      const command = getDirectionCommand(normalizedKey, playerCount);

      if (command) {
        event.preventDefault();
        if (game.gameOver) {
          resetGame({
            autoStart: true,
            nextDirections: {
              [command.playerId]: command.direction
            }
          });
          return;
        }
        queueDirection(command.playerId, command.direction);
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

      if (normalizedKey === "m") {
        event.preventDefault();
        setSoundEnabled((currentValue) => !currentValue);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [game.gameOver, playerCount]);

  useEffect(() => {
    if (!isRunning || game.gameOver) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setGame((currentGame) => {
        const nextGame = stepGame(currentGame, {
          nextDirections: pendingDirectionsRef.current,
          random: Math.random
        });
        pendingDirectionsRef.current = createPendingDirections(nextGame);
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

  const cellMap = useMemo(() => {
    const map = new Map();
    game.players.forEach((player) => {
      player.snake.forEach((segment, index) => {
        map.set(pointKey(segment), {
          player,
          index
        });
      });
    });
    return map;
  }, [game.players]);

  const foodCellKey = game.food ? pointKey(game.food) : "";
  const boardCells = useMemo(() => {
    const cells = [];

    for (let y = 0; y < game.boardSize; y += 1) {
      for (let x = 0; x < game.boardSize; x += 1) {
        const key = `${x}:${y}`;
        let className = "snake-cell";
        let style;
        const occupant = cellMap.get(key);

        if (key === foodCellKey) {
          className += " food";
        } else if (occupant) {
          className += occupant.index === 0 ? " snake-head" : " snake-body";
          style = {
            "--player-hue": occupant.player.hue,
            "--segment-lightness": `${Math.max(54, 76 - occupant.index * 3)}%`,
            "--segment-accent": `${Math.max(44, 58 - occupant.index * 2)}%`,
            "--segment-glow": `${Math.max(8, 16 - occupant.index)}%`
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
  }, [cellMap, foodCellKey, game.boardSize]);

  return (
    <main className={`page-shell snake-screen${game.gameOver ? " is-game-over" : ""}`} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
      <nav className="snake-topnav" aria-label="Snake status">
        <div className="snake-nav-group">
          <div className="snake-stat-pill">
            <span>SCORE</span>
            <strong>{formatScore(totalScore)}</strong>
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

        {playerCount > 1 ? (
          <div className="snake-nav-group">
            {game.players.map((player) => (
              <div
                key={player.id}
                className={`snake-player-pill${player.alive ? "" : " muted"}`}
                style={{ "--player-hue": player.hue }}
              >
                <span>{player.label}</span>
                <strong>{formatScore(player.score)}</strong>
              </div>
            ))}
          </div>
        ) : null}
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

        <div className="snake-mode-toggle" role="group" aria-label="Player count">
          {Array.from({ length: MAX_PLAYERS }, (_, index) => index + 1).map((count) => (
            <button
              key={count}
              type="button"
              className={`snake-mode-pill${playerCount === count ? " active" : ""}`}
              onClick={() => handlePlayerCountChange(count)}
            >
              {count}P
            </button>
          ))}
        </div>

        <div className="snake-nav-group">
          <button
            type="button"
            className={`snake-control-pill${soundEnabled ? " active" : ""}`}
            onClick={() => setSoundEnabled((currentValue) => !currentValue)}
          >
            Sound
          </button>
        </div>
      </nav>
    </main>
  );
}
