import { StrictMode, useEffect, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, Link, useLocation } from 'react-router'
import { api, ApiError, message, type Account, type Summary } from './api'
import { brand } from './brand'
import { Projects } from './projects'
import './style.css'

function Logo() {
  return <div className="brand"><i>{brand.monogram}</i><span>{brand.name}<small>WORKSPACE</small></span></div>
}
function Layout({ user, signOut }: { user: Account; signOut: () => Promise<void> }) {
  const admin = user.roles.includes('Admin')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { pathname } = useLocation()
  return <div className="shell">
    <a href="#workspace" className="skip">Skip to content</a>
    <aside className="sidebar">
      <Logo />
      <nav aria-label="Workspace"><p className="eyebrow">WORKSPACE</p>
        <NavLink to="/" end><span aria-hidden>◫</span> Overview</NavLink>
        <NavLink to="/projects"><span aria-hidden>▤</span> Projects</NavLink>
        {admin && <NavLink to="/admin"><span aria-hidden>◇</span> Administration</NavLink>}
      </nav>
      <div className="identity"><span className="avatar" aria-hidden>{user.email[0]?.toUpperCase()}</span>
        <span className="identity-text" title={user.email}>{user.email}<small>{admin ? 'Admin' : 'User'}</small></span>
      </div>
    </aside>
    <div className="content">
      <header className="top"><span>{brand.workspace} <b>/</b> {pathname === '/' ? 'Overview' : pathname.startsWith('/admin') ? 'Administration' : 'Projects'}</span>
        <button className="quiet" disabled={busy} onClick={async () => {
          setBusy(true); setError('')
          try { await signOut() } catch (e) { setError(message(e)) } finally { setBusy(false) }
        }}>{busy ? 'Signing out…' : 'Sign out'}</button>
      </header>
      <main id="workspace" tabIndex={-1}>{error && <p className="alert" role="alert">{error}</p>}<Outlet /></main>
    </div>
  </div>
}

function Login({ onLogin }: { onLogin: (user: Account) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setBusy(true)
    const data = new FormData(e.currentTarget)
    try {
      await api('/auth/login', 'POST', { email: data.get('email'), password: data.get('password') })
      onLogin(await api<Account>('/auth/me'))
    } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  return <div className="login">
    <div className="login-story"><Logo /><div><p className="eyebrow">BUSINESS OPERATIONS</p><h1>A workspace for the work that matters.</h1>
      <p>Manage client projects and see where work stands from one shared space.</p></div><span>{brand.workspace}</span></div>
    <main className="login-panel"><form className="login-form" onSubmit={submit}>
      <p className="eyebrow">YOUR WORKSPACE</p><h2>Sign in</h2><p className="muted">Use your workspace email and password.</p>
      {error && <p className="alert" role="alert">{error}</p>}
      <label>Email<input name="email" type="email" required maxLength={256} autoComplete="username" /></label>
      <label>Password<input name="password" type="password" required maxLength={256} autoComplete="current-password" /></label>
      <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form></main>
  </div>
}

function Overview() {
  const [summary, setSummary] = useState<Summary>()
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let live = true
    api<Summary>('/projects/summary').then(data => { if (live) setSummary(data) })
      .catch(e => { if (live) setError(message(e)) })
    return () => { live = false }
  }, [revision])
  return <>
    <section className="hero"><p className="eyebrow">PROJECT OPERATIONS</p><h1>Workspace overview</h1>
      <p>See how client work is progressing across your workspace.</p><Link className="button primary" to="/projects">Browse projects <span aria-hidden>→</span></Link></section>
    <h2>Project snapshot</h2>
    {error ? <div className="alert" role="alert">{error} <button className="quiet" onClick={() => { setError(''); setRevision(n => n + 1) }}>Retry</button></div> :
    <div className="metrics" aria-busy={!summary}>
      {([['All projects', 'total', 'Every project in the workspace'], ['Active', 'active', 'Work currently in progress'], ['Completed', 'completed', 'Projects already delivered']] as const).map(([title, key, desc]) =>
        <article className="card" key={key}><span>{title}</span><strong>{summary?.[key] ?? '—'}</strong><small>{desc}</small></article>)}
    </div>}
  </>
}

function RequireAccount({ user }: { user: Account | null }) {
  const { pathname, search } = useLocation()
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ returnTo: pathname + search }} />
}
function LoginRoute({ user, onLogin }: { user: Account | null; onLogin: (user: Account) => void }) {
  const location = useLocation()
  const target = location.state?.returnTo
  const safe = typeof target === 'string' && /^\/(?:projects|admin)(?:\?|$)/.test(target) ? target : '/'
  return user ? <Navigate to={safe} replace /> : <Login onLogin={onLogin} />
}
function App() {
  const [user, setUser] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const expired = () => setUser(null)
    window.addEventListener('relay:expired', expired)
    let live = true
    api<Account>('/auth/me').then(data => { if (live) setUser(data) }).catch(e => {
      if (live && !(e instanceof ApiError && e.status === 401)) setError(message(e))
    }).finally(() => { if (live) setLoading(false) })
    return () => { live = false; window.removeEventListener('relay:expired', expired) }
  }, [revision])
  if (loading || error) return <main className="center" aria-live="polite">
    {error ? <><p role="alert">{error}</p><button className="quiet" onClick={() => { setError(''); setLoading(true); setRevision(n => n + 1) }}>Retry</button></> : 'Loading workspace…'}
  </main>
  return <Routes>
    <Route path="/login" element={<LoginRoute user={user} onLogin={setUser} />} />
    <Route element={<RequireAccount user={user} />}>
      <Route element={user && <Layout user={user} signOut={async () => { await api('/auth/logout', 'POST'); setUser(null) }} />}>
        <Route index element={<Overview />} />
        <Route path="projects" element={<Projects admin={user?.roles.includes('Admin') === true} />} />
        <Route path="admin" element={user?.roles.includes('Admin') ?
          <><p className="eyebrow">WORKSPACE ACCESS</p><h1>Administration</h1>
            <section className="card"><h2>Role permissions</h2><p><strong>Admin</strong> · View, create, edit and delete projects.</p>
            <p><strong>User</strong> · View the dashboard and browse projects.</p></section></> :
          <><h1>Access denied</h1><p>Your role doesn’t have access to administration.</p><Link to="/">Back to overview</Link></>} />
        <Route path="*" element={<><h1>Page not found</h1><Link to="/">Back to overview</Link></>} />
      </Route>
    </Route>
  </Routes>
}
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>)
