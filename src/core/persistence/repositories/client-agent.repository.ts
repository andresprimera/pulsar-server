import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, UpdateQuery } from 'mongoose';
import { ClientAgent } from '@persistence/schemas/client-agent.schema';
import { normalizeToE164 } from '@shared/e164.util';

@Injectable()
export class ClientAgentRepository {
  constructor(
    @InjectModel(ClientAgent.name)
    private readonly model: Model<ClientAgent>,
  ) {}

  async findById(id: string): Promise<ClientAgent | null> {
    return this.model.findById(id).exec();
  }

  async findAll(): Promise<ClientAgent[]> {
    return this.model.find().exec();
  }

  async create(
    data: Partial<ClientAgent>,
    session?: ClientSession,
  ): Promise<ClientAgent> {
    const normalized = this.normalizeChannelPhoneNumbers(data);
    const opts = session ? { session } : {};
    const [doc] = await this.model.create([normalized], opts);
    return doc;
  }

  /**
   * Find all ClientAgents for a given client.
   * Note: `credentials` and `apiKey` are excluded by default (select: false).
   * This is intentional — use `select('+channels.credentials')` only
   * in routing queries that need to decrypt credentials.
   */
  async findByClient(clientId: string): Promise<ClientAgent[]> {
    return this.model.find({ clientId }).exec();
  }

  async findByClientAndAgent(
    clientId: string,
    agentId: string,
  ): Promise<ClientAgent | null> {
    return this.model.findOne({ clientId, agentId }).exec();
  }

  async findByClientAndStatus(
    clientId: string,
    status: 'active' | 'inactive' | 'archived',
  ): Promise<ClientAgent[]> {
    return this.model.find({ clientId, status }).exec();
  }

  async update(
    id: string,
    data: Partial<ClientAgent>,
  ): Promise<ClientAgent | null> {
    const normalized = this.normalizeChannelPhoneNumbers(data);
    return this.model.findByIdAndUpdate(id, normalized, { new: true }).exec();
  }

  async updateWithQuery(
    id: string,
    update: UpdateQuery<ClientAgent>,
  ): Promise<ClientAgent | null> {
    return this.model.findByIdAndUpdate(id, update, { new: true }).exec();
  }

  /** Ensures channel.phoneNumberId is stored as E.164 (single place for persistence format). */
  private normalizeChannelPhoneNumbers(
    data: Partial<ClientAgent>,
  ): Partial<ClientAgent> {
    if (!data?.channels?.length) return data;
    return {
      ...data,
      channels: data.channels.map((ch) =>
        ch.phoneNumberId
          ? { ...ch, phoneNumberId: normalizeToE164(ch.phoneNumberId) }
          : ch,
      ),
    };
  }

  /**
   * Find ClientAgent by WhatsApp phoneNumberId within embedded channels.
   * Checks for active status and matching credentials.
   */
  async findOneByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<ClientAgent | null> {
    const matches = await this.findActiveByPhoneNumberId(phoneNumberId);
    return matches[0] ?? null;
  }

  /**
   * Find all active ClientAgents by WhatsApp phoneNumberId within embedded channels.
   */
  async findActiveByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<ClientAgent[]> {
    const canonical = normalizeToE164(phoneNumberId);
    return this.model
      .find({
        status: 'active',
        channels: {
          $elemMatch: {
            status: 'active',
            phoneNumberId: canonical,
          },
        },
      })
      .select('+channels.credentials +channels.llmConfig.apiKey')
      .exec();
  }

  /**
   * Find ClientAgent by TikTok user ID within embedded channels.
   * Checks for active status and matching tiktokUserId.
   */
  async findOneByTiktokUserId(
    tiktokUserId: string,
  ): Promise<ClientAgent | null> {
    const matches = await this.findActiveByTiktokUserId(tiktokUserId);
    return matches[0] ?? null;
  }

  /**
   * Find all active ClientAgents by TikTok user ID within embedded channels.
   */
  async findActiveByTiktokUserId(tiktokUserId: string): Promise<ClientAgent[]> {
    return this.model
      .find({
        status: 'active',
        channels: {
          $elemMatch: {
            status: 'active',
            tiktokUserId,
          },
        },
      })
      .select('+channels.credentials +channels.llmConfig.apiKey')
      .exec();
  }

  /**
   * Find ClientAgent by Instagram account ID within embedded channels.
   * Checks for active status and matching instagramAccountId.
   */
  async findOneByInstagramAccountId(
    instagramAccountId: string,
  ): Promise<ClientAgent | null> {
    const matches = await this.findActiveByInstagramAccountId(
      instagramAccountId,
    );
    return matches[0] ?? null;
  }

  /**
   * Find all active ClientAgents by Instagram account ID within embedded channels.
   */
  async findActiveByInstagramAccountId(
    instagramAccountId: string,
  ): Promise<ClientAgent[]> {
    return this.model
      .find({
        status: 'active',
        channels: {
          $elemMatch: {
            status: 'active',
            instagramAccountId,
          },
        },
      })
      .select('+channels.credentials +channels.llmConfig.apiKey')
      .exec();
  }

  /**
   * Find all active ClientAgents by Telegram bot user id (token prefix).
   */
  async findActiveByTelegramBotId(
    telegramBotId: string,
  ): Promise<ClientAgent[]> {
    return this.model
      .find({
        status: 'active',
        channels: {
          $elemMatch: {
            status: 'active',
            telegramBotId,
          },
        },
      })
      .select('+channels.credentials +channels.llmConfig.apiKey')
      .exec();
  }

  /**
   * Same routing query as findActiveByTelegramBotId but does not load encrypted
   * credentials (for webhook secret verification using plaintext hex only).
   */
  async findActiveByTelegramBotIdForWebhookAuth(
    telegramBotId: string,
  ): Promise<ClientAgent[]> {
    return this.model
      .find({
        status: 'active',
        channels: {
          $elemMatch: {
            status: 'active',
            telegramBotId,
          },
        },
      })
      .exec();
  }

  async findActiveByTelegramBotIdForWebhookRegistration(
    telegramBotId: string,
  ): Promise<ClientAgent[]> {
    return this.model
      .find({
        status: 'active',
        channels: { $elemMatch: { status: 'active', telegramBotId } },
      })
      .select(
        '_id channels.channelId channels.provider channels.status ' +
          'channels.telegramBotId channels.telegramWebhookSecretHex ' +
          'channels.credentials channels.webhookRegistration',
      )
      .select('+channels.credentials')
      .exec();
  }

  async updateWebhookRegistrationByTelegramBotId(input: {
    telegramBotId: string;
    status: 'pending' | 'registering' | 'registered' | 'failed';
    fingerprint?: string;
    lastError?: string;
    /**
     * When true, atomically `$inc`s `attemptCount`. Default false. The registrar's
     * terminal `failed` write (worker `failed` event) and the reconciler's
     * stuck-registering-reset write pass true; everything else passes false.
     */
    incrementAttempt?: boolean;
    /**
     * If set, the array-filter requires the current `webhookRegistration.status`
     * to satisfy the predicate. Use the literal `'absent'` to require the
     * sub-document to be missing. Other entries are matched via `$in`.
     * `'absent'` and concrete statuses may be combined; the resulting predicate
     * is the disjunction (`$or`).
     */
    expectStatus?: ReadonlyArray<
      | 'absent'
      | 'pending'
      | 'registering'
      | 'registered'
      | 'failed'
      | 'quarantined'
    >;
    /**
     * If set, the array-filter additionally requires
     * `webhookRegistration.lastAttemptAt < expectLastAttemptAtBefore`.
     * Used by the reconciler's stuck-registering reset to eliminate the
     * sub-second TOCTOU between `findReconcilable` returning the row and this
     * conditional update executing.
     */
    expectLastAttemptAtBefore?: Date;
  }): Promise<{ matched: boolean }> {
    const now = new Date();

    const $set: Record<string, unknown> = {
      'channels.$[ch].webhookRegistration.status': input.status,
      'channels.$[ch].webhookRegistration.lastAttemptAt': now,
    };
    if (input.fingerprint !== undefined) {
      $set['channels.$[ch].webhookRegistration.fingerprint'] =
        input.fingerprint;
    }
    if (input.status === 'registered') {
      $set['channels.$[ch].webhookRegistration.registeredAt'] = now;
      $set['channels.$[ch].webhookRegistration.lastError'] = null;
    }
    if (input.lastError !== undefined) {
      $set['channels.$[ch].webhookRegistration.lastError'] = input.lastError;
    }

    const update: Record<string, unknown> = { $set };
    if (input.incrementAttempt === true) {
      update.$inc = {
        'channels.$[ch].webhookRegistration.attemptCount': 1,
      };
    }

    const filter: Record<string, unknown> = {
      status: 'active',
      channels: {
        $elemMatch: { status: 'active', telegramBotId: input.telegramBotId },
      },
    };

    const arrayFilterCh: Record<string, unknown> = {
      'ch.status': 'active',
      'ch.telegramBotId': input.telegramBotId,
    };
    if (input.status === 'registering' && input.fingerprint !== undefined) {
      arrayFilterCh['ch.webhookRegistration.fingerprint'] = {
        $ne: input.fingerprint,
      };
    }
    if (input.expectStatus && input.expectStatus.length > 0) {
      const concrete = input.expectStatus.filter((s) => s !== 'absent');
      const wantsAbsent = input.expectStatus.includes('absent');
      const orClauses: Record<string, unknown>[] = [];
      if (concrete.length > 0) {
        orClauses.push({
          'ch.webhookRegistration.status': { $in: concrete },
        });
      }
      if (wantsAbsent) {
        orClauses.push({ 'ch.webhookRegistration': { $exists: false } });
      }
      if (orClauses.length === 1) {
        Object.assign(arrayFilterCh, orClauses[0]);
      } else if (orClauses.length > 1) {
        arrayFilterCh.$or = orClauses;
      }
    }
    if (input.expectLastAttemptAtBefore !== undefined) {
      arrayFilterCh['ch.webhookRegistration.lastAttemptAt'] = {
        $lt: input.expectLastAttemptAtBefore,
      };
    }

    const res = await this.model
      .updateOne(filter, update, { arrayFilters: [{ ch: arrayFilterCh }] })
      .exec();

    return { matched: res.matchedCount > 0 && res.modifiedCount > 0 };
  }

  /**
   * Sets webhookRegistration.status = 'quarantined' for the matching telegram
   * channel. No `$inc`. Used by the reconciler when attemptCount crosses the
   * configured threshold.
   */
  async quarantineWebhookRegistration(input: {
    telegramBotId: string;
    lastError?: string;
  }): Promise<{ matched: boolean }> {
    const now = new Date();
    const $set: Record<string, unknown> = {
      'channels.$[ch].webhookRegistration.status': 'quarantined',
      'channels.$[ch].webhookRegistration.lastAttemptAt': now,
    };
    if (input.lastError !== undefined) {
      $set['channels.$[ch].webhookRegistration.lastError'] = input.lastError;
    }
    const res = await this.model
      .updateOne(
        {
          status: 'active',
          channels: {
            $elemMatch: {
              status: 'active',
              telegramBotId: input.telegramBotId,
            },
          },
        },
        { $set },
        {
          arrayFilters: [
            {
              ch: {
                'ch.status': 'active',
                'ch.telegramBotId': input.telegramBotId,
              },
            },
          ],
        },
      )
      .exec();
    return { matched: res.matchedCount > 0 && res.modifiedCount > 0 };
  }

  /**
   * Returns rows the reconciler should act on: active hires with at least one
   * active telegram channel whose webhookRegistration is missing OR has status
   * in {pending, failed} AND attemptCount < quarantineThreshold, OR has status
   * 'registering' AND lastAttemptAt < stuckRegisteringCutoff. Excludes
   * 'registered' and 'quarantined'.
   *
   * Note: `attemptCount` is read as the channel's persisted counter so the
   * reconciler can decide whether to quarantine before re-enqueueing.
   */
  async findReconcilableTelegramHires(input: {
    limit: number;
    stuckRegisteringCutoff: Date;
    quarantineThreshold: number;
  }): Promise<
    Array<{
      clientAgentId: string;
      telegramBotId: string;
      currentStatus: 'pending' | 'registering' | 'failed' | undefined;
      attemptCount: number;
    }>
  > {
    const docs = await this.model
      .aggregate<{
        _id: unknown;
        ch: {
          telegramBotId?: string;
          webhookRegistration?: {
            status?: 'pending' | 'registering' | 'failed';
            attemptCount?: number;
          };
        };
      }>([
        { $match: { status: 'active' } },
        { $unwind: '$channels' },
        {
          $match: {
            'channels.status': 'active',
            'channels.provider': 'telegram',
            'channels.telegramBotId': { $exists: true, $ne: null },
            $or: [
              { 'channels.webhookRegistration': { $exists: false } },
              {
                $and: [
                  {
                    'channels.webhookRegistration.status': {
                      $in: ['pending', 'failed'],
                    },
                  },
                  {
                    $or: [
                      {
                        'channels.webhookRegistration.attemptCount': {
                          $exists: false,
                        },
                      },
                      {
                        'channels.webhookRegistration.attemptCount': {
                          $lt: input.quarantineThreshold,
                        },
                      },
                    ],
                  },
                ],
              },
              {
                $and: [
                  { 'channels.webhookRegistration.status': 'registering' },
                  {
                    'channels.webhookRegistration.lastAttemptAt': {
                      $lt: input.stuckRegisteringCutoff,
                    },
                  },
                  {
                    $or: [
                      {
                        'channels.webhookRegistration.attemptCount': {
                          $exists: false,
                        },
                      },
                      {
                        'channels.webhookRegistration.attemptCount': {
                          $lt: input.quarantineThreshold,
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
        {
          $project: {
            _id: 1,
            'ch.telegramBotId': '$channels.telegramBotId',
            'ch.webhookRegistration.status':
              '$channels.webhookRegistration.status',
            'ch.webhookRegistration.attemptCount':
              '$channels.webhookRegistration.attemptCount',
          },
        },
        { $limit: input.limit },
      ])
      .exec();

    return docs.map((d) => ({
      clientAgentId: String(d._id),
      telegramBotId: String(d.ch.telegramBotId),
      currentStatus: d.ch.webhookRegistration?.status,
      attemptCount: d.ch.webhookRegistration?.attemptCount ?? 0,
    }));
  }
}
