# Running this bot 24/7 on a DigitalOcean droplet

The bot must run on a machine that never sleeps — a laptop that closes its lid misses
slots. A €/$6–12 droplet is plenty (the bot is network-bound, not CPU-bound).

**Note:** you have already deployed this app on Emergent
(https://live-crypto-feed-2.emergent.host), which also runs 24/7. Use DigitalOcean only
if you specifically want your own server, your own IP for CoinDCX IP-whitelisting, and
full shell access.

## 1. Create the droplet
- Ubuntu 24.04 LTS, Basic plan, 1–2 GB RAM, region **Bangalore (BLR1)** — lowest latency
  to CoinDCX, which matters for limit-order fills.
- Add your SSH key. Note the droplet's public IP.
- In the CoinDCX API dashboard, whitelist that IP on your key.

## 2. Install the runtime
```bash
ssh root@YOUR_DROPLET_IP
apt update && apt install -y python3.11 python3.11-venv nginx git curl mongodb-org supervisor
# If mongodb-org is not found, add MongoDB's apt repo first (docs.mongodb.com), or use
# a free MongoDB Atlas cluster and skip installing Mongo locally.
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs
npm install -g yarn
```

## 3. Get the code onto the box
Push this project to GitHub from Emergent (the "Save to GitHub" button), then:
```bash
cd /opt && git clone https://github.com/YOU/YOUR_REPO.git app && cd app
```

## 4. Backend
```bash
cd /opt/app/backend
python3.11 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

cat > .env <<'EOF'
MONGODB_URI="mongodb://localhost:27017"
DB_NAME="cryptobot"
CORS_ORIGINS="*"
COINDCX_BASE_URL=https://api.coindcx.com
# Add CoinDCX credentials after login through the app's API Keys dialog.
# Keep the live-trading toggle off until validation is complete.
EOF
```

## 5. Frontend build
```bash
cd /opt/app/frontend && yarn install && yarn build   # static files land in dist/
```

## 6. Keep it alive with supervisor
```bash
cat > /etc/supervisor/conf.d/cryptobot.conf <<'EOF'
[program:backend]
command=/opt/app/backend/.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 1
directory=/opt/app/backend
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
stderr_logfile=/var/log/cryptobot.err.log
stdout_logfile=/var/log/cryptobot.out.log
EOF
supervisorctl reread && supervisorctl update && supervisorctl status
```
**Use exactly one worker.** The scheduler lives inside the process, so two workers means
two bots and duplicate orders. Never add `--reload` in production.

## 7. Nginx: serve the UI and proxy /api (WebSockets included)
```bash
cat > /etc/nginx/sites-available/cryptobot <<'EOF'
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    root /opt/app/frontend/dist;
    index index.html;
    location / { try_files $uri /index.html; }

    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;      # required for /api/ws
        proxy_set_header Connection "upgrade";        # required for /api/ws
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF
ln -sf /etc/nginx/sites-available/cryptobot /etc/nginx/sites-enabled/cryptobot
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```
The two `Upgrade`/`Connection` lines are the ones people forget — without them the live
table, log console and position monitor silently stop updating.

## 8. HTTPS + firewall (do this before adding API keys)
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your.domain            # needs a domain pointed at the droplet
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```
Never enter API keys over plain HTTP.

## 9. Turn the bot on
1. Open `https://your.domain/bot`
2. **API Keys** → paste key + secret → Save
3. Same dialog → **Go live** (this is the kill switch; it stays off until you press it)
4. Create a strategy, arm it, switch the bot ON
5. Watch `/position` and `/history`

## 10. Operating notes
- Logs: `tail -f /var/log/cryptobot.err.log`; restart with `supervisorctl restart backend`.
- Mongo backup: `mongodump --db cryptobot --out /root/backup-$(date +%F)` in a daily cron.
- Set the droplet clock to UTC and leave it — the bot converts to IST itself.
- Update after a code change: `git pull && supervisorctl restart backend`, plus
  `cd frontend && yarn build` if the UI changed.
- Enable DigitalOcean monitoring alerts on CPU/memory so you notice a wedged box.
- Keep the daily trade cap and the ₹40,000 per-trade cap while you build confidence.
