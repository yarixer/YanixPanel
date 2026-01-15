<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';

  const POLL_INTERVAL_MS = 10_000;

  type ContainerInfo = {
    serverId: string;
    dockerId: string;
    exists: boolean;
    containerState: string;
    cpuPercent: number;
    memUsage: number;
    memLimit: number;
    memUsagePercent: number;
    port: string;
    hostLabel: string;
  };

  let loading = true;
  let error: string | null = null;
  let containers: ContainerInfo[] = [];

  let viewMode: 'grid' | 'list' = 'grid';
  let search = '';

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function loadUser() {
    const res = await fetch('/api/auth/me', {
      credentials: 'include'
    });

    if (res.status === 401 || res.status === 403) {
      await goto('/auth/login');
      return null;
    }

    if (!res.ok) {
      throw new Error('Failed to load profile');
    }

    return res.json();
  }

  async function loadContainers() {
    const res = await fetch('/api/servers/allinfo', {
      credentials: 'include'
    });

    if (res.status === 401 || res.status === 403) {
      await goto('/auth/login');
      return;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message ?? 'Failed to load containers');
    }

    const data = await res.json();
    containers = data.containers ?? [];
  }

  onMount(async () => {
    loading = true;
    error = null;

    try {
      const user = await loadUser();
      if (!user) return;

      await loadContainers();

      pollTimer = setInterval(() => {
        loadContainers().catch((e) => {
          console.error('Failed to refresh containers', e);
        });
      }, POLL_INTERVAL_MS);
    } catch (e: any) {
      error = e?.message ?? 'Unknown error';
    } finally {
      loading = false;
    }
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });

  $: normalizedQuery = search.trim().toLowerCase();

  $: filteredContainers =
    normalizedQuery.length === 0
      ? containers
      : containers.filter((c) => {
          return (
            c.serverId.toLowerCase().includes(normalizedQuery) ||
            c.dockerId.toLowerCase().includes(normalizedQuery)
          );
        });

  function statusColor(state: string): string {
    switch (state) {
      case 'running':
        return 'bg-emerald-500';
      case 'exited':
      case 'stopped':
        return 'bg-rose-500';
      case 'paused':
        return 'bg-amber-400';
      default:
        return 'bg-slate-500';
    }
  }

  function openContainer(c: ContainerInfo) {
    const path = `/panel/server/${encodeURIComponent(c.hostLabel)}/${encodeURIComponent(c.dockerId)}`;
    goto(path);
  }
</script>

<svelte:head>
  <title>Servers</title>
</svelte:head>

<main class="text-slate-100">
  <div class="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-4">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 class="text-2xl font-semibold">Servers</h1>

      <div class="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div class="flex rounded-md shadow-sm border border-slate-700 overflow-hidden">
          <button
            type="button"
            class={`px-3 py-1 text-xs font-medium ${
              viewMode === 'grid'
                ? 'bg-sky-600 text-white'
                : 'bg-slate-900 text-slate-300'
            }`}
            on:click={() => (viewMode = 'grid')}
          >
            Tiles
          </button>
          <button
            type="button"
            class={`px-3 py-1 text-xs font-medium border-l border-slate-700 ${
              viewMode === 'list'
                ? 'bg-sky-600 text-white'
                : 'bg-slate-900 text-slate-300'
            }`}
            on:click={() => (viewMode = 'list')}
          >
            List
          </button>
        </div>

        <input
          class="px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-sky-500"
          placeholder="Search by server_id or docker_id"
          bind:value={search}
        />
      </div>
    </header>

    {#if loading}
      <p class="text-sm text-slate-300">Loading containers...</p>
    {:else if error}
      <p class="text-sm text-red-400">{error}</p>
    {:else if filteredContainers.length === 0}
      <p class="text-sm text-slate-400">No containers found.</p>
    {:else}
      {#if viewMode === 'grid'}
        <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {#each filteredContainers as c}
            <article class="bg-slate-900 border border-slate-800 rounded-lg">
              <button
                type="button"
                class="relative flex w-full flex-col gap-2 p-4 cursor-pointer hover:border-sky-500 text-left"
                on:click={() => openContainer(c)}
              >
                <div
                  class={`absolute right-0 top-0 w-1 h-full rounded-r-lg ${statusColor(
                    c.containerState
                  )}`}
                ></div>

                <div class="flex items-center justify-between gap-2">
                  <div>
                    <div class="text-xs uppercase tracking-wide text-slate-400">
                      {c.hostLabel} · {c.serverId}
                    </div>
                    <div class="text-xs text-slate-500 truncate max-w-[210px]">
                      {c.dockerId}
                    </div>
                  </div>
                  <div class="text-xs text-slate-400">
                    port{' '}
                    <span class="font-mono text-slate-200">
                      {c.port || '—'}
                    </span>
                  </div>
                </div>

                <div class="flex items-center justify-between text-xs mt-1">
                  <div class="flex flex-col">
                    <span class="text-slate-400">CPU</span>
                    <span class="font-mono text-slate-100">
                      {c.cpuPercent.toFixed(1)}%
                    </span>
                  </div>
                  <div class="flex flex-col">
                    <span class="text-slate-400">RAM</span>
                    <span class="font-mono text-slate-100">
                      {c.memUsagePercent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </button>
            </article>
          {/each}
        </section>
      {:else}
        <section class="overflow-x-auto rounded-lg border border-slate-800">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-900 text-xs uppercase text-slate-400">
              <tr>
                <th class="px-3 py-2 text-left">Host</th>
                <th class="px-3 py-2 text-left">Server ID</th>
                <th class="px-3 py-2 text-left">Docker ID</th>
                <th class="px-3 py-2 text-left">Port</th>
                <th class="px-3 py-2 text-left">CPU</th>
                <th class="px-3 py-2 text-left">RAM</th>
                <th class="px-3 py-2 text-left">State</th>
                <th class="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800 bg-slate-950">
              {#each filteredContainers as c}
                <tr class="hover:bg-slate-900">
                  <td class="px-3 py-2 text-xs">{c.hostLabel}</td>
                  <td class="px-3 py-2 text-xs">{c.serverId}</td>
                  <td class="px-3 py-2 text-xs font-mono truncate max-w-[220px]">
                    {c.dockerId}
                  </td>
                  <td class="px-3 py-2 text-xs font-mono">
                    {c.port || '—'}
                  </td>
                  <td class="px-3 py-2 text-xs font-mono">
                    {c.cpuPercent.toFixed(1)}%
                  </td>
                  <td class="px-3 py-2 text-xs font-mono">
                    {c.memUsagePercent.toFixed(1)}%
                  </td>
                  <td class="px-3 py-2 text-xs">
                    <span
                      class={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        c.containerState === 'running'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : c.containerState === 'exited' ||
                            c.containerState === 'stopped'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-slate-500/20 text-slate-200'
                      }`}
                    >
                      {c.containerState}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-xs">
                    <button
                      type="button"
                      class="px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 text-[11px]"
                      on:click={() => openContainer(c)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      {/if}
    {/if}
  </div>
</main>
