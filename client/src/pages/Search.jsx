import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, money } from '../api';
import { CatIcon, Stars, Avatar } from '../ui.jsx';
import { useAuth } from '../auth.jsx';
import SearchBox from '../SearchBox.jsx';

function Result({ g, mine }) {
  return (
    <article className="gig result">
      <Link to={`/gig/${g.id}`} className="result-link">
        <div className={`thumb t-${g.category}`}>
          <span className="tag">{g.category}</span>
          <span className="icon-box"><CatIcon name={g.category} size={30} /></span>
        </div>
      </Link>
      <div className="gig-body">
        <Link to={`/profile/${g.seller?.id}`} className="seller result-seller">
          <Avatar name={g.seller?.name} src={g.seller?.avatar} size={26} />
          {g.seller?.name}
        </Link>
        <Link to={`/gig/${g.id}`} className="result-link"><h3>{g.title}</h3></Link>
        <div className="gig-foot"><Stars value={g.rating} count={g.reviewCount} /><b>{money(g.price)}</b></div>
        <div className="result-actions">
          <Link className="btn ghost small" to={`/gig/${g.id}`}>View gig</Link>
          {!mine && <Link className="btn small" to={`/chat/${g.seller?.id}`}>Message</Link>}
        </div>
      </div>
    </article>
  );
}

export default function Search() {
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const cat = params.get('cat') || '';
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api(`/search?q=${encodeURIComponent(q)}&cat=${encodeURIComponent(cat)}`)
      .then(setData)
      .catch(() => setData({ exact: [], related: [] }));
  }, [q, cat]);

  const people = data ? new Set(data.exact.map((g) => g.seller?.id)).size : 0;

  return (
    <main className="page">
      <SearchBox />
      <h1 className="search-title">Results for “{q}”</h1>
      {!data ? (
        <p className="muted">Searching…</p>
      ) : (
        <>
          <p className="muted">
            {data.exact.length
              ? `${data.exact.length} gig${data.exact.length > 1 ? 's' : ''} from ${people} freelancer${people > 1 ? 's' : ''}`
              : 'No freelancer offers this exact service yet.'}
          </p>
          {data.exact.length > 0 && (
            <div className="grid">{data.exact.map((g) => <Result key={g.id} g={g} mine={user?.id === g.seller?.id} />)}</div>
          )}
          {data.related.length > 0 && (
            <>
              <h2>{data.exact.length ? 'More in' : 'Related gigs in'} {cat}</h2>
              <div className="grid">{data.related.map((g) => <Result key={g.id} g={g} mine={user?.id === g.seller?.id} />)}</div>
            </>
          )}
          {!data.exact.length && !data.related.length && (
            <div className="empty">
              <p>Nothing found. Try a broader word like “design”, “website” or “video”.</p>
              <Link className="btn" to="/">Browse all gigs</Link>
            </div>
          )}
        </>
      )}
    </main>
  );
}
