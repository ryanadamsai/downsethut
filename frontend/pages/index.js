import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import GameTable from "../components/GameTable";
import LeaderboardTable from "../components/LeaderboardTable";
import OverviewCards from "../components/OverviewCards";
import PlayFeed from "../components/PlayFeed";
import TeamSpotlight from "../components/TeamSpotlight";
import { getGame, getGames, getOverview, searchPlays } from "../lib/api";

const seasons = Array.from({ length: 2026 - 1999 + 1 }, (_, index) => 2026 - index);
const PAGE_SIZE = 200;
const NGS_TABS = ["passing", "rushing", "receiving"];

function looksLikeGameId(value) {
  return /^\d{4}_\d{2}_[A-Z0-9]{2,4}_[A-Z0-9]{2,4}$/i.test(value.trim());
}

export default function HomePage() {
  const [season, setSeason] = useState("all");
  const [team, setTeam] = useState("");
  const [search, setSearch] = useState("");
  const [games, setGames] = useState([]);
  const [overview, setOverview] = useState(null);
  const [ngsTab, setNgsTab] = useState("passing");
  const [totalGames, setTotalGames] = useState(0);
  const [gamesOffset, setGamesOffset] = useState(0);
  const [searchResults, setSearchResults] = useState([]);
  const [exactGameMatch, setExactGameMatch] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [error, setError] = useState("");

  const numericSeason = season === "all" ? undefined : Number(season);

  useEffect(() => {
    let active = true;

    async function loadGames() {
      setLoadingGames(true);
      setError("");
      try {
        const payload = await getGames({
          season: numericSeason,
          team,
          limit: PAGE_SIZE,
          offset: gamesOffset
        });
        if (!active) {
          return;
        }
        const nextGames = payload.games || [];
        setTotalGames(payload.total || 0);
        setGames((previousGames) => {
          if (gamesOffset === 0) {
            return nextGames;
          }
          const merged = new Map(previousGames.map((game) => [game.game_id, game]));
          nextGames.forEach((game) => {
            merged.set(game.game_id, game);
          });
          return Array.from(merged.values());
        });
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err.message || "Failed to load games.");
        if (gamesOffset === 0) {
          setGames([]);
          setTotalGames(0);
        }
      } finally {
        if (active) {
          setLoadingGames(false);
        }
      }
    }

    loadGames();
    return () => {
      active = false;
    };
  }, [numericSeason, team, gamesOffset]);

  useEffect(() => {
    let active = true;

    async function loadOverview() {
      setLoadingOverview(true);
      try {
        const payload = await getOverview({ season: numericSeason, team });
        if (active) {
          setOverview(payload);
        }
      } catch (err) {
        if (active) {
          setOverview(null);
          setError(err.message || "Failed to load overview.");
        }
      } finally {
        if (active) {
          setLoadingOverview(false);
        }
      }
    }

    loadOverview();
    return () => {
      active = false;
    };
  }, [numericSeason, team]);

  async function onSearchSubmit(event) {
    event.preventDefault();
    const query = search.trim();
    if (!query) {
      setSearchResults([]);
      setExactGameMatch(null);
      setHasSearched(false);
      return;
    }

    setLoadingSearch(true);
    setHasSearched(true);
    setError("");
    setSearchResults([]);
    setExactGameMatch(null);
    try {
      const shouldLookupGame = looksLikeGameId(query);
      const [payload, gamePayload] = await Promise.all([
        searchPlays(query, 40),
        shouldLookupGame ? getGame(query).catch(() => null) : Promise.resolve(null)
      ]);
      setSearchResults(payload.results || []);
      setExactGameMatch(gamePayload?.game || null);
    } catch (err) {
      setError(err.message || "Search failed.");
      setSearchResults([]);
      setExactGameMatch(null);
    } finally {
      setLoadingSearch(false);
    }
  }

  const matchingGame = useMemo(() => {
    if (exactGameMatch) {
      return exactGameMatch;
    }
    const value = search.trim().toLowerCase();
    if (!value) {
      return null;
    }
    return games.find((game) => String(game.game_id).toLowerCase() === value) || null;
  }, [exactGameMatch, games, search]);

  const ngsPayload = overview?.ngs?.[ngsTab] || { leaders: [], metric_label: "Metric" };
  const ngsColumns = [
    { key: "player_display_name", label: "Player" },
    { key: "team_abbr", label: "Team" },
    { key: ngsPayload.metric, label: ngsPayload.metric_label || "Metric" },
    { key: "player_position", label: "Pos" }
  ].filter((column) => column.key);
  const canLoadMore = games.length < totalGames;

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">NFL Analytics</p>
          <h1>Data nerd playground</h1>
          <p className="hero-copy">
            Play-by-play, schedule context, rosters, snap counts, and public Next Gen Stats in one lightweight dashboard.
          </p>
          <div className="hero-actions">
            <Link href="/snake" className="link-button">
              Play 2026 Snake
            </Link>
          </div>
        </div>
      </section>

      <section className="controls card">
        <div className="control-row">
          <label>
            <span>Season</span>
            <select
              value={season}
              onChange={(event) => {
                setSeason(event.target.value);
                setGamesOffset(0);
              }}
            >
              <option value="all">All seasons</option>
              {seasons.map((value) => (
                <option key={value} value={String(value)}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Team Filter</span>
            <input
              value={team}
              onChange={(event) => {
                setTeam(event.target.value.toUpperCase());
                setGamesOffset(0);
              }}
              placeholder="KC"
              maxLength={8}
            />
          </label>
        </div>

        <form className="search-row" onSubmit={onSearchSubmit}>
          <label className="search-label">
            <span>Search by team, phrase, or game_id</span>
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setHasSearched(false);
                setExactGameMatch(null);
                setSearchResults([]);
                setError("");
              }}
              placeholder="2025_01_BAL_KC, Mahomes, blitz, KC"
            />
          </label>
          <button type="submit" className="primary-button">
            {loadingSearch ? "Searching..." : "Search"}
          </button>
        </form>

        {matchingGame ? (
          <div className="quick-link">
            Exact game match:
            <Link href={`/game/${matchingGame.game_id}`}>{matchingGame.game_id}</Link>
          </div>
        ) : null}
        {error ? <div className="error-text">{error}</div> : null}
      </section>

      {loadingOverview ? <div className="empty-state">Loading overview...</div> : null}
      {overview ? <OverviewCards summary={overview.summary} dataSources={overview.data_sources} /> : null}
      {overview?.featured_team ? <TeamSpotlight team={overview.featured_team} /> : null}

      <LeaderboardTable
        title="Top Offensive Teams"
        rows={overview?.top_teams || []}
        columns={[
          { key: "team", label: "Team" },
          { key: "record", label: "Record" },
          { key: "epa_per_play", label: "EPA / Play" },
          { key: "success_rate", label: "Success %" },
          { key: "explosive_rate", label: "Explosive %" },
          { key: "pass_rate", label: "Pass %" }
        ]}
        emptyLabel="No team summary data available."
      />

      <section className="card">
        <div className="card-header">
          <h2>NGS Leaders</h2>
          <span>{ngsPayload.metric_label || "Metric"}</span>
        </div>
        <div className="tab-row">
          {NGS_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`tab-button${ngsTab === tab ? " active" : ""}`}
              onClick={() => setNgsTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <LeaderboardTable
          title=""
          rows={ngsPayload.leaders || []}
          columns={ngsColumns}
          emptyLabel="No NGS leaders for this filter."
          cardless
        />
      </section>

      {loadingGames && games.length === 0 ? <div className="empty-state">Loading games...</div> : <GameTable games={games} total={totalGames} />}

      {games.length > 0 && canLoadMore ? (
        <div className="load-more-row">
          <button
            type="button"
            className="primary-button"
            onClick={() => setGamesOffset((currentValue) => currentValue + PAGE_SIZE)}
            disabled={loadingGames}
          >
            {loadingGames ? "Loading..." : "Load more games"}
          </button>
          <span>{games.length} of {totalGames} games loaded</span>
        </div>
      ) : null}

      {searchResults.length > 0 ? (
        <PlayFeed plays={searchResults} title="Search Results" />
      ) : hasSearched && !loadingSearch ? (
        <div className="empty-state">No results found.</div>
      ) : null}
    </main>
  );
}
