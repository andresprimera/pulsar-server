import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { QuotaPolicy } from '@domain/quota/quota-policy';
import { AgentRepository } from '@persistence/repositories/agent.repository';
import { BillingRecordRepository } from '@persistence/repositories/billing-record.repository';
import { ChannelRepository } from '@persistence/repositories/channel.repository';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import { ClientRepository } from '@persistence/repositories/client.repository';

@Injectable()
export class BillingGeneratorService {
  private readonly logger = new Logger(BillingGeneratorService.name);

  constructor(
    private readonly billingRecordRepository: BillingRecordRepository,
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly clientRepository: ClientRepository,
    private readonly agentRepository: AgentRepository,
    private readonly channelRepository: ChannelRepository,
  ) {}

  /**
   * Generates a billing record for the client's current billing period if one
   * does not already exist. Uses the client-level billing anchor to compute
   * billing periods. All billing cycles for a client derive from
   * client.billingAnchor so that invoices and quota windows remain deterministic
   * across all subscriptions. Returns null if the client has no active
   * subscriptions or a record for the period already exists.
   */
  async generateForClient(
    clientId: string,
  ): Promise<{ clientId: string; periodStart: Date; periodEnd: Date } | null> {
    const client = await this.clientRepository.findById(clientId);
    if (!client) {
      return null;
    }

    const clientAgents = await this.clientAgentRepository.findByClientAndStatus(
      clientId,
      'active',
    );
    if (clientAgents.length === 0) {
      this.logger.debug(
        `No active ClientAgents for client ${clientId}; skipping billing generation.`,
      );
      return null;
    }

    const period = QuotaPolicy.computeCurrentBillingPeriod(
      client.billingAnchor,
      new Date(),
    );
    const periodStart = period.start;
    const periodEnd = period.end;

    const existing = await this.billingRecordRepository.findByClientAndPeriod(
      new Types.ObjectId(clientId),
      periodStart,
      periodEnd,
    );
    if (existing) {
      return null;
    }

    const items: Array<{
      type: 'agent' | 'channel';
      referenceId: Types.ObjectId;
      description: string;
      amount: number;
    }> = [];
    let totalAmount = 0;
    const currency = client.billingCurrency;

    for (const ca of clientAgents) {
      const agent = await this.agentRepository.findById(ca.agentId);
      items.push({
        type: 'agent',
        referenceId: new Types.ObjectId(ca.agentId),
        description: agent ? `Agent: ${agent.name}` : 'Agent subscription',
        amount: ca.agentPricing.amount,
      });
      totalAmount += ca.agentPricing.amount;

      for (const ch of ca.channels) {
        const channel = await this.channelRepository.findById(
          String(ch.channelId),
        );
        items.push({
          type: 'channel',
          referenceId: ch.channelId as Types.ObjectId,
          description: channel ? `Channel: ${channel.name}` : 'Channel',
          amount: ch.amount,
        });
        totalAmount += ch.amount;
      }
    }

    try {
      await this.billingRecordRepository.create({
        clientId: new Types.ObjectId(clientId),
        periodStart,
        periodEnd,
        currency,
        items,
        totalAmount,
        status: 'generated',
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        this.logger.debug(
          `Billing record already exists for client ${clientId} period ${periodStart.toISOString()}–${periodEnd.toISOString()} (concurrent generation).`,
        );
        return null;
      }
      throw err;
    }

    this.logger.log(
      `Generated billing record for client ${clientId} period ${periodStart.toISOString()}–${periodEnd.toISOString()} total=${totalAmount} ${currency}`,
    );

    return { clientId, periodStart, periodEnd };
  }
}
