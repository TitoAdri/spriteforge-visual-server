// Lightweight first-party analytics. It stores event counts server-side and
// keeps only a per-tab identifier in sessionStorage; no IP, email or user-agent
// is sent as an analytics field.
(() => {
  const clientKey = "spriteforge_analytics_session";
  const allowedEvents = new Set(["page_view", "pricing_viewed", "plan_selected", "checkout_started"]);
  const gaEventNames = { plan_selected: "select_item", checkout_started: "begin_checkout" };
  let clientId = "";
  try {
    clientId = sessionStorage.getItem(clientKey) || "";
    if (!clientId) {
      clientId = `sf_${crypto.randomUUID?.().replaceAll("-", "") || Math.random().toString(36).slice(2)} `.trim();
      sessionStorage.setItem(clientKey, clientId);
    }
  } catch {
    clientId = `sf_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }

  const gaMeasurementId = document.querySelector('meta[name="ga-measurement-id"]')?.content.trim() || "";
  let gaReady = false;
  const gaConsentGranted = () => {
    try { return localStorage.getItem("spriteforge_analytics_consent") === "granted"; } catch { return false; }
  };
  const initGa = () => {
    if (gaReady || !gaMeasurementId || !gaConsentGranted()) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", gaMeasurementId, { send_page_view: false, anonymize_ip: true });
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`;
    document.head.appendChild(script);
    gaReady = true;
  };
  const trackInGa = (eventName, params) => {
    initGa();
    if (!gaReady || typeof window.gtag !== "function") return;
    const gaName = gaEventNames[eventName] || eventName;
    window.gtag("event", gaName, { ...params, page_location: window.location.href });
  };
  const track = (eventName, params = {}) => {
    if (!allowedEvents.has(eventName)) return;
    const payload = {
      eventName,
      path: String(params.path || window.location.pathname).slice(0, 200),
      planId: params.planId || undefined,
      product: params.product || undefined,
      clientId,
      metadata: params.metadata || {},
    };
    trackInGa(eventName, { page_path: payload.path, plan_id: payload.planId, product: payload.product });
    const body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/analytics/events", new Blob([body], { type: "application/json" }));
        return;
      }
    } catch { /* Fall through to keepalive fetch. */ }
    fetch("/api/analytics/events", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  };

  window.spriteforgeTrack = track;
  window.spriteforgeTrackPageView = (path) => track("page_view", { path });
  window.spriteforgeTrackPricing = (path) => track("pricing_viewed", { path });
  window.spriteforgeSetAnalyticsConsent = (granted) => {
    try { localStorage.setItem("spriteforge_analytics_consent", granted ? "granted" : "denied"); } catch { /* Storage may be unavailable. */ }
    if (granted) initGa();
  };
})();
