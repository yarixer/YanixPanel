// src/nats/nats.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { connect, type NatsConnection } from 'nats';
import { ConfigService } from '@nestjs/config';

type NatsConnEntry = {
  nc: NatsConnection;
};

@Injectable()
export class NatsService implements OnModuleDestroy {
  private readonly logger = new Logger(NatsService.name);
  private readonly connections = new Map<string, NatsConnEntry>();

  constructor(private readonly config: ConfigService) {}

  /**
   * Возвращает JetStream-клиент для указанного natsUrl.
   * Если natsUrl не указан → берём NATS_URL из .env либо дефолтное значение.
   * Соединение переиспользуется между вызовами.
   */
  async getJetStream(natsUrl?: string) {
    const url =
      natsUrl ||
      this.config.get<string>('NATS_URL') ||
      'nats://127.0.0.1:4222';

    let entry = this.connections.get(url);

    if (!entry) {
      this.logger.log(`Connecting to NATS at ${url}`);
      const nc = await connect({ servers: url });
      entry = { nc };
      this.connections.set(url, entry);
    }

    return entry.nc.jetstream();
  }

  async onModuleDestroy() {
    for (const [url, entry] of this.connections.entries()) {
      this.logger.log(`Closing NATS connection ${url}`);
      try {
        await entry.nc.drain();
      } catch (err) {
        this.logger.error(
          `Error closing NATS connection ${url}`,
          err as Error,
        );
      }
    }
    this.connections.clear();
  }
}
