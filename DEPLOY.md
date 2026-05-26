# Deployment guide (Ubuntu VPS)

Tested on Ubuntu 22.04 / 24.04 with at least 2 GB RAM and 3 GB free disk.

The deploy is **additive** — if your VPS already serves another site on
ports 80/443, this app gets its own port (default `8080`) and doesn't
touch the existing nginx config.

---

## Quick reference — what you get

| URL | What |
|---|---|
| `http://<vps-ip>:8080/` | The React app |
| `http://<vps-ip>:8080/api/docs` | FastAPI Swagger UI |

Default login: `admin@retail.local` / `demo1234`

---

## First-time deploy

### 1. SSH into the VPS as root

```bash
ssh root@<vps-ip>
```

If you've never logged in: change the root password (`passwd`) and
consider switching to SSH-key auth before going further.

### 2. Clone the repo

```bash
git clone https://github.com/fahalsalam/DEMAND_FORECAST.git /opt/demand-forecast
cd /opt/demand-forecast
```

> If the repo is private, set up a deploy key first
> (see [private-repo notes](#private-repo-notes) at the bottom).

### 3. Run the installer

```bash
sudo bash deploy/deploy.sh
```

What it does (idempotent — safe to re-run):

1. Installs Python 3.11 (from deadsnakes PPA), build tools, nginx, node 20
2. Creates a non-root `demandapp` user
3. Sets up the Python venv + installs all backend dependencies
4. Compiles cmdstan for Prophet (one-time, ~3 min)
5. Seeds the database with 30 demo SKUs + 2 years of sales (only if empty)
6. Builds the React production bundle
7. Installs a `systemd` unit for the FastAPI backend (auto-restart on crash)
8. Adds an nginx vhost on port 8080 (doesn't touch existing `:80`/`:443`)

Total time: ~10–15 min, mostly unattended.

### 4. Open the app

```
http://<vps-ip>:8080/
```

Sign in with `admin@retail.local` / `demo1234`.

---

## Re-deploying after a code change

On your laptop:

```bash
git add -A && git commit -m "..." && git push
```

On the VPS:

```bash
cd /opt/demand-forecast
git pull
sudo bash deploy/redeploy.sh
```

`redeploy.sh` just rebuilds the frontend and restarts the backend (~30–60s).

---

## Useful operational commands

```bash
# Status / logs
systemctl status demand-forecast
journalctl -u demand-forecast -f          # live logs
journalctl -u demand-forecast -n 100      # last 100 lines

# Restart manually
systemctl restart demand-forecast

# Nginx reload after a config edit
nginx -t && systemctl reload nginx

# Where things live
ls /opt/demand-forecast/                  # app code
ls /etc/systemd/system/demand-forecast.service
ls /etc/nginx/sites-enabled/demand-forecast
```

---

## Switching to a domain + HTTPS

Once you have a domain (e.g. `demand.example.com`) pointing at the VPS:

```bash
# 1. Install certbot
apt-get install -y certbot python3-certbot-nginx

# 2. Edit the vhost to listen on :80 and add server_name
sed -i 's/listen 8080/listen 80/' /etc/nginx/sites-available/demand-forecast
sed -i 's/server_name _;/server_name demand.example.com;/' /etc/nginx/sites-available/demand-forecast

# 3. Reload nginx
nginx -t && systemctl reload nginx

# 4. Update the frontend API base + rebuild
echo "VITE_API_BASE=https://demand.example.com/api" > /opt/demand-forecast/frontend/.env.production
cd /opt/demand-forecast/frontend && sudo -u demandapp npm run build

# 5. Run certbot — it edits the vhost in place and adds a 443 server block
certbot --nginx -d demand.example.com
```

Cert auto-renews via a systemd timer that certbot installs.

---

## Private-repo notes

If your GitHub repo is private, generate a deploy key on the VPS:

```bash
ssh-keygen -t ed25519 -C "vps@demand-forecast" -f /root/.ssh/demand_deploy_key -N ""
cat /root/.ssh/demand_deploy_key.pub
```

Copy the printed key, then on GitHub:
**repo → Settings → Deploy keys → Add deploy key** → paste it
(leave "Allow write access" UNchecked).

Tell SSH to use this key when cloning:

```bash
cat >> /root/.ssh/config <<'EOF'
Host github.com
  IdentityFile /root/.ssh/demand_deploy_key
  StrictHostKeyChecking no
EOF
chmod 600 /root/.ssh/config
```

Now clone using the SSH URL:

```bash
git clone git@github.com:fahalsalam/DEMAND_FORECAST.git /opt/demand-forecast
```

Future `git pull`s on the VPS work without any password prompt.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `pmdarima` build fails | You're on Python 3.12. Re-run deploy.sh (it installs 3.11 explicitly) |
| `OSError: libomp.dylib` (we're on Linux though) | Run `apt-get install -y libomp-dev` (deploy.sh does this) |
| Frontend loads but API calls fail | Check `journalctl -u demand-forecast -n 50` — usually a stale `.env.production` value |
| Port 8080 already in use | Change `SITE_PORT=` at the top of `deploy/deploy.sh` and re-run |
| Nginx complains about duplicate `default_server` | Edit `/etc/nginx/sites-available/demand-forecast` and remove `default_server` from the `listen` line, then reload nginx |
