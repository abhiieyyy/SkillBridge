import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import GoogleButton from '../GoogleButton.jsx';

// the phone-code endpoints need no login, so plain fetch is enough here
async function post(path, body) {
  const r = await fetch(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
}

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState('login');
  const [method, setMethod] = useState('email'); // email | phone
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'client' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const go = async (path, body) => {
    setErr('');
    try {
      await login(path, body);
      nav(loc.state?.from || '/dashboard');
    } catch (x) { setErr(x.message); }
  };

  const sendCode = async () => {
    setErr('');
    if (mode === 'register' && !f.name.trim()) return setErr('Enter your full name first');
    if (phone.replace(/\D/g, '').length < 10) return setErr('Enter your 10-digit phone number');
    setBusy(true);
    try {
      const r = await post('/auth/phone/send', { phone });
      setSent(true); setCode(''); setWait(30);
      setNote(r.dev ? 'Test mode: the code is shown in your server terminal.' : 'We sent a 6-digit code by SMS.');
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (method === 'email') return go(mode === 'login' ? '/auth/login' : '/auth/register', f);
    if (!sent) return sendCode();
    setBusy(true);
    await go('/auth/phone/verify', mode === 'register' ? { phone, code, name: f.name, role: f.role } : { phone, code });
    setBusy(false);
  };

  const changeMethod = (m) => { setMethod(m); setErr(''); setSent(false); setCode(''); setNote(''); };
  const phoneStep = method === 'phone';

  return (
    <main className="page narrow">
      <form className="panel" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>

        <div className="method" role="tablist" aria-label="Sign in method">
          <button type="button" role="tab" aria-selected={method === 'email'} className={method === 'email' ? 'on' : ''} onClick={() => changeMethod('email')}>Email</button>
          <button type="button" role="tab" aria-selected={method === 'phone'} className={method === 'phone' ? 'on' : ''} onClick={() => changeMethod('phone')}>Phone number</button>
        </div>

        {mode === 'register' && (
          <>
            <div className="roles">
              <button type="button" className={f.role === 'client' ? 'role on' : 'role'} onClick={() => setF({ ...f, role: 'client' })}>
                <b>I want to hire</b><span>Find talent and pay safely</span>
              </button>
              <button type="button" className={f.role === 'freelancer' ? 'role on' : 'role'} onClick={() => setF({ ...f, role: 'freelancer' })}>
                <b>I want to work</b><span>Sell gigs and get paid</span>
              </button>
            </div>
            <label>Full name<input value={f.name} onChange={set('name')} required /></label>
          </>
        )}

        {!phoneStep && (
          <>
            <label>Email<input type="email" value={f.email} onChange={set('email')} required /></label>
            <label>Password<input type="password" value={f.password} onChange={set('password')} required minLength={6} /></label>
          </>
        )}

        {phoneStep && (
          <>
            <label>Phone number
              <div className="phone-row">
                <span className="phone-cc">+91</span>
                <input type="tel" inputMode="tel" autoComplete="tel-national" placeholder="98765 43210" value={phone}
                  onChange={(e) => setPhone(e.target.value)} disabled={sent} required />
                {sent && <button type="button" className="link-btn" onClick={() => { setSent(false); setCode(''); setNote(''); setErr(''); }}>Change</button>}
              </div>
            </label>
            {sent && (
              <label>6-digit code
                <input className="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus />
              </label>
            )}
            {note && <p className="muted">{note}</p>}
            {sent && (
              <p className="muted">
                {wait > 0 ? `You can ask for a new code in ${wait}s` : <a href="#" onClick={(e) => { e.preventDefault(); sendCode(); }}>Send a new code</a>}
              </p>
            )}
          </>
        )}

        {err && <p className="error">{err}</p>}
        <button className="btn full" disabled={busy}>
          {busy ? 'Please wait…'
            : phoneStep ? (!sent ? 'Send code' : mode === 'login' ? 'Verify and log in' : 'Verify and sign up')
            : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>

        <div className="divider"><span>or</span></div>
        <GoogleButton
          role={mode === 'register' ? f.role : undefined}
          onToken={(credential, role) => go('/auth/google', { credential, role })}
        />

        <p className="muted center">
          {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'login' ? 'register' : 'login'); setErr(''); setSent(false); setCode(''); setNote(''); }}>
            {mode === 'login' ? 'Create an account' : 'Log in'}
          </a>
        </p>
        {mode === 'login' && method === 'email' && (
          <p className="demo">Demo logins (password demo123): freelancer@demo.com or client@demo.com</p>
        )}
      </form>
    </main>
  );
}
