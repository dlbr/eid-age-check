'use client';

import { createElement, useEffect } from "react";
import { registerAgeCheckElement } from "@dlbr/eid-age-check";

export function AgeCheck() {
  useEffect(() => {
    registerAgeCheckElement();
  }, []);

  return createElement("dlbr-age-check", { endpoint: "/api/age-check" });
}
