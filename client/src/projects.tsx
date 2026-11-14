import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, ApiError, message, statuses, type Page, type Project, type ProjectInput } from './api'

type Mode = { kind: 'new' } | { kind: 'edit' | 'delete'; project: Project }
const fields = ['name', 'client', 'status'] as const
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export function Projects({ admin }: { admin: boolean }) {
  const [result, setResult] = useState<Page>()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mode, setMode] = useState<Mode>()
  useEffect(() => {
    let live = true
    api<Page>('/projects?' + new URLSearchParams({ page: String(page), search: query }))
      .then(data => {
        if (!live) return
        const last = Math.max(1, Math.ceil(data.total / data.pageSize))
        if (page > last) setPage(last); else setResult(data)
      }).catch(e => { if (live) setError(message(e)) })
    return () => { live = false }
  }, [page, query, revision])
  function refresh() { setError(''); setResult(undefined); setRevision(n => n + 1) }
  function move(n: number) { setError(''); setResult(undefined); setPage(n) }
  function filter(e: FormEvent) {
    e.preventDefault()
    setQuery(search.trim()); setPage(1); refresh()
  }
  return <>
    <div className="heading"><div><p className="eyebrow">CLIENT DELIVERY</p><h1>Projects</h1><p className="muted">Track client work and its current status.</p></div>
      {admin && <button className="primary" onClick={() => { setNotice(''); setMode({ kind: 'new' }) }}>＋ New project</button>}</div>
    {notice && <p className="notice" role="status">{notice}</p>}
    <section className="panel" aria-label="Project list">
      <div className="toolbar"><h2>Project directory</h2><form onSubmit={filter} className="search">
        <label className="sr-only" htmlFor="search">Search projects</label>
        <input id="search" type="search" placeholder="Search name or client" maxLength={100} value={search} onChange={e => setSearch(e.target.value)} />
        <button className="quiet">Search</button>
        {query && <button className="quiet" type="button" onClick={() => { setSearch(''); setQuery(''); setPage(1); refresh() }}>Clear</button>}
      </form></div>
      {error ? <p className="inset alert" role="alert">{error} <button className="quiet" onClick={refresh}>Retry</button></p> :
       !result ? <p className="inset muted" role="status">Loading projects…</p> :
       result.items.length === 0 ? <div className="empty"><h3>{query ? 'No matching projects' : 'No projects yet'}</h3>
         <p>{query ? 'Try a different project name or client.' : admin ? 'Create a project to start tracking client work.' : 'Projects will appear here once an admin adds them.'}</p></div> :
       <><div className="table-scroll"><table><thead><tr><th scope="col">Project</th><th scope="col">Client</th><th scope="col">Status</th><th scope="col">Created</th>
         {admin && <th scope="col">Actions</th>}</tr></thead>
       <tbody>{result.items.map(project => <tr key={project.id}><th scope="row">{project.name}</th><td>{project.client}</td>
         <td><span className={'badge ' + project.status.toLowerCase()}>{project.status}</span></td><td>{date.format(new Date(project.createdAt))}</td>
         {admin && <td className="actions"><button className="text-button" aria-label={'Edit ' + project.name} onClick={() => setMode({ kind: 'edit', project })}>Edit</button>
           <button className="text-button danger-text" aria-label={'Delete ' + project.name} onClick={() => setMode({ kind: 'delete', project })}>Delete</button></td>}</tr>)}</tbody></table></div>
       <div className="pagination"><span>{result.total} {result.total === 1 ? 'project' : 'projects'} · Page {page} of {Math.ceil(result.total / result.pageSize)}</span><div>
         <button className="quiet" disabled={page === 1} onClick={() => move(page - 1)}>Previous</button>
         <button className="quiet" disabled={page * result.pageSize >= result.total} onClick={() => move(page + 1)}>Next</button></div></div></>}
    </section>
    {mode && <ProjectDialog mode={mode} onClose={() => setMode(undefined)} onSuccess={msg => { setMode(undefined); setNotice(msg); refresh() }} />}
  </>
}

function ProjectDialog({ mode, onClose, onSuccess }: { mode: Mode; onClose: () => void; onSuccess: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  useEffect(() => {
    const element = dialog.current!
    const trigger = document.activeElement as HTMLElement | null
    element.showModal()
    return () => { element.close(); trigger?.focus() }
  }, [])
  const project = mode.kind === 'new' ? undefined : mode.project
  const remove = mode.kind === 'delete'
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setErrors({})
    const data = new FormData(e.currentTarget)
    const body: ProjectInput = { name: String(data.get('name') ?? '').trim(), client: String(data.get('client') ?? '').trim(),
      status: data.get('status') as ProjectInput['status'] }
    if (!remove && (!body.name || !body.client)) {
      setErrors({ ...(!body.name && { name: ['Enter a project name.'] }), ...(!body.client && { client: ['Enter a client.'] }) }); return
    }
    setBusy(true)
    try {
      await api(project ? '/projects/' + project.id : '/projects', remove ? 'DELETE' : project ? 'PUT' : 'POST', remove ? undefined : body)
      onSuccess(remove ? 'Project deleted.' : project ? 'Project updated.' : 'Project created.')
    } catch (e) {
      if (e instanceof ApiError && e.problem.errors)
        setErrors(Object.fromEntries(Object.entries(e.problem.errors).map(([key, value]) => [key.toLowerCase(), value])))
      setError(message(e))
    } finally { setBusy(false) }
  }
  return <dialog ref={dialog} aria-labelledby="dialog-title" onCancel={e => { e.preventDefault(); if (!busy) onClose() }}>
    <form onSubmit={save}><h2 id="dialog-title">{remove ? 'Delete project?' : project ? 'Edit project' : 'New project'}</h2>
      {error && <p role="alert" className="alert">{error}</p>}
      {remove ? <p>Delete <strong>{project?.name}</strong> permanently?</p> : fields.map(field =>
        <label key={field}><span id={"label-" + field}>{field === 'name' ? 'Project name' : field === 'client' ? 'Client' : 'Status'}</span>
          {field === 'status' ? <select name={field} aria-labelledby={"label-" + field} defaultValue={project?.status ?? 'Planned'} aria-invalid={!!errors[field]} aria-describedby={errors[field] ? 'error-' + field : undefined}>
            {statuses.map(status => <option key={status}>{status}</option>)}</select> :
            <input name={field} aria-labelledby={"label-" + field} defaultValue={project?.[field] ?? ''} required maxLength={100} autoFocus={field === 'name'} aria-invalid={!!errors[field]} aria-describedby={errors[field] ? 'error-' + field : undefined} />}
          {errors[field] && <small id={'error-' + field} className="danger-text">{errors[field].join(' ')}</small>}
        </label>)}
      <div className="dialog-actions"><button type="button" className="quiet" onClick={onClose} disabled={busy} autoFocus={remove}>Cancel</button>
        <button className={remove ? 'danger' : 'primary'} disabled={busy}>{busy ? 'Working…' : remove ? 'Delete project' : 'Save project'}</button></div>
    </form>
  </dialog>
}
