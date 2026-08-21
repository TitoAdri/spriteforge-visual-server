// One public credit schedule.  Stripe price IDs are intentionally injected only
// by environment variables, never committed into the application bundle.
export const CREDIT_COSTS = Object.freeze({
  character: 3,
  asset: 3,
  assetPackItem: 6,
  tilesetTile: 3,
  edit: 6,
  animation: 25,
});

export const BILLING_PLANS = Object.freeze([
  { id: "starter", name: "Starter", monthlyUsd: 9, credits: 700, stripePriceEnv: "STRIPE_PRICE_STARTER" },
  { id: "creator", name: "Creator", monthlyUsd: 19, credits: 1600, stripePriceEnv: "STRIPE_PRICE_CREATOR", featured: true },
  { id: "studio", name: "Studio", monthlyUsd: 39, credits: 3800, stripePriceEnv: "STRIPE_PRICE_STUDIO" },
]);

export const billingPlanForId = (id) => BILLING_PLANS.find((plan) => plan.id === id) || null;
export const billingPlanForPriceId = (priceId) => BILLING_PLANS.find((plan) => process.env[plan.stripePriceEnv] === priceId) || null;

export function creditCostForGeneration({ action, body = {} }) {
  if (action === "edit") return CREDIT_COSTS.edit;
  if (body.tileset) return CREDIT_COSTS.tilesetTile;
  if (body.assetPack) return CREDIT_COSTS.assetPackItem;
  const type = String(body.recipe?.assetType || "");
  return ["character", "enemy", "npc"].includes(type) ? CREDIT_COSTS.character : CREDIT_COSTS.asset;
}

export function publicBillingCatalog() {
  return {
    currency: "USD",
    credits: CREDIT_COSTS,
    plans: BILLING_PLANS.map(({ stripePriceEnv, ...plan }) => ({ ...plan, checkoutReady: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env[stripePriceEnv]) })),
  };
}
