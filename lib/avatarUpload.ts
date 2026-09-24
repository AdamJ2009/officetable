"use client";

// Client-side avatar processing + upload.
// Sensible size limits:
// - Source file must be an image and <= 10MB
// - It is center-cropped to a square and downscaled to at most 256x256
// - Encoded as WebP (quality 0.85, keeps transparency), falling back to PNG
// - Resulting upload is typically well under the server's 512KB limit

export const MAX_AVATAR_INPUT_BYTES = 10 * 1024 * 1024;
export const AVATAR_DIMENSION = 256;

export class AvatarError extends Error {}

export async function prepareAvatarForUpload(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new AvatarError('Please choose an image file (PNG, JPEG, WebP or GIF).');
  }
  if (file.size > MAX_AVATAR_INPUT_BYTES) {
    throw new AvatarError('Image is too large (max 10MB).');
  }

  // Animated GIFs are passed through untouched so they stay animated
  if (file.type === 'image/gif') {
    if (file.size > 512 * 1024) {
      throw new AvatarError('Animated GIFs must be under 512KB.');
    }
    return file;
  }

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new AvatarError('Could not read that image file.');
  });

  // Center-crop to square
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_DIMENSION;
  canvas.height = AVATAR_DIMENSION;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new AvatarError('Could not process that image.');
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_DIMENSION, AVATAR_DIMENSION);
  bitmap.close();

  // Prefer WebP (small + supports transparency); fall back to PNG
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/webp', 0.85)
  ) ?? await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );

  if (!blob) {
    throw new AvatarError('Could not process that image.');
  }
  return blob;
}

export async function uploadPlayerAvatar(playerId: number, blob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('avatar', blob, 'avatar');

  const res = await fetch(`/api/players/${playerId}/avatar`, {
    method: 'PUT',
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new AvatarError(data.error || 'Failed to upload avatar');
  }
  const data = await res.json();
  return data.avatar_updated_at;
}

export async function removePlayerAvatar(playerId: number): Promise<void> {
  const res = await fetch(`/api/players/${playerId}/avatar`, { method: 'DELETE' });
  if (!res.ok) {
    throw new AvatarError('Failed to remove avatar');
  }
}