import { useLayoutEffect, useMemo, useRef, useState } from 'react'

export default function ResidentBarangayField({ value, onChange, resource }) {
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState(null)
  const inputRef = useRef(null)
  const options = useMemo(() => resource.items.filter(item => item.name.toLowerCase().includes(value.trim().toLowerCase())), [resource.items, value])
  useLayoutEffect(() => {
    if (!open || options.length === 0 || !inputRef.current) {
      setMenuPosition(null)
      return
    }

    const updateMenuPosition = () => {
      const input = inputRef.current
      if (!input) return
      const rect = input.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const gap = 6
      const edge = 8
      const footer = input.closest('.account-setup-modal')?.querySelector('.setup-actions')
      const footerTop = footer?.getBoundingClientRect().top
      const lowerEdge = Math.min(viewportHeight - edge, Number.isFinite(footerTop) && footerTop > rect.bottom ? footerTop - edge : viewportHeight - edge)
      const roomBelow = Math.max(0, lowerEdge - rect.bottom - gap)
      const roomAbove = Math.max(0, rect.top - edge - gap)
      const desiredHeight = Math.min(260, options.length * 36 + 12)
      const opensAbove = roomBelow < desiredHeight && roomAbove > roomBelow
      const maxHeight = Math.max(0, Math.min(desiredHeight, opensAbove ? roomAbove : roomBelow))

      if (rect.bottom < 0 || rect.top > viewportHeight) {
        setOpen(false)
        setMenuPosition(null)
        return
      }

      setMenuPosition({
        left: rect.left,
        width: rect.width,
        maxHeight,
        top: opensAbove ? undefined : rect.bottom + gap,
        bottom: opensAbove ? viewportHeight - rect.top + gap : undefined,
      })
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    window.visualViewport?.addEventListener('resize', updateMenuPosition)
    window.visualViewport?.addEventListener('scroll', updateMenuPosition)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
      window.visualViewport?.removeEventListener('resize', updateMenuPosition)
      window.visualViewport?.removeEventListener('scroll', updateMenuPosition)
    }
  }, [open, options.length])

  const selectOption = name => {
    onChange({ target: { value: name } })
    setOpen(false)
  }

  return <label className="resident-barangay-field">Barangay
    <div className="resident-barangay-combobox">
      <input ref={inputRef} aria-label="Barangay" role="combobox" aria-expanded={open && options.length > 0} aria-controls="resident-barangay-options" aria-autocomplete="list" value={value} onFocus={() => setOpen(true)} onChange={event => { onChange(event); setOpen(true) }} onBlur={() => setTimeout(() => setOpen(false), 120)} required maxLength={160} placeholder="Enter your barangay..." autoComplete="address-level3" />
      {open && options.length > 0 && menuPosition && <ul id="resident-barangay-options" className="resident-barangay-options" style={{ left: menuPosition.left, width: menuPosition.width, maxHeight: menuPosition.maxHeight, ...(menuPosition.top === undefined ? { bottom: menuPosition.bottom } : { top: menuPosition.top }) }} role="listbox" aria-label="Barangay suggestions">
        {options.map(item => <li key={item.id || item.name} role="option" aria-selected={item.name === value} onMouseDown={() => selectOption(item.name)}>{item.name}</li>)}
      </ul>}
    </div>
    <small>Enter your barangay name{resource.items.length ? ' or choose a suggestion' : ''}.</small>
  </label>
}
