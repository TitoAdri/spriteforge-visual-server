// Lightweight first-party analytics. It stores event counts server-side and
// keeps only a per-tab identifier in sessionStorage; no IP, email or user-agent
// is sent as an analytics field.
(() => {
  const clientKey = "spriteforge_analytics_session";
  const attributionKey = "spriteforge_analytics_attribution";
  const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_ad", "utm_audience", "utm_term", "utm_content", "utm_id"];
  const allowedEvents = new Set(["page_view", "pricing_viewed", "plan_selected", "checkout_started", "signup_verified", "character_prompt_submitted", "character_funnel_converted", "animation_upload_submitted", "animation_funnel_converted"]);
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

  const readStoredAttribution = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(attributionKey) || "null");
      return stored && typeof stored === "object" ? stored : null;
    } catch { return null; }
  };
  const readUrlAttribution = () => {
    const query = new URLSearchParams(window.location.search);
    const values = Object.fromEntries(utmKeys.map((key) => [key, query.get(key)?.trim().slice(0, 160) || ""]).filter(([, value]) => value));
    if (!Object.keys(values).length) return null;
    return { ...values, landingPath: window.location.pathname.slice(0, 200), capturedAt: new Date().toISOString() };
  };
  const currentAttribution = readUrlAttribution();
  const storedAttribution = readStoredAttribution();
  let attribution = storedAttribution || currentAttribution;
  if (currentAttribution) {
    attribution = { ...(storedAttribution || {}), ...currentAttribution, firstTouch: storedAttribution?.firstTouch || currentAttribution };
    try { localStorage.setItem(attributionKey, JSON.stringify(attribution)); } catch { /* Storage may be unavailable. */ }
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
    window.gtag("event", gaName, { ...params, ...Object.fromEntries(utmKeys.map((key) => [key, attribution?.[key]]).filter(([, value]) => value)), page_location: window.location.href });
  };
  const track = (eventName, params = {}) => {
    if (!allowedEvents.has(eventName)) return;
    const eventAttribution = attribution ? Object.fromEntries([...utmKeys, "landingPath", "capturedAt"].map((key) => [key, attribution[key]]).filter(([, value]) => value)) : null;
    const payload = {
      eventName,
      path: String(params.path || window.location.pathname).slice(0, 200),
      planId: params.planId || undefined,
      product: params.product || undefined,
      clientId,
      metadata: { ...(params.metadata || {}), ...(eventAttribution ? { attribution: eventAttribution } : {}) },
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
  window.spriteforgeGetAttribution = () => attribution ? { ...attribution } : null;
  window.spriteforgeTrackPageView = (path) => track("page_view", { path });
  window.spriteforgeTrackPricing = (path) => track("pricing_viewed", { path });
  const funnelDefinitions = {
    character: { idKey: "spriteforge_character_funnel_id", convertedKey: "spriteforge_character_funnel_converted_id", contextKey: "spriteforge_funnel_context", startEvent: "character_prompt_submitted", conversionEvent: "character_funnel_converted", prefix: "cf_" },
    animation: { idKey: "spriteforge_animation_funnel_id", convertedKey: "spriteforge_animation_funnel_converted_id", contextKey: "spriteforge_funnel_context", startEvent: "animation_upload_submitted", conversionEvent: "animation_funnel_converted", prefix: "af_" },
  };
  const randomFunnelId = (prefix) => `${prefix}${crypto.randomUUID?.().replaceAll("-", "") || Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.slice(0, 100);
  const trackFunnelStart = (kind, path) => {
    const funnel = funnelDefinitions[kind]; const funnelId = randomFunnelId(funnel.prefix);
    try { localStorage.setItem(funnel.idKey, funnelId); localStorage.removeItem(funnel.convertedKey); localStorage.setItem(funnel.contextKey, kind); } catch { /* Storage may be unavailable. */ }
    track(funnel.startEvent, { path, metadata: { funnelId } });
    return funnelId;
  };
  const trackFunnelConversion = (kind, method = "email") => {
    const funnel = funnelDefinitions[kind]; let funnelId = "";
    try { funnelId = String(localStorage.getItem(funnel.idKey) || ""); } catch { /* Storage may be unavailable. */ }
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(funnelId)) return;
    try { if (localStorage.getItem(funnel.convertedKey) === funnelId) return; localStorage.setItem(funnel.convertedKey, funnelId); } catch { /* Storage may be unavailable. */ }
    track(funnel.conversionEvent, { path: "/app", metadata: { funnelId, method: String(method).slice(0, 20) } });
  };
  const clearFunnel = (kind) => {
    const funnel = funnelDefinitions[kind];
    try { localStorage.removeItem(funnel.idKey); localStorage.removeItem(funnel.convertedKey); if (localStorage.getItem(funnel.contextKey) === kind) localStorage.removeItem(funnel.contextKey); } catch { /* Storage may be unavailable. */ }
  };
  window.spriteforgeTrackCharacterPrompt = (path = "/") => trackFunnelStart("character", path);
  window.spriteforgeTrackAnimationUpload = (path = "/") => trackFunnelStart("animation", path);
  window.spriteforgeTrackCharacterFunnelConversion = (method = "email") => trackFunnelConversion("character", method);
  window.spriteforgeTrackAnimationFunnelConversion = (method = "email") => trackFunnelConversion("animation", method);
  window.spriteforgeTrackPendingFunnelConversion = (method = "email") => {
    let context = "";
    try { context = String(localStorage.getItem("spriteforge_funnel_context") || ""); } catch { /* Storage may be unavailable. */ }
    if (context === "character") trackFunnelConversion("character", method);
    if (context === "animation") trackFunnelConversion("animation", method);
  };
  window.spriteforgeClearCharacterFunnel = () => clearFunnel("character");
  window.spriteforgeClearAnimationFunnel = () => clearFunnel("animation");
  window.spriteforgeSetAnalyticsConsent = (granted) => {
    try { localStorage.setItem("spriteforge_analytics_consent", granted ? "granted" : "denied"); } catch { /* Storage may be unavailable. */ }
    if (granted) initGa();
  };
})();
