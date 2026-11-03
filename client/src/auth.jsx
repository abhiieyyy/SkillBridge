import { createContext, useContext, useEffect, useState } from 'react';
import { api, token } from './api';

const Ctx = createContext();
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = async () => {
    if (!token.get()) { setUser(null); setReady(true); return; }
    try { setUser(await api('/me')); } catch { token.clear(); setUser(null); }
    setReady(true);
  };
  useEffect(() => { refresh(); }, []);

  const login = async (path, body) => {
    const d = await api(path, { method: 'POST', body });
    token.set(d.token);
    setUser(d.user);
  };
  const logout = () => { token.clear(); setUser(null); };

  return <Ctx.Provider value={{ user, ready, login, logout, refresh }}>{children}</Ctx.Provider>;
}
