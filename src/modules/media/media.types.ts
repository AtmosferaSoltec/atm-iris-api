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
  /** Solo audios: es un sonido de la consola con este icono; null si no. */
  soundIcon: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DownloadUrl = { url: string; expiresAt: string };
