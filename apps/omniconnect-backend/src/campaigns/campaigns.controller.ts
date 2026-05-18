import { Controller, Get, Post, Body, Param, Delete, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ensureTenant } from '../common/utils/tenant-context';
import { Role } from '@prisma/client';
import csv from 'csv-parser';
import { Readable } from 'stream';

@ApiTags('campaigns')
@ApiBearerAuth('JWT-auth')
@Controller('campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) { }

  @Post()
  @Roles(Role.admin, Role.supervisor, Role.digital)
  create(@CurrentUser() user: any, @Body() createCampaignDto: CreateCampaignDto) {
    return this.campaignsService.create(ensureTenant(user), createCampaignDto);
  }

  @Post(':id/upload')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @UseInterceptors(FileInterceptor('file'))
  async uploadCsv(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('message') message?: string,
    @Body('useTemplate') useTemplate?: string,
    @Body('templateId') templateId?: string,
  ) {
    const tenantId = ensureTenant(user);
    console.log(`📤 [Campaigns] Upload CSV recebido para campanha ${id}`);
    console.log(`📄 [Campaigns] Arquivo:`, file ? { name: file.originalname, size: file.size, mimetype: file.mimetype } : 'NENHUM');
    console.log(`📝 [Campaigns] Mensagem: ${message || 'Nenhuma'}`);

    if (!file) {
      console.error('❌ [Campaigns] Arquivo CSV não recebido');
      throw new BadRequestException('Arquivo CSV é obrigatório');
    }

    const contacts = [];
    const stream = Readable.from(file.buffer.toString());
    console.log(`📊 [Campaigns] Processando CSV...`);

    return new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (row) => {
          console.log('📝 [Campaigns] Row do CSV:', row);
          if (row.name && row.phone) {
            // Extract variables (any column starting with 'variavel' or number)
            const variables = [];
            Object.keys(row).forEach(key => {
              const cleanKey = key.trim().toLowerCase();
              // Check for 'variavel' prefix or numeric keys (1, 2, 3...)
              if (cleanKey.startsWith('variavel')) {
                // Extract number/suffix from 'variavel1' -> '1'
                const suffix = cleanKey.replace('variavel', '').trim();
                if (suffix) {
                  variables.push({ key: suffix, value: row[key] });
                }
              } else if (!isNaN(Number(cleanKey)) && cleanKey !== '') {
                // Direct numeric keys '1', '2'
                variables.push({ key: cleanKey, value: row[key] });
              }
            });

            contacts.push({
              name: row.name,
              phone: row.phone,
              cpf: row.cpf || undefined,
              contract: row.contrato || row.contract || undefined,
              segment: row.segment ? parseInt(row.segment) : undefined,
              variables: variables.length > 0 ? variables : undefined
            });
          }
        })
        .on('end', async () => {
          console.log(`✅ [Campaigns] CSV processado: ${contacts.length} contatos encontrados`);
          try {
            const result = await this.campaignsService.uploadCampaign(
              tenantId,
              +id,
              contacts,
              message,
              useTemplate === 'true',
              templateId ? parseInt(templateId) : undefined,
            );
            console.log('✅ [Campaigns] Upload concluído:', result);
            resolve(result);
          } catch (error) {
            console.error('❌ [Campaigns] Erro no upload:', error.message);
            reject(error);
          }
        })
        .on('error', (error) => {
          console.error('❌ [Campaigns] Erro ao processar CSV:', error.message);
          reject(error);
        });
    });
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.digital)
  findAll(@CurrentUser() user: any) {
    return this.campaignsService.findAll(ensureTenant(user));
  }

  @Get(':id')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.campaignsService.findOne(ensureTenant(user), +id);
  }

  @Get('stats/:name')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  getStats(@CurrentUser() user: any, @Param('name') name: string) {
    return this.campaignsService.getStats(ensureTenant(user), name);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.campaignsService.remove(ensureTenant(user), +id);
  }
}
