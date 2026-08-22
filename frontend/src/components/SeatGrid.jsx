export default function SeatGrid({ seats, selectedIds, onToggle }) {
  const rows = {};
  for (const s of seats) {
    if (!rows[s.row_label]) rows[s.row_label] = [];
    rows[s.row_label].push(s);
  }
  const rowLabels = Object.keys(rows).sort();

  return (
    <div>
      <div className="screen-label">Screen this way</div>
      <div className="screen" />
      <div className="seat-map">
        {rowLabels.map((label) => (
          <div className="seat-row" key={label}>
            <div className="seat-row-label">{label}</div>
            {rows[label]
              .sort((a, b) => a.seat_number - b.seat_number)
              .map((seat) => {
                const isSelected = selectedIds.includes(seat.id);
                const status = isSelected ? 'selected' : seat.status;
                const disabled = seat.status !== 'available' && !isSelected;
                return (
                  <button
                    key={seat.id}
                    className="seat"
                    data-status={status}
                    disabled={disabled}
                    title={`${seat.row_label}${seat.seat_number} · ${seat.category} · ${seat.status}`}
                    onClick={() => onToggle(seat)}
                  >
                    {seat.seat_number}
                  </button>
                );
              })}
          </div>
        ))}
      </div>
      <div className="legend">
        <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--green)' }} /> Available</div>
        <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--dark)' }} /> Selected</div>
        <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--amber)' }} /> Held</div>
        <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--crimson)' }} /> Booked</div>
      </div>
    </div>
  );
}
