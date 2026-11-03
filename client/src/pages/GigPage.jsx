import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, money, ago } from '../api';
import { CatIcon, Stars, Avatar } from '../ui.jsx';
import { useAuth } from '../auth.jsx';

export default function GigPage() {
  const { id } = useParams();
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [g, setG] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { api(`/gigs/${id}`).then(setG).catch((e) => setErr(e.message)); }, [id]);
  if (!g) return <main className="page">{err || 'Loading…'}</main>;

  const hire = async () => {
    if (!user) return nav('/login', { state: { from: `/gig/${id}` } });
    try {
      await api('/orders', { method: 'POST', body: { gigId: g.id } });
      await refresh();
      nav('/dashboard');
    } catch (e) { setErr(e.message); }
  };

  const isOwner = user?.id === g.sellerId;

  return (
    <main className="page two-col">
      <section>
        <div className={`thumb big t-${g.category}`}>
          <span className="tag">{g.category}</span>
          <span className="icon-box"><CatIcon name={g.category} size={48} /></span>
        </div>
        <h1 className="gig-title">{g.title}</h1>
        <div className="seller lg">
          <Avatar name={g.seller?.name} />
          <Link to={`/profile/${g.sellerId}`}>{g.seller?.name}</Link>
          <Stars value={g.rating} count={g.reviewCount} />
        </div>
        <h3>About this gig</h3>
        <p className="muted">{g.description || 'No description yet.'}</p>

        <h3>Reviews</h3>
        {g.reviews.length === 0 && <p className="muted">No reviews yet. Be the first to hire and review.</p>}
        {g.reviews.map((r) => (
          <div key={r.id} className="review">
            <div className="seller"><Avatar name={r.buyer?.name} size={28} />{r.buyer?.name}<span className="stars">{'★'.repeat(r.rating)}</span></div>
            <p>{r.comment || 'Great work.'}</p>
            <small className="muted">{ago(r.createdAt)}</small>
          </div>
        ))}
      </section>

      <aside className="panel sticky">
        <div className="price">{money(g.price)}</div>
        <p className="muted">Delivered in {g.days} days. Payment stays in escrow until you approve.</p>
        {err && <p className="error">{err}</p>}
        {isOwner ? (
          <p className="muted">This is your gig.</p>
        ) : user?.role === 'freelancer' ? (
          <p className="muted">Switch to a client account to hire.</p>
        ) : (
          <button className="btn full" onClick={hire}>Hire for {money(g.price)}</button>
        )}
        {!isOwner && user && <Link className="btn ghost full" to={`/chat/${g.sellerId}`}>Message {g.seller?.name.split(' ')[0]}</Link>}
      </aside>
    </main>
  );
}