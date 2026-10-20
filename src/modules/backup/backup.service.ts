import { Injectable } from '@nestjs/common';

import { ChurchWriteLock } from '../../database/church-write-lock.js';
import { PrismaService } from '../../database/prisma.service.js';
import { MediaKind, PlanItemKind } from '../../generated/prisma/client.js';
import { nameKey } from '../../shared/utils/text.js';
import { SongsService } from '../songs/songs.service.js';
import { YoutubeVideosService } from '../youtube-videos/youtube-videos.service.js';
import {
  BACKUP_FORMAT,
  type EraseInput,
  type ImportBackupInput,
} from './dto/backup.schema.js';

export type BackupFile = ImportBackupInput & { exportedAt: string };
export type ImportResult = {
  songs: number;
  youtubeVideos: number;
  /** Ya estaban (mismo titulo y autor, o mismo video). */
  skipped: number;
  /** Eran solo una pista subida: sin archivos no hay nada que guardar. */
  withoutLyrics: number;
};
export type EraseResult = { songs: number; media: number; youtube: number };

/**
 * Respaldo de una iglesia (la letra y los enlaces, no los archivos) y borrado
 * masivo. Se importa a cualquier cuenta: los ids no viajan, todo se crea nuevo.
 */
@Injectable()
export class BackupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: ChurchWriteLock,
    private readonly songs: SongsService,
    private readonly youtube: YoutubeVideosService,
  ) {}

  async export(churchId: string): Promise<BackupFile> {
    const [songs, videos] = await Promise.all([
      this.prisma.song.findMany({
        where: { churchId, deletedAt: null },
        orderBy: [{ titleKey: 'asc' }, { id: 'asc' }],
        include: { sections: { orderBy: { position: 'asc' } } },
      }),
      this.prisma.youtubeVideo.findMany({
        where: { churchId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      songs: songs.map((song) => ({
        title: song.title,
        author: song.author,
        sections: song.sections.map((section) => ({
          label: section.label,
          text: section.text,
        })),
        youtubeId: song.youtubeId,
        youtubeMusic: song.youtubeMusic,
      })),
      youtubeVideos: videos.map((video) => ({
        videoId: video.videoId,
        title: video.title,
        author: video.author,
      })),
    };
  }

  async import(
    churchId: string,
    input: ImportBackupInput,
  ): Promise<ImportResult> {
    const existing = await this.prisma.song.findMany({
      where: { churchId, deletedAt: null },
      select: { titleKey: true, author: true },
    });
    const seen = new Set(existing.map((s) => songKey(s.titleKey, s.author)));
    const result: ImportResult = {
      songs: 0,
      youtubeVideos: 0,
      skipped: 0,
      withoutLyrics: 0,
    };

    for (const song of input.songs) {
      const youtubeId = song.youtubeId ?? null;
      if (song.sections.length === 0 && !youtubeId) {
        result.withoutLyrics += 1;
        continue;
      }
      const key = songKey(nameKey(song.title), song.author);
      if (seen.has(key)) {
        result.skipped += 1;
        continue;
      }
      await this.songs.create(churchId, {
        title: song.title,
        author: song.author,
        sections: song.sections.map((s) => ({
          label: s.label ?? null,
          text: s.text,
        })),
        audioId: null,
        youtubeId,
        youtubeMusic: youtubeId !== null && song.youtubeMusic,
      });
      seen.add(key);
      result.songs += 1;
    }

    for (const video of input.youtubeVideos) {
      const saved = await this.youtube.create(churchId, video);
      if (saved.isNew) result.youtubeVideos += 1;
      else result.skipped += 1;
    }
    return result;
  }

  /**
   * Borrado masivo, todo o nada y bajo el candado. Es el mismo borrado suave
   * de siempre: la limpieza de multimedia quita los archivos 24 h despues.
   */
  erase(churchId: string, input: EraseInput): Promise<EraseResult> {
    return this.lock.run(churchId, async (tx) => {
      const now = new Date();
      const result: EraseResult = { songs: 0, media: 0, youtube: 0 };
      const dropFromPlan = (kind: PlanItemKind) =>
        tx.servicePlanItem.updateMany({
          where: { churchId, kind, deletedAt: null },
          data: { deletedAt: now },
        });

      if (input.songs) {
        const songs = await tx.song.findMany({
          where: { churchId, deletedAt: null },
          select: { audioId: true },
        });
        const audioIds = songs.flatMap((s) => (s.audioId ? [s.audioId] : []));
        await tx.mediaAsset.updateMany({
          where: { churchId, id: { in: audioIds }, deletedAt: null },
          data: { deletedAt: now },
        });
        result.songs = (
          await tx.song.updateMany({
            where: { churchId, deletedAt: null },
            data: { deletedAt: now },
          })
        ).count;
        await dropFromPlan(PlanItemKind.SONG);
      }
      if (input.media) {
        result.media = (
          await tx.mediaAsset.updateMany({
            where: {
              churchId,
              deletedAt: null,
              kind: { in: [MediaKind.IMAGE, MediaKind.VIDEO] },
            },
            data: { deletedAt: now },
          })
        ).count;
        await dropFromPlan(PlanItemKind.MEDIA);
      }
      if (input.youtube) {
        result.youtube = (
          await tx.youtubeVideo.updateMany({
            where: { churchId, deletedAt: null },
            data: { deletedAt: now },
          })
        ).count;
        await dropFromPlan(PlanItemKind.YOUTUBE);
      }
      return result;
    });
  }
}

const songKey = (titleKey: string, author: string) =>
  `${titleKey}\u0000${nameKey(author)}`;
