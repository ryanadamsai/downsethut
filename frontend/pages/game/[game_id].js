import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import PlayFeed from "../../components/PlayFeed";
import { getGame, getPlays } from "../../lib/api";

export default function GameDetailPage() {
  const router = useRouter();
  const { game_id: gameId } = router.query;
  const [game, setGame] = useState(null);
  const [plays, setPlays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!gameId) {
      return;
    }

    let active = true;

    async function loadGame() {
      setLoading(true);
      setError("");
      try {
        const [gamePayload, playsPayload] = await Promise.all([getGame(gameId), getPlays(gameId)]);
        if (!active) {
          return;
        }
        setGame(gamePayload.game || null);
        setPlays(playsPayload.plays || []);
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err.message || "Failed to load game.");
        setGame(null);
        setPlays([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadGame();
    return () => {
      active = false;
    };
  }, [gameId]);

  const gameInsights = useMemo(() => {
    if (!plays.length) {
      return null;
    }

    const withEpa = plays
      .map((play) => ({ ...play, epaNumber: Number(play.epa ?? 0), yardsNumber: Number(play.yards_gained ?? 0) }))
      .filter((play) => Number.isFinite(play.epaNumber));

    const passPlays = plays.filter((play) => ["pass", "sack"].includes(play.play_type)).length;
    const rushPlays = plays.filter((play) => play.play_type === "run").length;
    const explosivePlays = plays.filter((play) => Number(play.yards_gained ?? 0) >= 20).length;
    const avgEpa = withEpa.length
      ? (withEpa.reduce((total, play) => total + play.epaNumber, 0) / withEpa.length).toFixed(3)
      : "—";
    const bestPlay = withEpa.length ? [...withEpa].sort((left, right) => right.epaNumber - left.epaNumber)[0] : null;

    return {
      passPlays,
      rushPlays,
      explosivePlays,
      avgEpa,
      bestPlay
    };
  }, [plays]);

  return (
    <main className="page-shell">
      <div className="page-top">
        <Link href="/" className="back-link">
          Back to dashboard
        </Link>
      </div>

      {loading ? <div className="empty-state">Loading game...</div> : null}
      {error ? <div className="error-text">{error}</div> : null}

      {game ? (
        <section className="card summary-grid">
          <div>
            <p className="eyebrow">Game</p>
            <h1>{game.teams || game.game_id}</h1>
            <p className="hero-copy compact-copy">{game.gameday || "Date TBD"} {game.gametime || ""}</p>
          </div>
          <div className="summary-stats">
            <div>
              <span className="label">Game ID</span>
              <strong>{game.game_id}</strong>
            </div>
            <div>
              <span className="label">Season / Week</span>
              <strong>{game.season} / {game.week}</strong>
            </div>
            <div>
              <span className="label">Score</span>
              <strong>{game.away_team} {game.away_score ?? "—"} - {game.home_score ?? "—"} {game.home_team}</strong>
            </div>
            <div>
              <span className="label">Venue</span>
              <strong>{game.stadium || game.location || "Unknown"}</strong>
            </div>
          </div>
        </section>
      ) : null}

      {gameInsights ? (
        <section className="card">
          <div className="card-header">
            <h2>Game Snapshot</h2>
            <span>{plays.length} plays</span>
          </div>
          <div className="metric-grid">
            <div className="metric-card">
              <span className="label">Pass Plays</span>
              <strong>{gameInsights.passPlays}</strong>
            </div>
            <div className="metric-card">
              <span className="label">Rush Plays</span>
              <strong>{gameInsights.rushPlays}</strong>
            </div>
            <div className="metric-card">
              <span className="label">Explosive Plays</span>
              <strong>{gameInsights.explosivePlays}</strong>
            </div>
            <div className="metric-card">
              <span className="label">Average EPA</span>
              <strong>{gameInsights.avgEpa}</strong>
            </div>
          </div>
          {gameInsights.bestPlay ? (
            <div className="best-play">
              <span className="label">Best EPA Play</span>
              <strong>{gameInsights.bestPlay.description}</strong>
            </div>
          ) : null}
        </section>
      ) : null}

      {!loading ? <PlayFeed plays={plays} title="Play-by-Play" /> : null}
    </main>
  );
}
