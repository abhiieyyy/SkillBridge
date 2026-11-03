// server/phoneauth.js: sign in / sign up with a phone number and a 6-digit code.
// Without SMS keys it runs in DEV mode: the code is printed in the server terminal.
// With TWILIO_* keys in server/.env it sends a real SMS.
import crypto from 'crypto';

export default function setupPhoneAuth({ app, db, one, run, id, now, me, Bad, SECRET, bcrypt, jwt }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS phones (
      userId TEXT PRIMARY KEY REFERENCES users(id),
      phone TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS otps (
      phone TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      expires INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      sentAt INTEGER NOT NULL,
      hourStart INTEGER NOT NULL,
      hourCount INTEGER NOT NULL
    );
  `);

  const TW = {
    sid: process.env.TWILIO_ACCOUNT_SID, token: process.env.TWILIO_AUTH_TOKEN,
    from: process.env.TWILIO_FROM, service: process.env.TWILIO_MESSAGING_SERVICE_SID,
  };
  const liveSms = !!(TW.sid && TW.token && (TW.from || TW.service));

  // "98765 43210", "+91 98765-43210", "919876543210" -> "+919876543210"
  const normalize = (raw) => {
    let s = String(raw || '').trim().replace(/[\s\-().]/g, '');
    if (s.startsWith('00')) s = '+' + s.slice(2);
    if (!s.startsWith('+')) {
      if (/^[6-9]\d{9}$/.test(s)) s = '+91' + s;
      else if (/^91[6-9]\d{9}$/.test(s)) s = '+' + s;
      else s = '+' + s;
    }
    if (!/^\+[1-9]\d{9,14}$/.test(s)) throw new Bad('Enter a valid phone number, like 98765 43210');
    return s;
  };
  const hashCode = (phone, code) => crypto.createHash('sha256').update(`${phone}:${code}:${SECRET}`).digest('hex');
  const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

  async function deliver(phone, code) {
    const body = `${code} is your SkillBridge login code. It expires in 5 minutes. Don't share it with anyone.`;
    if (!liveSms) {
      console.log(`\n[DEV] Login code for ${phone}: ${code}  (add TWILIO_* keys to server/.env to send real SMS)\n`);
      return;
    }
    const form = new URLSearchParams({ To: phone, Body: body });
    TW.service ? form.set('MessagingServiceSid', TW.service) : form.set('From', TW.from);
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW.sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${TW.sid}:${TW.token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (!r.ok) {
      console.error('[SMS] Twilio error', r.status, await r.text().catch(() => ''));
      throw new Bad('We could not send the code. Check the number and try again');
    }
  }

  // 1) ask for a code
  app.post('/api/auth/phone/send', async (req, res, next) => {
    try {
      const phone = normalize(req.body?.phone);
      const t = now();
      const old = one('SELECT * FROM otps WHERE phone = ?', phone);
      if (old && t - old.sentAt < 30000) throw new Bad('Wait 30 seconds before asking for another code');
      const fresh = !old || t - old.hourStart > 3600000;
      const hourCount = fresh ? 1 : old.hourCount + 1;
      if (!fresh && hourCount > 5) throw new Bad('Too many codes requested. Try again in an hour');
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      run(`INSERT INTO otps (phone, hash, expires, attempts, sentAt, hourStart, hourCount) VALUES (?,?,?,?,?,?,?)
           ON CONFLICT(phone) DO UPDATE SET hash = excluded.hash, expires = excluded.expires, attempts = 0,
             sentAt = excluded.sentAt, hourStart = excluded.hourStart, hourCount = excluded.hourCount`,
        phone, hashCode(phone, code), t + 5 * 60000, 0, t, fresh ? t : old.hourStart, hourCount);
      await deliver(phone, code);
      const user = one('SELECT userId FROM phones WHERE phone = ?', phone);
      res.json({ ok: true, phone, existing: !!user, dev: !liveSms });
    } catch (e) { next(e); }
  });

  // 2) check the code. New numbers must also send name + role (first reply says needsSignup)
  app.post('/api/auth/phone/verify', (req, res) => {
    const phone = normalize(req.body?.phone);
    const code = String(req.body?.code || '').replace(/\D/g, '');
    const o = one('SELECT * FROM otps WHERE phone = ?', phone);
    if (!o || o.expires < now()) throw new Bad('That code has expired. Ask for a new one');
    if (o.attempts >= 5) { run('DELETE FROM otps WHERE phone = ?', phone); throw new Bad('Too many wrong tries. Ask for a new code'); }
    if (code.length !== 6 || !same(o.hash, hashCode(phone, code))) {
      run('UPDATE otps SET attempts = attempts + 1 WHERE phone = ?', phone);
      throw new Bad('Wrong code. Check it and try again');
    }

    let link = one('SELECT userId FROM phones WHERE phone = ?', phone);
    if (!link) {
      const name = String(req.body?.name || '').trim().slice(0, 60);
      const role = req.body?.role;
      if (!name || !['freelancer', 'client'].includes(role))
        throw new Bad('No account uses this number yet. Open Sign up, choose hire or work, then use your phone number'); // code stays valid
      const uid = id();
      const email = `${phone.slice(1)}@phone.skillbridge.local`; // placeholder so the email column stays unique
      db.transaction(() => {
        run('INSERT INTO users VALUES (?,?,?,?,?,?,?,?)', uid, name, email, bcrypt.hashSync(crypto.randomUUID(), 8), role, 0, '', now());
        run('INSERT INTO phones (userId, phone) VALUES (?,?)', uid, phone);
      })();
      link = { userId: uid };
    }
    run('DELETE FROM otps WHERE phone = ?', phone); // one code, one use
    const u = one('SELECT * FROM users WHERE id = ?', link.userId);
    res.json({ token: jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' }), user: me(u) });
  });

  console.log(liveSms ? 'Phone login: real SMS via Twilio' : 'Phone login: DEV mode (codes are printed in this terminal)');
}