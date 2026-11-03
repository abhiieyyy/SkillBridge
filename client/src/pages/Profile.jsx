import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money } from '../api';
import { CatIcon, Stars, Avatar } from '../ui.jsx';
import { useAuth } from '../auth.jsx';

const SOCIALS = [
  ['github', 'GitHub', 'username or full link'],
  ['linkedin', 'LinkedIn', 'username or full link'],
  ['twitter', 'X / Twitter', '@handle or full link'],
  ['instagram', 'Instagram', '@handle or full link'],
  ['website', 'Portfolio website', 'https://yourname.com'],
];

const readFile = (f) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('Could not read the file'));
    r.readAsDataURL(f);
  });

// shrink and (optionally) square-crop an image in the browser before uploading
function toDataUrl(file, max, square) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (square) { const m = Math.min(sw, sh); sx = (sw - m) / 2; sy = (sh - m) / 2; sw = sh = m; }
      const scale = Math.min(1, max / Math.max(sw, sh));
      const c = document.createElement('canvas');
      c.width = Math.round(sw * scale);
      c.height = Math.round(sh * scale);
      c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

const Arrow = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17L17 7M8 7h9v9" />
  </svg>
);

function ProjectForm({ onDone, onError }) {
  const [f, setF] = useState({ title: '', description: '', link: '', tags: '', image: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const pick = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try { setF({ ...f, image: await toDataUrl(file, 900, false) }); } catch (x) { onError(x.message); }
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api('/people/me/projects', { method: 'POST', body: f }); onDone(); }
    catch (x) { onError(x.message); }
    setBusy(false);
  };

  return (
    <form className="panel" onSubmit={submit}>
      <div className="form-grid">
        <label>Project title<input value={f.title} onChange={set('title')} required maxLength={80} /></label>
        <label>Link (GitHub or live site)<input value={f.link} onChange={set('link')} placeholder="github.com/you/project" /></label>
      </div>
      <label>What did you build?<textarea rows="3" value={f.description} onChange={set('description')} maxLength={400} /></label>
      <label>Tech or tags, separated by commas<input value={f.tags} onChange={set('tags')} placeholder="React, Node, SQLite" /></label>
      <div className="inline" style={{ alignItems: 'center', marginBottom: '1rem' }}>
        <label className="btn ghost small file-btn">
          {f.image ? 'Change cover image' : 'Add cover image'}
          <input type="file" accept="image/*" hidden onChange={pick} />
        </label>
        {f.image && <img className="proj-preview" src={f.image} alt="Project cover preview" />}
      </div>
      <button className="btn" disabled={busy}>Save project</button>
    </form>
  );
}

export default function Profile() {
  const { id } = useParams();
  const { user, refresh } = useAuth();
  const [p, setP] = useState(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({});
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState({ text: '', bad: false });
  const photoRef = useRef();
  const resumeRef = useRef();

  const flash = (text, bad = false) => setMsg({ text, bad });
  const load = () => api(`/people/${id}`).then(setP).catch((e) => flash(e.message, true));
  useEffect(() => { setP(null); setEdit(false); setAdding(false); setMsg({ text: '', bad: false }); load(); }, [id]);

  if (!p) return <main className="page">{msg.text || 'Loading…'}</main>;
  const mine = user?.id === p.id;

  const patch = async (body, ok) => {
    try {
      await api('/people/me', { method: 'PUT', body });
      await load();
      await refresh();
      if (ok) flash(ok);
      return true;
    } catch (e) { flash(e.message, true); return false; }
  };

  const startEdit = () => {
    setForm({ headline: p.headline, location: p.location, bio: p.bio, skills: p.skills.join(', '), ...p.links });
    setEdit(true);
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onPhoto = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { await patch({ avatar: await toDataUrl(f, 320, true) }, 'Photo updated'); }
    catch (x) { flash(x.message, true); }
  };

  const onResume = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.type !== 'application/pdf') return flash('Please choose a PDF file', true);
    if (f.size > 3 * 1024 * 1024) return flash('The PDF must be smaller than 3 MB', true);
    try {
      await api('/people/me/resume', { method: 'POST', body: { name: f.name, data: await readFile(f) } });
      await load();
      flash('Resume uploaded');
    } catch (x) { flash(x.message, true); }
  };
  const removeResume = async () => {
    try { await api('/people/me/resume', { method: 'DELETE' }); await load(); flash('Resume removed'); }
    catch (x) { flash(x.message, true); }
  };
  const removeProject = async (pid) => {
    if (!confirm('Delete this project?')) return;
    try { await api(`/people/me/projects/${pid}`, { method: 'DELETE' }); await load(); }
    catch (x) { flash(x.message, true); }
  };

  const links = SOCIALS.filter(([k]) => p.links[k]);
  const joined = new Date(p.joined).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <main className="page profile">
      <section className="cover">
        <div className="cover-bg" />
        <div className="cover-body">
          <div className="ph-wrap">
            <Avatar name={p.name} src={p.avatar} size={112} />
            {mine && (
              <>
                <button className="ph-btn" onClick={() => photoRef.current.click()}>{p.avatar ? 'Change photo' : 'Add photo'}</button>
                <input ref={photoRef} type="file" accept="image/*" hidden onChange={onPhoto} />
              </>
            )}
          </div>
          <div className="cover-info">
            <h1>{p.name}</h1>
            <p className="headline">{p.headline || (mine ? 'Add a headline in Edit profile' : p.role === 'freelancer' ? 'Freelancer' : 'Client')}</p>
            <p className="meta">
              <span className={`badge ${p.role === 'freelancer' ? 'delivered' : 'in_progress'}`}>{p.role === 'freelancer' ? 'Freelancer' : 'Client'}</span>
              {p.location && <span>{p.location}</span>}
              <span>Joined {joined}</span>
            </p>
            {links.length > 0 && (
              <div className="social-row">
                {links.map(([k, label]) => (
                  <a key={k} className="social" href={p.links[k]} target="_blank" rel="noopener noreferrer">{label}<Arrow /></a>
                ))}
              </div>
            )}
          </div>
          <div className="cover-actions">
            {mine
              ? <button className="btn" onClick={startEdit}>Edit profile</button>
              : user && <Link className="btn" to={`/chat/${p.id}`}>Message</Link>}
          </div>
        </div>
      </section>

      {msg.text && <p className={msg.bad ? 'error' : 'success'}>{msg.text}</p>}

      {edit && mine && (
        <form className="panel" onSubmit={async (e) => { e.preventDefault(); if (await patch(form, 'Profile saved')) setEdit(false); }}>
          <h3>Edit profile</h3>
          <div className="form-grid">
            <label>Headline<input value={form.headline} onChange={set('headline')} maxLength={80} placeholder="Full-stack developer and UI designer" /></label>
            <label>Location<input value={form.location} onChange={set('location')} maxLength={60} placeholder="Ludhiana, India" /></label>
          </div>
          <label>About you<textarea rows="4" value={form.bio} onChange={set('bio')} maxLength={500} placeholder="Tell clients about your skills and experience" /></label>
          <label>Skills, separated by commas<input value={form.skills} onChange={set('skills')} placeholder="React, Node.js, UI design" /></label>
          <div className="form-grid">
            {SOCIALS.map(([k, label, hint]) => (
              <label key={k}>{label}<input value={form[k] || ''} onChange={set(k)} placeholder={hint} /></label>
            ))}
          </div>
          <div className="inline">
            <button className="btn">Save changes</button>
            <button type="button" className="btn ghost" onClick={() => setEdit(false)}>Cancel</button>
            {p.avatar && <button type="button" className="btn ghost" onClick={() => patch({ avatar: '' }, 'Photo removed')}>Remove photo</button>}
          </div>
        </form>
      )}

      <div className="stats">
        {p.role === 'freelancer' && (
          <>
            <div className="stat"><span>Rating</span><b>★ {p.rating ? p.rating.toFixed(1) : 'New'}</b></div>
            <div className="stat"><span>Reviews</span><b>{p.reviewCount}</b></div>
            <div className="stat"><span>Orders done</span><b>{p.completed}</b></div>
          </>
        )}
        <div className="stat"><span>Projects</span><b>{p.projects.length}</b></div>
      </div>

      <div className="two-col">
        <section>
          <h2>About</h2>
          <p className="muted">{p.bio || (mine ? 'Add an about section in Edit profile so clients know who you are.' : 'No bio yet.')}</p>

          {p.skills.length > 0 && (
            <>
              <h2>Skills</h2>
              <div className="skills">{p.skills.map((s) => <span key={s} className="skill">{s}</span>)}</div>
            </>
          )}

          <div className="section-head">
            <h2>Projects</h2>
            {mine && <button className="btn ghost small" onClick={() => setAdding(!adding)}>{adding ? 'Close' : 'Add project'}</button>}
          </div>
          {adding && mine && <ProjectForm onDone={() => { setAdding(false); load(); flash('Project added'); }} onError={(t) => flash(t, true)} />}
          {p.projects.length === 0 ? (
            <p className="muted">{mine ? 'Show clients your past work. Add your first project.' : 'No projects added yet.'}</p>
          ) : (
            <div className="proj-grid">
              {p.projects.map((x) => (
                <article key={x.id} className="proj">
                  <div className="proj-img" style={x.image ? { backgroundImage: `url(${x.image})` } : undefined}>
                    {!x.image && <span>{x.title[0].toUpperCase()}</span>}
                  </div>
                  <div className="proj-body">
                    <h3>{x.title}</h3>
                    {x.description && <p className="muted">{x.description}</p>}
                    {x.tags.length > 0 && <div className="skills">{x.tags.map((t) => <span key={t} className="skill small">{t}</span>)}</div>}
                    <div className="proj-actions">
                      {x.link && <a className="btn ghost small" href={x.link} target="_blank" rel="noopener noreferrer">View project</a>}
                      {mine && <button className="btn ghost small" onClick={() => removeProject(x.id)}>Delete</button>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {p.role === 'freelancer' && p.gigs.length > 0 && (
            <>
              <h2>Gigs by {p.name.split(' ')[0]}</h2>
              <div className="grid">
                {p.gigs.map((g) => (
                  <Link to={`/gig/${g.id}`} key={g.id} className="gig">
                    <div className={`thumb t-${g.category}`}>
                      <span className="tag">{g.category}</span>
                      <span className="icon-box"><CatIcon name={g.category} size={30} /></span>
                    </div>
                    <div className="gig-body">
                      <h3>{g.title}</h3>
                      <div className="gig-foot"><Stars value={g.rating} count={g.reviewCount} /><b>{money(g.price)}</b></div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>

        <aside className="panel sticky">
          <h3>Resume</h3>
          {p.resume ? (
            <div className="resume">
              <span className="pdf-badge">PDF</span>
              <div className="resume-info">
                <b>{p.resume.name}</b>
                <a className="btn small" href={p.resume.url} target="_blank" rel="noopener noreferrer">View resume</a>
              </div>
            </div>
          ) : (
            <p className="muted">{mine ? 'Upload a PDF resume so clients can see your experience.' : 'No resume uploaded.'}</p>
          )}
          {mine && (
            <div className="inline" style={{ marginTop: '1rem' }}>
              <button className="btn ghost small" onClick={() => resumeRef.current.click()}>{p.resume ? 'Replace PDF' : 'Upload PDF'}</button>
              {p.resume && <button className="btn ghost small" onClick={removeResume}>Remove</button>}
              <input ref={resumeRef} type="file" accept="application/pdf" hidden onChange={onResume} />
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}