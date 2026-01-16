![Yanix Panel](./header.png)

## Requirements

- **Docker Engine v27+** (cgroup v2 required)
- **OS:** Debian / Ubuntu
- **MySQL 8.0+**
- **acl** package (`apt-get install acl`)
- Basic Docker knowledge

## Installation

> **Please read this section from start to finish before running any commands.**

### Preparation stage

1. Install **MySQL 8.0+**
2. Create a **database**
3. Create a **MySQL user** with **full privileges** on that database  
   (save the database name, username, and password — you will need them)
4. Install `acl` if not installed

   ```bash
   sudo apt-get install -y acl
   ```

### Step 1 — Run the installer

1. Download `install.sh`
2. Make it executable and run it:

   ```bash
   chmod +x install.sh
   sudo ./install.sh
   ```

### Step 2 — Start the Docker Compose stack

1. Go to the Yanix core directory (startup files are stored here):

   ```bash
   cd /var/yanix/core
   ```
2. If needed, edit the startup/config files in this directory.
3. Start the stack:

   ```bash
   docker compose up -d
   ```
4. Wait until services are up.

### Step 3 — Register and enable your admin user

1. Open the panel in your browser and register:

   ```
   http://<server-ip>:3001
   ```

2. Connect to MySQL, find the `User` table, then **verify** your user and **grant admin**:

   ```sql
   UPDATE `User` SET isAdmin = 1 WHERE email = 'YourEmail@example.com';
   UPDATE `User` SET verified = 1 WHERE email = 'YourEmail@example.com';
   ```

3. Now you can sign in to the panel.

### Step 4 — Add the host in Admin Zone

1. Click the menu icon in the top-right corner and click **Admin**
2. Find the **Yanix Servers** section and add a server with these values:

* `hostLabel`: `A`
* `ip`: `yanix-api`
* URL: `http://yanix-api:8080`

3. Click **Add**

### Step 5 — Installation is complete.

Note: Now you can verify users using the admin panel

## How to add a container

### Option 1 — Add Yanix labels to your Docker Compose service

Add **two labels** to any container. Example:

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

**Notes**

* Do **not** edit `com.yanix.role: "yanix-server"` label
* Recommendation: Always set `com.yanix.server_id` to your container name (example: `"testcounter"`)


Start the container, and it should appear in the Yanix web panel.

### Option 2 - create templates

Soon...
