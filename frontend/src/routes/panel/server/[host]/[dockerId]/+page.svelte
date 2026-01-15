<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, afterUpdate } from 'svelte';
  import { goto } from '$app/navigation';
  import AceEditor from '$lib/AceEditor.svelte';
  import { startGlobalLoading, stopGlobalLoading } from '$lib/stores/progress';
  import { AnsiUp } from 'ansi_up';

  const ansiUp = new AnsiUp();

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

  type FileEntry = {
    name: string;
    type: 'file' | 'dir';
    size: number;
  };

  type StatusKind = 'online' | 'offline' | 'restarting' | 'other';

  type StatusInfo = {
    label: string;
    type: StatusKind;
  };

  type NatsLogMessage = {
    container_id?: string;
    container_name?: string;
    hostname?: string;
    image?: string;
    message?: string;
    stream?: string;
    timestamp?: string;
    [key: string]: any;
  };

  type TusUploadState = {
    id: number;
    fileName: string;
    progress: number;
    status: 'uploading' | 'success' | 'error';
    error?: string;
  };

  type ToastType = 'success' | 'error';

  type Toast = {
    id: number;
    type: ToastType;
    message: string;
    createdAt: number;
    duration: number;
  };

  type ExecMode = 'default' | 'args';

  const MAX_LOG_LINES = 1000;

  const ARCHIVE_EXTENSIONS = [
    '.zip',
    '.rar',
    '.7z',
    '.tar',
    '.tar.gz',
    '.tgz',
    '.tar.bz2',
    '.tbz2',
    '.tar.xz',
    '.txz'
  ];

  let loading = true;
  let error: string | null = null;
  let container: ContainerInfo | null = null;

  let activeTab: 'console' | 'files' | 'info' = 'console';

  let logs: string[] = [];
  let command = '';
  let actionLoading: 'start' | 'stop' | 'restart' | null = null;
  let logSource: EventSource | null = null;
  let logsContainer: HTMLDivElement;
  let autoScroll = true;

  let execMode: ExecMode = 'default';

  let commandHistory: string[] = [];
  let historyIndex: number | null = null;

  let lastLogSeq: number | null = null;

  // File manager
  let currentPath = '/';
  let entries: FileEntry[] = [];
  let filesLoading = false;

  // Small uploads
  let fileInput: HTMLInputElement;
  let uploadInProgress = false;
  let dragOver = false;

  // TUS uploads
  let tusFileInput: HTMLInputElement;
  let tusUploads: TusUploadState[] = [];
  let tusUploadCounter = 0;
  let tusModule: typeof import('tus-js-client') | null = null;

  // Ace editor
  let editorVisible = false;
  let editorPath = '';
  let editorContent = '';
  let editorLoading = false;
  let editorSaving = false;
  let editorError: string | null = null;
  let editorIsNew = false;

  // Context menu
  let contextMenuVisible = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let contextEntry: FileEntry | null = null;

  // Toasts
  let toasts: Toast[] = [];
  let toastCounter = 0;
  let now = Date.now();
  let toastTimer: any;

  // Custom input modal
  let inputModalVisible = false;
  let inputModalTitle = '';
  let inputModalLabel = '';
  let inputModalPlaceholder = '';
  let inputModalValue = '';
  let inputModalConfirmText = 'OK';
  let inputModalCancelText = 'Cancel';
  let inputModalResolve: ((value: string | null) => void) | null = null;

  // URL params
  $: params = $page.params;
  $: hostLabel = params.host;
  $: dockerId = params.dockerId;

  // Status info
  let statusInfo: StatusInfo | null = null;

  $: if (container) {
    statusInfo = getStatusDisplay(container.containerState);
  } else {
    statusInfo = null;
  }

  function getStatusDisplay(state: string): StatusInfo {
    const normalized = (state ?? '').toLowerCase();

    if (normalized === 'running') return { label: 'Online', type: 'online' };
    if (normalized === 'restarting') return { label: 'Restarting', type: 'restarting' };

    if (normalized === 'exited' || normalized === 'dead' || normalized === 'stopped') {
      return { label: 'Offline', type: 'offline' };
    }

    return { label: state || 'Unknown', type: 'other' };
  }

  function statusDotClass(kind: StatusKind): string {
    switch (kind) {
      case 'online':
        return 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]';
      case 'restarting':
        return 'bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]';
      case 'offline':
        return 'border border-slate-400';
      default:
        return 'bg-slate-500';
    }
  }

  function formatLogLine(raw: string): string {
    try {
      const obj: NatsLogMessage = JSON.parse(raw);
      return obj.message ?? raw;
    } catch {
      return raw;
    }
  }

  function formatLogHtml(line: string): string {
    return ansiUp.ansi_to_html(line ?? '');
  }

  function formatSizeMb(size: number): string {
    if (!size || size <= 0) return '0 MB';
    const mb = size / (1024 * 1024);
    const value = Math.floor(mb);
    return `${value} MB`;
  }

  function isArchiveFile(entry: FileEntry): boolean {
    if (entry.type !== 'file') return false;
    const name = entry.name.toLowerCase();
    return ARCHIVE_EXTENSIONS.some((ext) => name.endsWith(ext));
  }

  function pushToast(message: string, type: ToastType = 'success', duration = 10_000) {
    const id = ++toastCounter;
    const createdAt = Date.now();
    const toast: Toast = { id, type, message, createdAt, duration };
    toasts = [...toasts, toast];

    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
    }, duration);
  }

  function closeToast(id: number) {
    toasts = toasts.filter((t) => t.id !== id);
  }

  function getToastProgress(t: Toast, nowValue: number): number {
    if (!t.duration || t.duration <= 0) return 1;
    const elapsed = nowValue - t.createdAt;
    const left = 1 - elapsed / t.duration;
    return Math.max(0, Math.min(1, left));
  }

  function showInputModal(options: {
    title: string;
    label: string;
    placeholder?: string;
    initial?: string;
    confirmText?: string;
    cancelText?: string;
  }): Promise<string | null> {
    inputModalTitle = options.title;
    inputModalLabel = options.label;
    inputModalPlaceholder = options.placeholder ?? '';
    inputModalValue = options.initial ?? '';
    inputModalConfirmText = options.confirmText ?? 'OK';
    inputModalCancelText = options.cancelText ?? 'Cancel';
    inputModalVisible = true;

    return new Promise<string | null>((resolve) => {
      inputModalResolve = resolve;
    });
  }

  function handleInputModalConfirm() {
    if (!inputModalResolve) return;
    const value = inputModalValue.trim();
    const resolve = inputModalResolve;
    inputModalResolve = null;
    inputModalVisible = false;
    resolve(value);
  }

  function handleInputModalCancel() {
    if (!inputModalResolve) return;
    const resolve = inputModalResolve;
    inputModalResolve = null;
    inputModalVisible = false;
    resolve(null);
  }

  onMount(() => {
    let cancelled = false;

    toastTimer = setInterval(() => {
      now = Date.now();
    }, 200);

    const init = async () => {
      loading = true;
      error = null;

      try {
        const meRes = await fetch('/api/auth/me', { credentials: 'include' });
        if (meRes.status === 401 || meRes.status === 403) {
          await goto('/auth/login');
          return;
        }

        const res = await fetch(
          `/api/servers/${encodeURIComponent(hostLabel)}/${encodeURIComponent(dockerId)}`,
          { credentials: 'include' }
        );

        if (res.status === 404) {
          error = 'Container not found or inaccessible.';
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          error = data.message ?? data.error ?? 'Failed to load container.';
          return;
        }

        const data = await res.json();
        container = data.container;

        await loadDirectory('/');
      } catch (e: any) {
        error = e?.message ?? 'Network error';
      } finally {
        loading = false;
      }
    };

    const setupLogsSse = () => {
      if (logSource) {
        logSource.close();
        logSource = null;
      }

      let url = `/api/servers/${encodeURIComponent(hostLabel)}/${encodeURIComponent(dockerId)}/logs/stream`;

      if (lastLogSeq !== null && lastLogSeq >= 0) {
        const seq = Math.max(0, lastLogSeq);
        const params = new URLSearchParams({ lastSeq: String(seq) });
        url += `?${params.toString()}`;
      }

      const es = new EventSource(url, { withCredentials: true });
      logSource = es;

      es.onmessage = (event) => {
        if (event.data) {
          const line = formatLogLine(event.data);
          logs = [...logs, line].slice(-MAX_LOG_LINES);
        }

        const idStr = event.lastEventId;
        if (idStr) {
          const parsed = Number(idStr);
          if (!Number.isNaN(parsed)) {
            if (lastLogSeq === null || parsed > lastLogSeq) {
              lastLogSeq = parsed;
            }
          }
        }
      };

      es.onerror = () => {
        es.close();
        logSource = null;
        if (!cancelled) {
          setTimeout(() => {
            if (!cancelled) setupLogsSse();
          }, 3000);
        }
      };

      es.addEventListener('meta', () => {
        // no-op
      });
    };

    import('tus-js-client')
      .then((mod) => {
        tusModule = mod;
      })
      .catch(() => {});

    init().then(() => {
      if (!cancelled) setupLogsSse();
    });

    return () => {
      cancelled = true;
      if (logSource) {
        logSource.close();
        logSource = null;
      }
      if (toastTimer) clearInterval(toastTimer);
    };
  });

  // auto scroll
  afterUpdate(() => {
    if (autoScroll && logsContainer) {
      logsContainer.scrollTop = logsContainer.scrollHeight + 100;
    }
  });

  //  Console

  async function sendAction(action: 'start' | 'stop' | 'restart') {
    if (!container) return;

    actionLoading = action;

    try {
      const res = await fetch(
        `/api/servers/${encodeURIComponent(hostLabel)}/${encodeURIComponent(dockerId)}/${action}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.message ?? data.error ?? `Failed to perform ${action}`;
        pushToast(msg, 'error');
        logs = [...logs, `[error] ${msg}`].slice(-MAX_LOG_LINES);
        return;
      }

      if (data.containerState && container) {
        container = { ...container, containerState: data.containerState };
      }

      logs = [...logs, `[action] ${action} → ${data.containerState ?? 'ok'}`].slice(-MAX_LOG_LINES);
    } catch (e: any) {
      const msg = e?.message ?? 'Network error';
      pushToast(msg, 'error');
      logs = [...logs, `[error] ${msg}`].slice(-MAX_LOG_LINES);
    } finally {
      actionLoading = null;
    }
  }

  async function sendCommand() {
    const cmd = command.trim();
    if (!cmd || !container) return;

    if (commandHistory[commandHistory.length - 1] !== cmd) {
      commandHistory = [...commandHistory, cmd].slice(-10);
    }
    historyIndex = null;

    command = '';

    try {
      const payload = { cmd, mode: execMode };

      const res = await fetch(
        `/api/servers/${encodeURIComponent(hostLabel)}/${encodeURIComponent(dockerId)}/exec`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.message ?? data.error ?? 'Failed to execute command';
        pushToast(msg, 'error');
        logs = [...logs, `> ${cmd}`, `[error] ${msg}`].slice(-MAX_LOG_LINES);
        return;
      }

      logs = [...logs, `> ${cmd}`, `[exec] status: ${data.status ?? 'started'}`].slice(-MAX_LOG_LINES);
    } catch (e: any) {
      const msg = e?.message ?? 'Network error';
      pushToast(msg, 'error');
      logs = [...logs, `> ${cmd}`, `[error] ${msg}`].slice(-MAX_LOG_LINES);
    }
  }

  function handleCommandKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;

      if (historyIndex === null) {
        historyIndex = commandHistory.length - 1;
      } else if (historyIndex > 0) {
        historyIndex = historyIndex - 1;
      }

      command = commandHistory[historyIndex];
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (commandHistory.length === 0 || historyIndex === null) return;

      if (historyIndex < commandHistory.length - 1) {
        historyIndex = historyIndex + 1;
        command = commandHistory[historyIndex];
      } else {
        historyIndex = null;
        command = '';
      }
    }
  }

  // File manager

  function buildChildPath(base: string, name: string): string {
    if (!base || base === '/') return `/${name}`;
    return `${base.replace(/\/$/, '')}/${name}`;
  }

  function getParentPath(path: string): string {
    if (!path || path === '/') return '/';
    const withoutTrailing = path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
    const idx = withoutTrailing.lastIndexOf('/');
    if (idx <= 0) return '/';
    return withoutTrailing.slice(0, idx);
  }

  async function loadDirectory(path: string) {
    if (!container) return;
    filesLoading = true;

    try {
      const res = await fetch(
        `/api/containers/${encodeURIComponent(container.hostLabel)}/${encodeURIComponent(
          container.dockerId
        )}/files?path=${encodeURIComponent(path)}`,
        { credentials: 'include' }
      );

      if (res.status === 401 || res.status === 403) {
        await goto('/auth/login');
        return;
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.message ?? data.error ?? 'Failed to load files';
        pushToast(msg, 'error');
        return;
      }

      const list: FileEntry[] = data.entries ?? data ?? [];
      entries = list;
      currentPath = path || '/';
    } catch (e: any) {
      const msg = e?.message ?? 'Network error';
      pushToast(msg, 'error');
    } finally {
      filesLoading = false;
    }
  }

  async function goUp() {
    const parent = getParentPath(currentPath);
    await loadDirectory(parent);
  }

  async function openEntry(entry: FileEntry) {
    if (entry.type === 'dir') {
      const next = buildChildPath(currentPath, entry.name);
      await loadDirectory(next);
    } else {
      await openFile(entry);
    }
  }

  async function openFile(entry: FileEntry) {
    if (!container) return;
    editorVisible = true;
    editorLoading = true;
    editorError = null;
    editorIsNew = false;

    const path = buildChildPath(currentPath, entry.name);
    editorPath = path;

    try {
      const res = await fetch(
        `/api/containers/${encodeURIComponent(container.hostLabel)}/${encodeURIComponent(
          container.dockerId
        )}/file?path=${encodeURIComponent(path)}`,
        { credentials: 'include' }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.message ?? data.error ?? 'Failed to read file';
        editorError = msg;
        editorContent = '';
        pushToast(msg, 'error');
        return;
      }

      editorContent = data.content ?? '';
    } catch (e: any) {
      const msg = e?.message ?? 'Network error';
      editorError = msg;
      editorContent = '';
      pushToast(msg, 'error');
    } finally {
      editorLoading = false;
    }
  }

  async function newFile() {
    if (!container) return;

    const name = await showInputModal({
      title: 'New file',
      label: 'New file name (no path)',
      placeholder: 'example.txt',
      confirmText: 'Create'
    });

    if (!name || !name.trim()) return;

    editorPath = buildChildPath(currentPath, name.trim());
    editorContent = '';
    editorError = null;
    editorIsNew = true;
    editorVisible = true;
    editorLoading = false;
  }

  async function newFolder() {
    if (!container) return;

    const name = await showInputModal({
      title: 'New directory',
      label: 'New directory name (no path)',
      placeholder: 'configs',
      confirmText: 'Create'
    });

    if (!name || !name.trim()) return;

    const path = buildChildPath(currentPath, name.trim());

    try {
      const res = await fetch(
        `/api/containers/${encodeURIComponent(container.hostLabel)}/${encodeURIComponent(container.dockerId)}/mkdir`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path })
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.message ?? data.error ?? 'Failed to create directory';
        pushToast(msg, 'error');
        return;
      }

      pushToast('Directory created', 'success');
      await loadDirectory(currentPath);
    } catch (e: any) {
      const msg = e?.message ?? 'Network error';
      pushToast(msg, 'error');
    }
  }

  async function deleteEntry(entry: FileEntry) {
    if (!container) return;

    const confirmed = window.confirm(`Delete ${entry.type === 'dir' ? 'directory' : 'file'} "${entry.name}"?`);
    if (!confirmed) return;

    const path = buildChildPath(currentPath, entry.name);

    try {
      const res = await fetch(
        `/api/containers/${encodeURIComponent(container.hostLabel)}/${encodeURIComponent(
          container.dockerId
        )}/file?path=${encodeURIComponent(path)}`,
        { method: 'DELETE', credentials: 'include' }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.message ?? data.error ?? 'Failed to delete';
        pushToast(msg, 'error');
        return;
      }

      pushToast('Deleted', 'success');
      await loadDirectory(currentPath);
    } catch (e: any) {
      const msg = e?.message ?? 'Network error';
      pushToast(msg, 'error');
    }
  }

  async function renameEntry(entry: FileEntry) {
    if (!container) return;

    const current = entry.name;
    const next = await showInputModal({
      title: 'Rename',
      label: 'New name',
      initial: current,
      confirmText: 'Rename'
    });

    if (!next || !next.trim() || next.trim() === current) return;

    const from = buildChildPath(currentPath, current);
    const to = buildChildPath(getParentPath(from), next.trim());

    try {
      const res = await fetch(
        `/api/containers/${encodeURIComponent(container.hostLabel)}/${encodeURIComponent(container.dockerId)}/rename`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to })
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.message ?? data.error ?? 'Failed to rename';
        pushToast(msg, 'error');
        return;
      }

      pushToast('Renamed', 'success');
      await loadDirectory(currentPath);
    } catch (e: any) {
      const msg = e?.message ?? 'Network error';
      pushToast(msg, 'error');
    }
  }

  async function moveEntry(entry: FileEntry) {
    if (!container) return;

    const from = buildChildPath(currentPath, entry.name);
    const to = await showInputModal({
      title: 'Move',
      label: 'New path (full, including name)',
      initial: from,
      confirmText: 'Move'
    });

    if (!to || !to.trim() || to.trim() === from) return;

    try {
      const res = await fetch(
        `/api/containers/${encodeURIComponent(container.hostLabel)}/${encodeURIComponent(container.dockerId)}/move`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: to.trim() })
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.message ?? data.error ?? 'Failed to move';
        pushToast(msg, 'error');
        return;
      }

      pushToast('Moved', 'success');
      await loadDirectory(currentPath);
    } catch (e: any) {
      const msg = e?.message ?? 'Network error';
      pushToast(msg, 'error');
    }
  }

  async function copyEntry(entry: FileEntry) {
    if (!container) return;

    const from = buildChildPath(currentPath, entry.name);
    const to = await showInputModal({
      title: 'Copy',
      label: 'Destination path (full, including name)',
      initial: from,
      confirmText: 'Copy'
    });

    if (!to || !to.trim()) return;

    try {
      const res = await fetch(
        `/api/containers/${encodeURIComponent(container.hostLabel)}/${encodeURIComponent(container.dockerId)}/copy`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: to.trim() })
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.message ?? data.error ?? 'Failed to copy';
        pushToast(msg, 'error');
        return;
      }

      pushToast('Copied', 'success');
      await loadDirectory(currentPath);
    } catch (e: any) {
      const msg = e?.message ?? 'Network error';
      pushToast(msg, 'error');
    }
  }

  function extractQueueSize(data: any): number | undefined {
    const raw = data?.queue_size ?? data?.queueSize ?? data?.queue ?? data?.position;
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      const parsed = Number(raw);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return undefined;
  }

  async function archiveEntry(entry: FileEntry) {
    if (!container) return;

    const sourcePath = buildChildPath(currentPath, entry.name);

    try {
      const res = await fetch(
        `/api/containers/${encodeURIComponent(container.hostLabel)}/${encodeURIComponent(container.dockerId)}/archive`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourcePath })
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.message ?? data.error ?? 'Failed to queue archive job';
        pushToast(msg, 'error');
        return;
      }

      const queueSize = extractQueueSize(data);
      let msg = 'Archive job queued';
      if (queueSize !== undefined) msg += ` (position: ${queueSize})`;

      pushToast(msg, 'success');
      await loadDirectory(currentPath);
    } catch (e: any) {
      const msg = e?.message ?? 'Network error';
      pushToast(msg, 'error');
    }
  }

  async function unarchiveEntry(entry: FileEntry) {
    if (!container) return;

    const archivePath = buildChildPath(currentPath, entry.name);

    try {
      const res = await fetch(
        `/api/containers/${encodeURIComponent(container.hostLabel)}/${encodeURIComponent(container.dockerId)}/unarchive`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archivePath })
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.message ?? data.error ?? 'Failed to queue unarchive job';
        pushToast(msg, 'error');
        return;
      }

      const queueSize = extractQueueSize(data);
      let msg = 'Unarchive job queued';
      if (queueSize !== undefined) msg += ` (position: ${queueSize})`;

      pushToast(msg, 'success');
      await loadDirectory(currentPath);
    } catch (e: any) {
      const msg = e?.message ?? 'Network error';
      pushToast(msg, 'error');
    }
  }

  // Context menu

  function openContextMenu(event: MouseEvent, entry: FileEntry) {
    event.preventDefault();
    contextEntry = entry;
    contextMenuVisible = true;

    let x = event.clientX;
    let y = event.clientY;

    if (typeof window !== 'undefined') {
      const margin = 8;
      const menuWidth = 200;
      const menuHeight = 220;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (x + menuWidth + margin > vw) x = vw - menuWidth - margin;
      if (y + menuHeight + margin > vh) y = vh - menuHeight - margin;
    }

    contextMenuX = x;
    contextMenuY = y;
  }

  function closeContextMenu() {
    contextMenuVisible = false;
    contextEntry = null;
  }

  async function ctxOpen() {
    if (!contextEntry) return;
    await openEntry(contextEntry);
    closeContextMenu();
  }

  async function ctxRename() {
    if (!contextEntry) return;
    await renameEntry(contextEntry);
    closeContextMenu();
  }

  async function ctxMove() {
    if (!contextEntry) return;
    await moveEntry(contextEntry);
    closeContextMenu();
  }

  async function ctxCopy() {
    if (!contextEntry) return;
    await copyEntry(contextEntry);
    closeContextMenu();
  }

  async function ctxArchive() {
    if (!contextEntry) return;
    await archiveEntry(contextEntry);
    closeContextMenu();
  }

  async function ctxUnarchive() {
    if (!contextEntry) return;
    await unarchiveEntry(contextEntry);
    closeContextMenu();
  }

  async function ctxDelete() {
    if (!contextEntry) return;
    await deleteEntry(contextEntry);
    closeContextMenu();
  }

  // Upload (HTTP)

  function triggerUploadPicker() {
    if (fileInput) fileInput.click();
  }

  async function handleFileInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    const files = Array.from(target.files);
    target.value = '';
    await uploadFiles(files);
  }

  async function onDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = false;

    const dt = event.dataTransfer;
    if (!dt || !dt.files || dt.files.length === 0) return;

    const files = Array.from(dt.files);
    await uploadFiles(files);
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault();
    dragOver = true;
  }

  function onDragLeave(event: DragEvent) {
    event.preventDefault();
    dragOver = false;
  }

  async function uploadFiles(files: File[]) {
    if (!container || files.length === 0) return;

    uploadInProgress = true;
    startGlobalLoading();

    try {
      const MAX_SIZE = 25 * 1024 * 1024;
      let hadError = false;

      for (const file of files) {
        if (file.size > MAX_SIZE) {
          hadError = true;
          pushToast('Some files exceed 25 MB. For larger files, use TUS.', 'error');
          continue;
        }

        const path = buildChildPath(currentPath, file.name);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', path);

        const res = await fetch(
          `/api/containers/${encodeURIComponent(container.hostLabel)}/${encodeURIComponent(container.dockerId)}/upload`,
          { method: 'POST', credentials: 'include', body: formData }
        );

        if (!res.ok) {
          hadError = true;
          let msg = `Failed to upload file ${file.name}`;
          try {
            const data = await res.json();
            msg = data.message ?? data.error ?? msg;
          } catch {}
          pushToast(msg, 'error');
        }
      }

      await loadDirectory(currentPath);

      if (!hadError) pushToast('Files uploaded', 'success');
    } catch (e: any) {
      pushToast(e?.message ?? 'Network error while uploading files', 'error');
    } finally {
      uploadInProgress = false;
      stopGlobalLoading();
    }
  }

  // TUS

  function triggerTusPicker() {
    if (tusFileInput) tusFileInput.click();
  }

  async function handleTusInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    const files = Array.from(target.files);
    target.value = '';
    await startTusUpload(files);
  }

  async function startTusUpload(files: File[]) {
    if (!container || files.length === 0) return;

    if (!tusModule) {
      try {
        tusModule = await import('tus-js-client');
      } catch (e: any) {
        pushToast(e?.message ?? 'Failed to initialize TUS client', 'error');
        return;
      }
    }

    if (!tusModule) {
      pushToast('tus-js-client is not initialized', 'error');
      return;
    }

    const endpoint = `/api/containers/${encodeURIComponent(container.hostLabel)}/${encodeURIComponent(container.dockerId)}/tus`;
    const currentDir = currentPath || '/';
    const Upload = tusModule.Upload;

    for (const file of files) {
      const id = ++tusUploadCounter;

      tusUploads = [...tusUploads, { id, fileName: file.name, progress: 0, status: 'uploading' }];

      const upload = new Upload(file, {
        endpoint,
        metadata: { filename: file.name, targetPath: currentDir },
        withCredentials: true,
        chunkSize: 5 * 1024 * 1024,
        retryDelays: [0, 3000, 5000, 10000],
        onError(error) {
          tusUploads = tusUploads.map((u) =>
            u.id === id ? { ...u, status: 'error', error: error?.message ?? 'Upload error' } : u
          );
          pushToast(`TUS upload error for ${file.name}: ${error?.message ?? 'unknown error'}`, 'error');
        },
        onProgress(bytesUploaded, bytesTotal) {
          const progress = bytesTotal ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
          tusUploads = tusUploads.map((u) => (u.id === id ? { ...u, progress } : u));
        },
        async onSuccess() {
          tusUploads = tusUploads.map((u) => (u.id === id ? { ...u, progress: 100, status: 'success' } : u));
          pushToast(`File ${file.name} uploaded (TUS)`, 'success');
          await loadDirectory(currentPath);
        }
      });

      upload.start();
    }
  }

  //  Save file Ace

  async function saveFile() {
    if (!container || !editorPath) return;

    editorSaving = true;
    editorError = null;
    startGlobalLoading();

    try {
      const res = await fetch(
        `/api/containers/${encodeURIComponent(container.hostLabel)}/${encodeURIComponent(container.dockerId)}/file`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: editorPath, content: editorContent })
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.message ?? data.error ?? 'Failed to save file';
        editorError = msg;
        pushToast(msg, 'error');
        return;
      }

      editorIsNew = false;
      pushToast('File saved', 'success');
      await loadDirectory(getParentPath(editorPath));
    } catch (e: any) {
      const msg = e?.message ?? 'Network error';
      editorError = msg;
      pushToast(msg, 'error');
    } finally {
      editorSaving = false;
      stopGlobalLoading();
    }
  }

  function closeEditor() {
    editorVisible = false;
    editorPath = '';
    editorContent = '';
    editorError = null;
    editorIsNew = false;
  }
</script>

<svelte:head>
  <title>Container</title>
</svelte:head>

<main class="text-slate-100">
  <div class="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-4">
    {#if loading}
      <p class="text-sm text-slate-300">Loading container...</p>
    {:else if error}
      <p class="text-sm text-red-400">{error}</p>
    {:else if !container}
      <p class="text-sm text-slate-400">Container not found.</p>
    {:else}
      <section class="mb-3">
        <div class="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 flex items-center gap-4 justify-between">
          <div class="text-sm font-semibold text-slate-100 truncate">
            {container.serverId}
          </div>

          <div class="hidden sm:block h-8 w-px bg-slate-700/80 mx-4"></div>

          <div class="flex-1 flex items-center justify-between gap-4 text-xs">
            <div class="flex flex-col">
              <div class="flex items-center gap-2">
                {#if statusInfo}
                  <span class={`inline-flex h-2.5 w-2.5 rounded-full ${statusDotClass(statusInfo.type)}`}></span>
                  <span class="text-slate-100 text-xs">{statusInfo.label}</span>
                {:else}
                  <span class="text-slate-400 text-xs">Unknown</span>
                {/if}
              </div>
              <div class="mt-1 font-mono text-[11px] text-slate-400 break-all">
                {container.dockerId}
              </div>
            </div>

            <div class="text-right text-xs text-slate-300">
              Host: {container.hostLabel}
            </div>
          </div>
        </div>
      </section>

      <div class="mt-1">
        <nav class="flex gap-4 text-xs">
          <button
            type="button"
            class={`pb-2 border-b-2 ${activeTab === 'console'
              ? 'border-sky-500 text-sky-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'}`}
            on:click={() => (activeTab = 'console')}
          >
            Console
          </button>
          <button
            type="button"
            class={`pb-2 border-b-2 ${activeTab === 'files'
              ? 'border-sky-500 text-sky-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'}`}
            on:click={() => (activeTab = 'files')}
          >
            File Manager
          </button>
          <button
            type="button"
            class={`pb-2 border-b-2 ${activeTab === 'info'
              ? 'border-sky-500 text-sky-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'}`}
            on:click={() => (activeTab = 'info')}
          >
            Info
          </button>
        </nav>
      </div>

      {#if activeTab === 'console'}
        <section class="mt-4 flex flex-col gap-3">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2 text-[11px] text-slate-300">
              <span>Auto scroll</span>
              <button
                type="button"
                class="inline-flex items-center"
                role="switch"
                aria-checked={autoScroll}
                on:click={() => (autoScroll = !autoScroll)}
              >
                <span class={`inline-flex h-4 w-8 items-center rounded-full transition-colors ${autoScroll ? 'bg-emerald-500/70' : 'bg-slate-600'}`}>
                  <span class={`h-3 w-3 bg-slate-950 rounded-full transform transition-transform ${autoScroll ? 'translate-x-4' : 'translate-x-1'}`}></span>
                </span>
              </button>
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                on:click={() => sendAction('start')}
                disabled={actionLoading === 'start'}
              >
                {actionLoading === 'start' ? 'Starting...' : 'Start'}
              </button>
              <button
                type="button"
                class="px-3 py-1 rounded bg-violet-600 hover:bg-violet-500 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                on:click={() => sendAction('restart')}
                disabled={actionLoading === 'restart'}
              >
                {actionLoading === 'restart' ? 'Restarting...' : 'Restart'}
              </button>
              <button
                type="button"
                class="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                on:click={() => sendAction('stop')}
                disabled={actionLoading === 'stop'}
              >
                {actionLoading === 'stop' ? 'Stopping...' : 'Stop'}
              </button>
            </div>
          </div>

          <div
            class="border border-slate-800 rounded-md bg-slate-950 h-[50rem] overflow-y-auto p-2 text-xs font-mono"
            bind:this={logsContainer}
          >
            {#if logs.length === 0}
              <p class="text-slate-500">
                No logs yet. Once events arrive from NATS/JetStream, they will appear here.
              </p>
            {:else}
              {#each logs as line}
                <div class="whitespace-pre-wrap">
                  {@html formatLogHtml(line)}
                </div>
              {/each}
            {/if}
          </div>

          <form class="flex items-center gap-2" on:submit|preventDefault={sendCommand}>
            <div class="flex items-center gap-2">
              <select
                class="px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:ring focus:ring-sky-500"
                bind:value={execMode}
                aria-label="Command mode"
              >
                <option value="default">Default</option>
                <option value="args">Args</option>
              </select>
            </div>

            <input
              class="flex-1 px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-xs font-mono text-slate-100 focus:outline-none focus:ring focus:ring-sky-500"
              placeholder="Enter a command and press Enter"
              bind:value={command}
              on:keydown={handleCommandKeydown}
            />

            <button type="submit" class="px-3 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-xs text-white">
              Send
            </button>
          </form>
        </section>
      {:else if activeTab === 'files'}
        <section class="mt-4 flex flex-col gap-3">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-2">
              <span class="text-slate-400">Path:</span>
              <span class="font-mono text-slate-100 break-all">{currentPath}</span>
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                on:click={goUp}
                disabled={currentPath === '/'}
              >
                Up
              </button>
              <button
                type="button"
                class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700"
                on:click={() => loadDirectory(currentPath)}
              >
                Refresh
              </button>
            </div>
          </div>

          <div class="flex flex-col gap-1 text-xs">
            <div class="flex gap-2">
              <button
                type="button"
                class="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700"
                on:click={newFile}
              >
                New file
              </button>
              <button
                type="button"
                class="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700"
                on:click={newFolder}
              >
                New folder
              </button>
              <button
                type="button"
                class="px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 border border-sky-500 disabled:opacity-60 disabled:cursor-not-allowed"
                on:click={triggerUploadPicker}
                disabled={uploadInProgress}
                title="Upload files (up to 25 MB each)"
              >
                {uploadInProgress ? 'Uploading...' : 'Upload'}
              </button>
              <button
                type="button"
                class="px-3 py-1 rounded bg-indigo-700 hover:bg-indigo-600 border border-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                on:click={triggerTusPicker}
                disabled={uploadInProgress}
                title="Upload large files via the TUS protocol"
              >
                TUS
              </button>
            </div>

            {#if tusUploads.length > 0}
              <div class="mt-1 space-y-1">
                {#each tusUploads as u}
                  <div class="flex items-center gap-2 text-[11px]">
                    <span class="truncate max-w-[40%] text-slate-200">{u.fileName}</span>
                    <div class="flex-1 h-1.5 bg-slate-800 rounded overflow-hidden">
                      <div class="h-full bg-indigo-500 transition-[width]" style={`width: ${u.progress}%;`}></div>
                    </div>
                    <span class={`w-16 text-right ${u.status === 'error'
                      ? 'text-rose-400'
                      : u.status === 'success'
                      ? 'text-emerald-400'
                      : 'text-slate-300'}`}>
                      {u.status === 'uploading'
                        ? `${u.progress}%`
                        : u.status === 'success'
                        ? 'Done'
                        : 'Error'}
                    </span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <input type="file" multiple class="hidden" bind:this={fileInput} on:change={handleFileInput} />
          <input type="file" multiple class="hidden" bind:this={tusFileInput} on:change={handleTusInput} />

          <div
            class={`border rounded-md bg-slate-950 h-[70vh] p-2 text-xs overflow-auto transition-colors ${dragOver ? 'border-sky-500 bg-slate-900/60' : 'border-slate-800'}`}
            role="region"
            aria-label="File drag-and-drop area"
            on:dragover|preventDefault={onDragOver}
            on:dragenter|preventDefault={() => (dragOver = true)}
            on:dragleave|preventDefault={onDragLeave}
            on:drop|preventDefault={onDrop}
          >
            {#if filesLoading}
              <p class="text-slate-400">Loading file list...</p>
            {:else if entries.length === 0}
              <p class="text-slate-500">Empty directory. Drag files here to upload.</p>
            {:else}
              <ul class="space-y-1">
                {#if currentPath !== '/'}
                  <li>
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-slate-300 hover:bg-slate-800"
                      on:click={goUp}
                    >
                      <span class="text-slate-500 font-mono">[..]</span>
                      <span class="text-slate-400">Up</span>
                    </button>
                  </li>
                {/if}

                {#each entries as entry}
                  <li>
                    <div class="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        class="flex-1 flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-slate-800"
                        on:click={() => openEntry(entry)}
                        on:contextmenu={(e) => openContextMenu(e, entry)}
                      >
                        <span class={`inline-flex h-5 w-5 items-center justify-center rounded ${entry.type === 'dir'
                          ? 'bg-sky-500/20 text-sky-300'
                          : 'bg-slate-600/40 text-slate-200'}`}>
                          {entry.type === 'dir' ? 'D' : 'F'}
                        </span>
                        <span class="truncate text-slate-100">{entry.name}</span>
                        <span class="ml-auto text-[10px] text-slate-500">
                          {entry.type === 'file' ? formatSizeMb(entry.size) : ''}
                        </span>
                      </button>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </section>
      {:else if activeTab === 'info'}
        <section class="mt-4">
          <div class="border border-slate-800 rounded-md bg-slate-950 p-4 text-xs">
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              <div>
                <dt class="text-slate-400">Host label</dt>
                <dd class="text-slate-100">{container.hostLabel}</dd>
              </div>
              <div>
                <dt class="text-slate-400">Server ID</dt>
                <dd class="text-slate-100">{container.serverId}</dd>
              </div>
              <div>
                <dt class="text-slate-400">Docker ID</dt>
                <dd class="text-slate-100 font-mono break-all">{container.dockerId}</dd>
              </div>
              <div>
                <dt class="text-slate-400">Exists</dt>
                <dd class="text-slate-100">{container.exists ? 'yes' : 'no'}</dd>
              </div>
              <div>
                <dt class="text-slate-400">State</dt>
                <dd class="text-slate-100">{container.containerState}</dd>
              </div>
              <div>
                <dt class="text-slate-400">Port</dt>
                <dd class="text-slate-100">{container.port || '—'}</dd>
              </div>
              <div>
                <dt class="text-slate-400">CPU usage</dt>
                <dd class="text-slate-100">{container.cpuPercent.toFixed(2)}%</dd>
              </div>
              <div>
                <dt class="text-slate-400">Memory usage</dt>
                <dd class="text-slate-100">
                  {container.memUsage.toFixed(2)} / {container.memLimit.toFixed(2)} GiB ({container.memUsagePercent.toFixed(2)}%)
                </dd>
              </div>
            </dl>
          </div>
        </section>
      {/if}
    {/if}
  </div>

  {#if contextMenuVisible && contextEntry}
    <div class="fixed inset-0 z-40 pointer-events-none">
      <button
        type="button"
        class="absolute inset-0 w-full h-full cursor-default pointer-events-auto"
        on:click={closeContextMenu}
        on:contextmenu|preventDefault={closeContextMenu}
        aria-label="Close context menu"
      ></button>
      <div
        class="absolute z-50 w-44 rounded border border-slate-700 bg-slate-900/95 text-xs shadow-xl shadow-black/50 backdrop-blur pointer-events-auto"
        style={`top: ${contextMenuY}px; left: ${contextMenuX}px;`}
        role="menu"
        tabindex="-1"
        on:contextmenu|preventDefault|stopPropagation
      >
        <div class="px-3 py-2 border-b border-slate-700/80 text-[11px] text-slate-300 truncate">{contextEntry.name}</div>
        <button type="button" class="w-full px-3 py-1.5 text-left hover:bg-slate-800 text-slate-100" on:click={ctxOpen}>Open</button>
        <button type="button" class="w-full px-3 py-1.5 text-left hover:bg-slate-800 text-slate-100" on:click={ctxRename}>Rename</button>
        <button type="button" class="w-full px-3 py-1.5 text-left hover:bg-slate-800 text-slate-100" on:click={ctxMove}>Move</button>
        <button type="button" class="w-full px-3 py-1.5 text-left hover:bg-slate-800 text-slate-100" on:click={ctxCopy}>Copy</button>
        <button type="button" class="w-full px-3 py-1.5 text-left hover:bg-slate-800 text-slate-100" on:click={ctxArchive}>Archive (zip)</button>
        {#if isArchiveFile(contextEntry)}
          <button type="button" class="w-full px-3 py-1.5 text-left hover:bg-slate-800 text-slate-100" on:click={ctxUnarchive}>Unarchive</button>
        {/if}
        <button type="button" class="w-full px-3 py-1.5 text-left hover:bg-rose-900/60 text-rose-100 border-t border-slate-700/80" on:click={ctxDelete}>Delete</button>
      </div>
    </div>
  {/if}

  {#if inputModalVisible}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div class="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-950 p-4 shadow-xl shadow-black/60" role="dialog" aria-modal="true">
        <h2 class="text-sm font-semibold text-slate-100 mb-2">{inputModalTitle}</h2>
        <label for="input-modal-field" class="block text-xs text-slate-300 mb-1">{inputModalLabel}</label>
        <input
          id="input-modal-field"
          class="w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
          bind:value={inputModalValue}
          placeholder={inputModalPlaceholder}
          on:keydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleInputModalConfirm();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              handleInputModalCancel();
            }
          }}
        />
        <div class="mt-3 flex justify-end gap-2 text-xs">
          <button type="button" class="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200" on:click={handleInputModalCancel}>
            {inputModalCancelText}
          </button>
          <button type="button" class="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white" on:click={handleInputModalConfirm}>
            {inputModalConfirmText}
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if editorVisible}
    <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
      <div class="w-[98vw] h-[95vh] bg-slate-950 border border-slate-800 rounded-lg shadow-xl shadow-black/60 flex flex-col p-4 gap-3">
        <div class="flex items-center justify-between gap-3">
          <div class="flex flex-col">
            <span class="text-xs text-slate-400">File</span>
            <span class="font-mono text-xs text-slate-100 break-all">{editorPath}</span>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-[11px] disabled:opacity-60 disabled:cursor-not-allowed"
              on:click={saveFile}
              disabled={editorSaving}
            >
              {editorSaving ? 'Saving...' : 'Save'}
            </button>
            <button type="button" class="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px]" on:click={closeEditor}>
              Close
            </button>
          </div>
        </div>

        <div class="flex-1">
          {#if editorLoading}
            <div class="w-full h-full flex items-center justify-center">
              <p class="text-slate-400 text-xs">Loading file contents...</p>
            </div>
          {:else}
            <AceEditor value={editorContent} filePath={editorPath} onChange={(v) => (editorContent = v)} onSave={saveFile} />
          {/if}
        </div>

        {#if editorError}
          <p class="text-[11px] text-rose-400">{editorError}</p>
        {:else if editorIsNew}
          <p class="text-[11px] text-slate-500">This is a new file. After saving, it will be created on disk.</p>
        {/if}
      </div>
    </div>
  {/if}

  {#if toasts.length > 0}
    <div class="fixed top-3 right-3 z-50 space-y-2">
      {#each toasts as t (t.id)}
        <div
          class={`w-72 rounded-md border px-3 py-2 text-xs shadow-lg shadow-black/40 bg-slate-950/95 backdrop-blur flex flex-col gap-1 ${
            t.type === 'success' ? 'border-emerald-500/60' : 'border-rose-500/60'
          }`}
        >
          <div class="flex items-start gap-2">
            <div class="mt-0.5">
              <span class={`inline-block h-2 w-2 rounded-full ${t.type === 'success' ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
            </div>
            <div class="flex-1 text-slate-100">{t.message}</div>
            <button type="button" class="ml-2 text-[10px] text-slate-400 hover:text-slate-200" on:click={() => closeToast(t.id)}>
              ✕
            </button>
          </div>
          <div class="mt-1 h-0.5 w-full bg-slate-800 rounded overflow-hidden">
            <div class={`h-full ${t.type === 'success' ? 'bg-emerald-400' : 'bg-rose-400'}`} style={`width: ${getToastProgress(t, now) * 100}%;`}></div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</main>
