import { publicStatus } from './serviceApplication.js';
export const BILLING_STEPS = [
  ["DRAFT", "Draft", "requests.own.update", ["SUBMITTED", "CANCELLED"]],
  [
    "SUBMITTED",
    "Submitted",
    "requests.department.process",
    ["IN_REVIEW", "FOR_ASSESSMENT", "AWAITING_PAYMENT", "CANCELLED"],
  ],
  [
    "IN_REVIEW",
    "Under review",
    "requests.department.process",
    ["FOR_ASSESSMENT", "NEEDS_INFORMATION", "REJECTED", "CANCELLED"],
  ],
  [
    "NEEDS_INFORMATION",
    "Action required",
    "requests.department.process",
    ["IN_REVIEW", "FOR_ASSESSMENT", "CANCELLED"],
  ],
  [
    "FOR_ASSESSMENT",
    "For assessment",
    "assessments.create",
    ["AWAITING_PAYMENT", "NEEDS_INFORMATION", "REJECTED", "CANCELLED"],
  ],
  [
    "AWAITING_PAYMENT",
    "Ready for payment",
    "assessments.create",
    ["PAID", "CANCELLED"],
  ],
  ["PAID", "Paid", "payments.verify", ["COMPLETED", "AWAITING_PAYMENT"]],
  ["COMPLETED", "Completed", "requests.department.process", []],
  ["REJECTED", "Rejected", "requests.department.process", []],
  ["CANCELLED", "Cancelled", "requests.department.process", []],
].map(([status, label, permission, next_statuses]) => ({
  status,
  label,
  permission,
  next_statuses,
}));
export const WORKFLOW_TYPES = [
  "INFORMATION",
  "APPLICATION",
  "APPOINTMENT",
  "ASSESSMENT",
  "PAYMENT",
  "ASSESSMENT_PAYMENT",
];
export const PAYMENT_METHODS = {
  TREASURY: "Municipal Treasurer",
  BANK: "Bank payment",
  EWALLET: "E-wallet",
  OVER_COUNTER: "Over-the-counter payment",
};
export function billingStatus(request) {
  if (request.status === "AWAITING_PAYMENT" && request.payment_pending)
    return "Pending payment verification";
  return request.public_status || publicStatus(request.status);
}
