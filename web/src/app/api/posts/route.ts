import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    const showInactive = searchParams.get('show_inactive') === 'true';

    let query = `
      SELECT p.*, t.id as target_id, t.is_active as target_active
      FROM posts p
      JOIN targets t ON p.username = t.username
    `;
    const params: (string | boolean)[] = [];
    const conditions: string[] = [];

    if (username) {
      params.push(username);
      conditions.push(`p.username = $${params.length}`);
    }

    if (!showInactive) {
      conditions.push('t.is_active = true');
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY p.post_date DESC NULLS LAST';

    const result = await pool.query(query, params);
    return NextResponse.json(result.rows);
  } catch (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
