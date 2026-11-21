import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import StatisticalReportTable from '../../components/StatisticalReportTable'
import { publicData, apiData, collection, label } from '../../services/publicDataApi'
import { trackOpenDataActivity } from '../../services/websiteAnalytics.js'
import './publicData.css'
import './publicDataPalette.css'

const dimensionsOf = dataset => collection(dataset?.dimensions || dataset?.dimensionDefinitions || dataset?.dimension_definitions)
const valuesOf = value => Array.isArray(value) ? value : collection(value?.values || value)
const dimensionCode = dimension => dimension.code || dimension.id || dimension.name
const valueCode = value => typeof value === 'string' || typeof value === 'number'
  ? String(value)
  : String(value?.code ?? value?.id ?? value?.value ?? '')
const valueLabel = value => typeof value === 'string' || typeof value === 'number' ? String(value) : label(value)

export default function DatasetDetail() {
  const { id } = useParams()
  const [record, setRecord] = useState(null)
  const [values, setValues] = useState({})
  const [selection, setSelection] = useState({})
  const [outcome, setOutcome] = useState(null)
  const [error, setError] = useState('')
  const reportRequest = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    setRecord(null)
    setValues({})
    setSelection({})
    setOutcome(null)
    setError('')
    publicData(`/datasets/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(setRecord)
      .catch(cause => {
        if (!controller.signal.aborted && cause.name !== 'AbortError') setError(cause.message)
      })
    return () => { controller.abort(); reportRequest.current?.abort() }
  }, [id])

  const dataset = apiData(apiData(record))
  const currentRecord = Boolean(record && dataset.id && String(dataset.id) === String(id))
  const dimensions = dimensionsOf(dataset)
  useEffect(() => { if (currentRecord) trackOpenDataActivity(String(dataset.id), 'dataset_view') }, [currentRecord, dataset.id])

  useEffect(() => {
    const sampleQuery = dataset.sampleQuery || dataset.sample_query
    if (!currentRecord || !sampleQuery?.selection) return undefined
    const controller = new AbortController()
    reportRequest.current = controller
    const initialSelection = Object.fromEntries(Object.entries(sampleQuery.selection).map(([code, selected]) => [code, Array.isArray(selected) ? String(selected[0] ?? '') : String(selected ?? '')]))
    setSelection(initialSelection)
    setError('')
    publicData(`/datasets/${encodeURIComponent(id)}/query`, {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify(sampleQuery),
    }).then(result => {
      if (!controller.signal.aborted) setOutcome(result)
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause.message)
    })
    return () => controller.abort()
  }, [record, id])

  useEffect(() => {
    if (!currentRecord) return undefined
    const controller = new AbortController()
    const release = dataset.release || dataset.version || ''
    Promise.all(dimensions.map(async dimension => {
      const code = dimensionCode(dimension)
      try {
        const allValues = []
        let offset = 0
        while (!controller.signal.aborted) {
          const params = new URLSearchParams({ dimension: code, release, pageSize: '200', offset: String(offset) })
          const response = await publicData(`/datasets/${encodeURIComponent(id)}/values?${params}`, { signal: controller.signal })
          const payload = apiData(apiData(response))
          const pageValues = valuesOf(payload)
          allValues.push(...pageValues)
          const cursor = payload?.pagination?.nextOffset
          if (!pageValues.length || cursor === null || (cursor === undefined && pageValues.length < 200)) break
          const nextOffset = cursor === undefined ? offset + pageValues.length : Number(cursor)
          if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset) throw new Error('The data provider returned an invalid page of dimension values.')
          offset = nextOffset
        }
        return [code, allValues]
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause.message)
        return [code, []]
      }
    })).then(entries => {
      if (!controller.signal.aborted) setValues(Object.fromEntries(entries))
    })
    return () => controller.abort()
  }, [record, id])

  const applySelection = async event => {
    event.preventDefault()
    reportRequest.current?.abort()
    const controller = new AbortController()
    reportRequest.current = controller
    setError('')
    setOutcome(null)
    try {
      const selectionPayload = Object.fromEntries(dimensions.map(dimension => {
        const code = dimensionCode(dimension)
        const chosen = selection[code]
        const available = values[code] || []
        const selectedValues = chosen ? [chosen] : available.map(valueCode).filter(Boolean)
        return [code, selectedValues]
      }))
      if (Object.values(selectionPayload).some(selectedValues => !selectedValues.length)) {
        throw new Error('Dimension values are still loading. Please wait, then generate the report again.')
      }
      trackOpenDataActivity(String(id), 'query_request')
      const result = await publicData(`/datasets/${encodeURIComponent(id)}/query`, {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({ selection: selectionPayload, release: dataset.release || dataset.version }),
      })
      if (!controller.signal.aborted) setOutcome(result)
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause.message)
    }
  }

  const queryPayload = outcome ? apiData(apiData(outcome)) : null
  const queryData = outcome ? { ...queryPayload, retrievedAt: outcome.retrievedAt || apiData(outcome)?.retrievedAt || queryPayload?.retrievedAt } : null
  const results = collection(queryData?.observations || queryData?.results || queryData?.rows)
  const updateDimension = (code, value) => {
    reportRequest.current?.abort()
    setSelection(current => ({ ...current, [code]: value }))
    setOutcome(null)
    setError('')
  }

  if (error && !currentRecord) return <main className="public-data-page"><section className="container data-section"><div className="data-empty">{error}</div></section></main>

  return (
    <main className="public-data-page">
      <section className="data-page-title">
        <div className="container">
          <Link className="breadcrumb" to="/data/datasets">Dataset Explorer</Link>
          <p className="data-eyebrow">DATASET DETAILS</p>
          <h1>{currentRecord ? label(dataset) : 'Loading dataset…'}</h1>
          <p>{dataset.description || dataset.summary || dataset.abstract || 'Public statistical data and metadata from the Philippine Statistics Authority.'}</p>
        </div>
      </section>
      {currentRecord && <>
        <section className="container metadata-grid">
          <dl>
            <dt>Topic</dt><dd>{dataset.topic || dataset.domain || '—'}</dd>
            <dt>Source organization</dt><dd>{dataset.sourceName || dataset.sourceOrganization || dataset.organization || 'Philippine Statistics Authority'}</dd>
            <dt>Release / version</dt><dd>{dataset.release || dataset.version || 'Available dataset release'}</dd>
          </dl>
          <dl>
            <dt>Retrieved</dt><dd>{record.retrievedAt ? new Date(record.retrievedAt).toLocaleString('en-PH') : dataset.retrieved ? new Date(dataset.retrieved).toLocaleString('en-PH') : '—'}</dd>
            <dt>Unit</dt><dd>{dataset.unit || '—'}</dd>
            <dt>Coverage</dt><dd>{dataset.coverage || dataset.geography || '—'}</dd>
          </dl>
          <dl>
            <dt>Availability</dt><dd>{dataset.status || dataset.availability || 'Ready'}</dd>
            <dt>Dimensions</dt><dd>{dimensions.map(label).join(', ') || '—'}</dd>
            <dt>Source URL</dt><dd>{dataset.source_url || dataset.source || dataset.url ? <a href={dataset.source_url || dataset.source || dataset.url} target="_blank" rel="noreferrer">View source &amp; methodology <ExternalLink size={13} aria-hidden="true" /></a> : '—'}</dd>
          </dl>
        </section>

        <section className="container data-section query-layout">
          <div>
            <p className="data-eyebrow">STATISTICAL REPORT</p>
            <h2>Choose observations</h2>
            <p className="muted">Choose values for this dataset’s dimensions, then generate a grouped report.</p>
            <form className="query-form" onSubmit={applySelection}>
              {dimensions.map(dimension => {
                const code = dimensionCode(dimension)
                return <label key={code}>{label(dimension)}
                  <select value={selection[code] || ''} onChange={event => updateDimension(code, event.target.value)}>
                    <option value="">All available values</option>
                    {(values[code] || []).map((value, index) => <option key={valueCode(value) || index} value={valueCode(value)}>{valueLabel(value)}</option>)}
                  </select>
                </label>
              })}
              <button type="submit">Generate report</button>
            </form>
          </div>
          <aside className="query-provenance">
            <h3>Provenance</h3>
            <p><strong>Dataset:</strong> {label(dataset)}</p>
            <p><strong>Release:</strong> {dataset.release || dataset.version || 'Available dataset release'}</p>
            <p><strong>Unit:</strong> {dataset.unit || '—'}</p>
            <p><strong>Retrieved:</strong> {record.retrievedAt ? new Date(record.retrievedAt).toLocaleString('en-PH') : '—'}</p>
          </aside>
        </section>

        {error && <section className="container"><div className="data-empty" role="alert">{error}</div></section>}
        {outcome && <section className="container data-section">
          {results.length > 0
            ? <StatisticalReportTable dataset={dataset} query={queryData} selection={{ ...selection, values }} datasetId={id} />
            : <div className="data-empty">No observation is available for this exact selection.</div>}
        </section>}
      </>}
    </main>
  )
}
