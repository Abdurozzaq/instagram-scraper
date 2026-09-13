import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT t.*, p.followers, p.following, p.posts_count, p.scraped_at as profile_scraped_at
      FROM targets t
      LEFT JOIN profiles p ON t.username = p.username
      ORDER BY t.created_at DESC
    `);
    return NextResponse.json(result.rows);
  } catch (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { username, usernames } = await request.json();

    // Support bulk add (comma-separated or array)
    let usernameList: string[] = [];

    if (usernames) {
      // Array of usernames
      usernameList = Array.isArray(usernames) ? usernames : usernames.split(',');
    } else if (username) {
      // Single username or comma-separated string
      usernameList = username.split(',');
    }

    // Clean usernames
    usernameList = usernameList
      .map((u: string) => u.trim().replace('@', ''))
      .filter((u: string) => u.length > 0);

    if (usernameList.length === 0) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    const results = [];
    const duplicates = [];

    for (const cleanUsername of usernameList) {
      const result = await pool.query(
        'INSERT INTO targets (username) VALUES ($1) ON CONFLICT (username) DO NOTHING RETURNING *',
        [cleanUsername]
      );

      if (result.rows.length > 0) {
        results.push(result.rows[0]);
      } else {
        duplicates.push(cleanUsername);
      }
    }

    return NextResponse.json({
      added: results,
      duplicates,
      added_count: results.length,
      duplicate_count: duplicates.length
    });
  } catch (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
