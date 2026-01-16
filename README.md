![Yanix Panel](./header.png)

# Yanix — Web Panel for Docker Containers (Local & Remote)

Yanix is a lightweight web panel that lets you manage Docker containers through a browser — including containers running on **other servers**. It’s designed for teams that want a simple “single pane of glass” for container operations and user management.

> **Important:** Please **read this README fully from top to bottom** before running any commands. Some steps (MySQL + user verification) are required for a successful first login.

---

## Key Features

- Web UI for managing Docker containers
- Ability to connect and manage containers on **multiple servers**
- Admin zone for server registry and user management
- Container discovery via **Docker labels** (simple integration with your existing `docker compose` stacks)

---

## Requirements

### System
- **OS:** Debian / Ubuntu
- **Docker:** `v27+` (**cgroup v2 required**)
- **MySQL:** `8.0+`
- **acl package:** `sudo apt-get install acl`
- Basic understanding of Docker and Docker Compose

### Notes
- Docker must be running with **cgroup v2** enabled.
- Ensure ports are reachable as needed (see “Networking” below).

---

## Networking

Default components and ports:
- **Web panel:** `http://<server-ip>:3001`
- **API:** `http://yanix-api:8080` (typically internal to the Docker network)

If you expose the panel publicly, use a firewall and/or a reverse proxy with TLS (recommended).

---

## Installation

### Preparation (must be done first)

1. **Install MySQL 8.0+**
2. **Create a database**
3. **Create a MySQL user** with **full privileges** on that database  
   Save these credentials — you will need them during setup.
4. Install ACL if not installed:
   ```bash
   sudo apt-get update
   sudo apt-get install -y acl
````

---

### Step 1 — Download and run the installer

1. Download `install.sh`
2. Run:

   ```bash
   chmod +x install.sh
   sudo ./install.sh
   ```

---

### Step 2 — Start Yanix via Docker Compose

After installation, the runtime files are located here:

```bash
cd /var/yanix/core
```

* This directory contains the launch/configuration files.
* Review and edit configuration if needed, then start the stack:

```bash
docker compose up -d
```

Wait until containers are up and healthy.

Tip for logs:

```bash
docker compose logs -f
```

---

### Step 3 — Register in the web UI and grant admin + verification in MySQL

1. Open the panel:

   * `http://<ip>:3001`

2. Register a user account via the UI.

3. Then in MySQL, locate the `User` table and mark your account as **admin** and **verified**:

```sql
UPDATE `User` SET isAdmin = 1 WHERE email = 'YourEmail@example.com';
UPDATE `User` SET verified = 1 WHERE email = 'YourEmail@example.com';
```

Now you can log in to the panel with full privileges.

---

### Step 4 — Add the local Yanix Server in Admin Zone

1. Click the **menu icon** in the **top-right**
2. Go to the **Admin zone**
3. Open **Yanix Servers**
4. Add a record with:

* `hostLabel`: `A`
* `ip`: `yanix-api`
* `http`: `http://yanix-api:8080`

Click **Add**.

---

### Step 5 — Done

Installation is complete.

From the admin panel, you can:

* Create/manage containers (depending on your deployment model)
* Verify users
* Operate connected Yanix servers

---

## Adding a Container (Label-Based Discovery)

Yanix discovers/manages containers using Docker labels.

### Option 1 — Add labels to your `docker compose`

Add **two labels** to a service:

* `com.yanix.role: "yanix-server"` **must not be changed**
* `com.yanix.server_id: "<id>"` should usually match the container name (recommended)

<details>
  <summary><strong>Example docker-compose service (click to expand)</strong></summary>

```yaml
services:
  testcounter:
    image: alpine:3.20
    container_name: testcounter
    labels:
      com.yanix.role: "yanix-server"
      com.yanix.server_id: "testcounter"
    command: >
      sh -c 'i=0; while :; do i=$$((i+1)); printf "%d ..\n" "$$i"; sleep 1; done'
    restart: unless-stopped
```

</details>
