<script lang="ts">
  import { goto } from '$app/navigation';

  let email = '';
  let password = '';
  let loading = false;
  let error: string | null = null;

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    loading = true;
    error = null;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        error = data.message ?? 'Login failed';
        return;
      }

      await goto('/panel/home');
    } catch (e) {
      error = 'Network error';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Login · Yanix Panel</title>
</svelte:head>

<main
  class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4"
>
  <div
    class="w-full max-w-md rounded-2xl border border-slate-800/80 bg-slate-950/70 p-8 shadow-xl shadow-black/40 backdrop-blur"
  >
    <header class="mb-6 text-center">
      <h1 class="text-2xl font-semibold tracking-tight text-slate-100">
        Yanix Panel
      </h1>
      <p class="mt-2 text-sm text-slate-400">
        Sign in to manage containers
      </p>
    </header>

    {#if error}
      <div
        class="mb-4 rounded-md border border-rose-700/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-200"
      >
        {error}
      </div>
    {/if}

    <form class="flex flex-col gap-4" on:submit|preventDefault={handleSubmit}>
      <div class="flex flex-col gap-1 text-sm">
        <label for="email" class="text-slate-200">
          Email
        </label>
        <input
          id="email"
          type="email"
          autocomplete="email"
          bind:value={email}
          required
          class="w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 shadow-inner shadow-black/30 outline-none ring-0 transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/60"
        />
      </div>

      <div class="flex flex-col gap-1 text-sm">
        <label for="password" class="text-slate-200">
          Password
        </label>
        <input
          id="password"
          type="password"
          autocomplete="current-password"
          bind:value={password}
          required
          class="w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 shadow-inner shadow-black/30 outline-none ring-0 transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/60"
        />
      </div>

      <button
        type="submit"
        class="mt-2 inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow shadow-sky-900/60 transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={loading}
      >
        {#if loading}
          Signing in...
        {:else}
          Sign in
        {/if}
      </button>
    </form>

    <footer class="mt-6 flex flex-col gap-1 text-xs text-slate-400">
      <p>
        No account?
        <a
          href="/auth/register"
          class="font-medium text-sky-400 hover:text-sky-300"
        >
          Register
        </a>
      </p>
      <p class="text-[11px] text-slate-500">
        After registration, the administrator must approve your account (verified)
        before you can sign in.
      </p>
    </footer>
  </div>
</main>
