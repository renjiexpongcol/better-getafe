import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Download } from 'lucide-react'
import { buildStatisticalReport, formatReportValue, resolveReportLayout, statisticalReportCsv } from '../pages/data/statisticalReport'
import { trackOpenDataActivity } from '../services/websiteAnalytics.js'
import './StatisticalReportTable.css'

function flattenHeaderTree(node, leaves = []) {
  if (node.leaf) leaves.push(node.leaf)
  for (const child of node.children.values()) flattenHeaderTree(child, leaves)
  return leaves
}

function leafCount(node) {
  if (node.leaf) return 1
  return [...node.children.values()].reduce((total, child) => total + leafCount(child), 0)
}

function headerGroups(node, depth) {
  if (depth === 0) return [...node.children.values()].map(child => ({ node: child, span: leafCount(child) }))
  return [...node.children.values()].flatMap(child => headerGroups(child, depth - 1))
}

function missing(value) {
  return value === null || value === undefined || value === '' || value === '..' || value === '...'
}

function downloadReport(report, datasetId) {
  trackOpenDataActivity(String(datasetId), 'csv_download_click')
  const blob = new Blob([`\uFEFF${statisticalReportCsv(report)}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${String(datasetId || 'statistical-report').replace(/[^A-Za-z0-9._-]/g, '-')}-report.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

const encoder = new TextEncoder()
const xmlEscape = value => String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
function columnName(index) {
  let name = ''
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + ((value - 1) % 26)) + name
  return name
}
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function zipStored(files) {
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const [path, content] of Object.entries(files)) {
    const name = encoder.encode(path)
    const data = encoder.encode(content)
    const checksum = crc32(data)
    const local = new Uint8Array(30 + name.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(6, 0x0800, true)
    localView.setUint16(8, 0, true); localView.setUint32(14, checksum, true); localView.setUint32(18, data.length, true); localView.setUint32(22, data.length, true)
    localView.setUint16(26, name.length, true); local.set(name, 30)
    localParts.push(local, data)

    const central = new Uint8Array(46 + name.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true); centralView.setUint16(10, 0, true); centralView.setUint32(16, checksum, true)
    centralView.setUint32(20, data.length, true); centralView.setUint32(24, data.length, true); centralView.setUint16(28, name.length, true)
    centralView.setUint32(42, offset, true); central.set(name, 46)
    centralParts.push(central)
    offset += local.length + data.length
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, centralParts.length, true); endView.setUint16(10, centralParts.length, true)
  endView.setUint32(12, centralSize, true); endView.setUint32(16, offset, true)
  return new Blob([...localParts, ...centralParts, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
function xlsxCell(reference, value, numeric = false) {
  if (numeric && value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value))) return `<c r="${reference}" t="n"><v>${Number(value)}</v></c>`
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
}
function downloadReportXlsx(report, datasetId) {
  trackOpenDataActivity(String(datasetId), 'xlsx_download_click')
  const rowHeaders = report.rowDimensions.length ? report.rowDimensions.map(dimension => dimension.label) : ['Observation']
  const columnHeaders = report.leaves.map(leaf => leaf.labels.length
    ? leaf.labels.map((value, index) => `${report.columnDimensions[index].label}: ${value}`).join(' / ')
    : `${report.measureLabel}${report.unit ? ` (${report.unit})` : ''}`)
  const tableRows = [
    [report.title],
    [...rowHeaders, ...columnHeaders],
    ...report.rows.map(row => [...row.labels, ...report.leaves.map(leaf => row.cells.get(leaf.key) ?? '')]),
    ...(report.footnotes.length ? [[''], ...report.footnotes.map(note => [note])] : []),
  ]
  const valueColumnStart = rowHeaders.length
  const sheetRows = tableRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => xlsxCell(`${columnName(columnIndex)}${rowIndex + 1}`, value, rowIndex >= 2 && columnIndex >= valueColumnStart)).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  const lastColumn = columnName(Math.max(0, rowHeaders.length + columnHeaders.length - 1))
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${tableRows.length}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${sheetRows}</sheetData><autoFilter ref="A2:${lastColumn}${Math.max(2, report.rows.length + 2)}"/></worksheet>`
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Open Data" sheetId="1" r:id="rId1"/></sheets></workbook>'
  const blob = zipStored({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': workbook,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': worksheet,
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${String(datasetId || 'open-data').replace(/[^A-Za-z0-9._-]/g, '-')}-report.xlsx`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function StatisticalReportTable({ dataset, query, selection, values, datasetId }) {
  const defaultLayout = resolveReportLayout(dataset, query)
  const layoutKey = `${datasetId || ''}:${defaultLayout.dimensions.map(dimension => dimension.code).join('|')}`
  const [layout, setLayout] = useState(null)
  const [page, setPage] = useState(1)
  useEffect(() => {
    setLayout({
      rowCodes: defaultLayout.rowDimensions.map(dimension => dimension.code),
      columnCodes: defaultLayout.columnDimensions.map(dimension => dimension.code),
    })
  }, [layoutKey])
  const activeLayout = layout || {
    rowCodes: defaultLayout.rowDimensions.map(dimension => dimension.code),
    columnCodes: defaultLayout.columnDimensions.map(dimension => dimension.code),
  }
  const report = buildStatisticalReport(dataset, query, selection, activeLayout)
  const pageSize = 100
  const pageCount = Math.max(1, Math.ceil(report.rows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visibleRows = report.rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const axisOrderKey = `${activeLayout.rowCodes.join('|')}::${activeLayout.columnCodes.join('|')}`
  useEffect(() => setPage(1), [datasetId, query?.retrievedAt, report.rows.length, axisOrderKey])
  if (!report.rows.length) return <div className="data-empty">No observation is available for this exact selection.</div>

  const leaves = report.columnDimensions.length ? flattenHeaderTree(report.headerTree) : report.leaves
  const groupedHeaderRows = report.columnDimensions.map((_, depth) => headerGroups(report.headerTree, depth))
  const headerRows = Math.max(1, groupedHeaderRows.length)
  const setDimensionAxis = (code, axis) => {
    setLayout(current => {
      const next = current || {
        rowCodes: defaultLayout.rowDimensions.map(dimension => dimension.code),
        columnCodes: defaultLayout.columnDimensions.map(dimension => dimension.code),
      }
      return {
        rowCodes: axis === 'row' ? [...next.rowCodes.filter(value => value !== code), code] : next.rowCodes.filter(value => value !== code),
        columnCodes: axis === 'column' ? [...next.columnCodes.filter(value => value !== code), code] : next.columnCodes.filter(value => value !== code),
      }
    })
  }
  const moveDimension = (code, direction) => setLayout(current => {
    const next = current || {
      rowCodes: defaultLayout.rowDimensions.map(dimension => dimension.code),
      columnCodes: defaultLayout.columnDimensions.map(dimension => dimension.code),
    }
    const axis = next.rowCodes.includes(code) ? 'rowCodes' : 'columnCodes'
    const codes = [...next[axis]]
    const index = codes.indexOf(code)
    const target = index + direction
    if (target < 0 || target >= codes.length) return next
    ;[codes[index], codes[target]] = [codes[target], codes[index]]
    return { ...next, [axis]: codes }
  })

  return (
    <div className="statistical-report">
      <div className="results-heading statistical-report-heading">
        <div>
          <p className="data-eyebrow">STATISTICAL REPORT</p>
          <h2>{report.title}</h2>
          {report.columnDimensions.length > 0 && <p className="statistical-report-grouping">Grouped columns: {report.columnDimensions.map(dimension => dimension.label).join(' → ')}</p>}
        </div>
        <div className="statistical-report-downloads">
          <button type="button" className="download-button" onClick={() => downloadReport(report, datasetId)}><Download size={16} aria-hidden="true" /> Download CSV</button>
          <button type="button" className="download-button" onClick={() => downloadReportXlsx(report, datasetId)}><Download size={16} aria-hidden="true" /> Download XLSX</button>
        </div>
      </div>
      <details className="report-layout-controls">
        <summary>Customize how the selected data is arranged</summary>
        <p>Place each dimension in the row labels or column headers, then change its order. Every dimension remains in the report.</p>
        <div className="report-layout-list">
          {report.dimensions.map(dimension => {
            const code = dimension.code
            const axis = activeLayout.rowCodes.includes(code) ? 'row' : 'column'
            const codes = axis === 'row' ? activeLayout.rowCodes : activeLayout.columnCodes
            const position = codes.indexOf(code)
            return <div className="report-layout-item" key={code}>
              <strong>{dimension.label}</strong>
              <label>Show as
                <select value={axis} onChange={event => setDimensionAxis(code, event.target.value)} aria-label={`Show ${dimension.label} as`}>
                  <option value="row">Row group</option>
                  <option value="column">Column group</option>
                </select>
              </label>
              <span className="report-layout-order">Order {position + 1}</span>
              <div className="report-layout-move">
                <button type="button" aria-label={`Move ${dimension.label} earlier`} title="Move earlier" disabled={position <= 0} onClick={() => moveDimension(code, -1)}><ArrowUp size={15} aria-hidden="true" /></button>
                <button type="button" aria-label={`Move ${dimension.label} later`} title="Move later" disabled={position < 0 || position >= codes.length - 1} onClick={() => moveDimension(code, 1)}><ArrowDown size={15} aria-hidden="true" /></button>
              </div>
            </div>
          })}
        </div>
      </details>
      <div className="dataset-table-wrap statistical-report-table-wrap">
        <table className="statistical-report-table">
          <caption className="sr-only">{report.title}{report.unit ? `. Unit: ${report.unit}.` : ''}</caption>
          <thead>
            {groupedHeaderRows.length > 0 ? groupedHeaderRows.map((groups, depth) => (
              <tr key={`header-${depth}`}>
                {depth === 0 && (report.rowDimensions.length
                  ? report.rowDimensions.map(dimension => <th scope="col" rowSpan={headerRows} key={dimension.code}>{dimension.label}</th>)
                  : <th scope="col" rowSpan={headerRows}>Observation</th>)}
                {groups.map(({ node, span }, index) => <th scope={depth === headerRows - 1 ? 'col' : 'colgroup'} colSpan={span} key={`${depth}-${node.value}-${index}`} title={`${report.columnDimensions[depth].label}: ${node.value}`}>
                  <span className="statistical-report-dimension">{report.columnDimensions[depth].label}:</span> {node.value}
                </th>)}
              </tr>
            )) : <tr>
              {report.rowDimensions.length
                ? report.rowDimensions.map(dimension => <th scope="col" key={dimension.code}>{dimension.label}</th>)
                : <th scope="col">Observation</th>}
              <th scope="col">{report.measureLabel}{report.unit ? ` (${report.unit})` : ''}</th>
            </tr>}
          </thead>
          <tbody>
            {visibleRows.map(row => <tr key={row.key}>
              {row.labels.map((value, index) => <th scope="row" key={`${row.key}-${index}`}>{value}</th>)}
              {leaves.map(leaf => {
                const value = row.cells.get(leaf.key)
                return <td key={leaf.key} className={missing(value) ? 'statistical-report-missing' : undefined}>{missing(value) ? '—' : formatReportValue(value, report.unit)}</td>
              })}
            </tr>)}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && <nav className="pagination statistical-report-pagination" aria-label="Report result pages">
        <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span>Rows {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, report.rows.length)} of {report.rows.length.toLocaleString('en-PH')}</span>
        <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
      </nav>}
      {(report.unit || report.footnotes.length > 0) && <div className="statistical-report-notes">
        {report.unit && <p><strong>Unit:</strong> {report.unit}</p>}
        {report.footnotes.length > 0 && <ul>{report.footnotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}</ul>}
      </div>}
      <p className="table-note">Zero values are reported as 0. Missing observations are shown as —.</p>
    </div>
  )
}
