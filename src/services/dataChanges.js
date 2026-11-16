const listeners = new Set()
let channel
try {
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('getafe-data-changes-v1')
    channel.onmessage = () => emit()
  }
} catch { /* Local invalidation remains available. */ }
function emit() { for (const listener of listeners) listener() }
export function onDataChanged(listener) { listeners.add(listener); return () => listeners.delete(listener) }
export function publishDataChanged() { emit(); channel?.postMessage({ changed: true }) }
