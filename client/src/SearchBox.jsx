import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { suggest } from './catalog.js';

export default function SearchBox({ placeholder = 'Search “logo”, “React”, “blog posts”…' }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const list = suggest(q);

  const go = (label, cat) => {
    const text = (label ?? q).trim();
    if (!text) return;
    const c = cat ?? suggest(text)[0]?.cat ?? '';
    setOpen(false);
    setQ(text);
    nav(`/search?q=${encodeURIComponent(text)}&cat=${encodeURIComponent(c)}`);
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
    else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Enter') {
      e.preventDefault();
      active >= 0 ? go(list[active].label, list[active].cat) : go();
    }
  };

  return (
    <div className="search sbox">
      <input
        value={q}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKey}
      />
      {open && list.length > 0 && (
        <ul className="sbox-list" role="listbox">
          <li className="sbox-head">{q.trim() ? 'Matching services' : 'Popular services'}</li>
          {list.map((c, i) => (
            <li
              key={c.label}
              role="option"
              className={i === active ? 'on' : ''}
              onMouseDown={(e) => { e.preventDefault(); go(c.label, c.cat); }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{c.label}</span>
              <small>{c.cat}</small>
            </li>
          ))}
          {q.trim() && (
            <li className="sbox-all" onMouseDown={(e) => { e.preventDefault(); go(); }}>
              Search everything for “{q.trim()}”
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
