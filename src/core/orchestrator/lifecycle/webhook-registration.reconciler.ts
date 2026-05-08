import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DistributedLockService } from '@orchestrator/distributed-lock.service';
import { HireChannelLifecyclePublisher } from '@orchestrator/lifecycle/hire-channel-lifecycle.publisher';
import {
  HIRE_CHANNEL_LIFECYCLE_PORT,
  HireChannelLifecyclePort,
} from '@shared/ports/hire-channel-lifecycle.port';

const RECONCILER_LOCK_KEY = 'pulsar:webhook-registration-reconciler:cron:lock';
const RECONCILER_LOCK_TTL_MS = 55_000; // < 60s tick interval to allow next tick

const STUCK_REGISTERING_CUTOFF_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Periodic + boot-time scan that re-enqueues webhook-registration probes for
 * active telegram hires whose `webhookRegistration` is missing, `pending`,
 * `failed (< quarantineThreshold)`, or stuck-`registering (older than cutoff)`.
 *
 * Quarantines rows whose `attemptCount >= quarantineThreshold`. Stuck-
 * registering rows are reset to `failed` first (so their next eligible tick
 * picks them up via the `failed → registering` transition path).
 *
 * Multi-instance safety: distributed lock at the tick level + atomic Mongo
 * conditional updates (`expectStatus` + `expectLastAttemptAtBefore`) at the
 * row level + BullMQ stable jobId at the queue level.
 *
 * Host-only: registered in `OrchestratorModule` only when `WORKER_MODE !== 'true'`.
 */
@Injectable()
export class WebhookRegistrationReconciler implements OnApplicationBootstrap {
  private readonly logger = new Logger(WebhookRegistrationReconciler.name);

  constructor(
    private readonly lockService: DistributedLockService,
    private readonly publisher: HireChannelLifecyclePublisher,
    private readonly configService: ConfigService,
    @Inject(HIRE_CHANNEL_LIFECYCLE_PORT)
    private readonly lifecycle: HireChannelLifecyclePort,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Best-effort one-shot at boot so newly-deployed code reconciles legacy
    // and stuck rows immediately rather than waiting for the next tick.
    try {
      await this.tick();
    } catch (err) {
      this.logger.warn(
        `event=webhook_registration_reconciler_boot_tick_failed error=${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledTick(): Promise<void> {
    await this.tick();
  }

  private async tick(): Promise<void> {
    const token = await this.lockService.acquire(
      RECONCILER_LOCK_KEY,
      RECONCILER_LOCK_TTL_MS,
    );
    if (!token) {
      this.logger.debug(
        'event=webhook_registration_reconciler_tick_skipped reason=lock_not_acquired',
      );
      return;
    }
    try {
      const now = new Date();
      const stuckRegisteringCutoff = new Date(
        now.getTime() - STUCK_REGISTERING_CUTOFF_MS,
      );
      const pageSize = this.getPageSize();
      const quarantineThreshold = this.getQuarantineThreshold();

      const rows = await this.lifecycle.findReconcilableTelegramHires({
        limit: pageSize,
        stuckRegisteringCutoff,
        quarantineThreshold,
      });
      if (rows.length === 0) {
        this.logger.debug(
          'event=webhook_registration_reconciler_tick_done reconcilable=0',
        );
        return;
      }

      let enqueued = 0;
      let quarantined = 0;
      let stuckReset = 0;
      let dedupAtPort = 0;

      for (const row of rows) {
        // Stuck-registering takes precedence over quarantine: a row stuck in
        // `registering` gets reset to `failed` first (so the next tick picks
        // it up via the `failed → registering` path) rather than being
        // prematurely quarantined. The `expectLastAttemptAtBefore` predicate
        // eliminates the sub-second TOCTOU window where a concurrent registrar
        // attempt bumps `lastAttemptAt` between scan and update.
        if (row.currentStatus === 'registering') {
          const res = await this.lifecycle.recordOutcome({
            telegramBotId: row.telegramBotId,
            status: 'failed',
            lastError: 'reconciler:stuck_registering_reset',
            incrementAttempt: false,
            expectStatus: ['registering'],
            expectLastAttemptAtBefore: stuckRegisteringCutoff,
          });
          if (res.matched) {
            stuckReset += 1;
            this.logger.log(
              `event=webhook_registration_stuck_registering_reset botId=${row.telegramBotId}`,
            );
          } else {
            dedupAtPort += 1;
          }
          continue;
        }

        // Quarantine if the persisted attempt counter has crossed the threshold.
        if (row.attemptCount >= quarantineThreshold) {
          const res = await this.lifecycle.quarantineTelegramRegistration({
            telegramBotId: row.telegramBotId,
            lastError: 'reconciler:quarantine_threshold_exceeded',
          });
          if (res.matched) {
            quarantined += 1;
            this.logger.log(
              `event=webhook_registration_quarantined botId=${row.telegramBotId} attemptCount=${row.attemptCount}`,
            );
          } else {
            dedupAtPort += 1;
          }
          continue;
        }

        // pending or failed: claim the row by transitioning to `registering`,
        // then publish the probe. The conditional update is the multi-instance
        // dedup primary tier; BullMQ stable jobId is the secondary tier.
        const claim = await this.lifecycle.recordOutcome({
          telegramBotId: row.telegramBotId,
          status: 'registering',
          incrementAttempt: false,
          expectStatus: ['pending', 'failed', 'absent'],
        });
        if (!claim.matched) {
          dedupAtPort += 1;
          continue;
        }
        await this.publisher.publishProbe({
          telegramBotId: row.telegramBotId,
        });
        enqueued += 1;
      }

      this.logger.log(
        `event=webhook_registration_reconciler_tick_done reconcilable=${rows.length} enqueued=${enqueued} quarantined=${quarantined} stuck_reset=${stuckReset} dedup=${dedupAtPort}`,
      );
    } finally {
      await this.lockService.release(RECONCILER_LOCK_KEY, token);
    }
  }

  private getQuarantineThreshold(): number {
    const raw = this.configService.get<string | number | undefined>(
      'WEBHOOK_RECONCILER_QUARANTINE_AFTER_PROBES',
    );
    if (raw === undefined || raw === null || raw === '') return 4;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < 1) return 4;
    return n;
  }

  private getPageSize(): number {
    const raw = this.configService.get<string | number | undefined>(
      'WEBHOOK_RECONCILER_PAGE_SIZE',
    );
    if (raw === undefined || raw === null || raw === '') return 100;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < 1 || n > 1000) return 100;
    return n;
  }
}
