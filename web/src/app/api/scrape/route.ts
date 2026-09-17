import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const SCRAPER_PATH = path.join(process.cwd(), '..', 'scraper.py');
const STATUS_FILE = path.join(process.cwd(), '..', 'scrape_status.json');
const VENV_PYTHON = path.join(process.cwd(), '..', 'venv',
  ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));

let scrapeProcess: ReturnType<typeof spawn> | null = null;

export async function GET() {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      const status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
      status.is_running = scrapeProcess !== null && !scrapeProcess.killed;
      return NextResponse.json(status);
    }
    return NextResponse.json({ is_running: false, message: 'No scrape in progress' });
  } catch (error) {
    return NextResponse.json({ is_running: false, message: 'Error reading status' });
  }
}

export async function POST(request: Request) {
  try {
    const { username, mode = 'phase1' } = await request.json();

    if (scrapeProcess && !scrapeProcess.killed) {
      return NextResponse.json({ error: 'Scrape already in progress' }, { status: 409 });
    }

    // Initialize status
    const initialStatus = {
      is_running: true,
      phase: mode,
      current: username || 'all',
      message: `Starting ${mode}...`,
      queued: [],
      success: [],
      failed: [],
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(STATUS_FILE, JSON.stringify(initialStatus));

    // Build args based on mode
    let args: string[] = [SCRAPER_PATH];

    if (username) {
      // Specific username(s)
      args.push(...username.split(',').map((u: string) => u.trim()));
    } else {
      // Mode: phase1, phase2, full, retry
      args.push(mode);
    }

    scrapeProcess = spawn(VENV_PYTHON, args, {
      cwd: path.dirname(SCRAPER_PATH),
      detached: false
    });

    scrapeProcess.on('close', (code) => {
      scrapeProcess = null;
      try {
        const status = fs.existsSync(STATUS_FILE)
          ? JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'))
          : {};
        status.is_running = false;
        status.exit_code = code;
        status.finished_at = new Date().toISOString();
        fs.writeFileSync(STATUS_FILE, JSON.stringify(status));
      } catch (e) {}
    });

    scrapeProcess.on('error', (err) => {
      scrapeProcess = null;
      fs.writeFileSync(STATUS_FILE, JSON.stringify({
        is_running: false,
        error: err.message,
        timestamp: new Date().toISOString()
      }));
    });

    return NextResponse.json({ success: true, message: `Scraper started (${mode})` });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to start scraper' }, { status: 500 });
  }
}

export async function DELETE() {
  if (scrapeProcess && !scrapeProcess.killed) {
    scrapeProcess.kill('SIGTERM');
    scrapeProcess = null;
    return NextResponse.json({ success: true, message: 'Scraper stopped' });
  }
  return NextResponse.json({ error: 'No scraper running' }, { status: 400 });
}
