<script lang="ts">
  import { goto } from '$app/navigation';

  let email = '';
  let password = '';
  let passwordConfirm = '';
  let loading = false;
  let error: string | null = null;
  let success: string | null = null;

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    loading = true;
    error = null;
    success = null;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, passwordConfirm })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        error = data.message ?? 'Registration failed';
        return;
      }

      success =
        'Registration successful. Please wait until an administrator approves your account (verified = true), then sign in.';
    } catch (e) {
      error = 'Network error';
    } finally {
      loading = false;
    }
  }

  function goToLogin() {
    goto('/auth/login');
  }
</script>

<svelte:head>
  <title>Register · Yanix Panel</title>
</svelte:head>

<main
  class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4"
>
  <div
    class="w-full max-w-md rounded-2xl border border-slate-800/80 bg-slate-950/70 p-8 shadow-xl shadow-black/40 backdrop-blur"
  >
    <header class="mb-6 text-center">
      <h1 class="text-2xl font-semibold tracking-tight text-slate-100">
        Create an account
      </h1>
      <p class="mt-2 text-sm text-slate-400">
        Registration to access Yanix Panel
      </p>
    </header>

    {#if error}
      <div
        class="mb-4 rounded-md border border-rose-700/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-200"
      >
        {error}
      </div>
    {/if}

    {#if success}
      <div
        class="mb-4 rounded-md border border-emerald-700/60 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200"
      >
        <p>{success}</p>
        <button
          type="button"
          class="mt-2 inline-flex items-center rounded-md bg-emerald-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-emerald-500"
          on:click={goToLogin}
        >
          Go to sign in
        </button>
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
          autocomplete="new-password"
          bind:value={password}
          required
          class="w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 shadow-inner shadow-black/30 outline-none ring-0 transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/60"
        />
      </div>

      <div class="flex flex-col gap-1 text-sm">
        <label for="passwordConfirm" class="text-slate-200">
          Confirm password
        </label>
        <input
          id="passwordConfirm"
          type="password"
          autocomplete="new-password"
          bind:value={passwordConfirm}
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
          Registering...
        {:else}
          Register
        {/if}
      </button>
    </form>

    <footer class="mt-6 text-xs text-slate-400">
      <p>
        Already have an account?
        <a
          href="/auth/login"
          class="font-medium text-sky-400 hover:text-sky-300"
        >
          Sign in
        </a>
      </p>
    </footer>
  </div>
</main>
