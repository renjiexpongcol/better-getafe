import { useEffect, useState } from 'react'

// PSA OpenSTAT PX-Web API — Palay & Corn: Volume of Production (metric tons)
// by Ecosystem/Croptype, Quarter, Semester, Region and Province, 1987–2026.
const API_PATH = '/psa/PXWeb/api/v1/en/DB/2E/CS/0012E4EVCP0.px'
// Direct URL used when the same-origin proxy isn't available (e.g. static hosting).
const DIRECT_URL = 'https://openstat.psa.gov.ph:443/PXWeb/api/v1/en/DB/2E/CS/0012E4EVCP0.px'

// Codes (from the dataset metadata):
//  - Ecosystem/Croptype: "2" = Palay, "5" = Corn
//  - Geolocation: "60" = Bohol
//  - Period: "6" = Annual
//  - Year: "37" = 2024, "38" = 2025, "39" = 2026
const CROP = { code: 'Ecosystem/Croptype', values: ['2', '5'], labels: ['Palay', 'Corn'] }
const LOCATION = { code: 'Geolocation', values: ['60'], labels: ['Bohol'] }
const PERIOD = { code: 'Period', values: ['6'], labels: ['Annual'] }
const YEARS = { codes: ['37', '38'], labels: ['2024', '2025'] }

// NOTE: The API does not allow `application/json` in CORS preflight, but it
// accepts a plain JSON body with a CORS-safelisted `text/plain` content type,
// which lets the browser call it directly without a proxy.
const buildQuery = () =>
  JSON.stringify({
    query: [
      { code: CROP.code, selection: { filter: 'item', values: CROP.values } },
      { code: LOCATION.code, selection: { filter: 'item', values: LOCATION.values } },
      { code: 'Year', selection: { filter: 'item', values: YEARS.codes } },
      { code: PERIOD.code, selection: { filter: 'item', values: PERIOD.values } },
    ],
    response: { format: 'json-stat' },
  })

// Convert a flat value index into per-dimension coordinates using the sizes.
function coordsFromIndex(index, size) {
  const coords = []
  for (let i = size.length - 1; i >= 0; i -= 1) {
    coords.unshift(index % size[i])
    index = Math.floor(index / size[i])
  }
  return coords
}

// Map a json-stat dataset's dimensions to arrays of labels (in coordinate order).
function dimensionLabels(dataset) {
  return dataset.dimension.id.map((id) => {
    const dim = dataset.dimension[id]
    return Object.entries(dim.category.index)
      .sort((a, b) => a[1] - b[1])
      .map(([code]) => dim.category.label[code])
  })
}

/**
 * Fetch annual Palay & Corn production (metric tons) for Bohol from PSA OpenSTAT.
 * Returns { data, loading, error } where data is an array of
 * { crop, year, value } records.
 */
export default function useOpenStats() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const body = buildQuery()
        const postJson = (url) =>
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body,
            signal: controller.signal,
          }).then(async (res) => {
            if (!res.ok) throw new Error(`Request failed (${res.status})`)
            return res.json()
          })

        // Prefer the same-origin proxy (dev), fall back to the direct API.
        let json
        try {
          json = await postJson(API_PATH)
        } catch {
          json = await postJson(DIRECT_URL)
        }

        if (!json.dataset) throw new Error('Unexpected API response')
        if (cancelled) return

        const labels = dimensionLabels(json.dataset)
        const cropLabels = labels[0] // Ecosystem/Croptype
        const yearLabels = labels[2] // Year
        const size = json.dataset.dimension.size
        const rows = json.dataset.value.map((value, i) => {
          const coords = coordsFromIndex(i, size)
          return {
            crop: cropLabels[coords[0]],
            year: yearLabels[coords[2]],
            value,
          }
        })
        setData({ rows, source: json.dataset.source, updated: json.dataset.updated })
      } catch (e) {
        if (!cancelled && e.name !== 'AbortError') setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  return { data, loading, error }
}
