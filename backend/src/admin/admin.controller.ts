// backend/src/admin/admin.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CreateTemplateServerDto } from './dto/create-template-server.dto';
import { ServersService } from '../servers/servers.service';
import { CreateYanixServerDto, UpdateYanixServerDto } from './dto/yanix-server.dto';


@Controller('admin')
@UseGuards(SessionAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly serversService: ServersService,
  ) {}

  // ------- Пользователи / сессии / верификация -------

  @Get('users')
  async listUsers() {
    return this.adminService.getUsersWithSessions();
  }

  @Patch('users/:id/verified')
  async setUserVerified(
    @Param('id') id: string,
    @Body() body: { verified?: boolean },
  ) {
    if (typeof body.verified !== 'boolean') {
      throw new BadRequestException('verified must be boolean');
    }

    const userId = BigInt(id);
    await this.adminService.setUserVerified(userId, body.verified);

    return { ok: true };
  }

  @Post('users/admin-by-email')
  async setUserAdminByEmail(
    @Body() body: { email?: string; isAdmin?: boolean },
  ) {
    const email = body.email?.trim();
    if (!email) {
      throw new BadRequestException('email is required');
    }
    if (typeof body.isAdmin !== 'boolean') {
      throw new BadRequestException('isAdmin must be boolean');
    }

    await this.adminService.setUserAdminByEmail(email, body.isAdmin);
    return { ok: true };
  }

  @Post('users/invalidate-sessions')
  async invalidateUserSessions(@Body() body: { userId?: string }) {
    const userIdStr = body.userId?.trim();
    if (!userIdStr) {
      throw new BadRequestException('userId is required');
    }
    const userId = BigInt(userIdStr);

    await this.adminService.invalidateAllSessionsForUser(userId);
    return { ok: true };
  }

  // ------- Секретные контейнеры -------

  @Get('restricted-containers')
  async listRestrictedContainers() {
    return this.adminService.getRestrictedContainers();
  }

  @Post('restricted-containers')
  async addRestrictedContainer(@Body() body: { dockerId?: string }) {
    const dockerId = body.dockerId?.trim();
    if (!dockerId) {
      throw new BadRequestException('dockerId is required');
    }

    await this.adminService.addRestrictedContainer(dockerId);
    return { ok: true };
  }

  @Delete('restricted-containers/:dockerId')
  async deleteRestrictedContainer(@Param('dockerId') dockerId: string) {
    const id = dockerId.trim();
    if (!id) {
      throw new BadRequestException('dockerId is required');
    }

    await this.adminService.removeRestrictedContainer(id);
    return { ok: true };
  }

  // ------- ACL по секретным (по email) -------

  @Get('restricted-access')
  async listRestrictedAccess() {
    return this.adminService.getRestrictedAccess();
  }

  @Post('restricted-access')
  async createRestrictedAccess(
    @Body() body: { dockerId?: string; email?: string },
  ) {
    const dockerId = body.dockerId?.trim();
    const email = body.email?.trim();

    if (!dockerId || !email) {
      throw new BadRequestException('dockerId and email are required');
    }

    await this.adminService.addRestrictedAccess(email, dockerId);
    return { ok: true };
  }

  @Delete('restricted-access')
  async deleteRestrictedAccess(
    @Body() body: { dockerId?: string; email?: string },
  ) {
    const dockerId = body.dockerId?.trim();
    const email = body.email?.trim();

    if (!dockerId || !email) {
      throw new BadRequestException('dockerId and email are required');
    }

    await this.adminService.removeRestrictedAccess(email, dockerId);
    return { ok: true };
  }

  // ===================== Templates / создание контейнера =====================

  @Get('hosts')
  async listHosts() {
    return this.adminService.listYanixHosts();
  }

  @Get('hosts/:hostLabel/templates')
  async getTemplates(@Param('hostLabel') hostLabel: string) {
    return this.adminService.getTemplatesForHost(hostLabel);
  }

  @Get('hosts/:hostLabel/templates/:template/placeholders')
  async getTemplatePlaceholders(
    @Param('hostLabel') hostLabel: string,
    @Param('template') template: string,
  ) {
    return this.adminService.getTemplatePlaceholders(hostLabel, template);
  }
  // ===================== YANIX SERVERS (CRUD) =====================

  @Get('yanix-servers')
  async listYanixServers() {
    return this.adminService.listYanixServers();
  }

  @Post('yanix-servers')
  async createYanixServer(@Body() dto: CreateYanixServerDto) {
    return this.adminService.createYanixServer(dto);
  }

  @Patch('yanix-servers/:hostLabel')
  async updateYanixServer(
    @Param('hostLabel') hostLabel: string,
    @Body() dto: UpdateYanixServerDto,
  ) {
    return this.adminService.updateYanixServer(hostLabel, dto);
  }

  @Delete('yanix-servers/:hostLabel')
  async deleteYanixServer(@Param('hostLabel') hostLabel: string) {
    return this.adminService.deleteYanixServer(hostLabel);
  }


  @Post('hosts/:hostLabel/servers')
  async createServerFromTemplate(
    @Param('hostLabel') hostLabel: string,
    @Body() dto: CreateTemplateServerDto,
  ) {
    return this.adminService.createServerFromTemplate(hostLabel, dto);
  }

  // ===================== COMMAND PATTERNS =====================

  @Get('command-patterns')
  async listCommandPatterns() {
    return this.adminService.getAllCommandPatterns();
  }

  @Post('command-patterns')
  async upsertCommandPattern(@Body() body: { name?: string; pattern?: any }) {
    const name = body.name?.trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }
    if (body.pattern === undefined || body.pattern === null) {
      throw new BadRequestException('pattern is required');
    }

    return this.adminService.upsertCommandPattern(name, body.pattern);
  }

  @Delete('command-patterns/:name')
  async deleteCommandPattern(@Param('name') name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('name is required');
    }

    await this.adminService.deleteCommandPattern(trimmed);
    return { ok: true };
  }

  // ===================== CONTAINER → PATTERN BINDINGS =====================

  @Get('container-command-patterns')
  async listContainerCommandPatternBindings() {
    return this.adminService.getAllContainerPatternBindings();
  }

  @Post('container-command-patterns')
  async upsertContainerCommandPatternBinding(
    @Body() body: { containerId?: string; patternName?: string },
  ) {
    const containerId = body.containerId?.trim();
    const patternName = body.patternName?.trim();

    if (!containerId) {
      throw new BadRequestException('containerId is required');
    }
    if (!patternName) {
      throw new BadRequestException('patternName is required');
    }

    return this.adminService.upsertContainerPatternBinding(
      containerId,
      patternName,
    );
  }

  @Delete('container-command-patterns/:containerId')
  async deleteContainerCommandPatternBinding(
    @Param('containerId') containerId: string,
  ) {
    const id = containerId.trim();
    if (!id) {
      throw new BadRequestException('containerId is required');
    }

    await this.adminService.deleteContainerPatternBinding(id);
    return { ok: true };
  }

  // ===================== CONTAINERS MAINTENANCE =====================

  @Post('containers/remove')
  async removeContainerByDockerId(@Body() body: { dockerId?: string }) {
    const dockerId = body.dockerId?.trim();
    if (!dockerId) {
      throw new BadRequestException('dockerId is required');
    }

    return this.serversService.adminRemoveContainerByDockerId(dockerId);
  }
}
