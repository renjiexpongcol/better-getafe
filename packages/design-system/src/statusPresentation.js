const residentLabels = {
  DRAFT: 'Draft', SUBMITTED: 'Submitted', RECEIVED: 'Received', VERIFIED: 'Verified',
  IN_REVIEW: 'Processing', UNDER_REVIEW: 'Processing', REVIEW: 'Processing', PROCESSING: 'Processing',
  FOR_ASSESSMENT: 'Processing', FOR_APPROVAL: 'Processing', APPROVED: 'Approved',
  NEEDS_INFORMATION: 'Action required', ACTION_REQUIRED: 'Action required', ADDITIONAL_INFORMATION_REQUIRED: 'Action required',
  ADDITIONAL_DOCUMENTS_REQUIRED: 'Action required', REQUIRES_ACTION: 'Action required',
  AWAITING_PAYMENT: 'Payment required', PAID: 'Payment received', UNPAID: 'Unpaid',
  FOR_RELEASE: 'Ready for release', READY_FOR_RELEASE: 'Ready for release', RELEASED: 'Released', COMPLETED: 'Completed',
  REJECTED: 'Rejected', CANCELLED: 'Cancelled', REQUESTED: 'Awaiting confirmation',
  SCHEDULED: 'Scheduled', CONFIRMED: 'Confirmed', PENDING: 'Pending', ON_HOLD: 'On hold',
  PENDING_VERIFICATION: 'Pending verification', VERIFIED_PAYMENT: 'Verified payment', FAILED: 'Failed', OVERDUE: 'Overdue',
}

export function statusPresentation(value, audience = 'resident') {
  const key = String(value || '').trim().toUpperCase().replace(/[ -]+/g, '_')
  const fallback = key ? key.toLowerCase().replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase()) : 'Status unavailable'
  const tone = ['REJECTED', 'FAILED', 'OVERDUE'].includes(key) ? 'danger'
    : ['APPROVED', 'COMPLETED', 'PAID', 'RELEASED', 'FOR_RELEASE', 'READY_FOR_RELEASE', 'VERIFIED_PAYMENT'].includes(key) ? 'success'
      : ['NEEDS_INFORMATION', 'ACTION_REQUIRED', 'ADDITIONAL_INFORMATION_REQUIRED', 'ADDITIONAL_DOCUMENTS_REQUIRED', 'REQUIRES_ACTION', 'AWAITING_PAYMENT', 'UNPAID', 'PENDING', 'REQUESTED', 'PENDING_VERIFICATION', 'ON_HOLD'].includes(key) ? 'warning'
        : ['DRAFT', 'CANCELLED'].includes(key) ? 'neutral' : 'info'
  return { label: audience === 'staff' ? fallback : residentLabels[key] || fallback, tone }
}
