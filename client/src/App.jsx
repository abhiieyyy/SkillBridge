import { Routes, Route, NavLink, Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { money } from './api';
import { Avatar } from './ui.jsx';
import ParticleScene from './ParticleScene.jsx';
import Home from './pages/Home.jsx';
import GigPage from './pages/GigPage.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Wallet from './pages/Wallet.jsx';
import Chat from './pages/Chat.jsx';
import Profile from './pages/Profile.jsx';
import Search from './pages/Search.jsx';

function Private({ children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="page">Loading…</div>;
  return user ? children : <Navigate to="/login" state={{ from: loc.pathname }} replace />;
}

function Nav() {
  const { user, logout } = useAuth();
  return (
    <header className="nav">
      <Link to="/" className="brand">
        <img src="/logo.png" alt="SkillBridge" className="brand-logo" />
      </Link>
      <nav>
        <NavLink to="/">Explore</NavLink>
        {user && <NavLink to="/dashboard">{user.role === 'freelancer' ? 'My work' : 'My orders'}</NavLink>}
        {user && <NavLink to="/chat">Messages</NavLink>}
        {user && <NavLink to="/wallet">Wallet <b className="pill">{money(user.balance)}</b></NavLink>}
        {user && <NavLink to={`/profile/${user.id}`}>Profile</NavLink>}
      </nav>
      <div className="nav-right">
        {user ? (
          <>
            <Link to={`/profile/${user.id}`} className="who" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Avatar name={user.name} src={user.avatar} size={30} />
              {user.name.split(' ')[0]} <small>{user.role}</small>
            </Link>
            <button className="btn ghost" onClick={logout}>Log out</button>
          </>
        ) : (
          <Link className="btn" to="/login">Log in or sign up</Link>
        )}
      </div>
    </header>
  );
}

export default function App() {
  return (
    <>
      <ParticleScene />
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/gig/:id" element={<GigPage />} />
        <Route path="/profile/:id" element={<Profile />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Private><Dashboard /></Private>} />
        <Route path="/wallet" element={<Private><Wallet /></Private>} />
        <Route path="/chat" element={<Private><Chat /></Private>} />
        <Route path="/chat/:uid" element={<Private><Chat /></Private>} />
        <Route path="*" element={<Navigate to="/" />} />
        <Route path="/search" element={<Search />} />
      </Routes>
    </>
  );
}
