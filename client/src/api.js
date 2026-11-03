export const token = {
  get: () => localStorage.getItem('sb_token'),
  set: (v) => localStorage.setItem('sb_token', v),
  clear: () => localStorage.removeItem('sb_token'),
};

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token.get() ? { Authorization: 'Bearer ' + token.get() } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Start the backend with npm start in the server folder');
  }
  const data = await res.json().catch(() => null);
  if (!data) throw new Error('The server is not responding correctly. Make sure the backend is running on port 5001');
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again');
  return data;
}

export const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
export const ago = (t) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
