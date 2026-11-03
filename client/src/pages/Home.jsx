import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api';
import { CATS, CatIcon, Stars, Avatar, Empty } from '../ui.jsx';
import { useAuth } from '../auth.jsx';
import TiltCard from '../TiltCard.jsx';
import SearchBox from '../SearchBox.jsx';
export default function Home() {
  const { user } = useAuth();
  const [gigs, setGigs] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [sort, setSort] = useState('new');
  const [max, setMax] = useState('');
  const names = Object.keys(CATS);

  useEffect(() => {
    const url = `/gigs?q=${encodeURIComponent(q)}&category=${cat}&sort=${sort}&max=${max}`;
    const t = setTimeout(() => api(url).then(setGigs).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q, cat, sort, max]);

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>Hire great talent. Get paid for your skills.</h1>
          <p>Clients pay into escrow, freelancers deliver, and the money is released only when the work is approved.</p>
          <div className="search">
          <SearchBox />      
        </div>
          <ul className="trust">
            <li>Escrow protected</li>
            <li>UPI, cards and net banking</li>
            <li>Flat 10% fee</li>
          </ul>
          {!user && <Link to="/login" className="btn light">Create a free account</Link>}
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...names, ...names, ...names, ...names, ...names, ...names].map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </div>
      </div>

      <main className="page">
        <div className="section-head">
          <h2>Featured gigs</h2>
          <span className="muted">{gigs.length} available</span>
        </div>

        <div className="filters">
          <div className="chips">
            <button className={!cat ? 'chip on' : 'chip'} onClick={() => setCat('')}>All</button>
            {names.map((c) => (
              <button key={c} className={cat === c ? 'chip on' : 'chip'} onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>
          <div className="toolbar">
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort gigs">
              <option value="new">Newest</option>
              <option value="rated">Top rated</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
            </select>
            <input type="number" min="1" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Max price (₹)" />
          </div>
        </div>

        {gigs.length === 0 ? (
          <Empty title="No gigs match your search" hint="Try a different word, category or price." />
        ) : (
          <div className="grid cards">
            {gigs.map((g, i) => (
              <TiltCard key={g.id} to={`/gig/${g.id}`} delay={(i % 6) * 80}>
                <div className="tilt-inner">
                  <div className={`thumb t-${g.category}`}>
                    <span className="tag">{g.category}</span>
                    <span className="idx">{String(i + 1).padStart(2, '0')}</span>
                    <span className="icon-box"><CatIcon name={g.category} size={30} /></span>
                  </div>
                  <div className="gig-body">
                    <div className="seller"><Avatar name={g.seller?.name} size={26} />{g.seller?.name}</div>
                    <h3>{g.title}</h3>
                    <div className="gig-foot">
                      <Stars value={g.rating} count={g.reviewCount} />
                      <b>{money(g.price)}</b>
                    </div>
                  </div>
                  <span className="glare" />
                </div>
              </TiltCard>
            ))}
          </div>
        )}
      </main>
    </>
  );
}