import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../common/utils/tenant-context';
import { CrmPdfParserService } from './crm-pdf-parser.service';
import { ParseCrmDocumentDto } from './dto/parse.dto';

@Controller('crm/pdf-parser')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CrmPdfParserController {
  constructor(private readonly service: CrmPdfParserService) {}

  /**
   * Extrai campos estruturados de uma proposta/contrato a partir do
   * texto bruto do PDF. O frontend já fez o OCR/extração via pdf.js
   * antes de chamar este endpoint.
   */
  @Post()
  @Roles(Role.admin, Role.supervisor, Role.broker)
  parse(
    @CurrentUser() user: RequestUserLike,
    @Body() dto: ParseCrmDocumentDto,
  ) {
    return this.service.parse(ensureTenant(user), dto);
  }
}
