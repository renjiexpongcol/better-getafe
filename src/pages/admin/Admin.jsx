import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
const blank = { title: '', slug: '', excerpt: '', content: '', category_id: '', status: 'draft', published_at: '' }
const api = (url, token, options = {}) => fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } }).then(async r => { const body = r.status === 204 ? null : await r.json(); if (!r.ok) throw new Error(body?.error || 'Request failed'); return body })
export default function Admin() {
 const { user, logout } = useAuth()
 const [token, setToken] = useState(() => localStorage.getItem('getafe_cms_token') || ''), [articles, setArticles] = useState([]), [categories, setCategories] = useState([]), [form, setForm] = useState(blank), [editing, setEditing] = useState(null), [notice, setNotice] = useState(''), [tab, setTab] = useState('dashboard'), [media, setMedia] = useState([]), [settings, setSettings] = useState(null)
 const load = async () => { try { const [news, cats, files] = await Promise.all([api('/api/news?limit=100', token), api('/api/categories'), api('/api/media', token)]); setArticles(news.items); setCategories(cats); setMedia(files) } catch { setToken(''); localStorage.removeItem('getafe_cms_token') } }
 useEffect(() => { if (token) load() }, [token])
 useEffect(() => { if (token && tab === 'settings') api('/api/admin/settings', token).then(setSettings).catch(e => setNotice(e.message)) }, [token, tab])
 const saveArticle = async e => { e.preventDefault(); try { await api(editing ? `/api/news/${editing}` : '/api/news', token, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(form) }); setNotice(editing ? 'Article updated.' : 'Article created.'); setForm(blank); setEditing(null); setTab('news'); load() } catch (e) { setNotice(e.message) } }
 const removeArticle = async id => { if (!confirm('Delete this article permanently?')) return; await api(`/api/news/${id}`, token, { method: 'DELETE' }); load() }
 const upload = async e => { const file = e.target.files?.[0]; if (!file) return; if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) return setNotice('Choose a JPG, PNG, or WEBP image smaller than 5 MB.'); try { const formData = new FormData(); formData.append('file', file); formData.append('name', file.name); const res = await fetch('/api/media', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: formData }); const body = await res.json(); if (!res.ok) throw new Error(body?.error || 'Upload failed'); setMedia(m => [body, ...m]); setForm(f => ({ ...f, featured_image: body.filepath, featured_image_preview: body.preview_url || body.filepath })); setNotice('Image uploaded and selected.') } catch (err) { setNotice(err.message) } }
 if (!user || !token) return <Navigate to="/auth/login" replace />
 if (user.role !== 'admin') return <Navigate to="/" replace />
 const published = articles.filter(a => a.status === 'published').length
 return <main className="cms"><aside className="cms-side"><div><img src="/assets/getafe-seal.png" alt="" /><strong>Getafe CMS</strong></div>{[['dashboard','Dashboard'],['news','News & Updates'],['categories','Categories'],['media','Media Library'],['settings','Settings']].map(([key,label]) => <button className={tab === key ? 'active' : ''} onClick={() => setTab(key)} key={key}>{label}</button>)}<button onClick={logout}>Logout</button></aside><section className="cms-main">{notice && <div className="cms-notice">{notice}</div>}{tab === 'dashboard' && <><div className="cms-title"><div><p className="news-category">Overview</p><h1>Dashboard</h1></div><button onClick={() => { setForm(blank); setEditing(null); setTab('editor') }}>+ Add News</button></div><div className="cms-stats"><div><span>Published news</span><strong>{published}</strong></div><div><span>Drafts</span><strong>{articles.length - published}</strong></div><div><span>Categories</span><strong>{categories.length}</strong></div></div><h2>Recent articles</h2><ArticleTable articles={articles.slice(0, 5)} edit={a => { setForm({ ...a, featured_image: a.featured_image_path || a.featured_image, published_at: a.published_at?.slice(0, 16) || '' }); setEditing(a.id); setTab('editor') }} remove={removeArticle} /></>}{tab === 'news' && <><div className="cms-title"><h1>News & Updates</h1><button onClick={() => { setForm(blank); setEditing(null); setTab('editor') }}>+ Add News</button></div><ArticleTable articles={articles} edit={a => { setForm({ ...a, featured_image: a.featured_image_path || a.featured_image, published_at: a.published_at?.slice(0, 16) || '' }); setEditing(a.id); setTab('editor') }} remove={removeArticle} /></>}{tab === 'editor' && <form className="cms-editor" onSubmit={saveArticle}><div className="cms-title"><h1>{editing ? 'Edit article' : 'Add news article'}</h1><button>{form.status === 'published' ? 'Publish changes' : 'Save draft'}</button></div><label>Title<input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value, slug: form.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g,'-') })} /></label><label>URL slug<input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} /></label><label>Short excerpt<textarea required value={form.excerpt} onChange={e => setForm({ ...form, excerpt: e.target.value })} /></label><label>Full content<textarea className="content-box" required value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} /><small>HTML is supported (for example, &lt;p&gt;paragraph&lt;/p&gt;).</small></label><div className="cms-row"><label>Category<select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}><option value="">Uncategorised</option>{categories.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="draft">Draft</option><option value="published">Published</option></select></label><label>Publication date<input type="datetime-local" value={form.published_at} onChange={e => setForm({ ...form, published_at: e.target.value })} /></label></div><label>Featured image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} /></label>{form.featured_image && <img className="cms-preview" src={form.featured_image_preview || form.featured_image} alt="Selected" />}</form>}{tab === 'categories' && <Categories token={token} categories={categories} reload={load} />}{tab === 'media' && <><div className="cms-title"><h1>Media Library</h1><label className="upload-btn">Upload image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} /></label></div><div className="media-grid">{media.map(m => <div key={m.id}><img src={m.preview_url || m.filepath} alt={m.filename} /><small>{m.filename}</small><button onClick={async () => { if (confirm('Delete this image?')) { try { await api(`/api/media/${m.id}`, token, { method: 'DELETE' }); load() } catch (e) { setNotice(e.message) } } }}>Delete</button></div>)}</div></>}{tab === 'settings' && <Settings token={token} settings={settings} setSettings={setSettings} onSaved={setNotice} />}</section></main>
}
function ArticleTable({ articles, edit, remove }) { return <div className="cms-table"><div className="cms-table-head"><span>Title</span><span>Category</span><span>Status</span><span>Actions</span></div>{articles.map(a => <div className="cms-table-row" key={a.id}><strong>{a.title}</strong><span>{a.category?.name || '—'}</span><span className={`status ${a.status}`}>{a.status}</span><span><button onClick={() => edit(a)}>Edit</button><button className="danger" onClick={() => remove(a.id)}>Delete</button></span></div>)}</div> }
function Categories({ token, categories, reload }) { const [name, setName] = useState(''); const add = async e => { e.preventDefault(); try { await api('/api/categories', token, { method: 'POST', body: JSON.stringify({ name }) }); setName(''); reload() } catch (e) { alert(e.message) } }; return <><h1>Categories</h1><form className="category-form" onSubmit={add}><input placeholder="New category name" value={name} onChange={e => setName(e.target.value)} /><button>Add category</button></form><div className="category-list">{categories.map(c => <div key={c.id}><span>{c.name}</span><button className="danger" onClick={async () => { if (confirm(`Delete ${c.name}?`)) { try { await api(`/api/categories/${c.id}`, token, { method: 'DELETE' }); reload() } catch (e) { alert(e.message) } } }}>Delete</button></div>)}</div></> }
function Settings({ settings }) { 
  if (!settings) return <p>Loading settings…</p>; 
  
  return (
    <div className="cms-editor">
      <div className="cms-title">
        <div>
          <h1>System Infrastructure</h1>
          <p>These settings are managed via Cloud Run Environment Variables and cannot be changed here.</p>
        </div>
      </div>
      
      <div className="cms-row">
        <label>
          Database Provider
          <input readOnly value={settings.databaseProvider === 'gcp' ? 'Google Cloud SQL' : 'Local Development (JSON)'} />
        </label>
        <label>
          Media Provider
          <input readOnly value={settings.mediaProvider === 'gcp' ? 'Google Cloud Storage' : 'Local File System'} />
        </label>
      </div>

      <h2>Google Cloud SQL Configuration</h2>
      <p style={{marginBottom: '1rem', color: '#666'}}>
        {settings.databaseProvider === 'gcp' 
          ? 'Connected via @google-cloud/cloud-sql-connector.' 
          : 'Set CMS_DATABASE_PROVIDER=gcp in your deployment to enable Cloud SQL.'}
      </p>
      
      <label>
        Instance Connection Name
        <input readOnly value={settings.instanceConnectionName || 'Not configured'} />
      </label>
      <div className="cms-row">
        <label>
          Database Name
          <input readOnly value={settings.databaseName || 'Not configured'} />
        </label>
        <label>
          Database User
          <input readOnly value={settings.databaseUser || 'Not configured'} />
        </label>
      </div>

      <h2>Google Cloud Storage Configuration</h2>
      <p style={{marginBottom: '1rem', color: '#666'}}>
        {settings.mediaProvider === 'gcp' 
          ? 'Media uploads are piped directly to your bucket.' 
          : 'Set CMS_MEDIA_PROVIDER=gcp in your deployment to enable Cloud Storage.'}
      </p>

      <label>
        Bucket Name
        <input readOnly value={settings.bucket || 'Not configured'} />
      </label>
      <label>
        Public Media Base URL
        <input readOnly value={settings.publicBaseUrl || 'Not configured'} />
      </label>
    </div>
  ); 
}
