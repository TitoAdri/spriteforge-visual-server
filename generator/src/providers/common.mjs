export function base64ToBuffer(value) {
  return Buffer.from(value, "base64");
}

export function assertKey(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. Set it in the process environment; never send it from the browser.`);
  return value;
}

export async function requestJson(url, options) {
  let response;
  try {
    // Keep provider calls bounded. The API layer refunds the idempotent debit
    // when this timeout is reached instead of leaving a paid request hanging.
    const requestOptions = options?.signal ? options : { ...options, signal: AbortSignal.timeout(150_000) };
    response = await fetch(url, requestOptions);
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      const timeout = new Error("Image provider timed out");
      timeout.status = 504;
      timeout.code = "provider_timeout";
      throw timeout;
    }
    throw error;
  }
  const requestId = response.headers.get("x-request-id") || response.headers.get("x-goog-request-id") || null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || `Provider request failed with HTTP ${response.status}`);
    error.status = response.status;
    error.code = body?.error?.code || body?.error?.type || null;
    error.requestId = requestId;
    error.providerBody = body;
    throw error;
  }
  return { body, requestId };
}

export function normalizeImageResult({ provider, model, imageBase64, mimeType = "image/png", requestId, interactionId = null, raw = {} }) {
  if (!imageBase64) throw new Error(`${provider} returned no image payload`);
  return { provider, model, image: base64ToBuffer(imageBase64), mimeType, requestId, interactionId, raw };
}
