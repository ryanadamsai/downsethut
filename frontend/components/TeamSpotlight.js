function MetricLine({ label, value, suffix = "" }) {
  return (
    <div className="team-metric">
      <span className="label">{label}</span>
      <strong>{value === null || value === undefined ? "—" : `${value}${suffix}`}</strong>
    </div>
  );
}

export default function TeamSpotlight({ team }) {
  if (!team) {
    return null;
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2>{team.team_name || team.team} Spotlight</h2>
        <span>{team.record || "No record available"}</span>
      </div>
      <div className="spotlight-grid">
        <div className="spotlight-panel">
          <p className="eyebrow">Offense</p>
          <div className="team-metrics">
            <MetricLine label="Plays" value={team.offense?.plays} />
            <MetricLine label="EPA / Play" value={team.offense?.epa_per_play} />
            <MetricLine label="Success Rate" value={team.offense?.success_rate} suffix="%" />
            <MetricLine label="Explosive Rate" value={team.offense?.explosive_rate} suffix="%" />
            <MetricLine label="Pass Rate" value={team.offense?.pass_rate} suffix="%" />
          </div>
        </div>
        <div className="spotlight-panel">
          <p className="eyebrow">Defense</p>
          <div className="team-metrics">
            <MetricLine label="Plays Faced" value={team.defense?.plays} />
            <MetricLine label="EPA / Play" value={team.defense?.epa_per_play} />
            <MetricLine label="Success Rate" value={team.defense?.success_rate} suffix="%" />
            <MetricLine label="Explosive Rate" value={team.defense?.explosive_rate} suffix="%" />
            <MetricLine label="Pass Rate" value={team.defense?.pass_rate} suffix="%" />
          </div>
        </div>
      </div>
      <div className="spotlight-grid">
        <div className="spotlight-panel">
          <p className="eyebrow">Snap Leaders</p>
          <div className="mini-list">
            {team.snap_leaders?.length ? (
              team.snap_leaders.map((player) => (
                <div key={`${player.player}-${player.position}`} className="mini-row">
                  <span>{player.player}</span>
                  <span>{player.total_snaps} snaps</span>
                </div>
              ))
            ) : (
              <div className="muted">No snap data loaded.</div>
            )}
          </div>
        </div>
        <div className="spotlight-panel">
          <p className="eyebrow">Roster Spotlight</p>
          <div className="mini-list">
            {team.roster_spotlight?.length ? (
              team.roster_spotlight.map((player) => (
                <div key={`${player.full_name}-${player.position}`} className="mini-row">
                  <span>{player.full_name}</span>
                  <span>{player.position || player.depth_chart_position || "—"}</span>
                </div>
              ))
            ) : (
              <div className="muted">No roster data loaded.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
