import { inflateRawSync } from 'node:zlib'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const MAX_WORKBOOK_BYTES = 15 * 1024 * 1024
const decodeXml = value => String(value || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
const xmlText = xml => [...String(xml).matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(match => decodeXml(match[1])).join('')
const normalizeHeader = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')

function zipEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.length > MAX_WORKBOOK_BYTES) throw new Error('The PSA workbook is empty or exceeds the allowed size.')
  if (buffer.readUInt32LE(0) !== 0x04034b50) throw new Error('The PSA download is not an XLSX workbook.')
  let eocd = -1
  for (let i = buffer.length - 22, floor = Math.max(0, buffer.length - 65557); i >= floor; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('The PSA XLSX archive is malformed.')
  const count = buffer.readUInt16LE(eocd + 10)
  const directorySize = buffer.readUInt32LE(eocd + 12)
  const directoryStart = buffer.readUInt32LE(eocd + 16)
  if (!count || count > 2000 || directoryStart + directorySize > eocd) throw new Error('The PSA XLSX archive directory is invalid.')
  const entries = new Map()
  let offset = directoryStart
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('The PSA XLSX archive directory is malformed.')
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    if (name.includes('..') || name.startsWith('/')) throw new Error('The PSA XLSX contains an invalid archive path.')
    if (!name.endsWith('/')) entries.set(name, { method, compressedSize, localOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function readZipEntry(buffer, entry) {
  const offset = entry.localOffset
  if (buffer.readUInt32LE(offset) !== 0x04034b50) throw new Error('The PSA XLSX archive entry is malformed.')
  const nameLength = buffer.readUInt16LE(offset + 26)
  const extraLength = buffer.readUInt16LE(offset + 28)
  const start = offset + 30 + nameLength + extraLength
  const compressed = buffer.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return compressed.toString('utf8')
  if (entry.method === 8) return inflateRawSync(compressed, { maxOutputLength: MAX_WORKBOOK_BYTES }).toString('utf8')
  throw new Error('The PSA XLSX uses an unsupported compression method.')
}

function cellValue(cell, sharedStrings) {
  const type = cell.match(/\bt="([^"]+)"/)?.[1]
  if (type === 'inlineStr') return xmlText(cell)
  const value = cell.match(/<v>([\s\S]*?)<\/v>/)?.[1]
  if (value === undefined) return ''
  if (type === 's') return sharedStrings[Number(value)] ?? ''
  return decodeXml(value)
}

function worksheetRows(xml, sharedStrings) {
  const rows = []
  for (const rowMatch of String(xml).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map()
    for (const match of rowMatch[1].matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)) {
      let column = 0
      for (const char of match[1]) column = column * 26 + char.charCodeAt(0) - 64
      cells.set(column - 1, cellValue(match[2], sharedStrings))
    }
    if (cells.size) rows.push(cells)
  }
  return rows
}

function headerMap(rows) {
  const isHeader = value => value === '10digitcode' || value === '10digitpsgccode' || value === 'psgccode'
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex++) {
    const values = rows[rowIndex]
    const columns = new Map([...values].map(([index, value]) => [normalizeHeader(value), index]))
    const code = [...columns].find(([header]) => isHeader(header))?.[1]
    const name = ['name', 'areaname', 'geographicname'].map(key => columns.get(key)).find(index => index !== undefined)
    const correspondence = ['correspondencecode', '9digitcode'].map(key => columns.get(key)).find(index => index !== undefined)
    const level = ['geographiclevel', 'geolevel'].map(key => columns.get(key)).find(index => index !== undefined)
    if (code !== undefined && name !== undefined && correspondence !== undefined && level !== undefined) return { rowIndex, columns, code, name, correspondence, level }
  }
  return null
}

export function parsePsgcWorkbook(buffer, { version, municipalityPrefix }) {
  const entries = zipEntries(buffer)
  const workbook = entries.get('xl/workbook.xml')
  const types = entries.get('[Content_Types].xml')
  if (!workbook || !types) throw new Error('The download is not a complete XLSX workbook.')
  const sharedStrings = entries.has('xl/sharedStrings.xml')
    ? [...readZipEntry(buffer, entries.get('xl/sharedStrings.xml')).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(match => xmlText(match[1]))
    : []
  let selected
  for (const [name, entry] of entries) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue
    const rows = worksheetRows(readZipEntry(buffer, entry), sharedStrings)
    const header = headerMap(rows)
    if (header) { selected = { rows, header }; break }
  }
  if (!selected) throw new Error('The PSA workbook is missing the required PSGC code, name, correspondence code, and geographic level columns.')
  const { rows, header } = selected
  const field = (row, keys) => {
    for (const key of keys) {
      const index = header.columns.get(normalizeHeader(key))
      if (index !== undefined) return String(row.get(index) ?? '').trim()
    }
    return ''
  }
  const records = []
  for (const row of rows.slice(header.rowIndex + 1)) {
    const code = String(row.get(header.code) ?? '').replace(/\D/g, '').padStart(10, '0')
    if (!code.startsWith(municipalityPrefix)) continue
    const name = String(row.get(header.name) ?? '').trim()
    const correspondenceCode = String(row.get(header.correspondence) ?? '').replace(/\D/g, '').padStart(9, '0')
    const geographicLevel = String(row.get(header.level) ?? '').trim()
    if (!/^\d{10}$/.test(code) || !name || !/^\d{9}$/.test(correspondenceCode) || !/^Bgy$/i.test(geographicLevel)) continue
    const urbanRural = field(row, ['Urban/Rural', 'Urban Rural'])
    const oldName = field(row, ['Old Name'])
    const population = field(row, ['Population (2024 POPCEN)', 'Population 2024', 'Population'])
    const populationValue = Number(population.replace(/,/g, ''))
    records.push({
      psgcCode: code,
      correspondenceCode,
      areaName: name.slice(0, 160),
      geographicLevel: geographicLevel.slice(0, 20),
      urbanRural: urbanRural.slice(0, 30),
      oldName: oldName.slice(0, 160),
      version,
      populationData: Number.isSafeInteger(populationValue) && populationValue >= 0 ? [{ year: 2024, population: populationValue }] : [],
      rawPayload: Object.fromEntries([...row].map(([index, value]) => [String(index), value])),
    })
  }
  if (records.length !== 24 || new Set(records.map(record => record.psgcCode)).size !== 24) throw new Error(`The PSA workbook contained ${records.length} valid Getafe barangays; expected 24.`)
  return records
}

export function validatePsgcWorkbookResponse({ bytes, contentType, finalUrl, version }) {
  if (version !== 'Q3_2026') throw new Error(`No official PSA workbook is configured for ${version}.`)
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase()
  if (![XLSX_MIME, 'application/octet-stream', 'application/zip'].includes(mime)) throw new Error(`PSA returned an unexpected content type (${mime || 'missing'}).`)
  if (!Buffer.isBuffer(bytes) || bytes.length < 1000 || bytes.length > MAX_WORKBOOK_BYTES) throw new Error('The PSA workbook is empty or exceeds the allowed size.')
  const url = new URL(finalUrl)
  if (!['psa.gov.ph'].includes(url.hostname.toLowerCase()) || url.pathname !== '/system/files/scd/PSGC-3Q-2026-Publication-Datafile.xlsx') throw new Error('The PSGC download did not finish at the official Q3_2026 PSA workbook.')
  if (bytes.readUInt32LE(0) !== 0x04034b50) throw new Error('The PSA response is not an XLSX workbook (it may be an HTML error page).')
  return parsePsgcWorkbook(bytes, { version, municipalityPrefix: '0701226' })
}

export { XLSX_MIME }
