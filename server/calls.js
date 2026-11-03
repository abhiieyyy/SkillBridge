// server/calls.js  (ES module. If your server uses require(), see the note in the chat.)
// Adds: live-call signaling, file upload/download, scheduled call requests.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import express from 'express';

const here = path.dirname(fileURLToPath(import.meta.url));
const UP = path.join(here, 'uploads');
const DB = path.join(here, 'callreqs.json');
fs.mkdirSync(UP, { recursive: true });

const loadReqs = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return []; } };
const saveReqs = (a) => fs.writeFileSync(DB, JSON.stringify(a));
const rid = () => crypto.randomBytes(12).toString('hex');
const IMG = /^image\/(png|jpe?g|gif|webp)$/;

// auth = your existing middleware that sets req.user (the one your other /api routes use)
export default function setupCalls({ app, io, auth }) {
  // ---------- who is each socket? ----------
  const uidOf = (s) => s.data?.user?.id ?? s.data?.userId ?? s.user?.id ?? s.userId ?? s.data?.id;
  const online = new Map(); // userId -> Set(socket)
  const emitTo = (uid, ev, payload) => online.get(String(uid))?.forEach((s) => s.emit(ev, payload));

  io.on('connection', (socket) => {
    const me = uidOf(socket);
    if (me == null) return console.warn('[calls] socket has no user id; adjust uidOf() in server/calls.js');
    const key = String(me);
    if (!online.has(key)) online.set(key, new Set());
    online.get(key).add(socket);
    socket.on('disconnect', () => { online.get(key)?.delete(socket); });

    // pure relay: the browsers negotiate the call between themselves
    ['call:invite', 'call:accept', 'call:reject', 'call:end', 'call:signal'].forEach((ev) => {
      socket.on(ev, (p = {}) => {
        const to = p.to;
        if (to == null) return;
        const { to: _drop, ...rest } = p;
        if (!online.get(String(to))?.size) {
          if (ev === 'call:invite') socket.emit('call:reject', { from: to, reason: 'offline' });
          return;
        }
        emitTo(to, ev, { ...rest, from: me });
      });
    });
  });

  // let ?token= work for <img src> and download links
  const tokenFromQuery = (req, _res, next) => {
    if (!req.headers.authorization && req.query.token) req.headers.authorization = `Bearer ${req.query.token}`;
    next();
  };

  // ---------- files ----------
  app.post('/api/files', auth, express.raw({ type: '*/*', limit: '25mb' }), (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Empty file' });
    const id = rid();
    const name = String(req.query.name || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
    const type = String(req.query.type || 'application/octet-stream').slice(0, 100);
    fs.writeFileSync(path.join(UP, id), req.body);
    fs.writeFileSync(path.join(UP, `${id}.json`), JSON.stringify({ name, type, size: req.body.length, owner: req.user.id }));
    res.json({ id, name, type, size: req.body.length });
  });

  app.get('/api/files/:id', tokenFromQuery, auth, (req, res) => {
    const id = req.params.id;
    if (!/^[a-f0-9]{24}$/.test(id)) return res.status(404).end();
    let meta;
    try { meta = JSON.parse(fs.readFileSync(path.join(UP, `${id}.json`), 'utf8')); } catch { return res.status(404).end(); }
    const inline = IMG.test(meta.type); // only real images display in the browser; everything else downloads
    res.setHeader('Content-Type', inline ? meta.type : 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${meta.name}"`);
    fs.createReadStream(path.join(UP, id)).pipe(res);
  });

  // ---------- scheduled call requests ----------
  app.post('/api/call-requests', auth, express.json(), (req, res) => {
    const { to, at, mins, video, note } = req.body || {};
    if (!to || String(to) === String(req.user.id)) return res.status(400).json({ error: 'Choose someone to call.' });
    if (!Number.isFinite(at) || at < Date.now()) return res.status(400).json({ error: 'Pick a time in the future.' });
    const r = {
      id: rid(), from: req.user.id, to: isNaN(+to) ? to : +to, at, mins: [15, 30, 60].includes(mins) ? mins : 30,
      video: !!video, note: String(note || '').slice(0, 400), status: 'pending', createdAt: Date.now(),
    };
    const all = loadReqs(); all.push(r); saveReqs(all);
    emitTo(r.to, 'callreq:update', r);
    res.json(r);
  });

  app.get('/api/call-requests', auth, (req, res) => {
    const me = String(req.user.id), other = String(req.query.with || '');
    res.json(loadReqs().filter((r) => (String(r.from) === me && String(r.to) === other) || (String(r.to) === me && String(r.from) === other)));
  });

  app.post('/api/call-requests/:id/respond', auth, express.json(), (req, res) => {
    const status = req.body?.status;
    const all = loadReqs();
    const r = all.find((x) => x.id === req.params.id);
    const me = String(req.user.id);
    if (!r || (String(r.from) !== me && String(r.to) !== me)) return res.status(404).json({ error: 'Request not found.' });
    if (r.status !== 'pending') return res.status(409).json({ error: 'This request was already answered.' });
    const okRecipient = String(r.to) === me && ['accepted', 'declined'].includes(status);
    const okSender = String(r.from) === me && status === 'cancelled';
    if (!okRecipient && !okSender) return res.status(403).json({ error: 'You cannot do that.' });
    r.status = status;
    saveReqs(all);
    emitTo(r.from, 'callreq:update', r);
    emitTo(r.to, 'callreq:update', r);
    res.json(r);
  });
}