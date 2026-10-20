import type { YoutubeVideo as YoutubeVideoRow } from '../../generated/prisma/client.js';
import type { YoutubeVideo } from './youtube-videos.types.js';

export function toYoutubeVideo(row: YoutubeVideoRow): YoutubeVideo {
  return {
    id: row.id,
    videoId: row.videoId,
    title: row.title,
    author: row.author,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
