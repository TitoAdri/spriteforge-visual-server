import crypto from "node:crypto";
import { AuthError } from "./auth.mjs";

const STRIPE_API = "https://api.stripe.com/v1";
const endpoint = () => {
  const value = String(process.env.SPRITEFORGE_PUBLIC_URL || "").replace(/\/$/, "");
  if (!/^https:\/\/[^/]+$/i.test(value)) throw new AuthError(503, "billing_not_configured", "Billing is not configured yet");
  return value;
};
const secret = () => {
  const value = String(process.env.STRIPE_SECRET_KEY || "");
  if (!/^sk_(test|live)_/.test(value)) throw new AuthError(503, "billing_not_configured", "Billing is not configured yet");
  return value;
};

async function stripeForm(path, params, idempotencyKey) {
  let response;
  try {
    response = await fetch(`${STRIPE_API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret()}`,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    console.warn({ event: "stripe_api_timeout", path, code: error?.name || "network_error" });
    throw new AuthError(504, "stripe_unavailable", "Stripe took too long to respond. Please try again.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error({ event: "stripe_api_error", status: response.status, type: result?.error?.type, code: result?.error?.code });
    throw new AuthError(502, "stripe_unavailable", "Stripe could not start checkout. Please try again.");
  }
  return result;
}

export async function createCheckout({ user, plan, attribution = null }) {
  const priceId = process.env[plan.stripePriceEnv];
  if (!priceId) throw new AuthError(503, "billing_not_configured", "This plan is not configured yet");
  const baseUrl = endpoint();
  const attributionMetadata = Object.fromEntries(Object.entries(attribution || {}).flatMap(([key, value]) => [[`metadata[${key}]`, value], [`subscription_data[metadata][${key}]`, value]]));
  return stripeForm("/checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    client_reference_id: user.id,
    customer_email: user.email,
    success_url: `${baseUrl}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
    "metadata[user_id]": user.id,
    "metadata[plan_id]": plan.id,
    "subscription_data[metadata][user_id]": user.id,
    "subscription_data[metadata][plan_id]": plan.id,
    ...attributionMetadata,
  });
}

export async function createBillingPortal({ customerId }) {
  if (!customerId) throw new AuthError(409, "billing_customer_missing", "Start a subscription before opening the billing portal");
  return stripeForm("/billing_portal/sessions", { customer: customerId, return_url: `${endpoint()}/app` });
}

export function verifyWebhookSignature(rawBody, signatureHeader) {
  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "");
  if (!webhookSecret.startsWith("whsec_")) throw new AuthError(503, "billing_not_configured", "Stripe webhook signing is not configured yet");
  const parts = String(signatureHeader || "").split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  const time = Number(timestamp);
  if (!Number.isInteger(time) || Math.abs(Date.now() / 1000 - time) > 300 || !signatures.length) throw new AuthError(400, "invalid_webhook_signature", "Invalid Stripe signature");
  const expected = crypto.createHmac("sha256", webhookSecret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
  const valid = signatures.some((candidate) => {
    const actual = Buffer.from(candidate, "hex"); const expectedBytes = Buffer.from(expected, "hex");
    return actual.length === expectedBytes.length && crypto.timingSafeEqual(actual, expectedBytes);
  });
  if (!valid) throw new AuthError(400, "invalid_webhook_signature", "Invalid Stripe signature");
  try { return JSON.parse(rawBody.toString("utf8")); } catch { throw new AuthError(400, "invalid_webhook_payload", "Invalid Stripe webhook payload"); }
}
