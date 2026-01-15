<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  let loading = true;
  let error: string | null = null;
  let user: { id: string; email: string; isAdmin: boolean } | null = null;

  onMount(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include'
      });

      if (res.status === 401 || res.status === 403) {
        await goto('/auth/login');
        return;
      }

      if (!res.ok) {
        error = 'Failed to load profile';
        return;
      }

      user = await res.json();
    } catch (e) {
      error = 'Network error';
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Home</title>
</svelte:head>

<main class="min-h-[calc(100vh-40px)] flex flex-col text-slate-100 overflow-x-hidden">
  {#if loading}
    <div class="flex-1 flex items-center justify-center">
      <p class="text-sm text-slate-300">Loading...</p>
    </div>
  {:else if error}
    <div class="flex-1 flex items-center justify-center">
      <p class="text-sm text-red-400">{error}</p>
    </div>
  {:else if user}
    <div class="flex-1 flex flex-col items-center justify-center px-6 py-16">
      <h1 class="text-6xl sm:text-7xl font-semibold tracking-tight text-slate-100 text-center">
        Welcome
      </h1>

      <div class="mt-12 w-full max-w-7xl">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          <!-- Patch Notes -->
          <section class="rounded-xl border border-slate-800 bg-slate-950/60 p-7 shadow-lg shadow-black/30">
            <h2 class="text-base font-semibold text-slate-100">Patch Notes</h2>
            <ul class="mt-4 space-y-2 text-sm text-slate-300">
              <li class="flex gap-2">
                <span class="mt-2 h-1.5 w-1.5 rounded-full bg-slate-500"></span>
                <span>CPU load visualization will be added in the future.</span>
              </li>
            </ul>
          </section>

          <!-- Quick Start (bigger) -->
          <section class="rounded-xl border border-slate-700 bg-slate-950/80 p-8 shadow-xl shadow-black/40">
            <h2 class="text-base font-semibold text-slate-100">Quick Start</h2>
            <ul class="mt-4 space-y-2 text-base text-slate-200">
              <li class="flex gap-2">
                <span class="mt-2 h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
                <span>Click the logo to open the servers list.</span>
              </li>
              <li class="flex gap-2">
                <span class="mt-2 h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
                <span>Use the menu icon in the top-right to open Admin panel.</span>
              </li>
              <li class="flex gap-2">
                <span class="mt-2 h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
                <span>Read the Wiki.</span>
              </li>
            </ul>
          </section>

          <!-- Security -->
          <section class="rounded-xl border border-rose-900/60 bg-rose-950/20 p-7 shadow-lg shadow-black/30">
            <h2 class="text-base font-semibold text-rose-200">Security</h2>
            <ul class="mt-4 space-y-2 text-sm text-rose-100/90">
              <li class="flex gap-2">
                <span class="mt-2 h-1.5 w-1.5 rounded-full bg-rose-400"></span>
                <span>
                  I hope you closed the required ports, otherwise you are highly
                  vulnerable to hacking attacks!
                </span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="w-full border-t border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-2 text-[11px] text-slate-400">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <div class="w-1/3"></div>
        <div class="w-1/3 text-center">version 0.1</div>
        <div class="w-1/3 text-right">© Yanix dev 2026</div>
      </div>
    </footer>
  {/if}
</main>
