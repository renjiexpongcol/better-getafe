import crypto from "node:crypto";
import { fail } from "./eserviceValidation.js";

export class ManualPaymentProvider {
  id = "MANUAL";
  online = false;
  async checkout() {
    fail("Online payment is currently unavailable.", 409);
  }
}

// Real adapters must verify the exact received bytes and map provider events to
// a payment order, amount and unique transaction reference. Browser redirects
// never enter this interface. No online adapter is enabled by default.
export class PaymentProviderRegistry {
  constructor(providers = []) {
    this.providers = new Map([
      ["MANUAL", new ManualPaymentProvider()],
      ...providers.map((p) => [p.id, p]),
    ]);
  }
  getOnline(id) {
    const provider = this.providers.get(id);
    if (!provider?.online || typeof provider.verifyWebhook !== "function")
      fail("Online payment is currently unavailable.", 503);
    return provider;
  }
  async verify(id, rawBody, headers) {
    const provider = this.getOnline(id);
    const event = await provider.verifyWebhook(rawBody, headers);
    if (
      !event ||
      event.status !== "CONFIRMED" ||
      event.currency !== "PHP" ||
      !event.orderId ||
      !event.reference ||
      !provider.verifierUserId
    )
      fail("Unverified payment event.", 403);
    return { ...event, verifierUserId: provider.verifierUserId, provider: id };
  }
}

// Utility for adapters whose authorized provider specifies timestamped HMAC.
// Other providers must implement their own documented verification protocol.
export function verifyTimestampedHmac(
  rawBody,
  { signature, timestamp, secret, now = Date.now(), tolerance = 300000 },
) {
  if (
    !Buffer.isBuffer(rawBody) ||
    !secret ||
    !/^\d{10}$/.test(String(timestamp)) ||
    Math.abs(now - Number(timestamp) * 1000) > tolerance ||
    !/^[a-f0-9]{64}$/i.test(String(signature))
  )
    return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(String(timestamp))
    .update(".")
    .update(rawBody)
    .digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
