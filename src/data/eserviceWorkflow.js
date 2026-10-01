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
