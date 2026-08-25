// A proper, modern back button -- a real chevron icon (not a big/small text
// "←" character, which renders inconsistently across fonts/OSes) with a
// comfortable clickable area and a hover state, rather than a small text
// link. Renders as a plain <button onClick> when `to` is omitted, or a
// react-router <Link> when `to` is given.
import { Link } from 'react-router-dom';

function ChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export default function BackButton({ to, onClick, children, style }) {
  const content = (
    <>
      <ChevronLeft />
      <span>{children}</span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className="back-btn" style={style}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className="back-btn" onClick={onClick} style={style}>
      {content}
    </button>
  );
}
