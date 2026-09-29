import { registerAgeCheckElement } from "@dlbr/eid-age-check";

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  registerAgeCheckElement("dlbr-age-check", undefined, config.public.dlbrAgeCheck.endpoint);
});
