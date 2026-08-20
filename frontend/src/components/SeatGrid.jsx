const CATEGORY_COLORS = {
  Premium: '#B77DB4',
  Standard: '#D7A8CE',
};

export default function SeatGrid({ seats, selectedIds, onToggle }) {
  const rows = {};
  for (const s of seats) {
    if (!rows[s.row_label]) rows[s.row_label] = [];
    rows[s.row_label].push(s);
  }
  const rowLabels = Object.keys(rows).sort();

  return (
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
      <div className="legend">
        <div className="legend-item"><span className="legend-swatch" style={{ background: 'rgba(232,201,220,0.55)' }} /> Available</div>
        <div className="legend-item"><span className="legend-swatch" style={{ background: 'linear-gradient(135deg,#B77DB4,#623D70)' }} /> Selected</div>
        <div className="legend-item"><span className="legend-swatch" style={{ background: 'rgba(142,87,148,0.55)' }} /> Held / Offered</div>
        <div className="legend-item"><span className="legend-swatch" style={{ background: '#392846' }} /> Booked</div>
      </div>
    </div>
  );
}

export { CATEGORY_COLORS };
