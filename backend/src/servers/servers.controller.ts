import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Req,
  Res,
  Query,
} from '@nestjs/common';
import { ServersService } from './servers.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { Request, Response } from 'express';
import { AuthUser } from '../auth/auth.types';
import { NatsService } from '../nats/nats.service';
import { consumerOpts, createInbox, type JetStreamSubscription } from 'nats';
import { ExecCommandDto } from './dto/exec-command.dto';

@Controller('servers')
export class ServersController {
  constructor(
    private readonly serversService: ServersService,
    private readonly natsService: NatsService,
  ) {}

  @Get('allinfo')
  @UseGuards(SessionAuthGuard)
  async getAllInfo(@CurrentUser() user: any) {
    const containers = await this.serversService.getContainersForUser({
      id: user.id,
      isAdmin: user.isAdmin,
    });
    return { containers };
  }

  @Get(':hostLabel/:dockerId')
  @UseGuards(SessionAuthGuard)
  async getOne(
    @CurrentUser() user: any,
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
  ) {
    const container = await this.serversService.getContainerForUserById(
      { id: user.id, isAdmin: user.isAdmin },
      hostLabel,
      dockerId,
    );
    return { container };
  }

  @Post(':hostLabel/:dockerId/start')
  @UseGuards(SessionAuthGuard)
  async start(
    @CurrentUser() user: any,
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
  ) {
    return this.serversService.startContainer(
      { id: user.id, isAdmin: user.isAdmin },
      hostLabel,
      dockerId,
    );
  }

  @Post(':hostLabel/:dockerId/stop')
  @UseGuards(SessionAuthGuard)
  async stop(
    @CurrentUser() user: any,
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
  ) {
    return this.serversService.stopContainer(
      { id: user.id, isAdmin: user.isAdmin },
      hostLabel,
      dockerId,
    );
  }

  @Post(':hostLabel/:dockerId/restart')
  @UseGuards(SessionAuthGuard)
  async restart(
    @CurrentUser() user: any,
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
  ) {
    return this.serversService.restartContainer(
      { id: user.id, isAdmin: user.isAdmin },
      hostLabel,
      dockerId,
    );
  }

  @Post(':hostLabel/:dockerId/exec')
  @UseGuards(SessionAuthGuard)
  async exec(
    @CurrentUser() user: any,
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Body() body: any,
  ) {
    return this.serversService.execInContainer(
      { id: user.id, isAdmin: user.isAdmin },
      hostLabel,
      dockerId,
      {
        cmd: body?.cmd,
        mode: body?.mode,
        login: body?.login,
      },
    );
  }

  /**
   * SSE-стрим логов контейнера.
   *
   * Поддерживает опциональный query-параметр ?lastSeq=NN:
   *  - если lastSeq не передан → запускаем consumer с deliverAll() (получим все сообщения,
   *    которые ещё лежат в stream; судя по конфигу JetStream — это примерно 30 последних логов);
   *  - если lastSeq передан → startSequence(lastSeq + 1), т.е. получаем только новые сообщения,
   *    начиная с следующей позиции после уже отображённой на фронте.
   *
   * Для каждого лог-сообщения пробрасываем stream sequence в SSE как "id: <seq>", чтобы фронт
   * мог запоминать последнюю позицию.
   */
  @Get(':hostLabel/:dockerId/logs/stream')
  @UseGuards(SessionAuthGuard)
  async streamLogs(
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Query('lastSeq') lastSeqRaw: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = req['user'] as AuthUser | undefined;

    if (!user) {
      res.status(401).end();
      return;
    }

    // Проверяем ACL и факт существования контейнера
    const container = await this.serversService.getContainerForUserById(
      user,
      hostLabel,
      dockerId,
    );

    // Находим yanix-сервер и его NATS URL
    const yanixServer =
      await this.serversService.getYanixServerForHost(hostLabel);
    const natsUrl =
      (yanixServer && (yanixServer as any).natsUrl) || undefined;

    const subject = `logs.container.${dockerId}`;

    // SSE-заголовки
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    (res as any).flushHeaders?.();

    // Отправляем meta-событие
    res.write('event: meta\n');
    res.write(
      `data: ${JSON.stringify({
        containerId: container.dockerId,
        serverId: container.serverId,
        hostLabel: container.hostLabel,
      })}\n\n`,
    );

    let sub: JetStreamSubscription;

    // Настраиваем JetStream consumer под это конкретное SSE-подключение
    try {
      const js = await this.natsService.getJetStream(natsUrl);
      const opts = consumerOpts();

      // Ephemeral consumer с push-доставкой в отдельный inbox
      opts.ackNone();
      opts.deliverTo(createInbox());

      let startSeq: number | undefined;

      if (typeof lastSeqRaw === 'string') {
        const parsed = Number(lastSeqRaw);
        if (!Number.isNaN(parsed) && parsed >= 0) {
          startSeq = parsed + 1;
        }
      }

      if (startSeq && startSeq > 0) {
        // Начинаем строго после последнего отображённого сообщения
        opts.startSequence(startSeq);
      } else {
        // Нет lastSeq → читаем все сообщения, которые ещё есть в stream
        opts.deliverAll();
      }

      sub = await js.subscribe(subject, opts);
    } catch (err) {
      // Если не смогли подписаться — отправляем одно error-событие и закрываем SSE
      try {
        res.write('event: error\n');
        res.write(
          `data: ${JSON.stringify({
            message: 'Failed to subscribe to logs stream',
          })}\n\n`,
        );
      } catch {
        // ignore
      }
      res.end();
      return;
    }

    // keepalive, чтобы прокси не рубили idle-соединение
    const keepalive = setInterval(() => {
      try {
        res.write(`: keepalive\n\n`);
      } catch {
        // если запись не удалась — вскоре соединение закроется
      }
    }, 15_000);

    // TTL (например, 15 минут) на одно SSE-соединение
    const ttl = setTimeout(() => {
      try {
        res.write('event: end\n');
        res.write('data: "timeout"\n\n');
      } catch {
        // ignore
      }
      clearInterval(keepalive);
      try {
        sub.unsubscribe();
      } catch {
        // ignore
      }
      if (!res.writableEnded) {
        res.end();
      }
    }, 15 * 60 * 1000);

    // При закрытии соединения со стороны клиента — убираем подписку
    req.on('close', () => {
      clearInterval(keepalive);
      clearTimeout(ttl);
      try {
        sub.unsubscribe();
      } catch {
        // ignore
      }
    });

    const decoder = new TextDecoder();

    // Асинхронно читаем JetStream subscription и пушим в SSE
    (async () => {
      try {
        for await (const m of sub) {
          const payload = m.data ? decoder.decode(m.data) : '';

          // stream sequence из JetStream — это глобальный порядковый номер сообщения в stream
          const seq = (m as any).seq as number | undefined;

          if (typeof seq === 'number' && Number.isFinite(seq)) {
            // Пробрасываем его в SSE как id, чтобы фронт мог запомнить lastSeq
            res.write(`id: ${seq}\n`);
          }

          // Обычное data-сообщение (default event)
          res.write(`data: ${payload}\n\n`);
        }
      } catch {
        // игнорируем ошибки чтения — при обрыве соединения цикл всё равно завершится
      } finally {
        clearInterval(keepalive);
        clearTimeout(ttl);
        if (!res.writableEnded) {
          res.end();
        }
      }
    })();
  }
}
