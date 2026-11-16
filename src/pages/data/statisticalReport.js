import { collection, label } from '../../services/publicDataApi.js'

const dimensionCode = dimension => String(dimension?.code || dimension?.id || dimension?.name || '')
const axisRole = dimension => String(dimension?.axis || dimension?.role || dimension?.placement || dimension?.displayAxis || '').toLowerCase()
const geographyPattern = /geograph|geolocation|region|province|municipal|city|barangay|district|country|location|residen|place|area/i
const timePattern = /^(year|time|date|period|quarter|semester|month|week|day)s?$/i
const indicatorPattern = /indicator|variable|statistic|series|commodity|product|crop|sex|age|industry/i
const measurePattern = /measure|unit|value|amount|quantity|metric/i

function uniqueDimensions(...groups) {
  const dimensions = new Map()
  groups.flat().forEach(dimension => {
    const code = dimensionCode(dimension)
    if (code && !dimensions.has(code)) dimensions.set(code, { ...dimension, code, label: label(dimension) })
  })
  return [...dimensions.values()]
}

function displayValue(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : label(value)
}

function layoutDimensionCodes(value, dimensions) {
  if (value == null) return null
  const requested = Array.isArray(value) ? value : [value]
  const codes = requested.map(item => {
    if (item && typeof item === 'object') return dimensionCode(item) || String(item.label || '')
    return String(item)
  })
  return codes.map(code => dimensions.find(dimension => dimension.code === code || dimension.label === code)?.code).filter(Boolean)
}

function configuredAxes(dataset, dimensions) {
  const layout = dataset?.reportLayout || dataset?.report_layout || dataset?.tableLayout || dataset?.table_layout || dataset?.dimensionLayout || dataset?.dimension_layout || dataset?.layout || {}
  const rowSpec = layout.rowDimensions ?? layout.row_dimensions ?? layout.rows ?? dataset?.rowDimensions ?? dataset?.row_dimensions
  const columnSpec = layout.columnDimensions ?? layout.column_dimensions ?? layout.columns ?? dataset?.columnDimensions ?? dataset?.column_dimensions
  const rowCodes = layoutDimensionCodes(rowSpec, dimensions)
  const columnCodes = layoutDimensionCodes(columnSpec, dimensions)
  const roleRows = dimensions.filter(dimension => /^(row|rows|stub|stubhead|geography)$/.test(axisRole(dimension))).map(dimension => dimension.code)
  const roleColumns = dimensions.filter(dimension => /^(column|columns|col|measure|value)$/.test(axisRole(dimension))).map(dimension => dimension.code)
  return {
    rowCodes: rowCodes?.length ? rowCodes : roleRows,
    columnCodes: columnCodes?.length ? columnCodes : roleColumns,
    hasConfiguredRows: Boolean(rowCodes?.length || roleRows.length),
    hasConfiguredColumns: Boolean(columnCodes?.length || roleColumns.length),
  }
}

function unitLabel(value) {
  if (value == null || value === '') return ''
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : displayValue(value.label || value.name || value.title || value)
}

function defaultColumnOrder(dimensions) {
  const rank = dimension => {
    const text = `${dimension.code} ${dimension.label}`
    if (/^year$/i.test(dimension.code) || /^year$/i.test(dimension.label)) return 0
    if (timePattern.test(dimension.code) || timePattern.test(dimension.label)) return 1
    if (indicatorPattern.test(text)) return 2
    if (measurePattern.test(text)) return 3
    return 4
  }
  return [...dimensions].sort((a, b) => rank(a) - rank(b) || a.index - b.index)
}

export function resolveReportLayout(dataset = {}, query = {}, layoutOverride = null) {
  const queryDimensions = collection(query?.dimensions)
  const metadataDimensions = collection(dataset?.dimensions || dataset?.dimensionDefinitions || dataset?.dimension_definitions)
  const dimensions = uniqueDimensions(metadataDimensions, queryDimensions).map((dimension, index) => ({ ...dimension, index }))
  if (layoutOverride && Array.isArray(layoutOverride.rowCodes) && Array.isArray(layoutOverride.columnCodes)) {
    const byCode = new Map(dimensions.map(dimension => [dimension.code, dimension]))
    const rowCodes = [...new Set(layoutOverride.rowCodes)].filter(code => byCode.has(code))
    const columnCodes = [...new Set(layoutOverride.columnCodes)].filter(code => byCode.has(code) && !rowCodes.includes(code))
    const placed = new Set([...rowCodes, ...columnCodes])
    rowCodes.push(...dimensions.filter(dimension => !placed.has(dimension.code)).map(dimension => dimension.code))
    return {
      dimensions,
      rowDimensions: rowCodes.map(code => byCode.get(code)),
      columnDimensions: columnCodes.map(code => byCode.get(code)),
    }
  }
  const configured = configuredAxes(dataset, dimensions)
  const byCode = new Map(dimensions.map(dimension => [dimension.code, dimension]))
  const configuredColumns = configured.columnCodes.filter(code => byCode.has(code))
  const configuredRows = configured.rowCodes.filter(code => byCode.has(code))
  const remaining = dimensions.filter(dimension => !configuredRows.includes(dimension.code) && !configuredColumns.includes(dimension.code))

  let rowDimensions
  let columnDimensions
  if (configured.hasConfiguredRows || configured.hasConfiguredColumns) {
    rowDimensions = configuredRows.map(code => byCode.get(code))
    columnDimensions = [
      ...configuredColumns.map(code => byCode.get(code)),
      ...defaultColumnOrder(remaining.filter(dimension => !configuredRows.includes(dimension.code))),
    ]
    if (!rowDimensions.length && remaining.length) {
      const inferredRow = remaining.find(dimension => geographyPattern.test(`${dimension.code} ${dimension.label}`)) || remaining.find(dimension => !timePattern.test(dimension.code) && !timePattern.test(dimension.label)) || remaining[0]
      rowDimensions = [inferredRow]
      columnDimensions = [...columnDimensions, ...defaultColumnOrder(remaining.filter(dimension => dimension.code !== inferredRow.code))]
    }
  } else {
    const geographicDimensions = dimensions.filter(dimension => geographyPattern.test(`${dimension.code} ${dimension.label}`))
    const inferredRows = geographicDimensions.length
      ? geographicDimensions
      : [dimensions.find(dimension => !timePattern.test(dimension.code) && !timePattern.test(dimension.label)) || dimensions[0]].filter(Boolean)
    rowDimensions = inferredRows
    columnDimensions = defaultColumnOrder(dimensions.filter(dimension => !inferredRows.some(row => row.code === dimension.code)))
  }

  return { dimensions, rowDimensions, columnDimensions }
}

function coordinate(row, dimension, fallbackIndex, responseIndex) {
  const index = responseIndex.has(dimension.code) ? responseIndex.get(dimension.code) : fallbackIndex
  if (Array.isArray(row?.labels) && row.labels[index] !== undefined) return String(row.labels[index])
  if (Array.isArray(row?.codes) && row.codes[index] !== undefined) return String(row.codes[index])
  const keyed = row?.dimensions?.[dimension.code] ?? row?.dimensionValues?.[dimension.code] ?? row?.[dimension.code] ?? row?.[dimension.label]
  if (keyed && typeof keyed === 'object') return String(keyed.label ?? keyed.name ?? keyed.value ?? keyed.code ?? '—')
  return keyed == null || keyed === '' ? '—' : String(keyed)
}

function measureValue(row) {
  if (row?.value !== undefined) return row.value
  if (row?.measureValue !== undefined) return row.measureValue
  if (row?.observation !== undefined) return row.observation
  return row?.measure
}

function tupleKey(values) { return JSON.stringify(values) }

export function formatReportValue(value, unit = '') {
  if (value === null || value === undefined || value === '' || value === '..' || value === '...') return '—'
  if (typeof value === 'string' && !value.trim()) return '—'
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  const hasFractionalUnit = /%|percent|percentage|rate|ratio|index|average|mean|price|currency|peso|php|per\s/i.test(unit)
  return new Intl.NumberFormat('en-PH', { maximumFractionDigits: hasFractionalUnit || !Number.isInteger(numeric) ? 2 : 0 }).format(numeric)
}

function footnoteValues(...sources) {
  const values = []
  const add = value => {
    if (Array.isArray(value)) value.forEach(add)
    else if (typeof value === 'string' && value.trim()) values.push(value.trim())
    else if (value && typeof value === 'object') {
      const text = value.text || value.note || value.label || value.description
      if (typeof text === 'string' && text.trim()) values.push(text.trim())
    }
  }
  sources.forEach(source => {
    if (!source || typeof source !== 'object') return
    for (const key of ['footnotes', 'footnote', 'notes', 'note', 'sourceNotes', 'sourceNote']) add(source[key])
  })
  return [...new Set(values)]
}

export function buildStatisticalReport(dataset = {}, query = {}, selection = {}, layoutOverride = null) {
  const { dimensions, rowDimensions, columnDimensions } = resolveReportLayout(dataset, query, layoutOverride)
  const responseDimensions = collection(query?.dimensions)
  const responseIndex = new Map(responseDimensions.map((dimension, index) => [dimensionCode(dimension), index]))
  const sourceRows = collection(query?.rows || query?.observations || query?.results)
  const rowGroups = new Map()
  const columnLeaves = new Map()

  sourceRows.forEach((sourceRow, sourceIndex) => {
    const rowLabels = rowDimensions.length
      ? rowDimensions.map(dimension => coordinate(sourceRow, dimension, dimension.index, responseIndex))
      : [`Observation ${sourceIndex + 1}`]
    const columnLabels = columnDimensions.map(dimension => coordinate(sourceRow, dimension, dimension.index, responseIndex))
    const rowKey = tupleKey(rowLabels)
    const columnKey = tupleKey(columnLabels)
    if (!rowGroups.has(rowKey)) rowGroups.set(rowKey, { key: rowKey, labels: rowLabels, cells: new Map() })
    if (!columnLeaves.has(columnKey)) columnLeaves.set(columnKey, { key: columnKey, labels: columnLabels })
    rowGroups.get(rowKey).cells.set(columnKey, measureValue(sourceRow))
  })

  const leaves = [...columnLeaves.values()]
  const tree = { children: new Map() }
  leaves.forEach(leaf => {
    let node = tree
    leaf.labels.forEach((value, index) => {
      if (!node.children.has(value)) node.children.set(value, { value, depth: index, children: new Map(), leaf: null })
      node = node.children.get(value)
    })
    node.leaf = leaf
  })
  const measureMetadata = dataset?.measure || dataset?.measureDefinition || dataset?.measure_definition
  const measureLabel = measureMetadata
    ? displayValue(measureMetadata.label || measureMetadata.name || measureMetadata.title || measureMetadata)
    : dataset?.measureLabel || dataset?.measure_label || query?.measure || 'Measure'
  if (!columnDimensions.length && !leaves.length && sourceRows.length) leaves.push({ key: tupleKey([]), labels: [] })
  const unit = unitLabel(query?.unit || dataset?.unit || dataset?.measure?.unit)
  const configuredFootnotes = footnoteValues(dataset, query, query?.metadata, dataset?.metadata)
  const footnotes = [...configuredFootnotes]
  if (query?.source || dataset?.source) footnotes.push(`Source: ${query.source || dataset.source}`)
  if (query?.release || dataset?.release) footnotes.push(`Release: ${query.release || dataset.release}`)
  if (query?.retrievedAt || dataset?.retrievedAt || dataset?.retrieved) footnotes.push(`Retrieved: ${query.retrievedAt || dataset.retrievedAt || dataset.retrieved}`)
  const selectionLabels = dimensions.map(dimension => {
    const selected = selection?.[dimension.code]
    if (!selected) return null
    const availableValues = collection(selection?.values?.[dimension.code])
    const selectedValue = availableValues.find(value => String(value?.code ?? value?.id ?? value?.value ?? value) === String(selected))
    return `${dimension.label}: ${selectedValue ? displayValue(selectedValue) : selected}`
  }).filter(Boolean)
  if (selectionLabels.length) footnotes.unshift(`Selected: ${selectionLabels.join('; ')}`)

  return {
    title: query?.dataset?.title || dataset?.title || label(dataset),
    unit,
    measureLabel,
    dimensions,
    rowDimensions,
    columnDimensions,
    leaves,
    headerTree: tree,
    rows: [...rowGroups.values()],
    footnotes: [...new Set(footnotes)],
  }
}

export function statisticalReportCsv(report) {
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const rowHeaders = report.rowDimensions.length ? report.rowDimensions.map(dimension => dimension.label) : ['Observation']
  const columnHeaders = report.leaves.map(leaf => leaf.labels.length
    ? leaf.labels.map((value, index) => `${report.columnDimensions[index].label}: ${value}`).join(' / ')
    : `${report.measureLabel}${report.unit ? ` (${report.unit})` : ''}`)
  const headings = [...rowHeaders, ...columnHeaders]
  const body = report.rows.map(row => [
    ...row.labels,
    ...report.leaves.map(leaf => row.cells.get(leaf.key) ?? ''),
  ])
  const footnotes = report.footnotes.map(note => [note])
  return [headings, ...body, ...(footnotes.length ? [[''], ...footnotes] : [])].map(row => row.map(quote).join(',')).join('\r\n')
}

