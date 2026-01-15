import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  Req,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  Patch,
  Head,
  Options,
  Res,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { Request, Response } from 'express';
import type { Express } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { HttpService } from '@nestjs/axios';
import { AuthUser } from '../auth/auth.types';
import { ServersService } from '../servers/servers.service';

@Controller('containers')
@UseGuards(SessionAuthGuard)
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly serversService: ServersService,
    private readonly http: HttpService,
  ) {}

  // Общий helper для проксирования заголовков TUS-запросов
  private buildTusHeaders(req: Request): Record<string, string> {
    const headers: Record<string, string> = {};

    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'undefined') continue;

      if (Array.isArray(value)) {
        headers[key] = value.join(',');
      } else {
        headers[key] = String(value);
      }
    }

    // hop-by-hop заголовки не пробрасываем
    delete headers['host'];
    delete headers['connection'];

    return headers;
  }

  // Патчим Upload-Metadata: гарантируем правильный containerId
  private patchUploadMetadata(
    original: string | undefined,
    containerId: string,
  ): string {
    const base64Container = Buffer.from(containerId, 'utf8').toString('base64');

    const existing = (original ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((part) => {
        const [key, ...rest] = part.split(' ');
        return {
          key,
          value: rest.join(' '),
        };
      });

    let hasContainerId = false;
    const out: { key: string; value: string }[] = [];

    for (const entry of existing) {
      if (!entry.key) continue;

      if (entry.key.toLowerCase() === 'containerid') {
        hasContainerId = true;
        out.push({
          key: 'containerId',
          value: base64Container,
        });
      } else {
        out.push(entry);
      }
    }

    if (!hasContainerId) {
      out.push({
        key: 'containerId',
        value: base64Container,
      });
    }

    return out.map((e) => `${e.key} ${e.value}`).join(',');
  }

  // Заголовки для TUS create (PATCH Upload-Metadata + общий набор)
  private buildTusHeadersWithMetadata(
    req: Request,
    containerId: string,
  ): Record<string, string> {
    const headers = this.buildTusHeaders(req);

    // Node приводит имена заголовков к нижнему регистру
    const metaHeaderName = 'upload-metadata';
    const originalMeta = headers[metaHeaderName];
    const nextMeta = this.patchUploadMetadata(originalMeta, containerId);
    headers[metaHeaderName] = nextMeta;

    return headers;
  }

  // Общий прокси для HEAD/PATCH/OPTIONS по конкретному uploadId
  private async proxyTusToYanix(
    method: 'HEAD' | 'PATCH' | 'OPTIONS',
    hostLabel: string,
    dockerId: string,
    uploadId: string,
    req: Request,
    res: Response,
  ) {
    const user = req['user'] as AuthUser;

    // Проверка доступа к контейнеру (ACL)
    await this.serversService.getContainerForUserById(
      user,
      hostLabel,
      dockerId,
    );

    const yanixServer =
      await this.serversService.getYanixServerForHost(hostLabel);
    const baseUrl = yanixServer.apiBaseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/api/uploads/${encodeURIComponent(uploadId)}`;

    const headers = this.buildTusHeaders(req);

    const upstream = await this.http.axiosRef.request({
      method,
      url,
      headers,
      data: method === 'PATCH' ? (req as any) : undefined,
      validateStatus: () => true,
      maxRedirects: 0,
    });

    res.status(upstream.status);

    for (const [key, value] of Object.entries(upstream.headers)) {
      if (typeof value === 'undefined') continue;
      res.setHeader(
        key,
        Array.isArray(value) ? value.join(',') : String(value),
      );
    }

    if (method === 'PATCH') {
      // PATCH по TUS обычно без тела
      res.end();
    } else {
      if (upstream.data) {
        res.send(upstream.data);
      } else {
        res.end();
      }
    }
  }

  // Список файлов/директорий
  // GET /api/containers/:hostLabel/:dockerId/files?path=/
  @Get(':hostLabel/:dockerId/files')
  async list(
    @CurrentUser() user: any,
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Query('path') path = '/',
  ) {
    return this.filesService.list(
      { id: user.id, isAdmin: user.isAdmin },
      hostLabel,
      dockerId,
      path,
    );
  }

  // Чтение файла как текст (для Ace Editor)
  // GET /api/containers/:hostLabel/:dockerId/file?path=/file.txt
  @Get(':hostLabel/:dockerId/file')
  async readFile(
    @CurrentUser() user: any,
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Query('path') path: string,
  ) {
    return this.filesService.readFile(
      { id: user.id, isAdmin: user.isAdmin },
      hostLabel,
      dockerId,
      path,
    );
  }

  // Создать/обновить файл
  // PUT /api/containers/:hostLabel/:dockerId/file
  // body: { path, content }
  @Put(':hostLabel/:dockerId/file')
  async writeFile(
    @CurrentUser() user: any,
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Body() body: { path: string; content: string },
  ) {
    return this.filesService.writeFile(
      { id: user.id, isAdmin: user.isAdmin },
      hostLabel,
      dockerId,
      body.path,
      body.content,
    );
  }

  // Удалить файл
  // DELETE /api/containers/:hostLabel/:dockerId/file?path=/file.txt
  @Delete(':hostLabel/:dockerId/file')
  async deleteFile(
    @CurrentUser() user: any,
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Query('path') path: string,
  ) {
    return this.filesService.deleteFile(
      { id: user.id, isAdmin: user.isAdmin },
      hostLabel,
      dockerId,
      path,
    );
  }

  // Создать директорию
  // POST /api/containers/:hostLabel/:dockerId/mkdir  body: { path }
  @Post(':hostLabel/:dockerId/mkdir')
  async mkdir(
    @CurrentUser() user: any,
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Body() body: { path: string },
  ) {
    return this.filesService.mkdir(
      { id: user.id, isAdmin: user.isAdmin },
      hostLabel,
      dockerId,
      body.path,
    );
  }

  // Переименование
  // POST /api/containers/:hostLabel/:dockerId/rename  body: { from, to }
  @Post(':hostLabel/:dockerId/rename')
  async rename(
    @CurrentUser() user: any,
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Body() body: { from: string; to: string },
  ) {
    return this.filesService.rename(
      { id: user.id, isAdmin: user.isAdmin },
      hostLabel,
      dockerId,
      body,
    );
  }

  // Перемещение
  // POST /api/containers/:hostLabel/:dockerId/move  body: { from, to }
  @Post(':hostLabel/:dockerId/move')
  async move(
    @CurrentUser() user: any,
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Body() body: { from: string; to: string },
  ) {
    return this.filesService.move(
      { id: user.id, isAdmin: user.isAdmin },
      hostLabel,
      dockerId,
      body,
    );
  }

  // Копирование
  // POST /api/containers/:hostLabel/:dockerId/copy  body: { from, to }
  @Post(':hostLabel/:dockerId/copy')
  async copy(
    @CurrentUser() user: any,
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Body() body: { from: string; to: string },
  ) {
    return this.filesService.copy(
      { id: user.id, isAdmin: user.isAdmin },
      hostLabel,
      dockerId,
      body,
    );
  }

  // Архивация (zip, fire-and-forget)
  // POST /api/containers/:hostLabel/:dockerId/archive  body: { sourcePath }
  @Post(':hostLabel/:dockerId/archive')
  async archive(
    @CurrentUser() user: any,
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Body() body: { sourcePath: string },
  ) {
    const sourcePath = body.sourcePath?.trim();
    if (!sourcePath) {
      throw new BadRequestException('sourcePath is required');
    }

    return this.filesService.archive(
      { id: user.id, isAdmin: user.isAdmin },
      hostLabel,
      dockerId,
      sourcePath,
    );
  }

  // Разархивация
  // POST /api/containers/:hostLabel/:dockerId/unarchive  body: { archivePath }
  @Post(':hostLabel/:dockerId/unarchive')
  async unarchive(
    @CurrentUser() user: any,
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Body() body: { archivePath: string },
  ) {
    const archivePath = body.archivePath?.trim();
    if (!archivePath) {
      throw new BadRequestException('archivePath is required');
    }

    return this.filesService.unarchive(
      { id: user.id, isAdmin: user.isAdmin },
      hostLabel,
      dockerId,
      archivePath,
    );
  }

  @Post(':hostLabel/:dockerId/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSmallFile(
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Body('path') path: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    const user = req['user'] as AuthUser;

    if (!file) {
      throw new BadRequestException('Файл не передан');
    }
    if (!path) {
      throw new BadRequestException('Не указан путь назначения');
    }

    const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
    if (file.size > MAX_SIZE) {
      throw new BadRequestException(
        'Файл слишком большой для обычной загрузки, используйте TUS',
      );
    }

    // Проверяем доступ к контейнеру
    const container = await this.serversService.getContainerForUserById(
      user,
      hostLabel,
      dockerId,
    );

    // Узнаём, где живёт yanix-api для этого hostLabel
    const yanixServer =
      await this.serversService.getYanixServerForHost(hostLabel);

    const baseUrl = yanixServer.apiBaseUrl.replace(/\/$/, '');
    // containerId = server_id (как ты указал)
    const containerId = container.serverId;

    const url = `${baseUrl}/api/container/${encodeURIComponent(
      containerId,
    )}/file?path=${encodeURIComponent(path)}`;

    const upstream = await this.http.axiosRef.put(url, file.buffer, {
      headers: {
        'Content-Type': file.mimetype || 'application/octet-stream',
        'Content-Length': file.size,
      },
      validateStatus: () => true,
    });

    if (upstream.status >= 400) {
      const errMsg =
        (upstream.data && (upstream.data.message || upstream.data.error)) ||
        `yanix-api upload returned status ${upstream.status}`;
      throw new BadRequestException(errMsg);
    }

    return {
      ok: true,
      path,
      size: file.size,
    };
  }

  @Options(':hostLabel/:dockerId/tus')
  async tusOptionsCollection(
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = req['user'] as AuthUser;

    // Просто проверяем, что у пользователя есть доступ к контейнеру
    await this.serversService.getContainerForUserById(
      user,
      hostLabel,
      dockerId,
    );

    const yanixServer =
      await this.serversService.getYanixServerForHost(hostLabel);
    const baseUrl = yanixServer.apiBaseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/api/uploads/`;

    const headers = this.buildTusHeaders(req);

    const upstream = await this.http.axiosRef.request({
      method: 'OPTIONS',
      url,
      headers,
      validateStatus: () => true,
      maxRedirects: 0,
    });

    res.status(upstream.status);

    for (const [key, value] of Object.entries(upstream.headers)) {
      if (typeof value === 'undefined') continue;
      res.setHeader(
        key,
        Array.isArray(value) ? value.join(',') : String(value),
      );
    }

    res.end();
  }

  @Post(':hostLabel/:dockerId/tus')
  async createTusUpload(
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = req['user'] as AuthUser;

    // Проверяем доступ + получаем serverId (= containerId для yanix)
    const container = await this.serversService.getContainerForUserById(
      user,
      hostLabel,
      dockerId,
    );

    const yanixServer =
      await this.serversService.getYanixServerForHost(hostLabel);
    const baseUrl = yanixServer.apiBaseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/api/uploads/`;

    // Перепаковываем Upload-Metadata, добавляя/обновляя containerId
    const headers = this.buildTusHeadersWithMetadata(req, container.serverId);

    const upstream = await this.http.axiosRef.request({
      method: 'POST',
      url,
      headers,
      data: undefined,
      validateStatus: () => true,
      maxRedirects: 0,
    });

    res.status(upstream.status);

    for (const [key, value] of Object.entries(upstream.headers)) {
      if (typeof value === 'undefined') continue;
      res.setHeader(
        key,
        Array.isArray(value) ? value.join(',') : String(value),
      );
    }

    if (upstream.data) {
      res.send(upstream.data);
    } else {
      res.end();
    }
  }

  @Head(':hostLabel/:dockerId/tus/:uploadId')
  async tusHead(
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Param('uploadId') uploadId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.proxyTusToYanix('HEAD', hostLabel, dockerId, uploadId, req, res);
  }

  @Patch(':hostLabel/:dockerId/tus/:uploadId')
  async tusPatch(
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Param('uploadId') uploadId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.proxyTusToYanix('PATCH', hostLabel, dockerId, uploadId, req, res);
  }

  @Options(':hostLabel/:dockerId/tus/:uploadId')
  async tusOptionsResource(
    @Param('hostLabel') hostLabel: string,
    @Param('dockerId') dockerId: string,
    @Param('uploadId') uploadId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.proxyTusToYanix(
      'OPTIONS',
      hostLabel,
      dockerId,
      uploadId,
      req,
      res,
    );
  }
}
