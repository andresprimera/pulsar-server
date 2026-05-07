export const HIRE_CHANNEL_LIFECYCLE_PORT = Symbol(
  'HIRE_CHANNEL_LIFECYCLE_PORT',
);

export type WebhookRegistrationStatus =
  | 'pending'
  | 'registering'
  | 'registered'
  | 'failed'
  | 'quarantined';

export interface WebhookRegistrationStateSnapshot {
  status: WebhookRegistrationStatus;
  fingerprint?: string;
  lastAttemptAt?: Date;
  registeredAt?: Date;
  attemptCount?: number;
  lastError?: string;
}

export interface ReconcilableTelegramHire {
  clientAgentId: string;
  telegramBotId: string;
  currentStatus: 'pending' | 'registering' | 'failed' | undefined;
  attemptCount: number;
}

export interface RecordOutcomeInput {
  telegramBotId: string;
  /**
   * The status to write. Note `'quarantined'` is NOT a valid input here — use
   * `quarantineTelegramRegistration` instead. The reconciler writes `'pending'`
   * on the post-commit, pre-enqueue lifecycle stamping; the registrar writes
   * `'registering' | 'registered' | 'failed'`.
   */
  status: 'pending' | 'registering' | 'registered' | 'failed';
  fingerprint?: string;
  lastError?: string;
  /**
   * When true, atomically `$inc`s `attemptCount`. Default `false`. The
   * registrar's terminal `failed` write (worker `failed` event) and the
   * reconciler's stuck-registering reset write pass `true`; everything else
   * passes `false` (or omits this flag).
   */
  incrementAttempt?: boolean;
  /**
   * If set, the conditional update only matches rows whose current
   * `webhookRegistration.status` is in this allow-list. Use the literal
   * `'absent'` to require the sub-document to be missing. Concrete statuses
   * and `'absent'` may be combined; the resulting predicate is the disjunction.
   *
   * If unset, no status precondition is applied (caller accepts whatever the
   * row's current status is).
   */
  expectStatus?: ReadonlyArray<'absent' | WebhookRegistrationStatus>;
  /**
   * If set, additionally requires
   * `webhookRegistration.lastAttemptAt < expectLastAttemptAtBefore` at the
   * moment of the conditional update. Used by the reconciler's stuck-
   * registering reset to eliminate the sub-second TOCTOU between
   * `findReconcilableTelegramHires` returning the row and this update
   * executing.
   */
  expectLastAttemptAtBefore?: Date;
}

export interface HireChannelLifecyclePort {
  recordOutcome(input: RecordOutcomeInput): Promise<{ matched: boolean }>;

  loadForRegistration(telegramBotId: string): Promise<{
    encryptedCredentials: Record<string, unknown>;
    webhookRegistration?: WebhookRegistrationStateSnapshot;
  } | null>;

  /**
   * Sets `webhookRegistration.status = 'quarantined'` for the matching telegram
   * channel. No `$inc`. Quarantined rows are NOT picked up by the reconciler
   * scan; manual operator reset (via the migration runner or CLI script) is
   * required to bring them back to `'pending'`.
   */
  quarantineTelegramRegistration(input: {
    telegramBotId: string;
    lastError?: string;
  }): Promise<{ matched: boolean }>;

  /**
   * Returns a page of telegram hires whose webhookRegistration is missing,
   * pending, failed (and below the quarantine threshold), or stuck-registering
   * (and below the threshold). Excludes registered and quarantined.
   *
   * Reads MUST NOT decrypt or select encrypted credential fields.
   */
  findReconcilableTelegramHires(input: {
    limit: number;
    stuckRegisteringCutoff: Date;
    quarantineThreshold: number;
  }): Promise<ReconcilableTelegramHire[]>;
}
