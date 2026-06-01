import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dbPath = path.join(process.cwd(), '..', 'skeet.sqlite');

  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({
      rounds: [],
      ticks: [],
      connected: false
    });
  }

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    
    // Fetch rounds ordered by timestamp
    const rounds = db.prepare('SELECT * FROM rounds ORDER BY ts DESC LIMIT 50').all();
    
    // Fetch all ticks
    const ticks = db.prepare('SELECT * FROM ticks ORDER BY t ASC').all();
    
    db.close();

    return NextResponse.json({
      rounds,
      ticks,
      connected: true
    });
  } catch (e) {
    if (db) db.close();
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
      rounds: [],
      ticks: [],
      connected: false
    }, { status: 500 });
  }
}
