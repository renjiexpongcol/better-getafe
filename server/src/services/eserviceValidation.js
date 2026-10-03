import crypto from "node:crypto";
import { REQUEST_STATUSES } from "../../../src/data/eserviceWorkflow.js";

export const STATUSES = REQUEST_STATUSES;
export const fail = (message, status = 422) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};
export const uuid = (value) => {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      String(value),
    )
  )
    fail("Choose a valid record.", 400);
  return value;
};
export const text = (value, max = 4000) => {
  if (typeof value !== "string" || value.length > max)
    fail("Enter valid text.");
  return value.trim();
};
export function cents(value) {
  if (!/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/.test(String(value)))
    fail("Enter an amount with at most two decimal places.");
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export const decimal = (value) =>
  `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
export const totalFees = fees => {
  const total=fees.reduce((sum,fee)=>sum+(fee.fee_type==='CREDIT'?-1n:1n)*cents(fee.amount),0n);
  if(total<=0n) fail('The assessment total after credits must be positive.');
  return decimal(total);
};
export function visible(field, values) {
  return (
    !field.visibility ||
    values[field.visibility.field] === field.visibility.equals
  );
}
export function validateValues(fields, values, final = false) {
  if (!values || typeof values !== "object" || Array.isArray(values))
    fail("Enter application information.");
  if (
    Object.keys(values).some(
      (key) => !fields.some((field) => field.key === key),
    )
  )
    fail("Unknown application field.");
  const result = [];
  for (const field of fields) {
    if (!visible(field, values) || field.type === "file") continue;
    const value = values[field.key],
      missing =
        value === undefined ||
        value === null ||
        value === "" ||
        (field.type === "checkbox" && value === false);
    if (missing) {
      if (final && field.required) fail(`${field.label} is required.`);
      continue;
    }
    if (field.type === "checkbox") {
      if (typeof value !== "boolean")
        fail(`${field.label} must be checked or unchecked.`);
    } else if (field.type === "address") {
      if (
        typeof value !== "object" ||
        Array.isArray(value) ||
        JSON.stringify(value).length > 2000 ||
        Object.values(value).some(part => typeof part !== 'string') ||
        (final && field.required && !Object.values(value).some(part => part.trim()))
      )
        fail(`Enter a valid ${field.label}.`);
    } else {
      if (
        !["string", "number"].includes(typeof value) ||
        String(value).length >
          Math.min(Number(field.validation?.maxLength || 4000), 4000)
      )
        fail(`${field.label} is too long.`);
      if (
        field.type === "email" &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))
      )
        fail(`Enter a valid ${field.label}.`);
      if (
        field.type === "telephone" &&
        !/^\+?[\d ()-]{7,24}$/.test(String(value))
      )
        fail(`Enter a valid ${field.label}.`);
      if (
        field.type === "date" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ||
          !Number.isFinite(Date.parse(value)) ||
          new Date(value).toISOString().slice(0, 10) !== value)
      )
        fail(`Enter a valid ${field.label}.`);
      if (field.type === "currency") cents(value);
      if (["number", "currency"].includes(field.type)) {
        if (!Number.isFinite(Number(value)))
          fail(`Enter a valid ${field.label}.`);
        if (
          field.validation?.min !== undefined &&
          Number(value) < Number(field.validation.min)
        )
          fail(`${field.label} is below the minimum.`);
        if (
          field.validation?.max !== undefined &&
          Number(value) > Number(field.validation.max)
        )
          fail(`${field.label} is above the maximum.`);
      }
      if (
        ["select", "radio"].includes(field.type) &&
        !field.options.includes(value)
      )
        fail(`Choose a valid ${field.label}.`);
    }
    result.push({ field_id: field.id, value });
  }
  return result;
}
export function validateWorkflow(steps, paymentRequired) {
  if (
    !Array.isArray(steps) ||
    steps.length < 3 ||
    steps.length > STATUSES.length
  )
    fail("Configure the service workflow.");
  const names = steps.map((step) => step.status);
  if (
    new Set(names).size !== names.length ||
    !["DRAFT", "SUBMITTED", "COMPLETED"].every((status) =>
      names.includes(status),
    )
  )
    fail("Workflow requires unique Draft, Submitted and Completed steps.");
  for (const step of steps) {
    if (
      !STATUSES.includes(step.status) ||
      !Array.isArray(step.next_statuses) ||
      step.next_statuses.some((status) => !names.includes(status))
    )
      fail("Workflow contains an invalid transition.");
    text(step.label, 160);
    text(step.permission, 100);
    if (!step.permission) fail("Set a permission for every workflow step.");
    if (
      ["COMPLETED", "REJECTED", "CANCELLED"].includes(step.status) &&
      step.next_statuses.length
    )
      fail("Final workflow steps cannot reopen a request.");
    if (step.status === "DRAFT" && !step.next_statuses.includes("SUBMITTED"))
      fail("Drafts must support submission.");
    if (step.status !== "DRAFT" && step.next_statuses.includes("DRAFT"))
      fail("Submitted requests cannot become drafts.");
  }
  const reached = new Set(["DRAFT"]);
  const corrections = steps.find(step => step.status === 'NEEDS_INFORMATION');
  if (steps.some(step => step.next_statuses.includes('NEEDS_INFORMATION') && !corrections?.next_statuses.includes(step.status))) fail('Allow corrections to return to every step that may request information.');
  for (let i = 0; i < steps.length; i++)
    for (const step of steps)
      if (reached.has(step.status))
        step.next_statuses.forEach((status) => reached.add(status));
  if (names.some((name) => !reached.has(name)))
    fail("Every workflow step must be reachable.");
  if (
    paymentRequired &&
    !["FOR_ASSESSMENT", "AWAITING_PAYMENT", "PAID"].every((status) =>
      names.includes(status),
    )
  )
    fail("Payment services require assessment and payment steps.");
}
export function inspectDocument(bytes, mime) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 10485760)
    fail("Choose a document of 10 MB or less.");
  const signatures = {
    "application/pdf": bytes.subarray(0, 5).toString() === "%PDF-",
    "image/png": bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/jpeg": bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
  };
  if (!signatures[mime]) fail("Choose a valid PDF, PNG or JPEG document.");
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
