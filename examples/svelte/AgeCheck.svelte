<script lang="ts">
  import { onMount } from "svelte";
  import { registerAgeCheckElement } from "@dlbr/eid-age-check";

  let widget: HTMLElement;
  let accessGranted = false;

  onMount(() => {
    registerAgeCheckElement();
    const onVerified = () => {
      accessGranted = true;
    };
    widget.addEventListener("age-verified", onVerified);
    return () => widget.removeEventListener("age-verified", onVerified);
  });
</script>

<dlbr-age-check bind:this={widget} endpoint="/api/age-check"></dlbr-age-check>

{#if accessGranted}
  <p>Age verified. Continue with your own access rules.</p>
{/if}
