import { OAuth2Client } from 'google-auth-library';
import { ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { MAX_KNOWLEDGE_BYTES } from './knowledge.types';

export const DRIVE_FOLDER = 'application/vnd.google-apps.folder';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
export const driveFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  version: z.string().optional(),
  modifiedTime: z.string().optional(),
  size: z.string().optional(),
  parents: z.array(z.string()).optional(),
  webViewLink: z.string().url().optional(),
  trashed: z.boolean().optional(),
  capabilities: z.object({ canDownload: z.boolean().optional() }).optional(),
});
export type DriveFile = z.infer<typeof driveFileSchema>;
const fields =
  'id,name,mimeType,version,modifiedTime,size,parents,webViewLink,trashed,capabilities(canDownload)';
export class DriveApiError extends Error {
  constructor(public readonly status: number) {
    super(
      status === 401
        ? 'Google Drive authorization expired. Reconnect this account.'
        : status === 403 || status === 404
          ? 'Google Drive access is unavailable for this item.'
          : 'Google Drive is temporarily unavailable. Synchronization will retry.',
    );
  }
}
export function driveOAuthClient() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const origin = process.env.PUBLIC_API_URL;
  if (!clientId || !clientSecret || !origin)
    throw new ServiceUnavailableException(
      'Google Drive is not configured. Ask an administrator to configure its OAuth client.',
    );
  return new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri: `${origin.replace(/\/$/, '')}/api/knowledge/drive/callback`,
  });
}
const escapeQuery = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
export function driveExport(
  file: DriveFile,
): { mimeType: string; name: string } | null {
  if (
    file.mimeType === 'application/vnd.google-apps.document' ||
    file.mimeType === 'application/vnd.google-apps.presentation'
  )
    return { mimeType: 'text/plain', name: file.name + '.txt' };
  if (file.mimeType === 'application/vnd.google-apps.spreadsheet')
    return { mimeType: 'application/pdf', name: file.name + '.pdf' };
  return null;
}
export function supportedDriveFile(file: DriveFile) {
  return (
    file.mimeType === DRIVE_FOLDER ||
    Boolean(driveExport(file)) ||
    /\.(pdf|docx|txt|md|csv)$/i.test(file.name)
  );
}

export class DriveApi {
  constructor(private readonly accessToken: string) {}
  private async response(path: string, query: Record<string, string>) {
    const url = new URL('https://www.googleapis.com/drive/v3/' + path);
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, value);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new DriveApiError(response.status);
    }
    return response;
  }
  async get(id: string) {
    const response = await this.response('files/' + encodeURIComponent(id), {
      fields,
      supportsAllDrives: 'true',
    });
    return driveFileSchema.parse(await response.json());
  }
  async list(parentId = 'root', pageToken?: string, search?: string) {
    const q = search
      ? `trashed = false and name contains '${escapeQuery(search)}'`
      : `trashed = false and '${escapeQuery(parentId)}' in parents`;
    const response = await this.response('files', {
      q,
      fields: `nextPageToken,files(${fields})`,
      pageSize: '100',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      orderBy: 'folder,name',
      ...(pageToken ? { pageToken } : {}),
    });
    return z
      .object({
        nextPageToken: z.string().optional(),
        files: z.array(driveFileSchema),
      })
      .parse(await response.json());
  }
  async sharedDrives(pageToken?: string) {
    const response = await this.response('drives', {
      fields: 'nextPageToken,drives(id,name)',
      pageSize: '100',
      ...(pageToken ? { pageToken } : {}),
    });
    return z
      .object({
        nextPageToken: z.string().optional(),
        drives: z.array(z.object({ id: z.string(), name: z.string() })),
      })
      .parse(await response.json());
  }
  async download(file: DriveFile) {
    if (file.capabilities?.canDownload === false) throw new DriveApiError(403);
    if (Number(file.size ?? 0) > MAX_KNOWLEDGE_BYTES)
      throw new Error('This file exceeds the 20 MB document limit');
    const exported = driveExport(file);
    const response = await this.response(
      `files/${encodeURIComponent(file.id)}${exported ? '/export' : ''}`,
      exported
        ? { mimeType: exported.mimeType }
        : { alt: 'media', supportsAllDrives: 'true' },
    );
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Google Drive returned an empty download');
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_KNOWLEDGE_BYTES)
          throw new Error('This file exceeds the 20 MB document limit');
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    return { buffer: Buffer.concat(chunks), name: exported?.name ?? file.name };
  }
}
