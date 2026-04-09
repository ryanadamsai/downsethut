function formatValue(value, suffix = "") {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "number") {
    return `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`;
  }
  return `${value}${suffix}`;
}

export default function OverviewCards({ summary, dataSources }) {
  const cards = [
    { label: "Plays", value: summary?.plays },
    { label: "Games", value: summary?.games },
    { label: "Teams", value: summary?.teams },
    { label: "EPA / Play", value: summary?.avg_epa_per_play },
    { label: "Explosive Rate", value: summary?.explosive_rate, suffix: "%" },
    { label: "Pass Rate", value: summary?.pass_rate, suffix: "%" }
  ];

  return (
    <section className="card">
      <div className="card-header">
        <h2>Playground Snapshot</h2>
        <span>{summary?.seasons?.length ? summary.seasons.join(", ") : "No season filter"}</span>
      </div>
      <div className="metric-grid">
        {cards.map((card) => (
          <div key={card.label} className="metric-card">
            <span className="label">{card.label}</span>
            <strong>{formatValue(card.value, card.suffix)}</strong>
          </div>
        ))}
      </div>
      <div className="data-source-row">
        <span>Plays: {dataSources?.plays || "unknown"}</span>
        <span>NGS: {dataSources?.ngs?.length ? dataSources.ngs.join(", ") : "not loaded"}</span>
        <span>Aux rows: games {dataSources?.auxiliary?.games ?? 0}, rosters {dataSources?.auxiliary?.rosters ?? 0}</span>
      </div>
    </section>
  );
}
