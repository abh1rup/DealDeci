# DealDeci Docker Deployment

## Files

```
docker/
  Dockerfile.frontend   — Nginx serving static files, proxies API to backend
  Dockerfile.backend    — Node.js API server
  nginx.conf            — Nginx reverse proxy config
  DEPLOY.md             — This file

Dockerfile              — All-in-one single container (alternative)
docker-compose.yml      — 3-tier orchestration (recommended)
.env.example            — Template for environment variables
```

---

## Option A: 3-Tier (Recommended)

Frontend (nginx:80) → Backend (node:3000) → Data (volume)

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/abh1rup/DealDeci.git
cd DealDeci

# 2. Create your .env file
cp .env.example .env
# Edit .env — set your ANTHROPIC_API_KEY, ADMIN_USER, ADMIN_PASS

# 3. Build and run
docker compose up --build -d

# 4. Open browser
open http://localhost
```

### Manage

```bash
docker compose logs -f          # View logs
docker compose down              # Stop
docker compose down -v           # Stop + delete all data
docker compose up -d --build     # Rebuild after code changes
```

### Architecture

| Container | Image | Port | Role |
|-----------|-------|------|------|
| dealdeci-frontend | nginx:alpine | 80→80 | Serves HTML/CSS/JS, proxies /api |
| dealdeci-backend | node:20-alpine | (internal 3000) | API, AI calls, file generation |
| dealdeci-data | (volume) | — | Persists output/, runs.json, users.json |

---

## Option B: Single Container

One container runs everything on port 3000.

```bash
# Build
docker build -t dealdeci .

# Run
docker run -d \
  --name dealdeci \
  -p 3000:3000 \
  --env-file .env \
  -v dealdeci-data:/data \
  dealdeci

# Open browser
open http://localhost:3000
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| ANTHROPIC_API_KEY | Yes | — | Your Anthropic API key |
| ADMIN_USER | No | admin | Login username |
| ADMIN_PASS | No | dealdeci2026 | Login password |
| SESSION_SECRET | No | (auto) | Session encryption key |
| PORT | No | 3000 | Backend port |
| OUTPUT_DIR | No | /data/output | Where generated files are saved |
| RUNS_FILE | No | /data/runs.json | Run history persistence |
| USERS_FILE | No | /data/users.json | User profile persistence |

---

## Deploy to Another Machine

1. Copy these files to the target machine:
   - `docker/` folder
   - `docker-compose.yml`
   - `Dockerfile`
   - `backend/` folder
   - `frontend/` folder
   - `.env` (create from .env.example)

2. Install Docker on the target machine

3. Run: `docker compose up --build -d`

4. Access: `http://<machine-ip>`

---

## Data Persistence

All data lives in the Docker volume `dealdeci-data`:
- `/data/output/` — Generated PPTX/DOCX files
- `/data/runs.json` — Analysis run history
- `/data/users.json` — User profiles

To back up: `docker run --rm -v dealdeci-data:/data -v $(pwd):/backup alpine tar czf /backup/dealdeci-backup.tar.gz /data`

To restore: `docker run --rm -v dealdeci-data:/data -v $(pwd):/backup alpine tar xzf /backup/dealdeci-backup.tar.gz -C /`
