// category names (emoji removed on purpose; icons live in CatIcon below)
export const CATS = { Design: '', Development: '', Writing: '', Video: '', Marketing: '' };

const PATHS = {
  Design: (
    <>
      <path d="M12 3l6 9-3 3H9l-3-3 6-9z" />
      <circle cx="12" cy="11.5" r="1.2" />
      <path d="M12 10.3V3" />
      <path d="M8 20h8" />
    </>
  ),
  Development: (
    <>
      <path d="M8 8l-5 4 5 4" />
      <path d="M16 8l5 4-5 4" />
      <path d="M13.5 5l-3 14" />
    </>
  ),
  Writing: (
    <>
      <path d="M15 5l4 4" />
      <path d="M4 20l1-4.5L16.5 4a2.1 2.1 0 013 3L8 18.5 4 20z" />
      <path d="M13 21h8" />
    </>
  ),
  Video: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M10 9.5v5l4.5-2.5L10 9.5z" />
    </>
  ),
  Marketing: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
};

export function CatIcon({ name, size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export function Stars({ value, count }) {
  return (
    <span className="stars">
      ★ {value ? value.toFixed(1) : 'New'}
      {count ? <small> ({count})</small> : null}
    </span>
  );
}

export function Avatar({ name, src, size = 36 }) {
  const style = { width: size, height: size, fontSize: size * 0.42 };
  return src
    ? <img className="avatar" src={src} alt="" style={style} />
    : <span className="avatar" style={style}>{(name || '?').trim()[0].toUpperCase()}</span>;
}

export function Empty({ title, hint, children }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{hint}</p>
      {children}
    </div>
  );
}