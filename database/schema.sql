BEGIN;
CREATE TABLE IF NOT EXISTS targets (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_scraped_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS profiles (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    ig_user_id TEXT,
    followers BIGINT,
    following BIGINT,
    posts_count BIGINT,
    bio TEXT,
    full_name TEXT,
    is_private BOOLEAN,
    is_verified BOOLEAN,
    is_business BOOLEAN,
    profile_pic_url TEXT,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    shortcode TEXT NOT NULL UNIQUE,
    media_pk TEXT,
    url TEXT,
    type TEXT,
    caption TEXT,
    post_date TIMESTAMPTZ,
    likes BIGINT,
    comments_count BIGINT,
    views BIGINT,
    video_duration DOUBLE PRECISION,
    has_audio BOOLEAN,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS posts_username_idx ON posts(username);
CREATE TABLE IF NOT EXISTS scrape_errors (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    error_type TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS scrape_runs (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status TEXT,
    total_targets INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0
);
COMMIT;
