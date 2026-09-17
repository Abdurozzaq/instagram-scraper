# Instagram Scraper

Smart Instagram scraper with two-phase approach for efficient data collection.

Dokumentasi lengkap berbahasa Indonesia: [Panduan HTML project](docs/project-guide.html).
Unduh atau buka file HTML tersebut langsung di browser untuk membaca teknologi,
metode scraping, alur kode, dan langkah penggunaan.

## Features

- **Phase 1 (Light)**: Scrape basic post data (likes, comments, caption) - ~3 requests per user
- **Phase 2 (Views)**: Fetch views for reels/videos only - 1 request per reel
- Session from local browser (Zen Browser)
- PostgreSQL database storage
- Next.js web UI for management
- Smart retry for failed scrapes
- Configurable delays to avoid rate limits

## Requirements

- Python 3.10+
- Node.js 18+
- PostgreSQL
- Zen Browser (for session)

## Setup

### 1. Python Environment

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install --use-feature=truststore -r requirements.txt
```

### 2. Database

Local Windows setup uses PostgreSQL 17 at `127.0.0.1:5433`, database
`ins_loader`, and application user `instagram_app`. Credentials are stored in
`.env` (Python) and `web/.env.local` (Next.js); keep their PG settings in sync.
These files are ignored by Git. `.env.example` documents the settings.

The local cluster is stored in `.local/pgdata`. After restarting Windows, start it
from the project root:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe' -D .local/pgdata -l .local/postgres.log -o '-h 127.0.0.1 -p 5433' -w start
```

Stop it when needed:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe' -D .local/pgdata -m fast -w stop
```

The cluster administrator is `postgres`; its generated password is in
`.local/admin-password.txt`. The application uses its own non-superuser account.
The schema is in `database/schema.sql`; it can be reapplied using psql with
`-v ON_ERROR_STOP=1 -f database/schema.sql` while connected as the database owner.

On a fresh machine, create the database and its owner first, apply the schema,
then copy `.env.example` to `.env` and `web/.env.local` and fill in the credentials.

For Instagram login on Windows, set `INSTAGRAM_SESSIONID` in the root `.env`
to your own Instagram browser session cookie. Without this value the scraper
falls back to the original Linux Zen Browser cookie path.

### 3. Web UI

```bash
cd web
npm install
npm run dev
```

If npm reports a certificate error on Windows with Node.js 24, run
`$env:NODE_USE_SYSTEM_CA = '1'` in PowerShell before `npm install`.

Open http://localhost:3000

On Windows, use `.\venv\Scripts\python.exe` instead of `python` for the CLI
examples below (or activate the virtual environment first).

## Usage

### Via Web UI

1. Add target usernames
2. Click "Phase 1" to scrape basic data
3. Click "Phase 2" to fetch views for reels
4. Use "Retry" for failed accounts

### Via CLI

```bash
# Phase 1 - all active targets
python scraper.py phase1

# Phase 2 - views for reels
python scraper.py phase2

# Full (both phases)
python scraper.py full

# Retry failed
python scraper.py retry

# Specific users
python scraper.py user1 user2
```

## Delays

- Between accounts: 55-120 seconds
- Between reels (Phase 2): 2-4 seconds
- On rate limit: 120 seconds

## Database Schema

- `targets` - usernames to scrape
- `profiles` - user profile info
- `posts` - post metrics
- `scrape_errors` - error logs
- `scrape_runs` - scrape history
