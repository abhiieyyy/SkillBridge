import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import http from 'http';
import fs from 'fs';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { Server } from 'socket.io';
import 'dotenv/config';
import Razorpay from 'razorpay';
import { OAuth2Client } from 'google-auth-library';
import setupCalls from './calls.js';
import setupPhoneAuth from './phoneauth.js';
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const PORT = process.env.PORT || 5001;
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;
const GOOGLE_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = GOOGLE_ID ? new OAuth2Client(GOOGLE_ID) : null;
const FEE = 0.1; // platform keeps 10% of every completed order

// ---------- real SQL database (file: skillbridge.db, created automatically) ----------
const db = new Database(process.env.DB_FILE || 'skillbridge.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
db.exec(`
CREATE TABLE IF NOT EXISTS profiles (
  userId TEXT PRIMARY KEY REFERENCES users(id),
  headline TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '',
  github TEXT NOT NULL DEFAULT '',
  linkedin TEXT NOT NULL DEFAULT '',
  twitter TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  resumeName TEXT NOT NULL DEFAULT '',
  resumeData TEXT NOT NULL DEFAULT '',
  updatedAt INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  createdAt INTEGER NOT NULL
);
`);

const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const id = () => crypto.randomUUID();
const now = () => Date.now();
const avatarUrl = (uid) => {
  const p = one(`SELECT updatedAt FROM profiles WHERE userId = ? AND avatar != ''`, uid);
  return p ? `/api/avatar/${uid}?v=${p.updatedAt}` : '';
};
const card = (uid) => {
  const u = one('SELECT id, name, role, bio FROM users WHERE id = ?', uid);
  return u && { ...u, avatar: avatarUrl(uid) };
};
const me = (u) => ({ id: u.id, name: u.name, role: u.role, bio: u.bio, email: u.email, balance: u.balance, avatar: avatarUrl(u.id) });
const tx = (userId, type, amount, note) => run('INSERT INTO transactions VALUES (?,?,?,?,?,?)', id(), userId, type, amount, note, now());
const amountOf = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; };

class Bad extends Error {}
const fail = (res, code, error) => res.status(code).json({ error });

// ---------- demo data (only on a fresh database) ----------
if (!one('SELECT COUNT(*) n FROM users').n) {
  const hash = bcrypt.hashSync('demo123', 8);
  const f = id(), c = id();
  run('INSERT INTO users VALUES (?,?,?,?,?,?,?,?)', f, 'Aarav Sharma', 'freelancer@demo.com', hash, 'freelancer', 0, 'Full-stack developer and UI designer', now());
  run('INSERT INTO users VALUES (?,?,?,?,?,?,?,?)', c, 'Riya Verma', 'client@demo.com', hash, 'client', 10000, '', now());
  [
    ['I will design a clean, modern logo for your brand', 'Design', 1500, 3],
    ['I will build your React website with a Node backend', 'Development', 8000, 7],
    ['I will write SEO-friendly blog posts', 'Writing', 1200, 2],
    ['I will edit your YouTube videos with captions', 'Video', 2500, 4],
    ['I will set up and run your Instagram ads', 'Marketing', 3000, 5],
  ].forEach(([t, cat, price, days]) =>
    run('INSERT INTO gigs VALUES (?,?,?,?,?,?,?,?)', id(), f, t, cat, 'Clear communication, quick turnaround and one free revision. Message me before ordering if you have special requirements.', price, days, now()));
}

const withStats = (g) => {
  const s = one('SELECT AVG(rating) a, COUNT(*) n FROM reviews WHERE gigId = ?', g.id);
  return { ...g, rating: s.a || 0, reviewCount: s.n, seller: card(g.sellerId) };
};

const auth = (req, res, next) => {
  try {
    const t = (req.headers.authorization || '').split(' ')[1];
    req.user = one('SELECT * FROM users WHERE id = ?', jwt.verify(t, SECRET).id);
    if (!req.user) throw new Error();
    next();
  } catch { fail(res, 401, 'Please log in to continue'); }
};
const only = (role) => (req, res, next) => (req.user.role === role ? next() : fail(res, 403, `Only ${role}s can do this`));

const app = express();
app.use(cors());
app.use(express.json({ limit: '6mb' }));
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---------- auth ----------
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name?.trim() || !email?.includes('@') || (password || '').length < 6) throw new Bad('Enter a name, a valid email and a password of 6+ characters');
  if (!['freelancer', 'client'].includes(role)) throw new Bad('Choose whether you want to work or hire');
  const mail = email.trim().toLowerCase();
  if (one('SELECT id FROM users WHERE email = ?', mail)) throw new Bad('An account with this email already exists');
  const uid = id();
  run('INSERT INTO users VALUES (?,?,?,?,?,?,?,?)', uid, name.trim(), mail, bcrypt.hashSync(password, 8), role, 0, '', now());
  res.json({ token: jwt.sign({ id: uid }, SECRET, { expiresIn: '7d' }), user: me(one('SELECT * FROM users WHERE id = ?', uid)) });
});
app.post('/api/auth/login', (req, res) => {
  const u = one('SELECT * FROM users WHERE email = ?', (req.body.email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(req.body.password || '', u.password)) throw new Bad('Wrong email or password');
  res.json({ token: jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' }), user: me(u) });
});
app.get('/api/me', auth, (req, res) => res.json(me(req.user)));
app.get('/api/users/:id', auth, (req, res) => {
  const u = card(req.params.id);
  u ? res.json(u) : fail(res, 404, 'User not found');
});

// ---------- gigs ----------
app.get('/api/gigs', (req, res) => {
  const q = `%${req.query.q || ''}%`, c = req.query.category || '';
  const max = Number(req.query.max) || 1e9;
  const gigs = all(`SELECT * FROM gigs WHERE (? = '' OR category = ?) AND (title LIKE ? OR description LIKE ?) AND price <= ? ORDER BY createdAt DESC`, c, c, q, q, max).map(withStats);
  const sorts = {
    low: (a, b) => a.price - b.price,
    high: (a, b) => b.price - a.price,
    rated: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
  };
  if (sorts[req.query.sort]) gigs.sort(sorts[req.query.sort]);
  res.json(gigs);
});
app.get('/api/gigs/:id', (req, res) => {
  const g = one('SELECT * FROM gigs WHERE id = ?', req.params.id);
  if (!g) return fail(res, 404, 'Gig not found');
  const reviews = all('SELECT * FROM reviews WHERE gigId = ? ORDER BY createdAt DESC', g.id).map((r) => ({ ...r, buyer: card(r.buyerId) }));
  res.json({ ...withStats(g), reviews });
});
app.post('/api/gigs', auth, only('freelancer'), (req, res) => {
  const { title, category, description, price, days } = req.body;
  if (!title?.trim() || !category || amountOf(price) <= 0) throw new Bad('Add a title, category and a price above 0');
  const gid = id();
  run('INSERT INTO gigs VALUES (?,?,?,?,?,?,?,?)', gid, req.user.id, title.trim(), category, (description || '').trim(), amountOf(price), Number(days) || 3, now());
  res.json(withStats(one('SELECT * FROM gigs WHERE id = ?', gid)));
});
app.get('/api/my/gigs', auth, only('freelancer'), (req, res) =>
  res.json(all('SELECT * FROM gigs WHERE sellerId = ? ORDER BY createdAt DESC', req.user.id).map(withStats)));
app.get('/api/my/stats', auth, only('freelancer'), (req, res) => {
  const earned = one(`SELECT COALESCE(SUM(amount),0) t FROM transactions WHERE userId = ? AND type = 'earning'`, req.user.id).t;
  const o = one(`SELECT SUM(status = 'completed') done, SUM(status != 'completed') active FROM orders WHERE sellerId = ?`, req.user.id);
  const r = one('SELECT AVG(rating) a, COUNT(*) n FROM reviews WHERE sellerId = ?', req.user.id);
  res.json({ earned, done: o.done || 0, active: o.active || 0, rating: r.a || 0, reviews: r.n });
});

app.delete('/api/gigs/:id', auth, only('freelancer'), (req, res) => {
  const g = one('SELECT * FROM gigs WHERE id = ? AND sellerId = ?', req.params.id, req.user.id);
  if (!g) return fail(res, 404, 'Gig not found');
  if (one('SELECT COUNT(*) n FROM orders WHERE gigId = ?', g.id).n) throw new Bad('This gig already has orders, so it cannot be deleted');
  run('DELETE FROM gigs WHERE id = ?', g.id);
  res.json({ ok: true });
});

// ---------- orders (payment is held in escrow until the client approves) ----------
const placeOrder = db.transaction((user, g) => {
  const paid = run('UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?', g.price, user.id, g.price);
  if (!paid.changes) throw new Bad('Not enough balance. Add funds in your wallet first');
  const oid = id();
  run('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?)', oid, g.id, g.title, g.price, user.id, g.sellerId, 'in_progress', 0, now());
  tx(user.id, 'payment', -g.price, `Held in escrow: ${g.title}`);
  return oid;
});
app.post('/api/orders', auth, only('client'), (req, res) => {
  const g = one('SELECT * FROM gigs WHERE id = ?', req.body.gigId);
  if (!g) return fail(res, 404, 'Gig not found');
  res.json(one('SELECT * FROM orders WHERE id = ?', placeOrder(req.user, g)));
});
app.get('/api/orders', auth, (req, res) => {
  const rows = all('SELECT * FROM orders WHERE buyerId = ? OR sellerId = ? ORDER BY createdAt DESC', req.user.id, req.user.id);
  res.json(rows.map((o) => ({ ...o, reviewed: !!o.reviewed, other: card(o.buyerId === req.user.id ? o.sellerId : o.buyerId) })));
});
app.post('/api/orders/:id/deliver', auth, only('freelancer'), (req, res) => {
  const r = run(`UPDATE orders SET status = 'delivered' WHERE id = ? AND sellerId = ? AND status = 'in_progress'`, req.params.id, req.user.id);
  if (!r.changes) throw new Bad('This order cannot be delivered');
  res.json({ ok: true });
});
const releasePayment = db.transaction((orderId, buyerId) => {
  const o = one('SELECT * FROM orders WHERE id = ? AND buyerId = ?', orderId, buyerId);
  if (!o || o.status !== 'delivered') throw new Bad('Wait for the freelancer to deliver first');
  const payout = Math.round(o.price * (1 - FEE) * 100) / 100;
  run(`UPDATE orders SET status = 'completed' WHERE id = ?`, o.id);
  run('UPDATE users SET balance = balance + ? WHERE id = ?', payout, o.sellerId);
  tx(o.sellerId, 'earning', payout, `Earned: ${o.title} (after ${FEE * 100}% platform fee)`);
});
app.post('/api/orders/:id/complete', auth, only('client'), (req, res) => {
  releasePayment(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---------- reviews ----------
const addReview = db.transaction((user, orderId, rating, comment) => {
  const o = one('SELECT * FROM orders WHERE id = ? AND buyerId = ?', orderId, user.id);
  if (!o || o.status !== 'completed' || o.reviewed) throw new Bad('You can review a completed order once');
  run('INSERT INTO reviews VALUES (?,?,?,?,?,?,?,?)', id(), o.id, o.gigId, o.sellerId, user.id, rating, comment, now());
  run('UPDATE orders SET reviewed = 1 WHERE id = ?', o.id);
});
app.post('/api/reviews', auth, only('client'), (req, res) => {
  const r = Math.round(Number(req.body.rating));
  if (!(r >= 1 && r <= 5)) throw new Bad('Pick a rating from 1 to 5');
  addReview(req.user, req.body.orderId, r, (req.body.comment || '').trim().slice(0, 500));
  res.json({ ok: true });
});

// ---------- config, Google sign-in, Razorpay payments ----------
app.get('/api/config', (req, res) => res.json({ googleClientId: GOOGLE_ID, razorpay: !!razorpay }));

app.post('/api/auth/google', async (req, res, next) => {
  try {
    if (!googleClient) throw new Bad('Google sign-in is not set up yet');
    let p;
    try {
      const t = await googleClient.verifyIdToken({ idToken: req.body.credential, audience: GOOGLE_ID });
      p = t.getPayload();
    } catch { throw new Bad('Google sign-in failed. Try again'); }
    if (!p.email_verified) throw new Bad('Your Google email is not verified');
    const mail = p.email.toLowerCase();
    let u = one('SELECT * FROM users WHERE email = ?', mail);
    if (!u) {
      if (!['freelancer', 'client'].includes(req.body.role))
        throw new Bad('New here? Open the Sign up tab, choose hire or work, then continue with Google');
      const uid = id();
      run('INSERT INTO users VALUES (?,?,?,?,?,?,?,?)', uid, p.name || mail.split('@')[0], mail, bcrypt.hashSync(crypto.randomUUID(), 8), req.body.role, 0, '', now());
      u = one('SELECT * FROM users WHERE id = ?', uid);
    }
    res.json({ token: jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' }), user: me(u) });
  } catch (e) { next(e); }
});

app.post('/api/payments/order', auth, async (req, res, next) => {
  try {
    if (!razorpay) throw new Bad('Payments are not set up yet. Add the Razorpay keys to server/.env');
    const a = amountOf(req.body.amount);
    if (a < 1 || a > 100000) throw new Bad('Enter an amount between 1 and 1,00,000');
    const order = await razorpay.orders.create({ amount: Math.round(a * 100), currency: 'INR', receipt: id().slice(0, 20) });
    run('INSERT INTO payments VALUES (?,?,?,?,?,?)', order.id, req.user.id, a, 'created', null, now());
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, name: req.user.name, email: req.user.email });
  } catch (e) { next(e); }
});

const creditPayment = db.transaction((orderId, userId, paymentId) => {
  const p = one('SELECT * FROM payments WHERE id = ? AND userId = ?', orderId, userId);
  if (!p) throw new Bad('Payment not found');
  if (p.status === 'paid') return; // already credited, never credit twice
  run(`UPDATE payments SET status = 'paid', paymentId = ? WHERE id = ?`, paymentId, orderId);
  run('UPDATE users SET balance = balance + ? WHERE id = ?', p.amount, userId);
  tx(userId, 'deposit', p.amount, 'Funds added via Razorpay');
});
app.post('/api/payments/verify', auth, (req, res) => {
  const { razorpay_order_id: o, razorpay_payment_id: pid, razorpay_signature: sig } = req.body;
  if (!razorpay || !o || !pid || !sig) throw new Bad('Invalid payment details');
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${o}|${pid}`).digest('hex');
  const given = String(sig);
  const ok = expected.length === given.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
  if (!ok) throw new Bad('Payment could not be verified');
  creditPayment(o, req.user.id, pid);
  res.json({ balance: one('SELECT balance FROM users WHERE id = ?', req.user.id).balance });
});

// ---------- wallet ----------
app.get('/api/wallet', auth, (req, res) =>
  res.json({ balance: req.user.balance, transactions: all('SELECT * FROM transactions WHERE userId = ? ORDER BY createdAt DESC', req.user.id) }));
app.post('/api/wallet/deposit', auth, (req, res) => {
  const a = amountOf(req.body.amount);
  if (razorpay) throw new Bad('Use the Razorpay button to add funds');
  if (a <= 0 || a > 100000) throw new Bad('Enter an amount between 1 and 1,00,000');
  db.transaction(() => { run('UPDATE users SET balance = balance + ? WHERE id = ?', a, req.user.id); tx(req.user.id, 'deposit', a, 'Funds added'); })();
  res.json({ balance: one('SELECT balance FROM users WHERE id = ?', req.user.id).balance });
});
app.post('/api/wallet/withdraw', auth, only('freelancer'), (req, res) => {
  const a = amountOf(req.body.amount);
  if (a <= 0) throw new Bad('Enter an amount above 0');
  db.transaction(() => {
    const r = run('UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?', a, req.user.id, a);
    if (!r.changes) throw new Bad('You cannot withdraw more than your balance');
    tx(req.user.id, 'withdrawal', -a, 'Withdrawn to bank account');
  })();
  res.json({ balance: one('SELECT balance FROM users WHERE id = ?', req.user.id).balance });
});

// ---------- chat ----------
const MSG = `SELECT id, fromId AS "from", toId AS "to", text, createdAt FROM messages`;
app.get('/api/chats', auth, (req, res) => {
  const last = new Map();
  all(`${MSG} WHERE fromId = ? OR toId = ? ORDER BY createdAt ASC`, req.user.id, req.user.id)
    .forEach((m) => last.set(m.from === req.user.id ? m.to : m.from, m));
  res.json([...last].map(([uid, m]) => ({ user: card(uid), last: m })).sort((a, b) => b.last.createdAt - a.last.createdAt));
});
app.get('/api/messages/:uid', auth, (req, res) =>
  res.json(all(`${MSG} WHERE (fromId = ? AND toId = ?) OR (fromId = ? AND toId = ?) ORDER BY createdAt ASC`, req.user.id, req.params.uid, req.params.uid, req.user.id)));

// ---------- rich profiles: photo, links, projects, resume ----------
const txt = (v, n) => String(v ?? '').trim().slice(0, n);
const cleanLink = (v, base = '') => {
  v = txt(v, 200);
  if (!v) return '';
  if (base && /^@?[\w-]+$/.test(v)) v = base + v.replace(/^@/, '');
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; }
};
const cleanList = (v, max, len) =>
  String(v ?? '').split(',').map((s) => s.trim().slice(0, len)).filter(Boolean).slice(0, max).join(',');
const IMG_RE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const ensureProfile = (uid) => run('INSERT OR IGNORE INTO profiles (userId) VALUES (?)', uid);
const sendImage = (res, dataUrl) => {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl || '');
  if (!m) return res.status(404).end();
  res.set({ 'Content-Type': m[1], 'Cache-Control': 'public, max-age=86400' });
  res.send(Buffer.from(m[2], 'base64'));
};

const PROFILE_FIELDS = {
  headline: (v) => txt(v, 80),
  location: (v) => txt(v, 60),
  skills: (v) => cleanList(v, 12, 24),
  github: (v) => cleanLink(v, 'https://github.com/'),
  linkedin: (v) => cleanLink(v, 'https://www.linkedin.com/in/'),
  twitter: (v) => cleanLink(v, 'https://x.com/'),
  instagram: (v) => cleanLink(v, 'https://instagram.com/'),
  website: (v) => cleanLink(v),
};

app.get('/api/people/:id', (req, res) => {
  const u = one('SELECT id, name, role, bio, createdAt FROM users WHERE id = ?', req.params.id);
  if (!u) return fail(res, 404, 'User not found');
  const p = one(
    `SELECT headline, location, skills, github, linkedin, twitter, instagram, website, resumeName, updatedAt,
            avatar != '' AS hasAvatar, resumeData != '' AS hasResume FROM profiles WHERE userId = ?`, u.id
  ) || { headline: '', location: '', skills: '', github: '', linkedin: '', twitter: '', instagram: '', website: '', resumeName: '', updatedAt: 0, hasAvatar: 0, hasResume: 0 };
  const projects = all('SELECT * FROM projects WHERE userId = ? ORDER BY createdAt DESC', u.id).map((x) => ({
    id: x.id, title: x.title, description: x.description, link: x.link,
    tags: x.tags ? x.tags.split(',') : [], image: x.image ? `/api/project-image/${x.id}` : '',
  }));
  const gigs = all('SELECT * FROM gigs WHERE sellerId = ? ORDER BY createdAt DESC', u.id).map(withStats);
  const s = one('SELECT AVG(rating) a, COUNT(*) n FROM reviews WHERE sellerId = ?', u.id);
  const done = one(`SELECT COUNT(*) n FROM orders WHERE sellerId = ? AND status = 'completed'`, u.id).n;
  res.json({
    id: u.id, name: u.name, role: u.role, bio: u.bio, joined: u.createdAt,
    headline: p.headline, location: p.location, skills: p.skills ? p.skills.split(',') : [],
    links: { github: p.github, linkedin: p.linkedin, twitter: p.twitter, instagram: p.instagram, website: p.website },
    avatar: p.hasAvatar ? `/api/avatar/${u.id}?v=${p.updatedAt}` : '',
    resume: p.hasResume ? { name: p.resumeName, url: `/api/resume/${u.id}` } : null,
    projects, gigs, rating: s.a || 0, reviewCount: s.n, completed: done,
  });
});

app.put('/api/people/me', auth, (req, res) => {
  const b = req.body || {};
  ensureProfile(req.user.id);
  db.transaction(() => {
    if (b.bio !== undefined) run('UPDATE users SET bio = ? WHERE id = ?', txt(b.bio, 500), req.user.id);
    for (const [k, clean] of Object.entries(PROFILE_FIELDS))
      if (b[k] !== undefined) run(`UPDATE profiles SET ${k} = ? WHERE userId = ?`, clean(b[k]), req.user.id);
    if (b.avatar !== undefined) {
      if (b.avatar !== '' && (!IMG_RE.test(b.avatar) || b.avatar.length > 400000)) throw new Bad('Choose a smaller PNG, JPG or WebP image');
      run('UPDATE profiles SET avatar = ? WHERE userId = ?', b.avatar, req.user.id);
    }
    run('UPDATE profiles SET updatedAt = ? WHERE userId = ?', now(), req.user.id);
  })();
  res.json(me(one('SELECT * FROM users WHERE id = ?', req.user.id)));
});

app.post('/api/people/me/resume', auth, (req, res) => {
  const m = /^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(req.body?.data || '');
  if (!m || m[1].length > 4500000) throw new Bad('Upload a PDF smaller than 3 MB');
  if (!Buffer.from(m[1].slice(0, 16), 'base64').toString('latin1').startsWith('%PDF')) throw new Bad('That file is not a valid PDF');
  ensureProfile(req.user.id);
  const name = txt(req.body.name, 80).replace(/[^\w. -]/g, '_') || 'resume.pdf';
  run('UPDATE profiles SET resumeName = ?, resumeData = ?, updatedAt = ? WHERE userId = ?', name, m[1], now(), req.user.id);
  res.json({ ok: true });
});
app.delete('/api/people/me/resume', auth, (req, res) => {
  run(`UPDATE profiles SET resumeName = '', resumeData = '' WHERE userId = ?`, req.user.id);
  res.json({ ok: true });
});

app.post('/api/people/me/projects', auth, (req, res) => {
  const b = req.body || {};
  const title = txt(b.title, 80);
  if (!title) throw new Bad('Give your project a title');
  if (one('SELECT COUNT(*) n FROM projects WHERE userId = ?', req.user.id).n >= 12) throw new Bad('You can showcase up to 12 projects');
  const image = b.image || '';
  if (image && (!IMG_RE.test(image) || image.length > 900000)) throw new Bad('Choose a smaller cover image');
  run('INSERT INTO projects VALUES (?,?,?,?,?,?,?,?)', id(), req.user.id, title, txt(b.description, 400), cleanLink(b.link), cleanList(b.tags, 8, 24), image, now());
  res.json({ ok: true });
});
app.delete('/api/people/me/projects/:id', auth, (req, res) => {
  run('DELETE FROM projects WHERE id = ? AND userId = ?', req.params.id, req.user.id);
  res.json({ ok: true });
});

// public files (images and resumes are shown on public pages)
app.get('/api/avatar/:id', (req, res) => sendImage(res, one('SELECT avatar FROM profiles WHERE userId = ?', req.params.id)?.avatar));
app.get('/api/project-image/:id', (req, res) => sendImage(res, one('SELECT image FROM projects WHERE id = ?', req.params.id)?.image));
app.get('/api/resume/:id', (req, res) => {
  const p = one('SELECT resumeName, resumeData FROM profiles WHERE userId = ?', req.params.id);
  if (!p?.resumeData) return fail(res, 404, 'No resume uploaded');
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${p.resumeName || 'resume.pdf'}"` });
  res.send(Buffer.from(p.resumeData, 'base64'));
});

// ---------- search ----------
const STOP = new Set(['i','will','your','you','my','me','a','an','the','for','and','to','of','with','in','on','or']);
app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80).toLowerCase();
  const cat = String(req.query.cat || '').slice(0, 40);
  const words = [...new Set(q.split(/[^a-z0-9+#]+/).filter((w) => w.length > 1 && !STOP.has(w)))].slice(0, 6);
  const gigs = all('SELECT * FROM gigs ORDER BY createdAt DESC').map(withStats);
  const score = (g) => {
    const hay = `${g.title} ${g.description} ${g.category} ${g.seller?.name || ''}`.toLowerCase();
    return words.filter((w) => hay.includes(w)).length;
  };
  const exact = gigs
    .map((g) => ({ g, s: score(g) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.g.rating - a.g.rating)
    .map((x) => x.g);
  const ids = new Set(exact.map((g) => g.id));
  const related = cat ? gigs.filter((g) => !ids.has(g.id) && g.category === cat) : [];
  res.json({ q, cat, exact, related });
});

// ---------- realtime: sockets, then calls / files / call requests ----------
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
io.use((s, next) => {
  try { s.userId = jwt.verify(s.handshake.auth.token, SECRET).id; next(); } catch { next(new Error('auth')); }
});
io.on('connection', (s) => {
  s.join(s.userId);
  s.on('send', ({ to, text }) => {
    if (!text?.trim() || to === s.userId || !card(to)) return;
    const m = { id: id(), from: s.userId, to, text: text.trim().slice(0, 1000), createdAt: now() };
    run('INSERT INTO messages VALUES (?,?,?,?,?)', m.id, m.from, m.to, m.text, m.createdAt);
    io.to(to).to(s.userId).emit('message', m);
  });
});

// voice/video calls, file attachments and scheduled call requests (see calls.js)
setupCalls({ app, io, auth });

// sign in with a phone number + one-time code (see phoneauth.js)
setupPhoneAuth({ app, db, one, run, id, now, me, Bad, SECRET, bcrypt, jwt });

// ---------- errors (must stay after all routes, including setupCalls) ----------
app.use((e, req, res, next) => {
  if (e instanceof Bad) return fail(res, 400, e.message);
  console.error(e);
  fail(res, 500, 'Server error. Check the server terminal for details');
});

server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is busy. Run with another port, e.g. PORT=5002 npm start` : e);
  process.exit(1);
});
server.listen(PORT, () => console.log(`SkillBridge API running on http://localhost:${PORT} (database: skillbridge.db)`));