import { registerAgeCheckElement } from "../dist/index.js";

registerAgeCheckElement();

const widget = document.querySelector("dlbr-age-check");
const output = document.querySelector("#result");
widget?.addEventListener("age-verified", () => {
  if (output) output.textContent = "Access granted";
});
widget?.addEventListener("age-not-verified", () => {
  if (output) output.textContent = "Access denied";
});
