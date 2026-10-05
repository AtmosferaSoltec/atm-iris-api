/** Contrato §11. */
export type MediaKindName = 'image' | 'video' | 'audio';

export type UploadTicket = {
  uploadId: string;
  /** PUT firmado. */
  uploadUrl: string;
  /** El cliente los manda tal cual en el PUT (incluye Content-Type). */
  headers: Record<string, string>;
  expiresAt: string;
};

export type MediaAsset = {
  id: string;
  kind: MediaKindName;
  title: string;
  description: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  isBackground: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DownloadUrl = { url: string; expiresAt: string };
