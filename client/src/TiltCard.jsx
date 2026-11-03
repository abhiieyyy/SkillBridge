import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

export default function TiltCard({ to, children, delay = 0 }) {
  const ref = useRef();

  // reveal once when scrolled into view
  useEffect(() => {
    const el = ref.current;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add('in'); io.disconnect(); } },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const move = (e) => {
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(0.5 - y) * 14}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 16}deg`);
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
  };
  const leave = () => {
    ref.current.style.setProperty('--rx', '0deg');
    ref.current.style.setProperty('--ry', '0deg');
  };

  return (
    <Link ref={ref} to={to} className="tilt" style={{ '--d': `${delay}ms` }} onMouseMove={move} onMouseLeave={leave}>
      {children}
    </Link>
  );
}