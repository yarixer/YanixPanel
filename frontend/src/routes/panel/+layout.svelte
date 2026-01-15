<script lang="ts">
  import { onMount } from 'svelte';
  import TopProgressBar from '$lib/TopProgressBar.svelte';
  import { goto } from '$app/navigation';

  type Me = {
    id: string;
    email: string;
    isAdmin: boolean;
  };

  let me: Me | null = null;
  let isAdmin = false;
  let loadingMe = true;

  let showMenu = false;
  let menuEl: HTMLElement | null = null;
  let menuButtonEl: HTMLButtonElement | null = null;

  async function fetchMe() {
    loadingMe = true;
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include'
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          await goto('/auth/login');
        }
        return;
      }

      const data = await res.json();
      me = data;
      isAdmin = !!data?.isAdmin;
    } catch {
      // тихо игнорируем ошибку профиля, хедер всё равно работает
    } finally {
      loadingMe = false;
    }
  }

  onMount(() => {
    fetchMe();
  });

  function toggleMenu() {
    showMenu = !showMenu;
  }

  function navigate(path: string) {
    showMenu = false;
    goto(path);
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch {
      // игнорируем сетевые ошибки при логауте
    } finally {
      showMenu = false;
      goto('/auth/login');
    }
  }

  function handleWindowClick(event: MouseEvent) {
    if (!showMenu) return;
    const target = event.target as Node | null;
    if (!target) return;

    if (menuEl?.contains(target)) return;
    if (menuButtonEl?.contains(target)) return;

    showMenu = false;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (!showMenu) return;
    if (event.key === 'Escape') {
      showMenu = false;
    }
  }
</script>

<svelte:window on:click={handleWindowClick} on:keydown={handleWindowKeydown} />

<!-- Глобальная бегущая полоска загрузки -->
<TopProgressBar />

<!-- Хедер панели -->
<header
  class="relative z-40 w-full border-b border-slate-800 bg-slate-950/95 backdrop-blur flex items-center justify-between px-4 py-2"
>
  <!-- Лого слева -->
  <a
    href="/panel/servers"
    class="flex items-center gap-2 px-1 py-1"
  >
    <img
      src="/logo.svg"
      alt="Yanix Panel"
      class="h-10 w-auto max-h-10 object-contain"
      loading="lazy"
    />
  </a>

  <!-- Кнопка меню справа (иконка без явной "кнопочности") -->
  <button
    bind:this={menuButtonEl}
    type="button"
    class="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-200 hover:text-cyan-300 hover:bg-slate-900/30 transition-colors focus:outline-none"
    on:click={toggleMenu}
    aria-label="Открыть меню навигации"
    aria-haspopup="true"
    aria-expanded={showMenu}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  </button>

  {#if showMenu}
    <!-- Выпадающее вертикальное меню под кнопкой -->
    <nav
      bind:this={menuEl}
      class="absolute right-4 top-[48px] mt-2 w-56 rounded-lg border border-slate-800 bg-slate-950/98 shadow-xl shadow-black/60 text-xs overflow-hidden"
      aria-label="Навигация панели"
    >
      <!-- Пункты навигации -->
      <div class="py-1">
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-100 hover:bg-slate-900"
          on:click={() => navigate('/panel/home')}
        >
          <span class="inline-flex h-4 w-4 items-center justify-center text-sky-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 10.5L12 4l9 6.5" />
              <path d="M5 11v8h5v-5h4v5h5v-8" />
            </svg>
          </span>
          <span>Home</span>
        </button>

        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-100 hover:bg-slate-900"
          on:click={() => navigate('/panel/servers')}
        >
          <span class="inline-flex h-4 w-4 items-center justify-center text-cyan-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="4" width="18" height="6" rx="1.5" />
              <rect x="3" y="14" width="18" height="6" rx="1.5" />
              <path d="M7 7h.01M7 17h.01" />
            </svg>
          </span>
          <span>Servers</span>
        </button>

        {#if isAdmin}
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-100 hover:bg-slate-900"
            on:click={() => navigate('/panel/admin')}
          >
            <span class="inline-flex h-4 w-4 items-center justify-center text-indigo-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.78 1.78 0 0 0 .35 1.94l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.78 1.78 0 0 0 15 19.4a1.78 1.78 0 0 0-1 .6 1.78 1.78 0 0 0-.47 1.12V22a2 2 0 1 1-4 0v-.15A1.78 1.78 0 0 0 8 19.4a1.78 1.78 0 0 0-1.94-.35l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.78 1.78 0 0 0 4.6 15a1.78 1.78 0 0 0-.6-1 1.78 1.78 0 0 0-1.12-.47H2a2 2 0 1 1 0-4h.15A1.78 1.78 0 0 0 4.6 8a1.78 1.78 0 0 0-.35-1.94l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.78 1.78 0 0 0 9 4.6a1.78 1.78 0 0 0 1-.6A1.78 1.78 0 0 0 10.47 3V2a2 2 0 1 1 4 0v.15A1.78 1.78 0 0 0 15 4.6a1.78 1.78 0 0 0 1.94.35l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.78 1.78 0 0 0 19.4 9c.32.3.74.5 1.12.47H22a2 2 0 1 1 0 4h-.15A1.78 1.78 0 0 0 19.4 15z" />
              </svg>
            </span>
            <span>Admin</span>
          </button>
        {/if}
      </div>

      <!-- Разделитель и Logout -->
      <div class="border-t border-slate-800 mt-1 pt-1">
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-rose-300 hover:bg-rose-950/40"
          on:click={logout}
        >
          <span class="inline-flex h-4 w-4 items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
            </svg>
          </span>
          <span>Log out</span>
        </button>
      </div>
    </nav>
  {/if}
</header>

<!-- Контент всех страниц /panel/* -->
<main class="min-h-[calc(100vh-40px)] bg-slate-950">
  <slot />
</main>
