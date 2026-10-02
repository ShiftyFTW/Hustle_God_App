import { createSign } from 'crypto';

/**
 * Server-side Google Drive helper using raw REST + JWT. Never import from client code.
 * Avoids the heavy googleapis package which causes build OOM.
 */

export class DriveConfigError extends Error {}

export interface DriveSubfolder {
  id: string;
  name: string;
  inventoryNumber: string;
  photoCount: number;
  thumbnailUrl: string | null;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

let _cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.expiresAt - 60000) {
    return _cachedToken.token;
  }

  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawJson) {
    throw new DriveConfigError('GOOGLE_SERVICE_ACCOUNT_JSON is not configured.');
  }

  let creds: ServiceAccount;
  try {
    creds = JSON.parse(rawJson);
  } catch {
    throw new DriveConfigError('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }

  const parentFolderId = process.env.DRIVE_ACTIVE_FOLDER_ID;
  if (!parentFolderId) {
    throw new DriveConfigError('DRIVE_ACTIVE_FOLDER_ID is not configured.');
  }

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedClaim = Buffer.from(JSON.stringify(claim)).toString('base64url');
  const signInput = `${encodedHeader}.${encodedClaim}`;

  const signer = createSign('RSA-SHA256');
  signer.update(signInput);
  const signature = signer.sign(creds.private_key.replace(/\\n/g, '\n'), 'base64url');

  const jwt = `${signInput}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    throw new DriveConfigError(`Google auth failed: ${errBody}`);
  }

  const tokenData = await tokenRes.json();
  _cachedToken = {
    token: tokenData.access_token,
    expiresAt: now * 1000 + (tokenData.expires_in - 60) * 1000,
  };
  return _cachedToken.token;
}

async function driveFetch(url: string): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) {
    const body = await res.text();
    throw new DriveConfigError(`Drive permission denied. Make sure the service account has access to the folder. (${res.status}: ${body})`);
  }
  return res;
}

/** Parse an inventory number from a folder name like "n070 nike..." or "N-001 ..." */
function parseInventoryNumber(name: string): string | null {
  const match = name.match(/^\s*[nN][-_]?(\d{3})\b/i);
  if (!match) return null;
  return `n${match[1]}`;
}

/** Parse a size from the end of a folder name, e.g. "10.5m", "7w", "6y", "13.5C" */
export function parseSizeFromName(name: string): string | null {
  const match = name.match(/(\d+(?:\.\d+)?)\s*([mcwycgs]|gs|ps|td)\s*$/i);
  if (!match) return null;
  return `${match[1]}${match[2].toUpperCase()}`;
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp'];
const PHOTO_ORDER = ['hero', 'side', 'front', 'rear', 'top', 'bottom', 'insole', 'sku', 'tag', 'box'];

export function labelFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').toLowerCase().replace(/[_-]+/g, ' ').trim();

  for (const keyword of PHOTO_ORDER) {
    if (base.includes(keyword)) {
      const map: Record<string, string> = {
        front: 'hero',
        rear: 'back',
        tag: 'size_tag',
        box: 'box_label',
      };
      return map[keyword] || keyword;
    }
  }
  return 'other';
}

interface DriveFile {
  id: string;
  name: string;
}

/**
 * List subfolders of DRIVE_ACTIVE_FOLDER_ID whose names start with an
 * inventory number. Sorted by number, newest (highest) first.
 */
export async function listInventoryFolders(): Promise<DriveSubfolder[]> {
  const parentFolderId = process.env.DRIVE_ACTIVE_FOLDER_ID!;
  const folders: DriveSubfolder[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'nextPageToken, files(id, name)',
      pageSize: '200',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
    const data = await res.json();

    for (const file of (data.files || []) as DriveFile[]) {
      const invNum = parseInventoryNumber(file.name);
      if (!invNum) continue;

      const images = await listImagesInFolder(file.id);
      const hero = images.find((img) => labelFromFilename(img.name) === 'hero') || images[0];
      let thumbnailUrl: string | null = null;
      if (hero) {
        try {
          const thumbRes = await driveFetch(`https://www.googleapis.com/drive/v3/files/${hero.id}?alt=media`);
          if (thumbRes.ok) {
            const buf = Buffer.from(await thumbRes.arrayBuffer());
            thumbnailUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
          }
        } catch {
          // Skip thumbnail if we can't fetch it
        }
      }

      folders.push({
        id: file.id,
        name: file.name,
        inventoryNumber: invNum,
        photoCount: images.length,
        thumbnailUrl,
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  folders.sort((a, b) => b.inventoryNumber.localeCompare(a.inventoryNumber, undefined, { numeric: true }));
  return folders;
}

async function listImagesInFolder(folderId: string): Promise<DriveFile[]> {
  const images: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false and (mimeType contains 'image/')`,
      fields: 'nextPageToken, files(id, name)',
      pageSize: '100',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    if (!res.ok) throw new Error(`Drive image list failed: ${res.status}`);
    const data = await res.json();

    for (const file of (data.files || []) as DriveFile[]) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (IMAGE_EXTENSIONS.includes(ext)) {
        images.push(file);
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return images;
}

export interface DriveImageBuffer {
  name: string;
  label: string;
  mimeType: string;
  buffer: Buffer;
}

export async function downloadFolderImages(folderId: string): Promise<DriveImageBuffer[]> {
  const images = await listImagesInFolder(folderId);

  if (images.length === 0) {
    throw new Error('No images found in this Drive folder.');
  }

  const results: DriveImageBuffer[] = [];

  for (const img of images) {
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${img.id}?alt=media`);
    if (!res.ok) {
      console.error('Drive download failed for', img.name, res.status);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = img.name.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    results.push({
      name: img.name,
      label: labelFromFilename(img.name),
      mimeType,
      buffer: buf,
    });
  }

  const orderIndex: Record<string, number> = {};
  PHOTO_ORDER.forEach((k, i) => {
    orderIndex[k] = i;
  });
  results.sort((a, b) => {
    const ai = orderIndex[a.label] ?? 99;
    const bi = orderIndex[b.label] ?? 99;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });

  return results;
}
