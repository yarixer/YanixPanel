<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    goto('/panel/home');
  });
</script>

<svelte:head>
  <title>Yanix Panel</title>
  <meta name="robots" content="noindex" />
  <noscript>
    <meta http-equiv="refresh" content="0; url=/panel/home" />
  </noscript>
</svelte:head>

<main class="min-h-screen bg-slate-950"></main>

