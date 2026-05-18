import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InsightAiService } from '../insight-ai.service';
import { AnalyzeConversationDto } from '../dto/analyze-conversation.dto';

interface AnalyzeJobData {
  tenantId: string;
  contactPhone: string;
  dto: AnalyzeConversationDto;
}

@Processor('insight-ai')
export class AnalyzeConversationProcessor {
  private readonly logger = new Logger(AnalyzeConversationProcessor.name);

  constructor(private readonly insightAiService: InsightAiService) {}

  @Process('analyze-conversation')
  async handleAnalyzeConversation(job: Job<AnalyzeJobData>) {
    this.logger.log(`Start processing analyze-conversation for phone ${job.data.contactPhone}`);
    
    try {
      const { tenantId, contactPhone, dto } = job.data;
      const result = await this.insightAiService.analyzeByPhone(tenantId, contactPhone, dto);
      this.logger.log(`Completed analyze-conversation for phone ${contactPhone}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to analyze conversation for phone ${job.data.contactPhone}: ${error.message}`);
      throw error;
    }
  }
}
