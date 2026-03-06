import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { LlmUsageLogRepository } from '@persistence/repositories/llm-usage-log.repository';
import { MessageRepository } from '@persistence/repositories/message.repository';
import { QuotaPolicy } from '@domain/quota/quota-policy';

export interface QuotaCheckInput {
  clientId: string;
  agentId: string;
  channelId: Types.ObjectId;
  /** Client-level billing cycle anchor. All quota periods are derived from this. */
  clientBillingAnchor: Date;
  agentMonthlyTokenQuota: number | null;
  channelMonthlyMessageQuota: number | null;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
}

@Injectable()
export class QuotaEnforcementService {
  constructor(
    private readonly llmUsageLogRepository: LlmUsageLogRepository,
    private readonly messageRepository: MessageRepository,
  ) {}

  async check(input: QuotaCheckInput): Promise<QuotaCheckResult> {
    const period = QuotaPolicy.computeCurrentBillingPeriod(
      input.clientBillingAnchor,
      new Date(),
    );

    const clientIdObj = new Types.ObjectId(input.clientId);
    const agentIdObj = new Types.ObjectId(input.agentId);

    const [tokenUsage, messageCount] = await Promise.all([
      this.llmUsageLogRepository.sumTokensForClientAgent(
        clientIdObj,
        agentIdObj,
        period.start,
        period.end,
      ),
      this.messageRepository.countMessagesForClientChannel(
        clientIdObj,
        input.channelId,
        period.start,
        period.end,
      ),
    ]);

    const tokenExceeded = QuotaPolicy.isExceeded(
      input.agentMonthlyTokenQuota,
      tokenUsage,
    );
    if (tokenExceeded) {
      return {
        allowed: false,
        reason: `Agent token quota exceeded (${tokenUsage}/${input.agentMonthlyTokenQuota})`,
      };
    }

    const messageExceeded = QuotaPolicy.isExceeded(
      input.channelMonthlyMessageQuota,
      messageCount,
    );
    if (messageExceeded) {
      return {
        allowed: false,
        reason: `Channel message quota exceeded (${messageCount}/${input.channelMonthlyMessageQuota})`,
      };
    }

    return { allowed: true };
  }
}
