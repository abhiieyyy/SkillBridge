import { useEffect, useRef, useState } from 'react';
import { api } from './api';

export default function GoogleButton({ role, onToken }) {
  const box = useRef();
  const [cid, setCid] = useState('');
  const roleRef = useRef(role);
  const cbRef = useRef(onToken);
  roleRef.current = role;
  cbRef.current = onToken;

  useEffect(() => { api('/config').then((c) => setCid(c.googleClientId)).catch(() => {}); }, []);

  useEffect(() => {
    if (!cid) return;
    const init = () => {
      window.google.accounts.id.initialize({ client_id: cid, callback: (r) => cbRef.current(r.credential, roleRef.current) });
      window.google.accounts.id.renderButton(box.current, { theme: 'filled_black', size: 'large', width: 340, text: 'continue_with' });
    };
    if (window.google?.accounts) return init();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = init;
    document.body.appendChild(s);
  }, [cid]);

  if (!cid) return <p className="muted center">Google sign-in will appear once GOOGLE_CLIENT_ID is added to server/.env</p>;
  return <div ref={box} className="g-btn" />;
}