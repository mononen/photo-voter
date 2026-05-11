# photo-voter

Hot-or-not style photo voting app. An admin selects photos from Google Photos via a picker UI; authenticated users vote **Good** (green) · **Mid** (grey) · **Bad** (red) on each photo one at a time. Once a user has voted on every photo they can view the ranked leaderboard.

**Stack:** Go Fiber v3 · React 19 + Vite 6 · PostgreSQL 17 · Docker Compose

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker + Compose plugin)
- A Google account with photos you want to vote on

No local Go or Node installation required — everything runs in containers.

---

## Quick start

```bash
# 1. Copy env template
cp .env.example .env

# 2. Fill in JWT_SECRET and Google credentials (see setup below)
$EDITOR .env

# 3. Start everything
make dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

Database migrations run automatically on first boot.

---

## Google Cloud setup

You need a Google Cloud project with the **Photos Picker API** enabled and OAuth 2.0 credentials. Do this once.

### 1 — Create a project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Project dropdown → **New Project** → name it (e.g. `photo-voter`) → **Create**

### 2 — Enable the Photos Picker API

1. **APIs & Services → Library**
2. Search **Google Photos Picker API** → click it → **Enable**

> This is the **Picker** API (`photospicker.googleapis.com`), not the deprecated Photos Library API.

### 3 — Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**
2. User type: **External** → **Create**
3. Fill in app name and support email (any values work for personal use)
4. On the **Scopes** step → **Add or remove scopes** → search `photospicker` → add:
   ```
   https://www.googleapis.com/auth/photospicker.mediaitems.readonly
   ```
5. On the **Test users** step, add your own Google account email
6. Save through to the end

> The app stays in **Testing** mode — only listed test users can authorize it, which is fine for personal use.

### 4 — Create OAuth credentials

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Application type: **Web application**
3. Under **Authorized redirect URIs** add:
   ```
   http://localhost:3000/api/admin/auth/google/callback
   ```
4. Click **Create**, copy the **Client ID** and **Client secret** into `.env`:
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```

---

## First-time setup sequence

After filling in `.env` and running `make dev`:

### 1 — Register your account

Visit http://localhost:5173/register and create your account.

### 2 — Make yourself an admin

```bash
docker compose exec postgres psql -U photovoter -c \
  "UPDATE users SET is_admin=true WHERE email='your@email.com';"
```

Log out and back in — the **Admin** and **Rankings** links appear in the header once the new JWT is issued.

### 3 — Connect Google Photos

1. Go to http://localhost:5173/admin
2. Click **Connect Google Photos**
3. Sign in with the Google account that owns the photos and grant access
4. You'll be redirected back to `/admin` with a confirmation banner

The connection status and the authorized account email are shown in the admin panel.

### 4 — Add photos

1. Click **Open Photo Picker** — Google's native picker opens in a new browser tab
2. Select the photos you want in the voting pool (across any album or your whole library), then click **Done** in the picker
3. Come back to the admin tab — the page polls automatically and lights up **Import Selected Photos** once you're done
4. Click **Import Selected Photos** — photos are fetched and stored in the database

> **Picker session limit:** Google limits each picker session to 2,000 photos. To add more than 2,000 photos, run the picker multiple times — each import is additive, not a replacement.

---

## Admin panel (`/admin`)

Accessible only to admin users.

| Section | What it does |
|---|---|
| **Google Photos Connection** | Shows OAuth status and the authorized account email. Click to (re-)authorize. |
| **Add Photos** | Opens a Google Photos picker session. The page polls for completion and offers an Import button once photos are selected. |
| **Photo Pool** | Shows the current photo count. **Clear All Photos** wipes all photos and their votes (with confirmation). |

---

## Voting

Photos are served one at a time. The order is determined by a coverage-maximising algorithm:

1. **Never repeat** — a user never sees a photo they've already voted on
2. **Zero-vote photos first** — photos with no votes from *any* user are shown before photos that already have votes, ensuring maximum coverage across the pool
3. **Least-voted next** — once every photo has at least one vote, photos with the fewest total votes are prioritised
4. **Random tiebreaking** — within each priority tier, order is random

Voting options: **Good** (+1) · **Mid** (0) · **Bad** (−1)

After voting on every photo in the pool, the user sees a completion screen with a link to the rankings.

---

## Rankings (`/rankings`)

Photos ranked by aggregate score (sum of all votes), with vote count shown alongside each score so you can assess statistical weight.

**Access rules:**
- **Admins** can view rankings at any time
- **Regular users** can only access rankings after voting on every photo in the pool — navigating to `/rankings` before finishing redirects back to the voting page

**Lightbox:** Click any photo in the grid to open it fullscreen. The lightbox shows the full image, rank, score, vote count, and filename. Navigate with the ‹ › arrow buttons or keyboard ← → keys. Close with the × button or Escape.

---

## Photo serving

Google Photos Picker URLs require an authorization header and cannot be loaded directly in browser `<img>` tags. The backend proxies all images through `GET /api/photos/:id/image` using the stored OAuth token. The frontend always references photos via this endpoint.

Photo URLs stored in the database expire after roughly one hour. If a photo fails to load (broken image), re-running the picker and importing the same photos will refresh the stored URLs.

---

## Production deployment

Use `docker-compose.prod.yml`. It assumes you have a reverse proxy (nginx, Caddy, Traefik, etc.) handling TLS and routing on the host.

### 1 — Build images

```bash
# Backend
docker build -t your-registry/photo-voter-backend:latest ./backend

# Frontend — VITE_API_URL left empty so nginx proxies /api/ to the backend internally
docker build --target production \
  --build-arg VITE_API_URL= \
  -t your-registry/photo-voter-frontend:latest \
  ./frontend
```

Push both to your registry, fill in the `image:` fields in `docker-compose.prod.yml`.

### 2 — Create a production `.env`

```bash
cp .env.example .env
```

Set real values for everything, in particular:
- `POSTGRES_PASSWORD` — matches what's in `DATABASE_URL`
- `JWT_SECRET` — long random string
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URL` — your production callback URL, e.g. `https://yourdomain.com/api/admin/auth/google/callback`
- `FRONTEND_URL` — your production frontend URL, e.g. `https://yourdomain.com`

Also add `https://yourdomain.com/api/admin/auth/google/callback` as an **Authorized redirect URI** in Google Cloud Console.

### 3 — Start

```bash
docker compose -f docker-compose.prod.yml up -d
```

The frontend container listens on `127.0.0.1:5173`. Point your reverse proxy at that port for your domain.

### How requests flow

```
browser → reverse proxy (TLS) → frontend nginx :80
                                       ↓
                               /api/* → backend :3000
                               /*     → index.html (SPA)
```

The frontend nginx container proxies all `/api/` traffic to the backend container directly over the internal Docker network — your reverse proxy only needs to know about the frontend.

> **VITE_API_URL alternative:** If your reverse proxy routes the backend separately (e.g. `api.yourdomain.com`), build the frontend with `--build-arg VITE_API_URL=https://api.yourdomain.com` instead, and remove the `/api/` proxy block from `frontend/nginx.conf`.

---

## Development

```bash
make dev          # docker compose up --build (rebuilds changed images)
make build        # build images without starting
make down         # stop and remove containers
make logs         # tail logs for all services

# Dependency management (runs inside temp containers — no local Go/Node needed)
make tidy         # go mod tidy → regenerates go.sum
make npm-install  # npm install → regenerates package-lock.json
```

The frontend Vite dev server hot-reloads changes to `frontend/src/` instantly. Backend changes require `make dev` to rebuild the Go binary.

> **After editing `.env`** run `docker compose up -d` (not `docker compose restart`) — `restart` preserves the old container environment and won't pick up new values.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgres://photovoter:photovoter@postgres:5432/photovoter` | PostgreSQL connection string |
| `JWT_SECRET` | *(required)* | Secret for signing JWTs — use a long random string |
| `GOOGLE_CLIENT_ID` | — | OAuth 2.0 client ID from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | — | OAuth 2.0 client secret |
| `GOOGLE_REDIRECT_URL` | `http://localhost:3000/api/admin/auth/google/callback` | Must match the redirect URI registered in Google Cloud |
| `FRONTEND_URL` | `http://localhost:5173` | Used to redirect back to the admin page after Google OAuth |
| `PORT` | `3000` | Backend listen port |
