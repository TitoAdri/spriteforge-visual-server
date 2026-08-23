const creditPattern = /(?:insufficient[_ -]?credits?|not enough credits?|need\s+\d+\s+credits?|cr[eé]ditos? insuficientes?)/i;

export const isInsufficientCreditsError = (error) => {
  const status = Number(error?.status || error?.statusCode || 0);
  return error?.code === "insufficient_credits" || status === 402 || creditPattern.test(String(error?.message || error || ""));
};

const neededCredits = (error) => String(error?.message || "").match(/need\s+(\d+)\s+credits?/i)?.[1] || "";

export const clearCreditUpgrade = (button) => {
  button?.closest("form, .pack-card, .tileset-card")?.querySelector(".credit-upgrade-alert")?.remove();
};

export const showCreditUpgrade = (button, error) => {
  if (!isInsufficientCreditsError(error)) return false;
  const container = button?.closest("form, .pack-card, .tileset-card") || button?.parentElement;
  if (!container) return false;
  const amount = neededCredits(error);
  const alert = document.createElement("aside");
  alert.className = "credit-upgrade-alert";
  alert.id = "credit-upgrade-alert";
  alert.setAttribute("role", "alert");
  alert.innerHTML = `<div class="credit-upgrade-alert-copy"><strong>No tienes créditos suficientes</strong><span>${amount ? `Necesitas ${amount} créditos para realizar esta acción.` : "Necesitas más créditos para realizar esta acción."} Sube de plan para seguir creando.</span></div><a href="/pricing" class="credit-upgrade-alert-cta">Subir de plan →</a>`;
  container.querySelector(".credit-upgrade-alert")?.remove();
  button.parentElement?.insertBefore(alert, button);
  button.setAttribute("aria-describedby", "credit-upgrade-alert");
  return true;
};
