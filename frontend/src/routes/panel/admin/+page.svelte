<script lang="ts">
  import { onMount } from 'svelte';

  type Me = {
    id: string;
    email: string;
    isAdmin: boolean;
  };

  type AdminUser = {
    id: string;
    email: string;
    isAdmin: boolean;
    verified: boolean;
    createdAt: string;
    registrationIp?: string | null;
    sessions: {
      id: string;
      isActive: boolean;
      ip: string;
      userAgent: string | null;
      createdAt: string;
      expiresAt: string;
    }[];
  };

  type Host = {
    hostLabel: string;
    ip: string;
  };

  type Template = {
    name: string;
    file: string;
  };

  type RestrictedContainerRow = {
    containerId: string;
  };

  type RestrictedAccessRow = {
    containerId: string;
    userId: string;
    userEmail: string;
  };

  type PlaceholdersResponse = {
    template: string;
    placeholders: string[];
  };

  // Yanix servers (A/B/C)
  type YanixServerRow = {
    id: number;
    hostLabel: string;
    ip: string;
    apiBaseUrl: string;
    natsUrl: string | null;
    createdAt: string;
    updatedAt: string;
  };

  // Command patterns
  type CommandPatternRow = {
    name: string;
    pattern: unknown;
  };

  // Container → pattern binding
  type ContainerPatternBindingRow = {
    containerId: string;
    patternName: string;
    pattern?: unknown | null;
  };

  let me: Me | null = null;
  let loadingProfile = true;
  let profileError = '';

  // Admin panel tabs
  let activeTab:
    | 'create'
    | 'yanix-servers'
    | 'verify'
    | 'restricted-containers'
    | 'restricted-access'
    | 'patterns'
    | 'maintenance' = 'create';

  // ---------- CREATE TAB (container creation) ----------

  let hosts: Host[] = [];
  let loadingHosts = false;
  let hostsError = '';

  let selectedHost: string | null = null;

  let templates: Template[] = [];
  let loadingTemplates = false;
  let templatesError = '';

  let selectedTemplate: string | null = null;

  let placeholders: string[] = [];
  let loadingPlaceholders = false;
  let placeholdersError = '';
  let placeholderValues: Record<string, string> = {};

  // server_id (container name/ID), entered separately
  let serverId = '';

  let isCreating = false;

  // ---------- YANIX SERVERS TAB ----------

  let yanixServers: YanixServerRow[] = [];
  let loadingYanixServers = false;

  let editingYanixHostLabel: string | null = null; // if not null -> editing
  let newYanixHostLabel = '';
  let newYanixIp = '';
  let newYanixApiBaseUrl = '';
  let newYanixNatsUrl = '';

  // ---------- VERIFY TAB (verification / admins / sessions) ----------

  let users: AdminUser[] = [];
  let loadingUsers = false;

  // ---------- RESTRICTED CONTAINERS TAB ----------

  let restrictedContainers: RestrictedContainerRow[] = [];
  let loadingRestrictedContainers = false;
  let newRestrictedDockerId = '';

  // ---------- RESTRICTED ACCESS TAB ----------

  let restrictedAccess: RestrictedAccessRow[] = [];
  let loadingRestrictedAccess = false;
  let newAccessDockerId = '';
  let newAccessEmail = '';

  // ---------- COMMAND PATTERNS TAB ----------

  let commandPatterns: CommandPatternRow[] = [];
  let loadingCommandPatterns = false;
  let newPatternName = '';
  let newPatternBody = '';

  let containerPatternBindings: ContainerPatternBindingRow[] = [];
  let loadingContainerBindings = false;
  let newBindingContainerId = '';
  let newBindingPatternName = '';

  // ---------- MAINTENANCE TAB (container removal) ----------

  let maintenanceDockerId = '';
  let maintenanceLoading = false;

  // ---------- TOASTS ----------

  type Toast = {
    id: number;
    message: string;
    type: 'error' | 'success';
  };

  let toasts: Toast[] = [];

  function showToast(message: string, type: 'error' | 'success' = 'error') {
    const id = Date.now() + Math.random();
    toasts = [...toasts, { id, message, type }];

    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
    }, 10_000);
  }

  // ---------- INIT ----------

  onMount(async () => {
    await loadProfile();
    if (me?.isAdmin) {
      loadHosts();
      loadYanixServers();
      loadUsers();
      loadRestrictedContainers();
      loadRestrictedAccess();
      loadCommandPatterns();
      loadContainerPatternBindings();
    }
  });

  // ---------- PROFILE ----------

  async function loadProfile() {
    loadingProfile = true;
    profileError = '';

    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      me = data;

      if (!me.isAdmin) {
        profileError = 'Access denied. Admin privileges are required.';
      }
    } catch (e: any) {
      console.error(e);
      const msg = 'Failed to load profile';
      profileError = msg;
      showToast(msg, 'error');
    } finally {
      loadingProfile = false;
    }
  }

  // ---------- YANIX SERVERS TAB ----------

  async function loadYanixServers() {
    loadingYanixServers = true;

    try {
      const res = await fetch('/api/admin/yanix-servers');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: YanixServerRow[] = await res.json();
      yanixServers = data ?? [];
    } catch (e: any) {
      console.error(e);
      showToast('Failed to load Yanix server list: ' + (e?.message ?? String(e)), 'error');
    } finally {
      loadingYanixServers = false;
    }
  }

  function startEditYanixServer(row: YanixServerRow) {
    editingYanixHostLabel = row.hostLabel;
    newYanixHostLabel = row.hostLabel;
    newYanixIp = row.ip;
    newYanixApiBaseUrl = row.apiBaseUrl;
    newYanixNatsUrl = row.natsUrl ?? '';
  }

  function resetYanixServerForm() {
    editingYanixHostLabel = null;
    newYanixHostLabel = '';
    newYanixIp = '';
    newYanixApiBaseUrl = '';
    newYanixNatsUrl = '';
  }

  async function saveYanixServer() {
    const hostLabel = newYanixHostLabel.trim().toUpperCase();
    const ip = newYanixIp.trim();
    const apiBaseUrl = newYanixApiBaseUrl.trim();
    const natsUrlRaw = newYanixNatsUrl.trim();
    const natsUrl = natsUrlRaw.length > 0 ? natsUrlRaw : null;

    if (!/^[A-Z]$/.test(hostLabel)) {
      showToast('hostLabel must be a single letter A-Z', 'error');
      return;
    }
    if (!ip) {
      showToast('ip is required', 'error');
      return;
    }
    if (!/^https?:\/\/\S+/i.test(apiBaseUrl)) {
      showToast('apiBaseUrl must start with http:// or https://', 'error');
      return;
    }
    if (natsUrl && !/^nats:\/\/\S+/i.test(natsUrl)) {
      showToast('natsUrl must start with nats://', 'error');
      return;
    }

    try {
      if (editingYanixHostLabel) {
        const res = await fetch(
          `/api/admin/yanix-servers/${encodeURIComponent(editingYanixHostLabel)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip, apiBaseUrl, natsUrl })
          }
        );

        const text = await res.text();
        if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

        showToast('Yanix server updated', 'success');
      } else {
        const res = await fetch('/api/admin/yanix-servers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostLabel, ip, apiBaseUrl, natsUrl })
        });

        const text = await res.text();
        if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

        showToast('Yanix server added', 'success');
      }

      resetYanixServerForm();
      await loadYanixServers();

      // Refresh Create Tab (hosts) so new servers appear immediately
      await loadHosts();
    } catch (e: any) {
      console.error(e);
      showToast('Failed to save Yanix server: ' + (e?.message ?? String(e)), 'error');
    }
  }

  async function deleteYanixServer(hostLabel: string) {
    const hl = (hostLabel ?? '').trim().toUpperCase();
    if (!hl) {
      showToast('Invalid hostLabel', 'error');
      return;
    }

    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Delete Yanix server ${hl}?`);
      if (!ok) return;
    }

    try {
      const res = await fetch(`/api/admin/yanix-servers/${encodeURIComponent(hl)}`, {
        method: 'DELETE'
      });

      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

      showToast('Yanix server deleted', 'success');

      // If we deleted the server currently being edited — reset the form
      if (editingYanixHostLabel === hl) resetYanixServerForm();

      await loadYanixServers();
      await loadHosts();
    } catch (e: any) {
      console.error(e);
      showToast('Failed to delete Yanix server: ' + (e?.message ?? String(e)), 'error');
    }
  }

  // ---------- CREATE TAB: HOSTS / TEMPLATES / PLACEHOLDERS ----------

  async function loadHosts() {
    loadingHosts = true;
    hostsError = '';

    try {
      const res = await fetch('/api/admin/hosts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Host[] = await res.json();
      hosts = data;

      if (!selectedHost && hosts.length > 0) {
        changeHost(hosts[0].hostLabel);
      }
    } catch (e: any) {
      console.error(e);
      const msg = 'Failed to load server list';
      hostsError = msg;
      showToast(msg, 'error');
    } finally {
      loadingHosts = false;
    }
  }

  function resetCreateStateForHost() {
    templates = [];
    selectedTemplate = null;
    placeholders = [];
    placeholderValues = {};
    serverId = '';
    templatesError = '';
    placeholdersError = '';
  }

  async function changeHost(hostLabel: string) {
    if (!hostLabel || hostLabel === selectedHost) return;
    selectedHost = hostLabel;
    resetCreateStateForHost();
    await loadTemplatesForHost(hostLabel);
  }

  async function loadTemplatesForHost(hostLabel: string) {
    loadingTemplates = true;
    templatesError = '';
    templates = [];
    selectedTemplate = null;

    try {
      const res = await fetch(`/api/admin/hosts/${encodeURIComponent(hostLabel)}/templates`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Template[] = await res.json();
      templates = data;
    } catch (e: any) {
      console.error(e);
      const msg = 'Failed to load templates';
      templatesError = msg;
      showToast(msg, 'error');
    } finally {
      loadingTemplates = false;
    }
  }

  function resetPlaceholdersState() {
    placeholders = [];
    placeholderValues = {};
    placeholdersError = '';
  }

  async function changeTemplate(templateName: string) {
    if (templateName === selectedTemplate) return;
    selectedTemplate = templateName;
    resetPlaceholdersState();
    await loadPlaceholdersForTemplate();
  }

  async function loadPlaceholdersForTemplate() {
    placeholders = [];
    placeholderValues = {};
    placeholdersError = '';

    if (!selectedHost || !selectedTemplate) return;

    loadingPlaceholders = true;

    try {
      const res = await fetch(
        `/api/admin/hosts/${encodeURIComponent(selectedHost)}/templates/${encodeURIComponent(
          selectedTemplate
        )}/placeholders`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PlaceholdersResponse = await res.json();
      placeholders = data.placeholders ?? [];

      const initial: Record<string, string> = {};
      for (const ph of placeholders) {
        initial[ph] = ph === 'SERVER_ID' ? serverId : '';
      }
      placeholderValues = initial;
    } catch (e: any) {
      console.error(e);
      const msg = 'Failed to load placeholders';
      placeholdersError = msg;
      showToast(msg, 'error');
    } finally {
      loadingPlaceholders = false;
    }
  }

  $: if (placeholders.includes('SERVER_ID')) {
    placeholderValues = {
      ...placeholderValues,
      SERVER_ID: serverId
    };
  }

  function updatePlaceholder(ph: string, value: string) {
    placeholderValues = {
      ...placeholderValues,
      [ph]: value
    };
  }

  async function refreshCreateTab() {
    await loadHosts();
    if (selectedHost) {
      await loadTemplatesForHost(selectedHost);
      if (selectedTemplate) {
        await loadPlaceholdersForTemplate();
      }
    }
  }

  async function submitCreate(event: Event) {
    event.preventDefault();

    if (!selectedHost) {
      showToast('Select a server (host).', 'error');
      return;
    }
    if (!selectedTemplate) {
      showToast('Select a template.', 'error');
      return;
    }

    const trimmedServerId = serverId.trim();
    if (!trimmedServerId) {
      showToast('Provide a server identifier (server_id).', 'error');
      return;
    }

    const values: Record<string, string> = {};
    for (const ph of placeholders) {
      if (ph === 'SERVER_ID') {
        values[ph] = trimmedServerId;
        continue;
      }
      const v = (placeholderValues[ph] ?? '').trim();
      if (!v) {
        showToast(`Fill in a value for ${ph}`, 'error');
        return;
      }
      values[ph] = v;
    }

    isCreating = true;

    try {
      const res = await fetch(`/api/admin/hosts/${encodeURIComponent(selectedHost)}/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: trimmedServerId,
          template: selectedTemplate,
          values
        })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const data = await res.json();
      showToast(
        `Container created: server_id=${data.server_id}, state=${data.container_state}`,
        'success'
      );
    } catch (e: any) {
      console.error(e);
      showToast('Failed to create container: ' + (e?.message ?? String(e)), 'error');
    } finally {
      isCreating = false;
    }
  }

  // ---------- VERIFY TAB ----------

  async function loadUsers() {
    loadingUsers = true;

    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AdminUser[] = await res.json();
      users = data;
    } catch (e: any) {
      console.error(e);
      showToast('Failed to load users: ' + (e?.message ?? String(e)), 'error');
    } finally {
      loadingUsers = false;
    }
  }

  async function setVerified(userId: string, next: boolean) {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/verified`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified: next })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      users = users.map((u) => (u.id === userId ? { ...u, verified: next } : u));
      showToast('Verification status updated', 'success');
    } catch (e: any) {
      console.error(e);
      showToast('Failed to update status: ' + (e?.message ?? String(e)), 'error');
    }
  }

  async function setAdminByEmail(email: string, next: boolean) {
    try {
      const res = await fetch('/api/admin/users/admin-by-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, isAdmin: next })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      users = users.map((u) => (u.email === email ? { ...u, isAdmin: next } : u));
      showToast('Admin status updated', 'success');
    } catch (e: any) {
      console.error(e);
      showToast('Failed to change permissions: ' + (e?.message ?? String(e)), 'error');
    }
  }

  async function invalidateSessions(userId: string) {
    try {
      const res = await fetch('/api/admin/users/invalidate-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const target = users.find((u) => u.id === userId);
      if (target) {
        target.sessions = target.sessions.map((s) => ({
          ...s,
          isActive: false
        }));
      }

      showToast('All active user sessions have been marked as inactive', 'success');
    } catch (e: any) {
      console.error(e);
      showToast('Failed to invalidate sessions: ' + (e?.message ?? String(e)), 'error');
    }
  }

  // ---------- RESTRICTED CONTAINERS TAB ----------

  async function loadRestrictedContainers() {
    loadingRestrictedContainers = true;

    try {
      const res = await fetch('/api/admin/restricted-containers');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RestrictedContainerRow[] = await res.json();
      restrictedContainers = data;
    } catch (e: any) {
      console.error(e);
      showToast(
        'Failed to load restricted containers: ' + (e?.message ?? String(e)),
        'error'
      );
    } finally {
      loadingRestrictedContainers = false;
    }
  }

  async function addRestrictedContainer() {
    const dockerId = newRestrictedDockerId.trim();
    if (!dockerId) {
      showToast('Enter the container docker_id', 'error');
      return;
    }

    try {
      const res = await fetch('/api/admin/restricted-containers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dockerId })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      if (!restrictedContainers.find((r) => r.containerId === dockerId)) {
        restrictedContainers = [...restrictedContainers, { containerId: dockerId }];
      }

      newRestrictedDockerId = '';
      showToast('Container added to restricted list', 'success');
    } catch (e: any) {
      console.error(e);
      showToast('Failed to add container: ' + (e?.message ?? String(e)), 'error');
    }
  }

  async function deleteRestrictedContainer(containerId: string) {
    try {
      const res = await fetch(`/api/admin/restricted-containers/${encodeURIComponent(containerId)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      restrictedContainers = restrictedContainers.filter((r) => r.containerId !== containerId);
      showToast('Container removed from restricted list', 'success');
    } catch (e: any) {
      console.error(e);
      showToast('Failed to delete container: ' + (e?.message ?? String(e)), 'error');
    }
  }

  // ---------- RESTRICTED ACCESS TAB ----------

  async function loadRestrictedAccess() {
    loadingRestrictedAccess = true;

    try {
      const res = await fetch('/api/admin/restricted-access');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RestrictedAccessRow[] = await res.json();
      restrictedAccess = data;
    } catch (e: any) {
      console.error(e);
      showToast('Failed to load access list: ' + (e?.message ?? String(e)), 'error');
    } finally {
      loadingRestrictedAccess = false;
    }
  }

  async function addRestrictedAccess() {
    const dockerId = newAccessDockerId.trim();
    const email = newAccessEmail.trim();

    if (!dockerId || !email) {
      showToast('docker_id and user email are required', 'error');
      return;
    }

    try {
      const res = await fetch('/api/admin/restricted-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dockerId, email })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      if (!restrictedAccess.find((r) => r.containerId === dockerId && r.userEmail === email)) {
        restrictedAccess = [
          ...restrictedAccess,
          { containerId: dockerId, userId: 'unknown', userEmail: email }
        ];
      }

      newAccessDockerId = '';
      newAccessEmail = '';
      showToast('Access granted', 'success');
    } catch (e: any) {
      console.error(e);
      showToast('Failed to grant access: ' + (e?.message ?? String(e)), 'error');
    }
  }

  async function deleteRestrictedAccess(row: RestrictedAccessRow) {
    try {
      const res = await fetch('/api/admin/restricted-access', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dockerId: row.containerId, email: row.userEmail })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      restrictedAccess = restrictedAccess.filter(
        (r) => !(r.containerId === row.containerId && r.userEmail === row.userEmail)
      );

      showToast('Access removed', 'success');
    } catch (e: any) {
      console.error(e);
      showToast('Failed to remove access: ' + (e?.message ?? String(e)), 'error');
    }
  }

  // ---------- PATTERNS TAB ----------

  function fillPatternForm(p: CommandPatternRow) {
    newPatternName = p.name;
    try {
      newPatternBody = JSON.stringify(p.pattern, null, 2);
    } catch {
      newPatternBody = String(p.pattern ?? '');
    }
  }

  async function loadCommandPatterns() {
    loadingCommandPatterns = true;

    try {
      const res = await fetch('/api/admin/command-patterns');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: CommandPatternRow[] = await res.json();
      commandPatterns = data;

      if (newBindingPatternName && !commandPatterns.find((p) => p.name === newBindingPatternName)) {
        newBindingPatternName = '';
      }
    } catch (e: any) {
      console.error(e);
      showToast('Failed to load patterns: ' + (e?.message ?? String(e)), 'error');
    } finally {
      loadingCommandPatterns = false;
    }
  }

  async function saveCommandPattern() {
    const name = newPatternName.trim();
    const body = newPatternBody.trim();

    if (!name) {
      showToast('Pattern name is required', 'error');
      return;
    }
    if (!body) {
      showToast('JSON pattern is required', 'error');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch (e: any) {
      showToast('Failed to parse JSON pattern: ' + (e?.message ?? ''), 'error');
      return;
    }

    if (!Array.isArray(parsed)) {
      showToast(
        'pattern must be a JSON array (example: ["rcon-cli","{{INPUT}}"])',
        'error'
      );
      return;
    }

    try {
      const res = await fetch('/api/admin/command-patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, pattern: parsed })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const saved: CommandPatternRow = await res.json();
      const idx = commandPatterns.findIndex((p) => p.name === saved.name);
      if (idx >= 0) {
        commandPatterns = [
          ...commandPatterns.slice(0, idx),
          saved,
          ...commandPatterns.slice(idx + 1)
        ];
      } else {
        commandPatterns = [...commandPatterns, saved];
      }

      showToast('Pattern saved', 'success');
    } catch (e: any) {
      console.error(e);
      showToast('Failed to save pattern: ' + (e?.message ?? String(e)), 'error');
    }
  }

  async function deleteCommandPattern(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      showToast('Invalid pattern name', 'error');
      return;
    }

    try {
      const res = await fetch(`/api/admin/command-patterns/${encodeURIComponent(trimmed)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      commandPatterns = commandPatterns.filter((p) => p.name !== trimmed);
      if (newBindingPatternName === trimmed) newBindingPatternName = '';
      await loadContainerPatternBindings();

      showToast('Pattern deleted', 'success');
    } catch (e: any) {
      console.error(e);
      showToast('Failed to delete pattern: ' + (e?.message ?? String(e)), 'error');
    }
  }

  async function loadContainerPatternBindings() {
    loadingContainerBindings = true;

    try {
      const res = await fetch('/api/admin/container-command-patterns');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ContainerPatternBindingRow[] = await res.json();
      containerPatternBindings = data;
    } catch (e: any) {
      console.error(e);
      showToast('Failed to load bindings: ' + (e?.message ?? String(e)), 'error');
    } finally {
      loadingContainerBindings = false;
    }
  }

  async function saveContainerPatternBinding() {
    const containerId = newBindingContainerId.trim();
    const patternName = newBindingPatternName.trim();

    if (!containerId || !patternName) {
      showToast('docker_id and pattern are required', 'error');
      return;
    }

    try {
      const res = await fetch('/api/admin/container-command-patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ containerId, patternName })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const saved: { containerId: string; patternName: string } = await res.json();

      const row: ContainerPatternBindingRow = {
        containerId: saved.containerId,
        patternName: saved.patternName
      };

      const idx = containerPatternBindings.findIndex((b) => b.containerId === row.containerId);
      if (idx >= 0) {
        containerPatternBindings = [
          ...containerPatternBindings.slice(0, idx),
          row,
          ...containerPatternBindings.slice(idx + 1)
        ];
      } else {
        containerPatternBindings = [...containerPatternBindings, row];
      }

      newBindingContainerId = '';
      showToast('Binding saved', 'success');
    } catch (e: any) {
      console.error(e);
      showToast('Failed to save binding: ' + (e?.message ?? String(e)), 'error');
    }
  }

  async function deleteContainerPatternBinding(containerId: string) {
    const id = containerId.trim();
    if (!id) {
      showToast('Invalid docker_id', 'error');
      return;
    }

    try {
      const res = await fetch(`/api/admin/container-command-patterns/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      containerPatternBindings = containerPatternBindings.filter((b) => b.containerId !== id);
      showToast('Binding deleted', 'success');
    } catch (e: any) {
      console.error(e);
      showToast('Failed to delete binding: ' + (e?.message ?? String(e)), 'error');
    }
  }

  // ---------- MAINTENANCE TAB ----------

  async function removeContainer() {
    const dockerId = maintenanceDockerId.trim();
    if (!dockerId) {
      showToast('Container docker_id is required', 'error');
      return;
    }

    maintenanceLoading = true;

    try {
      const res = await fetch('/api/admin/containers/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dockerId })
      });

      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {}

      const removed = data?.removed;
      const msg =
        removed === true
          ? `Container removed: docker_id=${data.docker_id}`
          : `Removal request submitted: docker_id=${dockerId}`;

      maintenanceDockerId = '';
      showToast(msg, 'success');
    } catch (e: any) {
      console.error(e);
      showToast('Failed to remove container: ' + (e?.message ?? String(e)), 'error');
    } finally {
      maintenanceLoading = false;
    }
  }
</script>

<style>
  @keyframes toast-progress {
    from { width: 100%; }
    to { width: 0%; }
  }

  .toast-progress {
    animation: toast-progress 10s linear forwards;
  }
</style>

<svelte:head>
  <title>Admin Panel</title>
</svelte:head>

<main class="w-full px-4 py-6">
  {#if toasts.length > 0}
    <div class="pointer-events-none fixed right-4 top-4 z-50 space-y-2">
      {#each toasts as t (t.id)}
        <div
          class={`pointer-events-auto w-72 rounded border px-3 py-2 text-xs shadow-lg ${
            t.type === 'error'
              ? 'border-red-500/70 bg-slate-900/95 text-red-100'
              : 'border-emerald-500/70 bg-slate-900/95 text-emerald-100'
          }`}
        >
          <div class="flex items-center justify-between gap-2">
            <span class="font-medium">
              {t.type === 'error' ? 'Error' : 'Success'}
            </span>
            <button
              type="button"
              class="text-[10px] text-slate-400 hover:text-slate-200"
              on:click={() => (toasts = toasts.filter((x) => x.id !== t.id))}
            >
              Close
            </button>
          </div>
          <p class="mt-1 text-[11px] leading-snug">{t.message}</p>
          <div class="mt-2 h-[2px] w-full bg-slate-700/80">
            <div
              class={`${t.type === 'error' ? 'bg-red-400' : 'bg-emerald-400'} h-full toast-progress`}
            ></div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <div class="mx-auto max-w-6xl space-y-6">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-slate-100">Admin Panel</h1>
      </div>
    </header>

    {#if loadingProfile}
      <p class="text-sm text-slate-300">Loading profile...</p>
    {:else if profileError}
      <p class="text-sm text-red-400">{profileError}</p>
    {:else if !me || !me.isAdmin}
      <p class="text-sm text-red-400">Access denied. Admin privileges are required.</p>
    {:else}
      <nav class="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          class="px-3 py-1 text-xs rounded-t-md border-b-2 transition-colors"
          class:border-b-cyan-400={activeTab === 'create'}
          class:text-cyan-200={activeTab === 'create'}
          class:border-b-transparent={activeTab !== 'create'}
          class:text-slate-400={activeTab !== 'create'}
          on:click={() => (activeTab = 'create')}
        >
          Create container
        </button>

        <button
          type="button"
          class="px-3 py-1 text-xs rounded-t-md border-b-2 transition-colors"
          class:border-b-cyan-400={activeTab === 'yanix-servers'}
          class:text-cyan-200={activeTab === 'yanix-servers'}
          class:border-b-transparent={activeTab !== 'yanix-servers'}
          class:text-slate-400={activeTab !== 'yanix-servers'}
          on:click={() => {
            activeTab = 'yanix-servers';
            loadYanixServers();
          }}
        >
          Yanix servers
        </button>

        <button
          type="button"
          class="px-3 py-1 text-xs rounded-t-md border-b-2 transition-colors"
          class:border-b-cyan-400={activeTab === 'verify'}
          class:text-cyan-200={activeTab === 'verify'}
          class:border-b-transparent={activeTab !== 'verify'}
          class:text-slate-400={activeTab !== 'verify'}
          on:click={() => (activeTab = 'verify')}
        >
          User verification
        </button>

        <button
          type="button"
          class="px-3 py-1 text-xs rounded-t-md border-b-2 transition-colors"
          class:border-b-cyan-400={activeTab === 'restricted-containers'}
          class:text-cyan-200={activeTab === 'restricted-containers'}
          class:border-b-transparent={activeTab !== 'restricted-containers'}
          class:text-slate-400={activeTab !== 'restricted-containers'}
          on:click={() => (activeTab = 'restricted-containers')}
        >
          Restricted containers
        </button>

        <button
          type="button"
          class="px-3 py-1 text-xs rounded-t-md border-b-2 transition-colors"
          class:border-b-cyan-400={activeTab === 'restricted-access'}
          class:text-cyan-200={activeTab === 'restricted-access'}
          class:border-b-transparent={activeTab !== 'restricted-access'}
          class:text-slate-400={activeTab !== 'restricted-access'}
          on:click={() => (activeTab = 'restricted-access')}
        >
          Restricted access
        </button>

        <button
          type="button"
          class="px-3 py-1 text-xs rounded-t-md border-b-2 transition-colors"
          class:border-b-cyan-400={activeTab === 'patterns'}
          class:text-cyan-200={activeTab === 'patterns'}
          class:border-b-transparent={activeTab !== 'patterns'}
          class:text-slate-400={activeTab !== 'patterns'}
          on:click={() => {
            activeTab = 'patterns';
            loadCommandPatterns();
            loadContainerPatternBindings();
          }}
        >
          Command patterns
        </button>

        <button
          type="button"
          class="px-3 py-1 text-xs rounded-t-md border-b-2 transition-colors"
          class:border-b-cyan-400={activeTab === 'maintenance'}
          class:text-cyan-200={activeTab === 'maintenance'}
          class:border-b-transparent={activeTab !== 'maintenance'}
          class:text-slate-400={activeTab !== 'maintenance'}
          on:click={() => (activeTab = 'maintenance')}
        >
          Maintenance
        </button>
      </nav>

      {#if activeTab === 'create'}
        <section class="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-4">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-semibold text-slate-100">Create container</h2>
            <button
              type="button"
              class="rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-200 hover:border-cyan-400"
              on:click={refreshCreateTab}
            >
              Refresh
            </button>
          </div>

          <form class="space-y-4" on:submit|preventDefault={submitCreate}>
            <div class="grid gap-2">
              <label for="host" class="text-xs font-medium text-slate-200">Host</label>

              {#if loadingHosts}
                <p class="text-xs text-slate-400">Loading...</p>
              {:else if hostsError}
                <p class="text-xs text-red-400">{hostsError}</p>
              {:else}
                <select
                  id="host"
                  class="w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                  on:change={(e) => changeHost((e.currentTarget as HTMLSelectElement).value)}
                >
                  <option value="">— select host —</option>
                  {#each hosts as h}
                    <option value={h.hostLabel} selected={h.hostLabel === selectedHost}>
                      {h.hostLabel} ({h.ip})
                    </option>
                  {/each}
                </select>
              {/if}
            </div>

            <div class="grid gap-2">
              <label for="serverId" class="text-xs font-medium text-slate-200">server_id</label>
              <input
                id="serverId"
                type="text"
                class="w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                placeholder="srv_mc1"
                bind:value={serverId}
              />
            </div>

            <div class="grid gap-2">
              <label for="template" class="text-xs font-medium text-slate-200">Template</label>

              {#if !selectedHost}
                <p class="text-xs text-slate-500">Select a host first.</p>
              {:else if loadingTemplates}
                <p class="text-xs text-slate-400">Loading...</p>
              {:else if templatesError}
                <p class="text-xs text-red-400">{templatesError}</p>
              {:else}
                <select
                  id="template"
                  class="w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                  on:change={(e) => changeTemplate((e.currentTarget as HTMLSelectElement).value)}
                >
                  <option value="">— select template —</option>
                  {#each templates as t}
                    <option value={t.name} selected={t.name === selectedTemplate}>
                      {t.name} ({t.file})
                    </option>
                  {/each}
                </select>
              {/if}
            </div>

            <div class="grid gap-2">
              <div class="text-xs font-medium text-slate-200">Placeholders</div>

              {#if !selectedTemplate}
                <p class="text-xs text-slate-500">Select a template.</p>
              {:else if loadingPlaceholders}
                <p class="text-xs text-slate-400">Loading...</p>
              {:else if placeholdersError}
                <p class="text-xs text-red-400">{placeholdersError}</p>
              {:else if placeholders.length === 0}
                <p class="text-xs text-slate-500">No placeholders.</p>
              {:else}
                <div class="space-y-2">
                  {#each placeholders as ph}
                    <div class="grid gap-1">
                      <label class="text-[11px] font-medium text-slate-200" for={`ph-${ph}`}>
                        {ph}
                      </label>

                      {#if ph === 'SERVER_ID'}
                        <input
                          id={`ph-${ph}`}
                          type="text"
                          class="w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-400"
                          value={serverId}
                          readonly
                          disabled
                        />
                      {:else}
                        <input
                          id={`ph-${ph}`}
                          type="text"
                          class="w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                          value={placeholderValues[ph] ?? ''}
                          on:input={(e) =>
                            updatePlaceholder(ph, (e.currentTarget as HTMLInputElement).value)}
                        />
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <div class="pt-2">
              <button
                type="submit"
                class="inline-flex items-center gap-2 rounded bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isCreating}
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </section>

      {:else if activeTab === 'yanix-servers'}
        <section class="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-4">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-semibold text-slate-100">Yanix servers (A/B/C)</h2>
            <button
              type="button"
              class="rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-200 hover:border-cyan-400"
              on:click={loadYanixServers}
            >
              Refresh
            </button>
          </div>

          <div class="flex flex-wrap items-end gap-2">
            <div class="w-[120px]">
              <label class="text-[11px] font-medium text-slate-200" for="ys-hostLabel">
                hostLabel
              </label>
              <input
                id="ys-hostLabel"
                type="text"
                maxlength="1"
                class="mt-1 w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none disabled:opacity-60"
                placeholder="A"
                bind:value={newYanixHostLabel}
                disabled={editingYanixHostLabel !== null}
              />
            </div>

            <div class="flex-1 min-w-[160px]">
              <label class="text-[11px] font-medium text-slate-200" for="ys-ip">
                ip
              </label>
              <input
                id="ys-ip"
                type="text"
                class="mt-1 w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                placeholder="1.2.3.4"
                bind:value={newYanixIp}
              />
            </div>

            <div class="flex-[2] min-w-[240px]">
              <label class="text-[11px] font-medium text-slate-200" for="ys-api">
                apiBaseUrl
              </label>
              <input
                id="ys-api"
                type="text"
                class="mt-1 w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                placeholder="http://127.0.0.1:3001"
                bind:value={newYanixApiBaseUrl}
              />
            </div>

            <div class="flex-[2] min-w-[240px]">
              <label class="text-[11px] font-medium text-slate-200" for="ys-nats">
                natsUrl (optional)
              </label>
              <input
                id="ys-nats"
                type="text"
                class="mt-1 w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                placeholder="nats://127.0.0.1:4222"
                bind:value={newYanixNatsUrl}
              />
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-cyan-500"
                on:click={saveYanixServer}
              >
                {editingYanixHostLabel ? 'Save' : 'Add'}
              </button>

              {#if editingYanixHostLabel}
                <button
                  type="button"
                  class="rounded border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200 hover:border-cyan-400"
                  on:click={resetYanixServerForm}
                >
                  Cancel
                </button>
              {/if}
            </div>
          </div>

          {#if loadingYanixServers}
            <p class="text-xs text-slate-400">Loading...</p>
          {:else if yanixServers.length === 0}
            <p class="text-xs text-slate-400">No servers yet.</p>
          {:else}
            <div class="overflow-x-auto rounded border border-slate-800 bg-slate-950/40">
              <table class="min-w-full divide-y divide-slate-800 text-xs">
                <thead class="bg-slate-900/80 text-[11px] text-slate-300">
                  <tr>
                    <th class="px-3 py-2 text-left font-medium">host</th>
                    <th class="px-3 py-2 text-left font-medium">ip</th>
                    <th class="px-3 py-2 text-left font-medium">api</th>
                    <th class="px-3 py-2 text-left font-medium">nats</th>
                    <th class="px-3 py-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-800">
                  {#each yanixServers as s (s.hostLabel)}
                    <tr class="hover:bg-slate-900/60">
                      <td class="px-3 py-2 text-slate-100 font-mono">{s.hostLabel}</td>
                      <td class="px-3 py-2 text-slate-100 font-mono">{s.ip}</td>
                      <td class="px-3 py-2 text-slate-100 font-mono">{s.apiBaseUrl}</td>
                      <td class="px-3 py-2 text-slate-100 font-mono">{s.natsUrl ?? '—'}</td>
                      <td class="px-3 py-2">
                        <div class="flex gap-2">
                          <button
                            type="button"
                            class="rounded border border-slate-600 bg-slate-900/40 px-2 py-0.5 text-[11px] text-slate-100 hover:border-cyan-400"
                            on:click={() => startEditYanixServer(s)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            class="rounded border border-red-500/60 bg-red-900/20 px-2 py-0.5 text-[11px] text-red-200 hover:bg-red-900/40"
                            on:click={() => deleteYanixServer(s.hostLabel)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </section>

      {:else if activeTab === 'verify'}
        <section class="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-semibold text-slate-100">Users</h2>
            <button
              type="button"
              class="rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-200 hover:border-cyan-400"
              on:click={loadUsers}
            >
              Refresh
            </button>
          </div>

          {#if loadingUsers}
            <p class="text-xs text-slate-400">Loading...</p>
          {:else if users.length === 0}
            <p class="text-xs text-slate-400">No users yet.</p>
          {:else}
            <div class="overflow-x-auto rounded border border-slate-800 bg-slate-950/40">
              <table class="min-w-full divide-y divide-slate-800 text-xs">
                <thead class="bg-slate-900/80">
                  <tr class="text-[11px] text-slate-300">
                    <th class="px-3 py-2 text-left font-medium">Email</th>
                    <th class="px-3 py-2 text-left font-medium">Created</th>
                    <th class="px-3 py-2 text-left font-medium">Reg. IP</th>
                    <th class="px-3 py-2 text-left font-medium">Verified</th>
                    <th class="px-3 py-2 text-left font-medium">Admin</th>
                    <th class="px-3 py-2 text-left font-medium">Sessions</th>
                    <th class="px-3 py-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-800">
                  {#each users as u}
                    <tr class="hover:bg-slate-900/60">
                      <td class="px-3 py-2 text-slate-100">{u.email}</td>
                      <td class="px-3 py-2 text-slate-400">
                        {new Date(u.createdAt).toLocaleString()}
                      </td>
                      <td class="px-3 py-2 text-slate-400">{u.registrationIp ?? '—'}</td>
                      <td class="px-3 py-2">
                        <button
                          type="button"
                          class={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            u.verified
                              ? 'bg-emerald-900/40 text-emerald-300'
                              : 'bg-slate-800 text-slate-300'
                          } hover:bg-cyan-500 hover:text-slate-900`}
                          on:click={() => setVerified(u.id, !u.verified)}
                        >
                          {u.verified ? 'Yes' : 'No'}
                        </button>
                      </td>
                      <td class="px-3 py-2">
                        <button
                          type="button"
                          class={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            u.isAdmin
                              ? 'bg-indigo-900/40 text-indigo-300'
                              : 'bg-slate-800 text-slate-300'
                          } hover:bg-cyan-500 hover:text-slate-900`}
                          on:click={() => setAdminByEmail(u.email, !u.isAdmin)}
                        >
                          {u.isAdmin ? 'Yes' : 'No'}
                        </button>
                      </td>
                      <td class="px-3 py-2 text-slate-300">{u.sessions.length}</td>
                      <td class="px-3 py-2">
                        <button
                          type="button"
                          class="rounded border border-red-500/60 bg-red-900/20 px-2 py-0.5 text-[11px] text-red-200 hover:bg-red-900/40"
                          on:click={() => invalidateSessions(u.id)}
                        >
                          Reset sessions
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </section>

      {:else if activeTab === 'restricted-containers'}
        <section class="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-semibold text-slate-100">Restricted containers</h2>
            <button
              type="button"
              class="rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-200 hover:border-cyan-400"
              on:click={loadRestrictedContainers}
            >
              Refresh
            </button>
          </div>

          <div class="flex flex-wrap items-end gap-2">
            <div class="flex-1 min-w-[220px]">
              <label for="restrictedDockerId" class="text-[11px] font-medium text-slate-200">
                docker_id
              </label>
              <input
                id="restrictedDockerId"
                type="text"
                class="mt-1 w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                placeholder="docker_id..."
                bind:value={newRestrictedDockerId}
              />
            </div>
            <button
              type="button"
              class="rounded bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-cyan-500"
              on:click={addRestrictedContainer}
            >
              Add
            </button>
          </div>

          {#if loadingRestrictedContainers}
            <p class="text-xs text-slate-400">Loading...</p>
          {:else if restrictedContainers.length === 0}
            <p class="text-xs text-slate-400">Nothing here yet.</p>
          {:else}
            <div class="overflow-x-auto rounded border border-slate-800 bg-slate-950/40">
              <table class="min-w-full divide-y divide-slate-800 text-xs">
                <thead class="bg-slate-900/80 text-[11px] text-slate-300">
                  <tr>
                    <th class="px-3 py-2 text-left font-medium">docker_id</th>
                    <th class="px-3 py-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-800">
                  {#each restrictedContainers as r}
                    <tr class="hover:bg-slate-900/60">
                      <td class="px-3 py-2 text-slate-100"><code>{r.containerId}</code></td>
                      <td class="px-3 py-2">
                        <button
                          type="button"
                          class="rounded border border-red-500/60 bg-red-900/20 px-2 py-0.5 text-[11px] text-red-200 hover:bg-red-900/40"
                          on:click={() => deleteRestrictedContainer(r.containerId)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </section>

      {:else if activeTab === 'restricted-access'}
        <section class="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-semibold text-slate-100">Restricted access</h2>
            <button
              type="button"
              class="rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-200 hover:border-cyan-400"
              on:click={loadRestrictedAccess}
            >
              Refresh
            </button>
          </div>

          <div class="flex flex-wrap items-end gap-2">
            <div class="flex-1 min-w-[160px]">
              <label for="accessDockerId" class="text-[11px] font-medium text-slate-200">
                docker_id
              </label>
              <input
                id="accessDockerId"
                type="text"
                class="mt-1 w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                placeholder="docker_id..."
                bind:value={newAccessDockerId}
              />
            </div>
            <div class="flex-1 min-w-[200px]">
              <label for="accessEmail" class="text-[11px] font-medium text-slate-200">
                Email
              </label>
              <input
                id="accessEmail"
                type="email"
                class="mt-1 w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                placeholder="user@example.com"
                bind:value={newAccessEmail}
              />
            </div>
            <button
              type="button"
              class="rounded bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-cyan-500"
              on:click={addRestrictedAccess}
            >
              Grant
            </button>
          </div>

          {#if loadingRestrictedAccess}
            <p class="text-xs text-slate-400">Loading...</p>
          {:else if restrictedAccess.length === 0}
            <p class="text-xs text-slate-400">Nothing here yet.</p>
          {:else}
            <div class="overflow-x-auto rounded border border-slate-800 bg-slate-950/40">
              <table class="min-w-full divide-y divide-slate-800 text-xs">
                <thead class="bg-slate-900/80 text-[11px] text-slate-300">
                  <tr>
                    <th class="px-3 py-2 text-left font-medium">docker_id</th>
                    <th class="px-3 py-2 text-left font-medium">User</th>
                    <th class="px-3 py-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-800">
                  {#each restrictedAccess as r}
                    <tr class="hover:bg-slate-900/60">
                      <td class="px-3 py-2 text-slate-100"><code>{r.containerId}</code></td>
                      <td class="px-3 py-2 text-slate-100">{r.userEmail}</td>
                      <td class="px-3 py-2">
                        <button
                          type="button"
                          class="rounded border border-red-500/60 bg-red-900/20 px-2 py-0.5 text-[11px] text-red-200 hover:bg-red-900/40"
                          on:click={() => deleteRestrictedAccess(r)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </section>

      {:else if activeTab === 'patterns'}
        <section class="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-4">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-semibold text-slate-100">Command patterns</h2>
            <button
              type="button"
              class="rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-200 hover:border-cyan-400"
              on:click={() => {
                loadCommandPatterns();
                loadContainerPatternBindings();
              }}
            >
              Refresh
            </button>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2">
              <div class="space-y-2">
                <div>
                  <label for="patternName" class="text-[11px] font-medium text-slate-200">
                    name
                  </label>
                  <input
                    id="patternName"
                    type="text"
                    class="mt-1 w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                    placeholder="e.g.: cs2-rcon"
                    bind:value={newPatternName}
                  />
                </div>

                <div>
                  <label for="patternBody" class="text-[11px] font-medium text-slate-200">
                    pattern (JSON array)
                  </label>
                  <textarea
                    id="patternBody"
                    rows="8"
                    class="mt-1 w-full resize-none rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-100 font-mono focus:border-cyan-400 focus:outline-none overflow-auto"
                    placeholder={'Example: ["rcon-cli","-a","127.0.0.1:27015","-p","CHANGEME","{{INPUT}}"]'}
                    bind:value={newPatternBody}
                  ></textarea>
                </div>

                <button
                  type="button"
                  class="rounded bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-cyan-500"
                  on:click={saveCommandPattern}
                >
                  Save
                </button>
              </div>
            </div>

            <div class="space-y-2">
              {#if loadingCommandPatterns}
                <p class="text-xs text-slate-400">Loading...</p>
              {:else if commandPatterns.length === 0}
                <p class="text-xs text-slate-400">No patterns yet.</p>
              {:else}
                <div class="max-h-72 overflow-auto rounded border border-slate-800 bg-slate-950/40">
                  <table class="min-w-full divide-y divide-slate-800 text-xs">
                    <thead class="bg-slate-900/80 text-[11px] text-slate-300">
                      <tr>
                        <th class="px-3 py-2 text-left font-medium">name</th>
                        <th class="px-3 py-2 text-left font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800">
                      {#each commandPatterns as p}
                        <tr class="hover:bg-slate-900/60">
                          <td class="px-3 py-2 text-slate-100">
                            <code>{p.name}</code>
                          </td>
                          <td class="px-3 py-2">
                            <div class="flex gap-2">
                              <button
                                type="button"
                                class="rounded border border-slate-600 bg-slate-900/40 px-2 py-0.5 text-[11px] text-slate-100 hover:border-cyan-400"
                                on:click={() => fillPatternForm(p)}
                              >
                                Fill form
                              </button>
                              <button
                                type="button"
                                class="rounded border border-red-500/60 bg-red-900/20 px-2 py-0.5 text-[11px] text-red-200 hover:bg-red-900/40"
                                on:click={() => deleteCommandPattern(p.name)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            </div>
          </div>

          <div class="border-t border-slate-800 pt-4 space-y-3">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-[13px] font-semibold text-slate-100">
                Bind patterns to containers
              </h3>
            </div>

            <div class="flex flex-wrap items-end gap-3">
              <div class="flex-1 min-w-[200px]">
                <label for="bindingContainerId" class="text-[11px] font-medium text-slate-200">
                  docker_id
                </label>
                <input
                  id="bindingContainerId"
                  type="text"
                  class="mt-1 w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                  placeholder="docker_id..."
                  bind:value={newBindingContainerId}
                />
              </div>

              <div class="flex-1 min-w-[200px]">
                <label for="bindingPatternName" class="text-[11px] font-medium text-slate-200">
                  pattern
                </label>
                <select
                  id="bindingPatternName"
                  class="mt-1 w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                  bind:value={newBindingPatternName}
                >
                  <option value="">— select —</option>
                  {#each commandPatterns as p}
                    <option value={p.name}>{p.name}</option>
                  {/each}
                </select>
              </div>

              <button
                type="button"
                class="rounded bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-cyan-500"
                on:click={saveContainerPatternBinding}
              >
                Bind
              </button>
            </div>

            {#if loadingContainerBindings}
              <p class="text-xs text-slate-400">Loading bindings...</p>
            {:else if containerPatternBindings.length === 0}
              <p class="text-xs text-slate-400">No bindings yet.</p>
            {:else}
              <div class="overflow-x-auto rounded border border-slate-800 bg-slate-950/40">
                <table class="min-w-full divide-y divide-slate-800 text-xs">
                  <thead class="bg-slate-900/80 text-[11px] text-slate-300">
                    <tr>
                      <th class="px-3 py-2 text-left font-medium">docker_id</th>
                      <th class="px-3 py-2 text-left font-medium">pattern</th>
                      <th class="px-3 py-2 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800">
                    {#each containerPatternBindings as b (b.containerId)}
                      <tr class="hover:bg-slate-900/60">
                        <td class="px-3 py-2 text-slate-100"><code>{b.containerId}</code></td>
                        <td class="px-3 py-2 text-slate-100"><code>{b.patternName}</code></td>
                        <td class="px-3 py-2">
                          <button
                            type="button"
                            class="rounded border border-red-500/60 bg-red-900/20 px-2 py-0.5 text-[11px] text-red-200 hover:bg-red-900/40"
                            on:click={() => deleteContainerPatternBinding(b.containerId)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        </section>

      {:else if activeTab === 'maintenance'}
        <section class="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-4">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-semibold text-slate-100">Remove container</h2>
          </div>

          <div class="flex flex-wrap items-end gap-3">
            <div class="flex-1 min-w-[220px]">
              <label for="maintenanceDockerId" class="text-[11px] font-medium text-slate-200">
                docker_id
              </label>
              <input
                id="maintenanceDockerId"
                type="text"
                class="mt-1 w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                placeholder="docker_id..."
                bind:value={maintenanceDockerId}
              />
            </div>

            <button
              type="button"
              class="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed"
              on:click={removeContainer}
              disabled={maintenanceLoading}
            >
              {maintenanceLoading ? 'Removing...' : 'Remove'}
            </button>
          </div>
        </section>
      {/if}
    {/if}
  </div>
</main>
