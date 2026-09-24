import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import db from '@/lib/db';

// Sensible limits for avatars:
// - Max 512KB after any client-side resizing (client resizes to 256x256 before upload)
// - Only common web image formats are accepted
const MAX_AVATAR_BYTES = 512 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

interface PlayerAvatarRow {
  id: number;
  avatar: Buffer | null;
  avatar_mime: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const playerId = parseInt(id);
  if (isNaN(playerId)) {
    return NextResponse.json({ error: 'Invalid player id' }, { status: 400 });
  }

  const player = db
    .prepare('SELECT id, avatar, avatar_mime FROM players WHERE id = ?')
    .get(playerId) as PlayerAvatarRow | undefined;

  if (!player || !player.avatar) {
    return NextResponse.json({ error: 'Avatar not found' }, { status: 404 });
  }

  const mime = player.avatar_mime && ALLOWED_MIME_TYPES.has(player.avatar_mime)
    ? player.avatar_mime
    : 'image/png';

  // Avatar URLs are cache-busted with avatar_updated_at, so we can cache aggressively
  const body = new Uint8Array(player.avatar);
  return new NextResponse(body, {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const playerId = parseInt(id);
  if (isNaN(playerId)) {
    return NextResponse.json({ error: 'Invalid player id' }, { status: 400 });
  }

  const player = db.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  let mime: string;
  let bytes: Uint8Array;
  try {
    const formData = await request.formData();
    const file = formData.get('avatar');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No avatar file provided' }, { status: 400 });
    }

    mime = file.type;
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      return NextResponse.json(
        { error: 'Avatar must be a PNG, JPEG, WebP or GIF image' },
        { status: 400 }
      );
    }

    if (file.size > MAX_AVATAR_BYTES) {
      return NextResponse.json(
        { error: 'Avatar is too large (max 512KB)' },
        { status: 413 }
      );
    }

    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }

  db.prepare(
    `UPDATE players SET avatar = ?, avatar_mime = ?, avatar_updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(bytes, mime, playerId);

  revalidatePath('/', 'layout');
  const updated = db
    .prepare('SELECT id, avatar_updated_at FROM players WHERE id = ?')
    .get(playerId) as { id: number; avatar_updated_at: string };
  return NextResponse.json({ success: true, avatar_updated_at: updated.avatar_updated_at });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const playerId = parseInt(id);
  if (isNaN(playerId)) {
    return NextResponse.json({ error: 'Invalid player id' }, { status: 400 });
  }

  const result = db
    .prepare(
      `UPDATE players SET avatar = NULL, avatar_mime = NULL, avatar_updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
    .run(playerId);

  if (result.changes === 0) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  revalidatePath('/', 'layout');
  return NextResponse.json({ success: true });
}