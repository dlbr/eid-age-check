import { registerAgeCheckElement } from "../../../src/index.ts";

registerAgeCheckElement();

const widget = document.querySelector("dlbr-age-check");
widget?.addEventListener("age-verified", () => {
  document.querySelector("#restricted-content").hidden = false;
  document.querySelector("#demo-help").hidden = true;
});

widget?.addEventListener("age-verification-error", (event) => {
  const help = document.querySelector("#demo-help");
  if (!help) return;
  help.hidden = true;

  const detail = event.detail;
  const messages = {
    ISSUER_NOT_ALLOWED: "The Test Gateway has not enabled the Proof of Age issuer for this demo yet. This is a demo setup issue; please try again later.",
    INTENDED_USE_NOT_ACTIVE: "The Test Gateway has not activated the Proof of Age policy for this demo yet. Please try again later.",
  };
  const message = messages[detail?.code];
  if (!message) return;

  help.textContent = message;
  if (detail.request_id) help.textContent += ` Support reference: ${detail.request_id}.`;
  help.hidden = false;
});
