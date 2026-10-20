import { Injectable } from '@nestjs/common';
import type { Response } from 'express';

type Event = 'state' | 'frame' | 'preload' | 'bye';

type ChurchChannel = {
  /** Lo ultimo de la consola: un televisor que se conecta lo recibe de entrada. */
  frame?: unknown;
  preload?: unknown;
  /** Reloj de la consola al mandarlo y del API al recibirlo: el televisor saca su desfase. */
  clock?: number;
  receivedAt?: number;
  /** Conexiones abiertas por televisor (puede haber varias pestañas). */
  streams: Map<string, Set<Response>>;
};

/** Cada cuanto viaja un comentario para que nginx y el navegador no corten el canal. */
const KEEP_ALIVE_MS = 20_000;

/**
 * El canal en vivo consola → televisores, en memoria (un solo proceso del API).
 * Un reinicio corta los canales: los televisores se reconectan solos y la
 * consola vuelve a mandar su estado.
 */
@Injectable()
export class DisplaysHub {
  private readonly churches = new Map<string, ChurchChannel>();

  /** Abre el canal de un televisor y le manda lo ultimo de la consola. */
  open(
    churchId: string,
    displayId: string,
    response: Response,
    onClose: () => void,
  ): void {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    // nginx no debe juntar los eventos en su buffer.
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    response.write('retry: 2000\n\n');

    const channel = this.channel(churchId);
    const streams = channel.streams.get(displayId) ?? new Set<Response>();
    streams.add(response);
    channel.streams.set(displayId, streams);

    send(response, 'state', {
      frame: channel.frame ?? null,
      preload: channel.preload ?? [],
      clock: channel.clock ?? null,
      receivedAt: channel.receivedAt ?? null,
    });

    const keepAlive = setInterval(
      () => response.write(': ok\n\n'),
      KEEP_ALIVE_MS,
    );
    response.on('close', () => {
      clearInterval(keepAlive);
      streams.delete(response);
      if (streams.size === 0) channel.streams.delete(displayId);
      onClose();
    });
  }

  /** Lo nuevo de la consola, a todos los televisores de la iglesia. */
  publish(
    churchId: string,
    state: { frame?: unknown; preload?: unknown; clock: number },
  ): void {
    const channel = this.channel(churchId);
    const times = { clock: state.clock, receivedAt: Date.now() };
    channel.clock = times.clock;
    channel.receivedAt = times.receivedAt;
    if (state.preload !== undefined) {
      channel.preload = state.preload;
      this.broadcast(channel, 'preload', { preload: state.preload, ...times });
    }
    if (state.frame !== undefined) {
      channel.frame = state.frame;
      this.broadcast(channel, 'frame', { frame: state.frame, ...times });
    }
  }

  isOnline(churchId: string, displayId: string): boolean {
    return (this.churches.get(churchId)?.streams.get(displayId)?.size ?? 0) > 0;
  }

  /** Desvinculado: se le avisa y se cierra su canal. */
  close(churchId: string, displayId: string): void {
    const streams = this.churches.get(churchId)?.streams.get(displayId);
    for (const response of streams ?? []) {
      send(response, 'bye', {});
      response.end();
    }
  }

  private broadcast(channel: ChurchChannel, event: Event, data: object): void {
    for (const streams of channel.streams.values()) {
      for (const response of streams) send(response, event, data);
    }
  }

  private channel(churchId: string): ChurchChannel {
    let channel = this.churches.get(churchId);
    if (!channel) {
      channel = { streams: new Map() };
      this.churches.set(churchId, channel);
    }
    return channel;
  }
}

/** Cada evento lleva `now`, la hora del API al mandarlo. */
function send(response: Response, event: Event, data: object): void {
  response.write(
    `event: ${event}\ndata: ${JSON.stringify({ ...data, now: Date.now() })}\n\n`,
  );
}
