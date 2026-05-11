# photo-voter

Hot-or-not style photo voting app. Photos are pulled from a Google Photos album and presented one at a time. Authenticated users vote **Good** (green), **Mid** (grey), or **Bad** (red). Admins see a ranked leaderboard based on aggregate scores.

**Stack:** Go Fiber v3 · React 19 + Vite 6 · PostgreSQL 17 · Docker Compose

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker + Compose plugin)
- A Google account with a Google Photos album you own

No local Go or Node installation required — everything runs in containers.

---

## Quick start

```bash
# 1. Copy env template
cp .env.example .env

# 2. Fill in JWT_SECRET and Google credentials (see below)
$EDITOR .env

# 3. Start everything
make dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

On first boot the backend runs database migrations automatically.

---

## Google Cloud setup

You need a Google Cloud project with the Photos Library API enabled and OAuth 2.0 credentials. Do this once.

### 1 — Create a project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown → **New Project** → name it (e.g. `photo-voter`) → **Create**

### 2 — Enable the Photos Library API

1. In the left menu go to **APIs & Services → Library**
2. Search for **Google Photos Library API** → click it → **Enable**

### 3 — Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. User type: **External** → **Create**
3. Fill in the required fields (App name, support email — any values are fine for personal use)
4. On the **Scopes** step, click **Add or remove scopes** and add:
   ```
   https://www.googleapis.com/auth/photoslibrary.readonly
   ```
5. On the **Test users** step, add your own Google account email
6. Save and continue through to the end

> The app stays in "Testing" mode, which is fine — only listed test users can authorize it.

### 4 — Create OAuth credentials

1. Go to **APIs & Services → Credentials** → **Create Credentials → OAuth client ID**
2. Application type: **Web application**
3. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:3000/api/admin/auth/google/callback
   ```
4. Click **Create**
5. Copy the **Client ID** and **Client secret** into your `.env`:
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```

### 5 — Find your album ID

1. Open [photos.google.com](https://photos.google.com) and navigate to the album you want to use
2. The URL looks like:
   ```
   https://photos.google.com/u/0/album/AF1QipN...
   ```
3. The album ID is everything after `/album/` — copy it into your `.env`:
   ```
   GOOGLE_ALBUM_ID=AF1QipN...
   ```

> `GOOGLE_ALBUM_ID` in `.env` is only used to seed the database on first boot. After that you can change it any time through the Admin UI without restarting the server.

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

Log out and back in — the admin JWT takes effect on the next login, and **Admin** / **Rankings** links will appear in the header.

### 3 — Connect Google Photos

1. Go to http://localhost:5173/admin
2. Click **Connect Google Photos**
3. Choose your Google account and grant read-only access
4. You'll be redirected back to the admin page with a confirmation

### 4 — Sync your album

On the admin page, click **Sync Album Now**. The backend fetches every photo from the configured album and stores its metadata. You'll see a count like "Synced 84 photos".

> Re-run sync any time you add photos to the album.

---

## Admin panel (`/admin`)

Accessible only to admin users.

| Section | What it does |
|---|---|
| **Google Photos Connection** | Shows OAuth status. Click to (re-)authorize. |
| **Album** | Change which album photos are pulled from. Save writes to the DB immediately. |
| **Sync** | Pulls fresh photo metadata from the current album. Safe to run repeatedly — existing photos are updated, not duplicated. |

---

## Voting

- Photos are shown in random order, one at a time
- Each user sees each photo exactly once (votes are tracked per user per photo)
- **Good** (+1) · **Mid** (0) · **Bad** (−1)
- After voting on all photos, you see a completion screen

---

## Rankings (`/rankings`)

Admin-only. Photos are ordered by aggregate score (sum of all votes). Score is shown with a vote count so you can judge statistical weight.

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

> **After editing `.env`** run `docker compose up -d` (not `docker compose restart`) — `restart` keeps the old container config and won't pick up new environment variables.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | postgres://... | PostgreSQL connection string |
| `JWT_SECRET` | *(required)* | Secret for signing JWTs — use a long random string |
| `GOOGLE_CLIENT_ID` | — | OAuth 2.0 client ID from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | — | OAuth 2.0 client secret |
| `GOOGLE_ALBUM_ID` | — | Album ID to seed on first boot (optional if set via Admin UI) |
| `GOOGLE_REDIRECT_URL` | `http://localhost:3000/...` | Must match the redirect URI registered in Google Cloud |
| `FRONTEND_URL` | `http://localhost:5173` | Used to redirect back after Google OAuth |
| `PORT` | `3000` | Backend listen port |

---

## Photo URL expiry

Google Photos base URLs expire after roughly one hour. The backend stores the expiry time alongside each URL and transparently refreshes it when serving the next photo to a voter. No action is required on your part.
