import { IsEnum, IsOptional } from 'class-validator';
import { MessageBrokerChannel, MessageBrokerStatus } from '@prisma/client';

export class ListMessageBrokersQueryDto {
  @IsOptional()
  @IsEnum(MessageBrokerChannel)
  channel?: MessageBrokerChannel;

  @IsOptional()
  @IsEnum(MessageBrokerStatus)
  status?: MessageBrokerStatus;
}
