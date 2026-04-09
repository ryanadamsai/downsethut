export default function LeaderboardTable({ title, rows, columns, emptyLabel = "No data available.", cardless = false }) {
  const content = (
    <>
      {title ? (
        <div className="card-header">
          <h2>{title}</h2>
          <span>{rows?.length || 0} rows</span>
        </div>
      ) : null}
      {!rows?.length ? (
        <div className="empty-state compact">{emptyLabel}</div>
      ) : (
        <div className="table-wrap">
          <table className="game-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.game_id || row.team || row.player_display_name || index}`}>
                  {columns.map((column) => (
                    <td key={column.key}>{column.render ? column.render(row[column.key], row) : row[column.key] ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  if (cardless) {
    return content;
  }

  return <section className="card">{content}</section>;
}
