import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../common/utils/tenant-context';
import { crmActor } from '../crm/common/actor';
import { CrmStorageService } from './crm-storage.service';
import { UploadCrmDocumentDto } from './dto/storage.dto';

@Controller('crm/storage')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CrmStorageController {
  constructor(private readonly service: CrmStorageService) {}

  @Post('upload')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async upload(
    @CurrentUser() user: RequestUserLike,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadCrmDocumentDto,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.service.upload(ensureTenant(user), crmActor(user), {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      parentType: dto.parentType,
      parentId: dto.parentId,
      fileName: dto.fileName,
    });
  }

  @Get('files/:fileId')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  async serve(
    @CurrentUser() user: RequestUserLike,
    @Param('fileId') fileIdRaw: string,
    @Res() res: Response,
  ) {
    // Aceita "fileId" puro ou "fileId.ext" (caso o cliente armazene o URL).
    const fileId = fileIdRaw.split('.')[0];
    const { absolutePath, mimeType, fileName } = await this.service.readForServe(
      ensureTenant(user),
      crmActor(user),
      fileId,
    );
    res.setHeader('Content-Type', mimeType);
    if (fileName) {
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${fileName.replace(/"/g, '')}"`,
      );
    }
    return res.sendFile(absolutePath);
  }
}
