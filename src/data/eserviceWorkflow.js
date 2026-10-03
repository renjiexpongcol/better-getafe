// Shared contract used by CMS, resident/staff views and server validation.
export const REQUEST_STATUSES = Object.freeze([
  "DRAFT",
  "SUBMITTED",
  "RECEIVED",
  "IN_REVIEW",
  "NEEDS_INFORMATION",
  "FOR_ASSESSMENT",
  "AWAITING_PAYMENT",
  "PAID",
  "FOR_APPROVAL",
  "APPROVED",
  "FOR_RELEASE",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
]);
export const WORKFLOW_PERMISSIONS = Object.freeze([
  "requests.own.update",
  "requests.department.process",
  "requests.department.approve",
  "payments.verify",
  "assessments.create",
]);

// Shared starting workflow. CMS revisions can narrow or change allowed transitions.
export const APPLICATION_STEPS = [
  ['DRAFT', 'Draft', 'requests.own.update', ['SUBMITTED', 'CANCELLED']],
  ['SUBMITTED', 'Submitted', 'requests.department.process', ['RECEIVED', 'IN_REVIEW', 'NEEDS_INFORMATION', 'REJECTED']],
  ['RECEIVED', 'Validation and department assignment', 'requests.department.process', ['IN_REVIEW', 'NEEDS_INFORMATION', 'REJECTED']],
  ['IN_REVIEW', 'Staff processing', 'requests.department.process', ['FOR_ASSESSMENT', 'FOR_APPROVAL', 'NEEDS_INFORMATION', 'REJECTED']],
  ['NEEDS_INFORMATION', 'Applicant corrections', 'requests.department.process', ['SUBMITTED', 'RECEIVED', 'IN_REVIEW', 'FOR_ASSESSMENT', 'FOR_APPROVAL', 'CANCELLED']],
  ['FOR_ASSESSMENT', 'Assessment', 'assessments.create', ['AWAITING_PAYMENT', 'FOR_APPROVAL', 'NEEDS_INFORMATION']],
  ['AWAITING_PAYMENT', 'Payment', 'payments.verify', ['PAID', 'CANCELLED']],
  ['PAID', 'Payment verified', 'payments.verify', ['FOR_APPROVAL', 'AWAITING_PAYMENT']],
  ['FOR_APPROVAL', 'Approval or action', 'requests.department.process', ['APPROVED', 'NEEDS_INFORMATION', 'REJECTED']],
  ['APPROVED', 'Document or result preparation', 'requests.department.approve', ['FOR_RELEASE']],
  ['FOR_RELEASE', 'Ready for release', 'requests.department.process', ['COMPLETED']],
  ['COMPLETED', 'Completed', 'requests.department.process', []],
  ['REJECTED', 'Unable to process', 'requests.department.process', []],
  ['CANCELLED', 'Cancelled', 'requests.department.process', []],
].map(([status, label, permission, next_statuses]) => ({ status, label, permission, next_statuses }));
