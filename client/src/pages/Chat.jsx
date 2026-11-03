import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { api, token, ago } from '../api';
import { useAuth } from '../auth.jsx';
import { Avatar } from '../ui.jsx';
import { useRealtime, Icon } from '../realtime.jsx';

const MAX_MB = 25;
const same = (a, b) => String(a) === String(b);
const at = (m) => new Date(m.createdAt).getTime();

const parse = (text = '') => {
  try {
    if (text.startsWith('::file::')) return { kind: 'file', ...JSON.parse(text.slice(8)) };
    if (text.startsWith('::calllog::')) return { kind: 'log', ...JSON.parse(text.slice(11)) };
  } catch {}
  return { kind: 'text', text };
};
const preview = (text = '') => {
  const p = parse(text);
  return p.kind === 'file' ? `📎 ${p.name}` : p.kind === 'log' ? (p.missed ? 'Missed call' : 'Call') : p.text;
};
const fileUrl = (id) => `/api/files/${id}?token=${token.get()}`;
const fsize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const dur = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} sec` : `${s} sec`);
const fmtWhen = (ms) => new Date(ms).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// calls the same-origin /api (works with your dev proxy, like api())
async function rest(path, opts = {}) {
  const r = await fetch(`/api${path}`, { ...opts, headers: { Authorization: `Bearer ${token.get()}`, ...(opts.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
}
const json = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function downloadIcs(r, name) {
  const f = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Chat//EN', 'BEGIN:VEVENT', `UID:${r.id}@chat`, `DTSTAMP:${f(Date.now())}`,
    `DTSTART:${f(r.at)}`, `DTEND:${f(r.at + r.mins * 60000)}`, `SUMMARY:${r.video ? 'Video' : 'Voice'} call with ${name}`,
    `DESCRIPTION:${(r.note || '').replace(/\n/g, ' ')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
  a.download = 'call.ics';
  a.click();
  URL.revokeObjectURL(a.href);
}

function ScheduleModal({ peer, onClose, onDone }) {
  const [when, setWhen] = useState('');
  const [mins, setMins] = useState(30);
  const [video, setVideo] = useState(true);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const submit = async (e) => {
    e.preventDefault();
    const t = new Date(when).getTime();
    if (!when || t < Date.now()) return setErr('Pick a time in the future.');
    setBusy(true);
    try { onDone(await rest('/call-requests', json({ to: peer.id, at: t, mins, video, note }))); }
    catch (e2) { setErr(e2.message); setBusy(false); }
  };
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit} role="dialog" aria-label="Request a call">
        <h3>Request a call with {peer.name}</h3>
        <p className="muted">They can accept or decline. Accepted calls can be added to your calendar.</p>
        <label>Date and time<input type="datetime-local" min={min} value={when} onChange={(e) => setWhen(e.target.value)} onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch {} }} required /></label>
        <label>Length
          <select value={mins} onChange={(e) => setMins(+e.target.value)}>
            <option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>1 hour</option>
          </select>
        </label>
        <label className="row"><input type="checkbox" checked={video} onChange={(e) => setVideo(e.target.checked)} /> Video call (with screen sharing)</label>
        <label>What do you want to talk about?<textarea rows={3} maxLength={400} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Logo brief and timeline" /></label>
        {err && <div className="form-err">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-solid" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}

function RequestCard({ r, me, peer, onAct, onCallNow }) {
  const mine = same(r.from, me);
  const label = { pending: mine ? 'Waiting for reply' : 'Needs your reply', accepted: 'Accepted', declined: 'Declined', cancelled: 'Cancelled' }[r.status];
  return (
    <div className={`req-card ${r.status} ${mine ? 'mine' : ''}`}>
      <div className="req-head"><Icon name="calendar" size={18} /><b>{mine ? 'You requested a call' : `${peer.name} requested a call`}</b></div>
      <div className="req-when">{fmtWhen(r.at)}</div>
      <div className="req-meta">{r.mins} min · {r.video ? 'Video' : 'Voice'}</div>
      {r.note && <p className="req-note">{r.note}</p>}
      <span className={`req-badge ${r.status}`}>{label}</span>
      <div className="req-actions">
        {r.status === 'pending' && !mine && (<>
          <button className="btn-solid sm" onClick={() => onAct(r.id, 'accepted')}>Accept</button>
          <button className="btn-ghost sm" onClick={() => onAct(r.id, 'declined')}>Decline</button>
        </>)}
        {r.status === 'pending' && mine && <button className="btn-ghost sm" onClick={() => onAct(r.id, 'cancelled')}>Cancel request</button>}
        {r.status === 'accepted' && (<>
          <button className="btn-ghost sm" onClick={() => downloadIcs(r, peer.name)}>Add to calendar</button>
          <button className="btn-solid sm" onClick={() => onCallNow(r.video)}>Call now</button>
        </>)}
      </div>
    </div>
  );
}

export default function Chat() {
  const { uid } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const { socket, startCall, inCall } = useRealtime(); // one shared socket for chat + calls
  const [chats, setChats] = useState([]);
  const [peer, setPeer] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [text, setText] = useState('');
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const uidRef = useRef(uid);
  const end = useRef();
  const fileRef = useRef();
  uidRef.current = uid;

  const loadChats = () => api('/chats').then(setChats).catch(() => {});
  useEffect(() => { loadChats(); }, []);

  useEffect(() => {
    if (!socket) return;
    const onMsg = (m) => {
      if (same(m.from, uidRef.current) || same(m.to, uidRef.current)) setMsgs((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
      loadChats();
    };
    const onReq = (r) => {
      if (same(r.from, uidRef.current) || same(r.to, uidRef.current)) setReqs((p) => (p.some((x) => x.id === r.id) ? p.map((x) => (x.id === r.id ? r : x)) : [...p, r]));
    };
    socket.on('message', onMsg);
    socket.on('callreq:update', onReq);
    return () => { socket.off('message', onMsg); socket.off('callreq:update', onReq); };
  }, [socket]);

  useEffect(() => {
    setErr('');
    if (!uid) { setPeer(null); setMsgs([]); setReqs([]); return; }
    api(`/users/${uid}`).then(setPeer).catch(() => nav('/chat'));
    api(`/messages/${uid}`).then(setMsgs);
    rest(`/call-requests?with=${uid}`).then(setReqs).catch(() => setReqs([]));
  }, [uid]);

  const timeline = useMemo(() => [
    ...msgs.map((m) => ({ k: 'm', t: at(m), m })),
    ...reqs.map((r) => ({ k: 'r', t: r.createdAt, r })),
  ].sort((a, b) => a.t - b.t), [msgs, reqs]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [timeline.length]);

  const emit = (body) => {
    if (!socket) return setErr('Not connected yet. Refresh the page.');
    socket.emit('send', { to: uid, text: body });
  };
  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    emit(text); setText('');
  };

  const attach = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_MB * 1048576) return setErr(`Files can be up to ${MAX_MB} MB.`);
    setBusy(true); setErr('');
    try {
      const r = await rest(`/files?name=${encodeURIComponent(f.name)}&type=${encodeURIComponent(f.type || 'application/octet-stream')}`,
        { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
      emit(`::file::${JSON.stringify({ id: r.id, name: r.name, size: r.size, type: r.type })}`);
    } catch (e2) { setErr(`Upload failed: ${e2.message}`); }
    setBusy(false);
  };

  const respond = (id, status) => rest(`/call-requests/${id}/respond`, json({ status }))
    .then((r) => setReqs((p) => p.map((x) => (x.id === r.id ? r : x)))).catch((e) => setErr(e.message));

  const bubble = (m) => {
    const p = parse(m.text);
    if (p.kind === 'log') {
      return (
        <div className="msg-log" key={m.id}>
          <Icon name={p.video ? 'video' : 'phone'} size={14} />
          {p.missed ? `Missed ${p.video ? 'video' : 'voice'} call` : `${p.video ? 'Video' : 'Voice'} call · ${dur(p.secs)}`} · {ago(m.createdAt)}
        </div>
      );
    }
    return (
      <div key={m.id} className={(same(m.from, user.id) ? 'bubble mine' : 'bubble') + (p.kind === 'file' ? ' has-file' : '')}>
        {p.kind === 'text' && p.text}
        {p.kind === 'file' && (/^image\/(png|jpe?g|gif|webp)$/.test(p.type)
          ? <a href={fileUrl(p.id)} target="_blank" rel="noreferrer"><img className="msg-img" src={fileUrl(p.id)} alt={p.name} /></a>
          : <a className="file-chip" href={fileUrl(p.id)} download={p.name}><Icon name="file" size={22} /><span><b>{p.name}</b><small>{fsize(p.size)} · Download</small></span></a>)}
        <small>{ago(m.createdAt)}</small>
      </div>
    );
  };

  return (
    <main className="page chat">
      <aside className="chat-list">
        <h3>Messages</h3>
        {chats.length === 0 && <p className="muted">No conversations yet. Open a gig and tap Message.</p>}
        {chats.map((c) => (
          <button key={c.user.id} className={same(c.user.id, uid) ? 'conv on' : 'conv'} onClick={() => nav(`/chat/${c.user.id}`)}>
            <Avatar name={c.user.name} src={c.user.avatar} />
            <span><b>{c.user.name}</b><small>{preview(c.last.text)}</small></span>
          </button>
        ))}
      </aside>
      <section className="chat-main">
        {!peer ? (
          <div className="empty"><h3>Pick a conversation</h3><p>Your messages with clients and freelancers appear here.</p></div>
        ) : (
          <>
            <div className="chat-head">
              <Avatar name={peer.name} src={peer.avatar} />{peer.name}<small>{peer.role}</small>
              <div className="chat-tools">
                <button className="tool" onClick={() => startCall({ id: peer.id, name: peer.name, avatar: peer.avatar }, false)} disabled={inCall} title="Voice call"><Icon name="phone" /><span>Voice</span></button>
                <button className="tool" onClick={() => startCall({ id: peer.id, name: peer.name, avatar: peer.avatar }, true)} disabled={inCall} title="Video call and screen sharing"><Icon name="video" /><span>Video</span></button>
                <button className="tool accent" onClick={() => setModal(true)} title="Request a scheduled call"><Icon name="calendar" /><span>Request call</span></button>
              </div>
            </div>
            <div className="bubbles">
              {timeline.map((i) => (i.k === 'm' ? bubble(i.m)
                : <RequestCard key={i.r.id} r={i.r} me={user.id} peer={peer} onAct={respond} onCallNow={(v) => startCall({ id: peer.id, name: peer.name, avatar: peer.avatar }, v)} />))}
              <div ref={end} />
            </div>
            {err && <div className="form-err bar" role="alert">{err}</div>}
            <form className="composer" onSubmit={send}>
              <input type="file" ref={fileRef} hidden onChange={attach} />
              <button type="button" className="tool icon" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Attach image or document"><Icon name="clip" /></button>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder={busy ? 'Uploading…' : 'Write a message'} />
              <button className="btn">Send</button>
            </form>
            {modal && <ScheduleModal peer={peer} onClose={() => setModal(false)} onDone={(r) => { setReqs((p) => (p.some((x) => x.id === r.id) ? p : [...p, r])); setModal(false); }} />}
          </>
        )}
      </section>
    </main>
  );
}
