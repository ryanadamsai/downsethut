export default function PlayFeed({ plays, title = "Plays" }) {
  if (!plays?.length) {
    return <div className="empty-state">No plays available.</div>;
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>{title}</h2>
        <span>{plays.length} rows</span>
      </div>
      <div className="play-feed">
        {plays.map((play, index) => (
          <div key={`${play.game_id}-${index}`} className="play-item">
            <div className="play-meta">
              <span>{play.team_offense} vs {play.team_defense}</span>
              <span>{play.timestamp || "No clock"}</span>
              <span>{play.play_type || "unknown"}</span>
            </div>
            <div className="play-description">{play.description}</div>
            <div className="play-details">
              <span>Down: {play.down ?? "-"}</span>
              <span>Distance: {play.distance ?? "-"}</span>
              <span>Yards: {play.yards_gained ?? "-"}</span>
              <span>EPA: {play.epa ?? "-"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
