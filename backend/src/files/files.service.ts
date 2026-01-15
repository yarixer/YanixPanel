import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServersService } from '../servers/servers.service';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly serversService: ServersService,
  ) {}

  /**
   * Проверяет ACL через ServersService и возвращает:
   * - нормализованный baseUrl yanix-api
   * - containerId (server_id, а при его отсутствии fallback на docker_id)
   */
  private async resolve(
    user: { id: bigint; isAdmin: boolean },
    hostLabel: string,
    dockerId: string,
  ) {
    const container = await this.serversService.getContainerForUserById(
      user,
      hostLabel,
      dockerId,
    );

    const server = await this.prisma.yanixServer.findUnique({
      where: { hostLabel },
    });
    if (!server) {
      throw new NotFoundException('Yanix server not found');
    }

    const baseUrl = server.apiBaseUrl.replace(/\/$/, '');
    const containerId = container.serverId || container.dockerId;

    if (!containerId) {
      throw new NotFoundException('Container ID not available');
    }

    return { baseUrl, containerId };
  }

  private handleAxiosError(err: any): never {
    const status = err?.response?.status ?? 502;
    const data = err?.response?.data;

    if (data && typeof data === 'object') {
      throw new HttpException(data, status);
    }

    throw new HttpException(
      { message: 'Yanix API error', statusCode: status },
      status,
    );
  }

  // ====== LIST ======

  async list(
    user: { id: bigint; isAdmin: boolean },
    hostLabel: string,
    dockerId: string,
    path: string,
  ) {
    const { baseUrl, containerId } = await this.resolve(
      user,
      hostLabel,
      dockerId,
    );
    const url = `${baseUrl}/api/container/${encodeURIComponent(
      containerId,
    )}/files`;

    try {
      const { data } = await firstValueFrom(
        this.http.get(url, {
          params: { path },
        }),
      );
      // data — массив { name, type, size }
      return { entries: data };
    } catch (err) {
      this.handleAxiosError(err);
    }
  }

  // ====== READ FILE ======

  async readFile(
    user: { id: bigint; isAdmin: boolean },
    hostLabel: string,
    dockerId: string,
    path: string,
  ) {
    const { baseUrl, containerId } = await this.resolve(
      user,
      hostLabel,
      dockerId,
    );
    const url = `${baseUrl}/api/container/${encodeURIComponent(
      containerId,
    )}/file`;

    try {
      const response = await firstValueFrom(
        this.http.get<ArrayBuffer>(url, {
          params: { path },
          responseType: 'arraybuffer',
          validateStatus: () => true,
        }),
      );

      if (response.status >= 400) {
        // yanix при ошибке отдаёт JSON {"error": "..."}
        try {
          const text = Buffer.from(response.data).toString('utf-8');
          const json = JSON.parse(text);
          throw new HttpException(json, response.status);
        } catch {
          throw new HttpException(
            { message: 'Failed to read file' },
            response.status,
          );
        }
      }

      const content = Buffer.from(response.data).toString('utf-8');
      return { path, content };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.handleAxiosError(err);
    }
  }

  // ====== WRITE FILE (create/update) ======

  async writeFile(
    user: { id: bigint; isAdmin: boolean },
    hostLabel: string,
    dockerId: string,
    path: string,
    content: string,
  ) {
    const { baseUrl, containerId } = await this.resolve(
      user,
      hostLabel,
      dockerId,
    );
    const url = `${baseUrl}/api/container/${encodeURIComponent(
      containerId,
    )}/file`;

    try {
      await firstValueFrom(
        this.http.put(url, content, {
          params: { path },
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
      );
      // yanix отвечает 204 No Content
      return { ok: true };
    } catch (err) {
      this.handleAxiosError(err);
    }
  }

  // ====== DELETE FILE ======

  async deleteFile(
    user: { id: bigint; isAdmin: boolean },
    hostLabel: string,
    dockerId: string,
    path: string,
  ) {
    const { baseUrl, containerId } = await this.resolve(
      user,
      hostLabel,
      dockerId,
    );
    const url = `${baseUrl}/api/container/${encodeURIComponent(
      containerId,
    )}/file`;

    try {
      await firstValueFrom(
        this.http.delete(url, {
          params: { path },
        }),
      );
      return { ok: true };
    } catch (err) {
      this.handleAxiosError(err);
    }
  }

  // ====== MKDIR ======

  async mkdir(
    user: { id: bigint; isAdmin: boolean },
    hostLabel: string,
    dockerId: string,
    path: string,
  ) {
    const { baseUrl, containerId } = await this.resolve(
      user,
      hostLabel,
      dockerId,
    );
    const url = `${baseUrl}/api/container/${encodeURIComponent(
      containerId,
    )}/mkdir`;

    try {
      await firstValueFrom(
        this.http.post(
          url,
          {},
          {
            params: { path },
          },
        ),
      );
      return { ok: true };
    } catch (err) {
      this.handleAxiosError(err);
    }
  }

  // ====== RENAME ======

  async rename(
    user: { id: bigint; isAdmin: boolean },
    hostLabel: string,
    dockerId: string,
    body: { from: string; to: string },
  ) {
    const { baseUrl, containerId } = await this.resolve(
      user,
      hostLabel,
      dockerId,
    );
    const url = `${baseUrl}/api/container/${encodeURIComponent(
      containerId,
    )}/rename`;

    try {
      await firstValueFrom(this.http.post(url, body));
      return { ok: true };
    } catch (err) {
      this.handleAxiosError(err);
    }
  }

  // ====== MOVE ======

  async move(
    user: { id: bigint; isAdmin: boolean },
    hostLabel: string,
    dockerId: string,
    body: { from: string; to: string },
  ) {
    const { baseUrl, containerId } = await this.resolve(
      user,
      hostLabel,
      dockerId,
    );
    const url = `${baseUrl}/api/container/${encodeURIComponent(
      containerId,
    )}/move`;

    try {
      await firstValueFrom(this.http.post(url, body));
      return { ok: true };
    } catch (err) {
      this.handleAxiosError(err);
    }
  }

  // ====== COPY ======

  async copy(
    user: { id: bigint; isAdmin: boolean },
    hostLabel: string,
    dockerId: string,
    body: { from: string; to: string },
  ) {
    const { baseUrl, containerId } = await this.resolve(
      user,
      hostLabel,
      dockerId,
    );
    const url = `${baseUrl}/api/container/${encodeURIComponent(
      containerId,
    )}/copy`;

    try {
      await firstValueFrom(this.http.post(url, body));
      return { ok: true };
    } catch (err) {
      this.handleAxiosError(err);
    }
  }

  // ====== ARCHIVE (zip, fire-and-forget) ======

  async archive(
    user: { id: bigint; isAdmin: boolean },
    hostLabel: string,
    dockerId: string,
    sourcePath: string,
  ) {
    const { baseUrl, containerId } = await this.resolve(
      user,
      hostLabel,
      dockerId,
    );
    const url = `${baseUrl}/api/container/${encodeURIComponent(
      containerId,
    )}/archive`;

    const body = {
      // по спецификации yanix: source_path, target_path (мы target_path не отправляем)
      source_path: sourcePath,
    };

    try {
      await firstValueFrom(this.http.post(url, body));
      // yanix может ответить 204 No Content, нам достаточно факта успеха
      return { ok: true };
    } catch (err) {
      this.handleAxiosError(err);
    }
  }

  // ====== UNARCHIVE (zip/rar/7z/tar*) ======

  async unarchive(
    user: { id: bigint; isAdmin: boolean },
    hostLabel: string,
    dockerId: string,
    archivePath: string,
  ) {
    const { baseUrl, containerId } = await this.resolve(
      user,
      hostLabel,
      dockerId,
    );
    const url = `${baseUrl}/api/container/${encodeURIComponent(
      containerId,
    )}/unarchive`;

    const body = {
      archive_path: archivePath,
    };

    try {
      await firstValueFrom(this.http.post(url, body));
      // yanix отдаёт JSON { status: "ok", queue_size: N }, но для фронта
      // достаточно факта успеха
      return { ok: true };
    } catch (err) {
      this.handleAxiosError(err);
    }
  }
}
