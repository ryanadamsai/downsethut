import Link from "next/link";

export default function GameTable({ games, total }) {
  if (!games?.length) {
    return <div className="empty-state">No games matched your filters.</div>;
  }

  const countLabel =
    typeof total === "number"
      ? games.length < total
        ? `${games.length} of ${total} loaded`
        : `${total} results`
      : `${games.length} results`;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Games</h2>
        <span>{countLabel}</span>
      </div>
      <div className="table-wrap">
        <table className="game-table">
          <thead>
            <tr>
              <th>Game</th>
              <th>Season</th>
              <th>Week</th>
              <th>Teams</th>
              <th>Date</th>
              <th>Score</th>
              <th>Plays</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {games.map((game) => (
              <tr key={game.game_id}>
                <td>{game.game_id}</td>
                <td>{game.season}</td>
                <td>{game.week}</td>
                <td>{game.teams}</td>
                <td>{game.gameday || "—"}</td>
                <td>
                  {game.away_score ?? "—"} - {game.home_score ?? "—"}
                </td>
                <td>{game.play_count}</td>
                <td>
                  <Link href={`/game/${game.game_id}`} className="link-button">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
