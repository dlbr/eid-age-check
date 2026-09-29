<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { registerAgeCheckElement } from "@dlbr/eid-age-check";

const widget = ref<HTMLElement | null>(null);
const accessGranted = ref(false);

function onVerified() {
  accessGranted.value = true;
}

onMounted(() => {
  registerAgeCheckElement();
  widget.value?.addEventListener("age-verified", onVerified);
});

onBeforeUnmount(() => {
  widget.value?.removeEventListener("age-verified", onVerified);
});
</script>

<template>
  <dlbr-age-check ref="widget" endpoint="/api/age-check" />
  <section v-if="accessGranted">Age verified. Continue with your own access rules.</section>
</template>
