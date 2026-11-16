// Input modality is established before React mounts so autofocus cannot flash
// a keyboard ring during initialization. Native :focus-visible remains the
// control-level eligibility check; this does not move or suppress focus.
export function installFocusModality(document) {
  document.documentElement.dataset.focusModality = 'pointer'
  const pointer = () => { document.documentElement.dataset.focusModality = 'pointer' }
  const keyboard = event => {
    if (['Shift','Control','Alt','Meta'].includes(event.key)) return
    // Editing a field reached by click/tap does not change how focus arrived.
    // Tab still opts into keyboard navigation, including when leaving a field.
    const editing = event.target?.matches?.('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="image"]):not([type="color"]),textarea,select,[role="textbox"],[role="searchbox"]') || event.target?.isContentEditable
    if (event.key === 'Tab' || !editing) document.documentElement.dataset.focusModality = 'keyboard'
  }
  document.addEventListener('pointerdown',pointer,true)
  document.addEventListener('keydown',keyboard,true)
  return () => {document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('keydown',keyboard,true)}
}
export function focusContentTarget(element) {
  if (!element) return
  element.dataset.focusTarget = 'content'
  element.setAttribute('tabindex','-1')
  element.focus({preventScroll:true})
}

