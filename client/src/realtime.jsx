import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from './api';
import { useAuth } from './auth.jsx';
import { Avatar } from './ui.jsx';

// Where your API server lives. Change here (or set VITE_SERVER_URL) if your port differs.
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
const BLANK = () => ({ pc: null, local: null, cam: null, screen: null, shareSender: null, remote: null, polite: false, making: false, addedLocal: false, ice: [], t0: 0, timer: null, ring: null });

// finds the login token wherever auth.jsx saved it
export function findToken() {
  for (const store of [localStorage, sessionStorage]) {
    for (let i = 0; i < store.length; i++) {
      const m = (store.getItem(store.key(i)) || '').match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
      if (m) return m[0];
    }
  }
  return '';
}

const ICONS = {
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  'mic-off': '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/><path d="M2 2l20 20"/>',
  video: '<path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  'video-off': '<path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M2 2l20 20"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  clip: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l8.6-8.6a4 4 0 1 1 5.7 5.7l-8.6 8.6a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6"/>',
};
export function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
  );
}

const Ctx = createContext({ socket: null, startCall: () => {}, inCall: false });
export const useRealtime = () => useContext(Ctx);
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [call, setCall] = useState(null); // { peerId, name, avatar, video, phase: out|in|connecting|live, caller }
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [remoteVideo, setRemoteVideo] = useState(false);
  const [secs, setSecs] = useState(0);
  const [notice, setNotice] = useState('');
  const R = useRef(BLANK());
  const callRef = useRef(null);
  const fn = useRef({});

  const setCallBoth = (c) => { callRef.current = c; setCall(c); };
  const flash = (t) => { setNotice(t); setTimeout(() => setNotice(''), 5000); };

  const cleanup = () => {
    const r = R.current;
    clearTimeout(r.ring);
    clearInterval(r.timer);
    try { r.pc?.close(); } catch {}
    [r.local, r.screen].forEach((s) => s?.getTracks().forEach((t) => t.stop()));
    R.current = BLANK();
    callRef.current = null;
    setCall(null); setMuted(false); setCamOff(false); setSharing(false); setRemoteVideo(false); setSecs(0);
  };

  // the caller writes one line into the chat when a call ends
  const finish = () => {
    const c = callRef.current;
    if (!c) return;
    if (c.caller && socket) {
      const s = R.current.t0 ? Math.round((Date.now() - R.current.t0) / 1000) : 0;
      socket.emit('send', { to: c.peerId, text: `::calllog::${JSON.stringify({ video: c.video, secs: s, missed: !R.current.t0 })}` });
    }
    cleanup();
  };
  const hangUp = () => {
    const c = callRef.current;
    if (!c) return;
    socket?.emit('call:end', { to: c.peerId });
    finish();
  };

  const makePc = () => {
    const r = R.current;
    const peerId = callRef.current.peerId;
    const pc = new RTCPeerConnection(ICE);
    r.pc = pc;
    pc.onicecandidate = (e) => e.candidate && socket.emit('call:signal', { to: peerId, data: { candidate: e.candidate } });
    pc.onnegotiationneeded = async () => {
      try {
        r.making = true;
        await pc.setLocalDescription();
        socket.emit('call:signal', { to: peerId, data: { sdp: pc.localDescription } });
      } catch {} finally { r.making = false; }
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      r.remote = stream;
      if (e.track.kind === 'video') {
        setRemoteVideo(!e.track.muted);
        e.track.onmute = () => setRemoteVideo(false);
        e.track.onunmute = () => setRemoteVideo(true);
        e.track.onended = () => setRemoteVideo(false);
      }
      setSecs((s) => s); // re-render so the video element picks up the stream
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected' && !r.t0 && callRef.current) {
        r.t0 = Date.now();
        setCallBoth({ ...callRef.current, phase: 'live' });
        r.timer = setInterval(() => setSecs(Math.round((Date.now() - r.t0) / 1000)), 1000);
      }
      if (pc.connectionState === 'failed') { flash('Connection lost.'); hangUp(); }
    };
    return pc;
  };

  const getLocal = (video) => navigator.mediaDevices.getUserMedia({ audio: true, video });

  const startCall = async (peer, video) => {
    if (callRef.current) return;
    if (!socket) return flash('Not connected yet. Refresh the page and try again.');
    if (!navigator.mediaDevices?.getUserMedia) return flash('Calls need a secure page (https or localhost).');
    let local;
    try { local = await getLocal(video); }
    catch { return flash(`Allow ${video ? 'camera and microphone' : 'microphone'} access in your browser to start the call.`); }
    const r = (R.current = { ...BLANK(), local, cam: local.getVideoTracks()[0] || null });
    setCallBoth({ peerId: peer.id, name: peer.name, avatar: peer.avatar, video, phase: 'out', caller: true });
    socket.emit('call:invite', { to: peer.id, video });
    r.ring = setTimeout(() => { flash('No answer.'); hangUp(); }, 45000);
  };

  const acceptCall = async () => {
    const c = callRef.current;
    if (!c || c.phase !== 'in') return;
    clearTimeout(R.current.ring);
    try {
      const local = await getLocal(c.video);
      R.current.local = local;
      R.current.cam = local.getVideoTracks()[0] || null;
    } catch {
      flash('Allow microphone access to answer calls.');
      socket.emit('call:reject', { to: c.peerId });
      return cleanup();
    }
    setCallBoth({ ...c, phase: 'connecting' });
    socket.emit('call:accept', { to: c.peerId });
  };
  const declineCall = () => {
    const c = callRef.current;
    if (!c) return;
    socket.emit('call:reject', { to: c.peerId });
    cleanup();
  };

  const toggleMic = () => {
    const next = !muted;
    R.current.local?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };
  const toggleCam = () => {
    const next = !camOff;
    if (R.current.cam) R.current.cam.enabled = !next;
    setCamOff(next);
  };

  const stopShare = async () => {
    const r = R.current;
    if (!r.screen) return;
    r.screen.getTracks().forEach((t) => t.stop());
    r.screen = null;
    setSharing(false);
    try { await r.shareSender?.replaceTrack(r.cam && r.cam.readyState === 'live' ? r.cam : null); } catch {}
  };
  const toggleShare = async () => {
    const r = R.current;
    if (!r.pc) return;
    if (r.screen) return stopShare();
    if (!navigator.mediaDevices.getDisplayMedia) return flash('Screen sharing is not supported in this browser.');
    let stream;
    try { stream = await navigator.mediaDevices.getDisplayMedia({ video: true }); } catch { return; }
    const track = stream.getVideoTracks()[0];
    r.screen = stream;
    let sender = r.pc.getSenders().find((s) => s.track && s.track.kind === 'video');
    if (!sender) sender = r.pc.getTransceivers().find((t) => !t.sender.track && t.receiver.track.kind === 'video' && t.direction === 'sendrecv')?.sender;
    if (sender) await sender.replaceTrack(track);
    else sender = r.pc.addTrack(track, r.local);
    r.shareSender = sender;
    track.onended = () => stopShare();
    setSharing(true);
  };

  // ---- incoming socket events (always the latest closures via fn.current) ----
  fn.current = {
    cleanup,
    'call:invite': async ({ from, video }) => {
      if (callRef.current) return socket.emit('call:reject', { to: from, reason: 'busy' });
      R.current = { ...BLANK(), polite: true };
      setCallBoth({ peerId: from, name: 'Someone', avatar: '', video, phase: 'in' });
      R.current.ring = setTimeout(() => cleanup(), 50000);
      try {
        const u = await api(`/users/${from}`);
        if (callRef.current?.peerId === from) setCallBoth({ ...callRef.current, name: u.name, avatar: u.avatar });
      } catch {}
    },
    'call:accept': ({ from }) => {
      const c = callRef.current;
      if (!c || c.peerId !== from || c.phase !== 'out') return;
      clearTimeout(R.current.ring);
      setCallBoth({ ...c, phase: 'connecting' });
      const pc = makePc();
      R.current.local.getTracks().forEach((t) => pc.addTrack(t, R.current.local));
    },
    'call:reject': ({ from, reason }) => {
      const c = callRef.current;
      if (!c || c.peerId !== from) return;
      flash(reason === 'busy' ? 'They are on another call.' : 'Call declined.');
      finish();
    },
    'call:end': ({ from }) => {
      const c = callRef.current;
      if (!c || c.peerId !== from) return;
      if (c.phase !== 'in') flash('Call ended.');
      finish();
    },
    'call:signal': async ({ from, data }) => {
      const c = callRef.current;
      if (!c || c.peerId !== from || !data || c.phase === 'in') return;
      const r = R.current;
      const pc = r.pc || makePc();
      try {
        if (data.sdp) {
          const collision = data.sdp.type === 'offer' && (r.making || pc.signalingState !== 'stable');
          if (collision && !r.polite) return;
          await pc.setRemoteDescription(data.sdp);
          if (!r.addedLocal) {
            r.addedLocal = true;
            if (r.polite) r.local.getTracks().forEach((t) => pc.addTrack(t, r.local));
          }
          for (const cand of r.ice.splice(0)) await pc.addIceCandidate(cand).catch(() => {});
          if (data.sdp.type === 'offer') {
            await pc.setLocalDescription();
            socket.emit('call:signal', { to: from, data: { sdp: pc.localDescription } });
          }
        } else if (data.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
          else r.ice.push(data.candidate);
        }
      } catch (e) { console.error(e); }
    },
  };

  useEffect(() => {
    if (!user) return;
    const token = findToken();
    if (!token) return;
    const s = io(SERVER_URL, { auth: { token } });
    setSocket(s);
    ['call:invite', 'call:accept', 'call:reject', 'call:end', 'call:signal'].forEach((ev) => s.on(ev, (p) => fn.current[ev]?.(p || {})));
    return () => { s.disconnect(); setSocket(null); fn.current.cleanup(); };
  }, [user?.id]);

  const setRemote = (el) => {
    if (el && R.current.remote && el.srcObject !== R.current.remote) el.srcObject = R.current.remote;
  };
  const setLocal = (el) => {
    const s = R.current.screen || R.current.local;
    if (el && s && el.srcObject !== s) el.srcObject = s;
  };

  const status = !call ? '' : call.phase === 'out' ? 'Calling…' : call.phase === 'connecting' ? 'Connecting…' : clock(secs);
  const hasCam = !!R.current.cam;

  return (
    <Ctx.Provider value={{ socket, startCall, inCall: !!call }}>
      {children}
      {notice && <div className="rt-toast" role="status">{notice}</div>}

      {call?.phase === 'in' && (
        <div className="ring-card" role="alertdialog" aria-label="Incoming call">
          <Avatar name={call.name} src={call.avatar} size={60} />
          <div className="ring-info">
            <b>{call.name}</b>
            <span>Incoming {call.video ? 'video' : 'voice'} call…</span>
          </div>
          <button className="call-btn bad hang" onClick={declineCall} aria-label="Decline"><Icon name="phone" /></button>
          <button className="call-btn ok" onClick={acceptCall} aria-label="Accept"><Icon name="phone" /></button>
        </div>
      )}

      {call && call.phase !== 'in' && (
        <div className="call-overlay">
          <div className="call-stage">
            <video ref={setRemote} autoPlay playsInline className={remoteVideo ? 'remote on' : 'remote'} />
            {!remoteVideo && (
              <div className="call-idle">
                <Avatar name={call.name} src={call.avatar} size={110} />
                <h2>{call.name}</h2>
                <p>{status}</p>
              </div>
            )}
            {(call.video || sharing) && <video ref={setLocal} autoPlay playsInline muted className={sharing ? 'local screen' : 'local'} />}
            {remoteVideo && call.phase === 'live' && <span className="call-timer">{status}</span>}
          </div>
          <div className="call-bar">
            <button className={muted ? 'call-btn on' : 'call-btn'} onClick={toggleMic} aria-label={muted ? 'Unmute' : 'Mute'}><Icon name={muted ? 'mic-off' : 'mic'} /></button>
            {call.video && hasCam && (
              <button className={camOff ? 'call-btn on' : 'call-btn'} onClick={toggleCam} aria-label="Toggle camera"><Icon name={camOff ? 'video-off' : 'video'} /></button>
            )}
            <button className={sharing ? 'call-btn on' : 'call-btn'} onClick={toggleShare} disabled={call.phase !== 'live'} aria-label="Share screen"><Icon name="monitor" /></button>
            <button className="call-btn bad hang" onClick={hangUp} aria-label="End call"><Icon name="phone" /></button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
