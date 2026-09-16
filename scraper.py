#!/usr/bin/env python3
import json
import time
import sqlite3
import shutil
import tempfile
import os
import random
import psycopg2
from datetime import datetime
from pathlib import Path
from instagrapi import Client
from instagrapi.exceptions import LoginRequired, ClientError, PleaseWaitFewMinutes

# Paths
BASE_DIR = Path(__file__).parent
STATUS_FILE = BASE_DIR / "scrape_status.json"

# Database config
DB_CONFIG = {
    "host": "217.216.72.172",
    "port": 41828,
    "user": "mooboard",
    "password": "MooBoard123!",
    "database": "ins_loader"
}

DELAY_BETWEEN_POSTS = (2, 4)
DELAY_BETWEEN_ACCOUNTS = (55, 120)
DELAY_ON_RATE_LIMIT = 120


def update_status(status):
    status["timestamp"] = datetime.now().isoformat()
    with open(STATUS_FILE, "w") as f:
        json.dump(status, f, indent=2)


class InstagramScraper:
    def __init__(self):
        self.client = None
        self.db_conn = None
        self.progress = {
            "phase": None,
            "queued": [],
            "success": [],
            "failed": [],
            "current": None
        }

    def connect_db(self):
        self.db_conn = psycopg2.connect(**DB_CONFIG)
        return self.db_conn

    def get_sessionid(self):
        db_path = Path.home() / ".var/app/app.zen_browser.zen/.zen/ugeu0vmz.Default (release)/cookies.sqlite"
        if not db_path.exists():
            print("[-] Zen browser cookies not found")
            return None

        temp_db = tempfile.mktemp(suffix=".sqlite")
        shutil.copy2(db_path, temp_db)
        conn = sqlite3.connect(temp_db)
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM moz_cookies WHERE host LIKE '%instagram.com' AND name = 'sessionid'")
        row = cursor.fetchone()
        conn.close()
        os.remove(temp_db)

        return row[0] if row else None

    def login(self):
        """Login using browser session"""
        sessionid = self.get_sessionid()
        if not sessionid:
            return False

        print("[*] Logging in with browser session...")
        self.client = Client()
        self.client.delay_range = [1, 3]

        try:
            self.client.login_by_sessionid(sessionid)
            print("[+] Login successful!")
            return True
        except Exception as e:
            print(f"[-] Login failed: {e}")
            return False

    def get_cached_profile(self, username):
        cur = self.db_conn.cursor()
        cur.execute("SELECT followers, following, posts_count, is_private FROM profiles WHERE username = %s", (username,))
        row = cur.fetchone()
        cur.close()
        return row

    def get_cached_user_id(self, username):
        cur = self.db_conn.cursor()
        cur.execute("SELECT ig_user_id FROM profiles WHERE username = %s AND ig_user_id IS NOT NULL", (username,))
        row = cur.fetchone()
        cur.close()
        return row[0] if row else None

    def save_profile(self, username, user_info, user_id):
        cur = self.db_conn.cursor()
        cur.execute("""
            INSERT INTO profiles (username, ig_user_id, followers, following, posts_count, bio,
                                  full_name, is_private, is_verified, is_business, profile_pic_url, scraped_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (username) DO UPDATE SET
                ig_user_id = COALESCE(EXCLUDED.ig_user_id, profiles.ig_user_id),
                followers = EXCLUDED.followers,
                following = EXCLUDED.following,
                posts_count = EXCLUDED.posts_count,
                bio = EXCLUDED.bio,
                full_name = EXCLUDED.full_name,
                is_private = EXCLUDED.is_private,
                is_verified = EXCLUDED.is_verified,
                is_business = EXCLUDED.is_business,
                profile_pic_url = EXCLUDED.profile_pic_url,
                scraped_at = NOW()
        """, (
            username,
            str(user_id),
            user_info.follower_count,
            user_info.following_count,
            user_info.media_count,
            user_info.biography,
            user_info.full_name,
            user_info.is_private,
            user_info.is_verified,
            user_info.is_business,
            str(user_info.profile_pic_url) if user_info.profile_pic_url else None
        ))
        self.db_conn.commit()
        cur.close()

    def save_post(self, username, post):
        cur = self.db_conn.cursor()
        cur.execute("""
            INSERT INTO posts (username, shortcode, media_pk, url, type, caption, post_date,
                               likes, comments_count, scraped_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (shortcode) DO UPDATE SET
                likes = EXCLUDED.likes,
                comments_count = EXCLUDED.comments_count,
                caption = COALESCE(EXCLUDED.caption, posts.caption),
                post_date = COALESCE(EXCLUDED.post_date, posts.post_date),
                media_pk = COALESCE(EXCLUDED.media_pk, posts.media_pk),
                scraped_at = NOW()
        """, (
            username,
            post.get("shortcode"),
            post.get("media_pk"),
            post.get("url"),
            post.get("type"),
            post.get("caption"),
            post.get("date"),
            post.get("likes"),
            post.get("comments_count")
        ))
        self.db_conn.commit()
        cur.close()

    def update_post_views(self, shortcode, views, video_duration=None, has_audio=None):
        cur = self.db_conn.cursor()
        cur.execute("""
            UPDATE posts SET views = %s, video_duration = %s, has_audio = %s, scraped_at = NOW()
            WHERE shortcode = %s
        """, (views, video_duration, has_audio, shortcode))
        self.db_conn.commit()
        cur.close()

    def update_target_scraped(self, username):
        cur = self.db_conn.cursor()
        cur.execute("UPDATE targets SET last_scraped_at = NOW() WHERE username = %s", (username,))
        self.db_conn.commit()
        cur.close()

    def log_error(self, username, error_type, error_msg):
        cur = self.db_conn.cursor()
        cur.execute("""
            INSERT INTO scrape_errors (username, error_type, error_message, created_at)
            VALUES (%s, %s, %s, NOW())
        """, (username, error_type, str(error_msg)[:500]))
        self.db_conn.commit()
        cur.close()

    def update_progress_status(self):
        update_status({
            "phase": self.progress["phase"],
            "current": self.progress["current"],
            "queued": self.progress["queued"],
            "success": self.progress["success"],
            "failed": self.progress["failed"],
            "queued_count": len(self.progress["queued"]),
            "success_count": len(self.progress["success"]),
            "failed_count": len(self.progress["failed"])
        })

    def print_progress(self):
        print(f"\n  Progress: {len(self.progress['success'])} success | {len(self.progress['failed'])} failed | {len(self.progress['queued'])} queued")

    def scrape_light(self, username):
        result = {"username": username, "success": False, "posts_scraped": 0, "error": None}

        try:
            print(f"  [*] Fetching @{username}...")

            user_id = self.get_cached_user_id(username)

            if user_id:
                print(f"  [+] Using cached user_id: {user_id}")
            else:
                print(f"  [*] Fetching user_id from API...")
                user_id = self.client.user_id_from_username(username)

            user_info = self.client.user_info(user_id)
            self.save_profile(username, user_info, user_id)
            print(f"  [+] Profile: {user_info.follower_count:,} followers, {user_info.media_count} posts")

            if user_info.is_private:
                print(f"  [!] Profile is private - skipping posts")
                result["error"] = "Private profile"
                return result

            print(f"  [*] Fetching posts...")
            medias = self.client.user_medias(user_id, amount=0)

            for media in medias:
                if media.media_type == 2 and media.product_type == "clips":
                    media_type = "reel"
                elif media.media_type == 2:
                    media_type = "video"
                elif media.media_type == 8:
                    media_type = "carousel"
                else:
                    media_type = "post"

                post = {
                    "shortcode": media.code,
                    "media_pk": str(media.pk),
                    "url": f"https://www.instagram.com/p/{media.code}/",
                    "type": media_type,
                    "likes": media.like_count,
                    "comments_count": media.comment_count,
                    "caption": media.caption_text[:500] if media.caption_text else None,
                    "date": media.taken_at.isoformat() if media.taken_at else None
                }
                self.save_post(username, post)
                result["posts_scraped"] += 1

            self.update_target_scraped(username)
            print(f"  [+] Done! {result['posts_scraped']} posts saved")
            result["success"] = True

        except PleaseWaitFewMinutes as e:
            result["error"] = f"Rate limited: {e}"
            self.log_error(username, "rate_limit", e)
            print(f"  [!] Rate limited: {e}")
        except LoginRequired as e:
            result["error"] = "Session expired"
            self.log_error(username, "login_required", e)
            print(f"  [!] Session expired")
        except ClientError as e:
            result["error"] = str(e)
            self.log_error(username, "client_error", e)
            print(f"  [!] API error: {e}")
        except Exception as e:
            result["error"] = str(e)
            self.log_error(username, "unknown", e)
            print(f"  [!] Error: {e}")

        return result

    def run_phase1(self, usernames=None):
        self.progress["phase"] = "phase1_light"

        if usernames:
            targets = usernames
        else:
            cur = self.db_conn.cursor()
            cur.execute("SELECT username FROM targets WHERE is_active = true ORDER BY last_scraped_at NULLS FIRST")
            targets = [row[0] for row in cur.fetchall()]
            cur.close()

        if not targets:
            print("No targets to scrape")
            return

        self.progress["queued"] = targets.copy()
        self.progress["success"] = []
        self.progress["failed"] = []

        print(f"\n{'='*60}")
        print(f"  PHASE 1: Light Scrape ({len(targets)} accounts)")
        print(f"  Gets: likes, comments, caption, date")
        print(f"  Skips: views (will fetch in Phase 2)")
        print(f"{'='*60}")

        for i, username in enumerate(targets):
            self.progress["current"] = username
            self.progress["queued"].remove(username)
            self.update_progress_status()

            print(f"\n[{i+1}/{len(targets)}] @{username}")
            self.print_progress()

            result = self.scrape_light(username)

            if result["success"]:
                self.progress["success"].append(username)
            else:
                self.progress["failed"].append({"username": username, "error": result["error"]})

            self.update_progress_status()

            if i < len(targets) - 1:
                delay = random.uniform(*DELAY_BETWEEN_ACCOUNTS)
                print(f"\n  [~] Waiting {delay:.0f}s before next account...")
                time.sleep(delay)

        self.progress["current"] = None
        self.update_progress_status()

        print(f"\n{'='*60}")
        print(f"  PHASE 1 COMPLETE")
        print(f"  Success: {len(self.progress['success'])}")
        print(f"  Failed: {len(self.progress['failed'])}")
        if self.progress["failed"]:
            print(f"  Failed accounts:")
            for f in self.progress["failed"]:
                print(f"    - @{f['username']}: {f['error']}")
        print(f"{'='*60}")

    def get_reels_without_views(self):
        cur = self.db_conn.cursor()
        cur.execute("""
            SELECT p.shortcode, p.media_pk, p.username
            FROM posts p
            JOIN targets t ON p.username = t.username
            WHERE p.type IN ('reel', 'video')
            AND p.media_pk IS NOT NULL
            AND t.is_active = true
            ORDER BY p.post_date DESC
        """)
        rows = cur.fetchall()
        cur.close()
        return rows

    def run_phase2(self):
        self.progress["phase"] = "phase2_views"

        reels = self.get_reels_without_views()

        if not reels:
            print("No reels need view updates")
            return

        self.progress["queued"] = [r[0] for r in reels]
        self.progress["success"] = []
        self.progress["failed"] = []

        print(f"\n{'='*60}")
        print(f"  PHASE 2: Fetch Views ({len(reels)} reels)")
        print(f"{'='*60}")

        for i, (shortcode, media_pk, username) in enumerate(reels):
            self.progress["current"] = shortcode
            self.progress["queued"].remove(shortcode)
            self.update_progress_status()

            print(f"\n[{i+1}/{len(reels)}] {shortcode} (@{username})")

            try:
                detailed = self.client.media_info(media_pk)
                views = detailed.play_count or detailed.view_count or 0
                self.update_post_views(shortcode, views, detailed.video_duration, detailed.has_audio)
                print(f"  [+] Views: {views:,}")
                self.progress["success"].append(shortcode)

            except PleaseWaitFewMinutes as e:
                print(f"  [!] Rate limited - stopping Phase 2")
                self.progress["failed"].append({"shortcode": shortcode, "error": "rate_limit"})
                break
            except Exception as e:
                print(f"  [!] Error: {e}")
                self.progress["failed"].append({"shortcode": shortcode, "error": str(e)})

            self.update_progress_status()

            if i < len(reels) - 1:
                delay = random.uniform(*DELAY_BETWEEN_POSTS)
                time.sleep(delay)

        self.progress["current"] = None
        self.update_progress_status()

        print(f"\n{'='*60}")
        print(f"  PHASE 2 COMPLETE")
        print(f"  Success: {len(self.progress['success'])}")
        print(f"  Remaining: {len(self.progress['queued']) + len(self.progress['failed'])}")
        print(f"{'='*60}")

    def close(self):
        if self.db_conn:
            self.db_conn.close()


def main():
    import sys

    scraper = InstagramScraper()

    try:
        print("[*] Connecting to database...")
        scraper.connect_db()

        if not scraper.login():
            print("[-] Failed to login")
            return

        # Parse arguments
        if len(sys.argv) > 1:
            cmd = sys.argv[1]

            if cmd == "phase1":
                if len(sys.argv) > 2:
                    usernames = [u.lstrip("@") for u in sys.argv[2:]]
                    scraper.run_phase1(usernames)
                else:
                    scraper.run_phase1()

            elif cmd == "phase2":

                scraper.run_phase2()

            elif cmd == "full":
                scraper.run_phase1()
                print("\n[*] Starting Phase 2 after 60s cooldown...")
                time.sleep(60)
                scraper.run_phase2()

            elif cmd == "retry":
                if STATUS_FILE.exists():
                    with open(STATUS_FILE) as f:
                        status = json.load(f)
                    failed = [f["username"] for f in status.get("failed", []) if "username" in f]
                    if failed:
                        print(f"[*] Retrying {len(failed)} failed accounts...")
                        scraper.run_phase1(failed)
                    else:
                        print("No failed accounts to retry")
                else:
                    print("No status file found")

            else:
                usernames = [u.lstrip("@") for u in sys.argv[1:]]
                scraper.run_phase1(usernames)
        else:
            scraper.run_phase1()

    finally:
        scraper.close()


if __name__ == "__main__":
    main()
