// src/nats/log-stream-hub.service.ts
import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { consumerOpts, createInbox } from 'nats';
import type { JetStreamSubscription } from 'nats';
import { NatsService } from './nats.service';

type LogClient = {
  id: string;
  res: Response;
};

type LogChannel = {
  key: string;
  natsUrl?: string;
  subject: string;
  sub: JetStreamSubscription;
  clients: Map<string, LogClient>;
};

@Injectable()
export class LogStreamHub {
  private readonly logger = new Logger(LogStreamHub.name);

  // key = `${natsUrl || 'default'}::${subject}`
  private readonly channels = new Map<string, LogChannel>();

  constructor(private readonly natsService: NatsService) {}

  private makeKey(natsUrl: string | undefined, subject: string): string {
    return `${natsUrl || 'default'}::${subject}`;
  }

  /**
   * Регистрирует SSE-клиента для указанного NATS-subject.
   * При первом клиенте создаётся JetStream-подписка и запускается fan-out.
   */
  async addClient(
    natsUrl: string | undefined,
    subject: string,
    res: Response,
  ): Promise<string> {
    const clientId = randomUUID();
    const key = this.makeKey(natsUrl, subject);

    let channel = this.channels.get(key);

    if (!channel) {
      const js = await this.natsService.getJetStream(natsUrl);
      const opts = consumerOpts();
      opts.deliverAll();
      opts.deliverTo(createInbox());
      opts.ackNone();
      const sub = await js.subscribe(subject, opts);

      channel = {
        key,
        natsUrl,
        subject,
        sub,
        clients: new Map<string, LogClient>(),
      };

      this.channels.set(key, channel);

      // запускаем отдельную фан-аут корутину
      this.startFanOut(channel).catch((err) => {
        this.logger.error(
          `Fan-out loop failed for ${subject} (${natsUrl}): ${err?.message}`,
        );
      });
    }

    channel.clients.set(clientId, { id: clientId, res });
    return clientId;
  }

  /**
   * Удаляет клиента из канала. Если клиентов не осталось — отписываемся от NATS.
   */
  removeClient(
    natsUrl: string | undefined,
    subject: string,
    clientId: string,
  ) {
    const key = this.makeKey(natsUrl, subject);
    const channel = this.channels.get(key);
    if (!channel) return;

    channel.clients.delete(clientId);

    if (channel.clients.size === 0) {
      this.logger.log(
        `No more clients for subject ${subject} (${natsUrl}), unsubscribing`,
      );
      try {
        channel.sub.unsubscribe();
      } catch (err) {
        this.logger.error(
          `Error unsubscribing from ${subject}: ${(err as Error).message}`,
        );
      }
      this.channels.delete(key);
    }
  }

  private async startFanOut(channel: LogChannel) {
    const { sub, subject, key } = channel;
    const decoder = new TextDecoder();

    try {
      for await (const m of sub) {
        const payload = m.data ? decoder.decode(m.data) : '';

        // Рассылаем всем живым клиентам
        for (const client of channel.clients.values()) {
          try {
            client.res.write(`data: ${payload}\n\n`);
          } catch {
            // Если запись не удалась — просто игнорируем, удаление клиента
            // произойдёт в обработчике 'close' в контроллере.
          }
        }
      }
    } catch (err) {
      this.logger.error(
        `Error in fan-out loop for ${subject}: ${(err as Error).message}`,
      );
    } finally {
      // Подписка завершилась (unsub или ошибка) — гарантированно очищаем канал
      this.channels.delete(key);
    }
  }
}
