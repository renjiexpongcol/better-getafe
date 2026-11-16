import { useEffect, useState } from 'react'
import { getSupabaseClient } from '../../utils/supabase'
import './SupabaseTodos.css'

export default function SupabaseTodos() {
  const [todos, setTodos] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true

    async function loadTodos() {
      setStatus('loading')
      setError('')
      try {
        const supabase = getSupabaseClient()
        const { data, error: queryError } = await supabase
          .from('todos')
          .select('id, name')
          .order('id')

        if (queryError) throw queryError
        if (active) {
          setTodos(data || [])
          setStatus('success')
        }
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Could not load todos.')
          setStatus('error')
        }
      }
    }

    loadTodos()
    return () => { active = false }
  }, [retry])

  return (
    <main className="content-page supabase-todos-page">
      <header className="supabase-todos-header">
        <p className="eyebrow">Supabase example</p>
        <h1>Todos</h1>
        <p>Tasks loaded from the configured Supabase project.</p>
      </header>

      {status === 'loading' && <p role="status">Loading todos…</p>}
      {status === 'error' && (
        <section className="supabase-todos-error" role="alert">
          <h2>Could not load todos</h2>
          <p>{error}</p>
          <button className="supabase-todos-retry" type="button" onClick={() => setRetry(value => value + 1)}>
            Try again
          </button>
        </section>
      )}
      {status === 'success' && (todos.length ? (
        <ul className="supabase-todos-list">
          {todos.map(todo => <li key={todo.id}>{todo.name}</li>)}
        </ul>
      ) : <p>No todos were found.</p>)}
    </main>
  )
}
