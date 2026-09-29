import { registerAgeCheckElement } from "../../../src/index.ts";

registerAgeCheckElement();

document.querySelector("dlbr-age-check")?.addEventListener("age-verified", () => {
  document.querySelector("#restricted-content").hidden = false;
});
