import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api';
import { CATS, Empty } from '../ui.jsx';
import { useAuth } from '../auth.jsx';

const LABEL = { in_progress: 'In progress', delivered: 'Delivered', completed: 'Completed' };

function ReviewForm({ orderId, onDone }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');
  const send = async () => {
    try { await api('/reviews', { method: 'POST', body: { orderId, rating, comment } }); onDone(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <div className="review-form">
      <div className="star-pick">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={n <= rating ? 'on' : ''} onClick={() => setRating(n)} aria-label={`${n} stars`}>★</button>
        ))}
      </div>
      <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tell others how it went" />
      <button className="btn small" onClick={send}>Post review</button>
      {err && <p className="error">{err}</p>}
    </div>
  );
}

function Orders() {
  const { user, refresh } = useAuth();
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState('');
  const load = () => api('/orders').then(setOrders);
  useEffect(() => { load(); }, []);

  const act = async (id, action) => {
    setErr('');
    try { await api(`/orders/${id}/${action}`, { method: 'POST' }); await load(); await refresh(); }
    catch (e) { setErr(e.message); }
  };

  if (!orders.length)
    return (
      <Empty title="No orders yet" hint={user.role === 'client' ? 'Find a gig and hire a freelancer to get started.' : 'Orders show up here as soon as a client hires you.'}>
        {user.role === 'client' && <Link className="btn" to="/">Browse gigs</Link>}
      </Empty>
    );

  return (
    <div className="list">
      {err && <p className="error">{err}</p>}
      {orders.map((o) => (
        <div key={o.id} className="row">
          <div className="row-main">
            <b>{o.title}</b>
            <span className="muted">{user.role === 'client' ? 'Freelancer' : 'Client'}: {o.other?.name}</span>
          </div>
          <b>{money(o.price)}</b>
          <span className={`badge ${o.status}`}>{LABEL[o.status]}</span>
          <div className="row-actions">
            <Link className="btn ghost small" to={`/chat/${o.other?.id}`}>Message</Link>
            {user.role === 'freelancer' && o.status === 'in_progress' && <button className="btn small" onClick={() => act(o.id, 'deliver')}>Mark delivered</button>}
            {user.role === 'client' && o.status === 'delivered' && <button className="btn small" onClick={() => act(o.id, 'complete')}>Approve and pay</button>}
          </div>
          {user.role === 'client' && o.status === 'completed' && !o.reviewed && <ReviewForm orderId={o.id} onDone={load} />}
        </div>
      ))}
    </div>
  );
}

function NewGig({ onCreated }) {
  const [f, setF] = useState({ title: '', category: 'Design', price: '', days: 3, description: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try {
      await api('/gigs', { method: 'POST', body: f });
      setF({ title: '', category: 'Design', price: '', days: 3, description: '' });
      onCreated();
    } catch (x) { setErr(x.message); }
  };
  return (
    <form className="panel" onSubmit={submit}>
      <h3>Publish a new gig</h3>
      <label>Title<input value={f.title} onChange={set('title')} placeholder="I will design…" required /></label>
      <div className="grid-3">
        <label>Category<select value={f.category} onChange={set('category')}>{Object.keys(CATS).map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Price (₹)<input type="number" min="1" value={f.price} onChange={set('price')} required /></label>
        <label>Days to deliver<input type="number" min="1" value={f.days} onChange={set('days')} /></label>
      </div>
      <label>Description<textarea rows="3" value={f.description} onChange={set('description')} placeholder="What will the client get?" /></label>
      {err && <p className="error">{err}</p>}
      <button className="btn">Publish gig</button>
    </form>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isFree = user.role === 'freelancer';
  const [gigs, setGigs] = useState([]);
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');

  const loadGigs = () => {
    if (!isFree) return;
    api('/my/gigs').then(setGigs);
    api('/my/stats').then(setStats);
  };
  useEffect(() => { loadGigs(); }, []);

  const remove = async (id) => {
    if (!confirm('Delete this gig?')) return;
    setErr('');
    try { await api(`/gigs/${id}`, { method: 'DELETE' }); loadGigs(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <main className="page">
      <h1>{isFree ? 'My work' : 'My orders'}</h1>
      {isFree && (
        <>
          {stats && (
            <div className="stats">
              <div className="stat"><span>Total earned</span><b>{money(stats.earned)}</b></div>
              <div className="stat"><span>Active orders</span><b>{stats.active}</b></div>
              <div className="stat"><span>Completed</span><b>{stats.done}</b></div>
              <div className="stat"><span>Rating</span><b>★ {stats.rating ? stats.rating.toFixed(1) : 'New'}</b></div>
            </div>
          )}
          <NewGig onCreated={loadGigs} />
          <h2>My gigs</h2>
          {err && <p className="error">{err}</p>}
          <div className="list">
            {gigs.map((g) => (
              <div key={g.id} className="row">
                <Link to={`/gig/${g.id}`} className="row-main"><b>{g.title}</b><span className="muted">{g.category}</span></Link>
                <b>{money(g.price)}</b>
                <span className="stars">★ {g.rating ? g.rating.toFixed(1) : 'New'} ({g.reviewCount})</span>
                <button className="btn ghost small" onClick={() => remove(g.id)}>Delete</button>
              </div>
            ))}
          </div>
          <h2>Orders from clients</h2>
        </>
      )}
      <Orders />
    </main>
  );
}
