# Instagram Scraper

Smart Instagram scraper with two-phase approach for efficient data collection.

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

```bash
python -m venv venv
source venv/bin/activate
pip install instagrapi psycopg2-binary
```

### 2. Database

Create PostgreSQL database and update `DB_CONFIG` in `scraper.py`.

### 3. Web UI

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000

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
