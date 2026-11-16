import { useEffect, useState } from 'react'
import { ChevronRight, Cloud, Folder, ImageOff, Search, Trash2, Upload } from 'lucide-react'
import ModalDialog from './ModalDialog'
import { requestJson } from '../services/apiTransport'
import { routeRequest } from '../services/routeRequests'
import { uploadMediaImage } from '../services/mediaUpload'
import './MediaFolderBrowser.css'

const post = (url, body) => requestJson(url, { method: 'POST', body: JSON.stringify(body), errorContext: 'form' })

export function MediaFolderBrowser({ onSelect, onDelete, onBrowse, multiple = false, attached = [], revision = 0, renderActions, canUpload = true, kind = 'images' }) {
  const [folder, setFolder] = useState(null)
  const [cursors, setCursors] = useState([null])
  const cursor = cursors.at(-1)
  const [request, setRequest] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [pending, setPending] = useState([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setPending([]) }, [revision])
  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams()
    query.set('kind', kind)
    if (folder !== null) query.set('folder', folder)
    if (cursor) query.set('cursor', cursor)
    setLoading(true)
    setError('')
    routeRequest('/api/media/folders?' + query, { signal: controller.signal, scope: 'cms' })
      .then(result => {
        if (controller.signal.aborted) return
        setData(result)
        onBrowse?.(result.items)
      })
      .catch(failure => {
        if (!controller.signal.aborted) setError([404, 405].includes(failure.status)
          ? 'This server does not have the Media Library folder API. Restart the backend with the current portal code.'
          : 'Could not load this media folder.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [folder, cursor, request, revision, kind, onBrowse])

  function navigate(next) {
    setPending([])
    setSearch('')
    setActionError('')
    setLoading(true)
    setCursors([null])
    setFolder(next)
  }
  const refresh = () => { setLoading(true); setRequest(count => count + 1) }
  const run = async action => {
    setBusy(true)
    setActionError('')
    try { await action() }
    catch (failure) { setActionError(failure.message || 'Could not complete the media action.') }
    finally { setBusy(false) }
  }
  const register = item => item.id ? Promise.resolve(item) : post('/api/media/register', { key: item.storage_path })
  const apply = () => run(async () => {
    const items = await Promise.all(pending.map(register))
    onSelect(items)
  })
  const root = data?.root
  const items = (data?.items || []).filter(item => item.original_filename.toLowerCase().includes(search.trim().toLowerCase()))
  const chosenIds = pending.map(item => item.id).filter(Boolean)
  const crumbs = folder && root ? folder.slice(root.length).split('/').filter(Boolean) : []
  const path = [{ name: 'Folders', key: null }]
  if (folder !== null && root) {
    path.push({ name: 'Root files', key: root })
    crumbs.forEach((name, index) => path.push({ name, key: root + '/' + crumbs.slice(0, index + 1).join('/') }))
  }
  return <div className="media-folder-browser">
    <header className="media-folder-header">
      <div>
        {data?.provider && <p className="media-folder-provider"><Cloud size={16} aria-hidden="true" />
          {({ azure: 'Microsoft Azure Blob Storage', backblaze: 'Backblaze B2', local: 'Local storage' })[data.provider] || data.provider}
        </p>}
        <nav aria-label="Media folders">
          <ol className="media-folder-path">
            {path.map(({ name, key }, index) => <li key={key ?? 'folders'}>
              {index > 0 && <ChevronRight size={14} aria-hidden="true" />}
              {index === path.length - 1 ? <span aria-current="page">{name}</span>
                : <button type="button" disabled={busy} onClick={() => navigate(key)}>{name}</button>}
            </li>)}
          </ol>
        </nav>
      </div>
      {!loading && !error && data && folder !== null && canUpload && <label className="media-folder-upload">
        <Upload size={17} aria-hidden="true" />{busy ? 'Working…' : 'Upload images'}
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={event => {
          const files = [...event.target.files]
          event.target.value = ''
          if (files.length) run(async () => {
            try { for (const file of files) await uploadMediaImage(file, { folder: data.provider === 'azure' ? folder : undefined }) }
            finally { setCursors([null]); refresh() }
          })
        }} />
      </label>}
    </header>
    {actionError && <p className="media-folder-message" role="alert">{actionError}</p>}
    {loading ? <p role="status">Loading folder…</p> : error ? <div className="media-folder-message" role="alert">{error} <button type="button" onClick={refresh}>Try again</button></div> : data && <>
      {folder === null && <p className="media-folder-hint">Choose a folder to browse media.</p>}
      <div className="media-folder-entries">
        {folder === null && (data.rootFiles || (canUpload && !data.folders.length && !cursor && !data.next)) &&
          <button type="button" onClick={() => navigate(root)}><Folder size={17} aria-hidden="true" /> Root files</button>}
        {data.folders.map(key => <button type="button" key={key} disabled={busy} onClick={() => navigate(key)}>
          <Folder size={17} aria-hidden="true" /> {key.split('/').filter(Boolean).at(-1)}
        </button>)}
      </div>
      {folder !== null && !data.folders.length && !data.items.length && <p className="media-folder-message">This folder has no matching files.</p>}
      {folder !== null && !onSelect && data.items.length > 0 && <div className="media-folder-toolbar">
        <label className="media-folder-search"><Search size={17} aria-hidden="true" />
          <input type="search" aria-label="Filter files on this page" placeholder="Filter files on this page" value={search} onChange={event => setSearch(event.target.value)} />
        </label>
        <div className="media-folder-bulk">
          <span role="status">{chosenIds.length ? chosenIds.length + ' selected' : items.length + (items.length === 1 ? ' file' : ' files')}</span>
          {onDelete && <>
            <button type="button" disabled={busy || !items.some(item => item.id)} onClick={() => setPending(items.filter(item => item.id))}>Select visible</button>
            <button type="button" className="media-folder-danger" disabled={busy || !chosenIds.length} onClick={event => onDelete(chosenIds, event.currentTarget)}>
              <Trash2 size={16} aria-hidden="true" /> Delete selected
            </button>
          </>}
        </div>
      </div>}
      {folder !== null && data.items.length > 0 && !items.length && <p className="media-folder-message">No files match this filter.</p>}
      {folder !== null && items.length > 0 && <div className="cms-gallery-library-grid media-folder-grid">
        {items.map(item => {
          const selected = pending.some(value => value.storage_path === item.storage_path)
          const alreadyAttached = attached.includes(item.storage_path)
          const image = <><span className="cms-gallery-library-thumb">{item.preview_url && item.content_type?.startsWith('image/')
            ? <img src={item.preview_url} alt="" loading="lazy" /> : <ImageOff size={20} aria-hidden="true" />}</span>
            <span className="media-folder-filename">{item.original_filename}</span></>
          return onSelect ? <button type="button" key={item.storage_path} className={`cms-gallery-library-item${selected ? ' is-selected' : ''}`}
            aria-pressed={selected} disabled={busy || alreadyAttached} onClick={() => setPending(multiple
              ? (selected ? pending.filter(value => value.storage_path !== item.storage_path) : [...pending, item])
              : [item])}>{image}{alreadyAttached && <small>Already added</small>}</button>
            : <article key={item.storage_path} className="cms-gallery-library-item">{image}
              {item.id && onDelete && <label className="media-folder-select"><input type="checkbox" aria-label={`Select ${item.original_filename}`} checked={selected} onChange={() => setPending(current =>
                selected ? current.filter(value => value.id !== item.id) : [...current, item])} /> Select file</label>}
              <div className="media-folder-file-actions">{item.id ? renderActions?.(item) : <button type="button" disabled={busy} onClick={() => run(async () => { await register(item); refresh() })}>Register media</button>}</div>
            </article>
        })}
      </div>}
      {(cursors.length > 1 || data.next) && <nav aria-label="Folder pages" className="media-folder-pages">
        <button type="button" disabled={busy || cursors.length === 1} onClick={() => { setLoading(true); setCursors(cursors.slice(0, -1)) }}>Previous</button>
        <span>Page {cursors.length}</span>
        <button type="button" disabled={busy || !data.next} onClick={() => { setLoading(true); setCursors([...cursors, data.next]) }}>Next</button>
      </nav>}
    </>}
    {onSelect && <div className="cms-gallery-library-actions">
      <button type="button" className="primary-button" disabled={folder === null || !pending.length || busy || loading || Boolean(error)}
        onClick={apply}>{multiple ? `Add selected${pending.length ? ` (${pending.length})` : ''}` : 'Select file'}</button>
    </div>}
  </div>
}

export default function MediaFolderPicker({ title, onClose, ...props }) {
  return <ModalDialog label={title} onClose={onClose} themeClass="cms admin-portal" backdropClass="cms-gallery-library-backdrop">
    <section className="cms-gallery-library-dialog">
      <header className="cms-gallery-library-heading"><h2>{title}</h2></header>
      <MediaFolderBrowser {...props} />
    </section>
  </ModalDialog>
}
