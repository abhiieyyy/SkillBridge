import { useEffect, useState } from 'react';
import { api, money, ago } from '../api';
import { useAuth } from '../auth.jsx';

const loadScript = (src) =>
  new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

export default function Wallet() {
  const { user, refresh } = useAuth();
  const [w, setW] = useState({ balance: 0, transactions: [] });
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState({ text: '', bad: false });
  const load = () => api('/wallet').then(setW);
  useEffect(() => { load(); }, []);

  const done = async (text) => {
    setAmount('');
    setMsg({ text, bad: false });
    await load();
    await refresh();
  };

  const withdraw = async () => {
    try {
      await api('/wallet/withdraw', { method: 'POST', body: { amount } });
      await done('Withdrawal sent to your bank account');
    } catch (e) { setMsg({ text: e.message, bad: true }); }
  };

  const pay = async () => {
    setMsg({ text: '', bad: false });
    try {
      const cfg = await api('/config');
      if (!cfg.razorpay) { // development fallback when no Razorpay keys are set
        await api('/wallet/deposit', { method: 'POST', body: { amount } });
        return done('Funds added to your wallet');
      }
      if (!(await loadScript('https://checkout.razorpay.com/v1/checkout.js')))
        throw new Error('Could not load Razorpay. Check your internet connection');
      const o = await api('/payments/order', { method: 'POST', body: { amount } });
      const rz = new window.Razorpay({
        key: o.keyId,
        amount: o.amount,
        currency: o.currency,
        order_id: o.orderId,
        name: 'SkillBridge',
        description: 'Add funds to your wallet',
        prefill: { name: o.name, email: o.email },
        theme: { color: '#2457f5' },
        handler: async (r) => {
          try {
            await api('/payments/verify', { method: 'POST', body: r });
            await done('Payment successful. Funds added to your wallet');
          } catch (e) { setMsg({ text: e.message, bad: true }); }
        },
      });
      rz.on('payment.failed', (r) => setMsg({ text: r.error?.description || 'Payment failed. Try again', bad: true }));
      rz.open();
    } catch (e) { setMsg({ text: e.message, bad: true }); }
  };

  const isFree = user.role === 'freelancer';
  return (
    <main className="page narrow">
      <section className="balance">
        <span>{isFree ? 'Available to withdraw' : 'Wallet balance'}</span>
        <h1>{money(w.balance)}</h1>
      </section>

      <section className="panel">
        <h3>{isFree ? 'Withdraw earnings' : 'Add funds'}</h3>
        <div className="inline">
          <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount in ₹" />
          {isFree
            ? <button className="btn" onClick={withdraw}>Withdraw</button>
            : <button className="btn" onClick={pay}>Pay with Razorpay</button>}
        </div>
        {!isFree && <p className="muted">Pay by UPI, card or net banking. Your money is added once the payment is verified.</p>}
        {msg.text && <p className={msg.bad ? 'error' : 'success'}>{msg.text}</p>}
      </section>

      <h2>Transactions</h2>
      <div className="list">
        {w.transactions.length === 0 && <p className="muted">Nothing here yet.</p>}
        {w.transactions.map((t) => (
          <div key={t.id} className="row">
            <div className="row-main"><b>{t.note}</b><span className="muted">{ago(t.createdAt)}</span></div>
            <b className={t.amount < 0 ? 'neg' : 'pos'}>{t.amount < 0 ? '−' : '+'}{money(Math.abs(t.amount))}</b>
          </div>
        ))}
      </div>
    </main>
  );
}