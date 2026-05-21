# Inbox operator outbound — Phase 2 runbook

This runbook covers operational concerns introduced by Phase 2 of the
inbox feature (`POST /inbox/conversations/:id/messages`). It documents the
forward-only schema changes on `messages`, the partial-unique idempotency
index, and the Phase-3 follow-up alerts that are declared but not yet
implemented.

## Schema additions on `Message`

Phase 2 widens the `Message` schema additively. All additions are optional
and the partial-unique index is empty against existing documents on
schema load.

### Forward-only enum widening

Per [`docs/rules/data-modeling.md`](../rules/data-modeling.md) §"Forward-only
enum evolution", once a value has been shipped in a schema's `enum` array
it MUST NEVER be removed — even on rollback. Phase 2 adds the following
values that are now permanent:

- `Message.type` gains `'human'`. Existing `'user'`, `'agent'`, and
  `'summary'` values are unchanged.
- `Message.deliveryStatus` is a new field with permitted values
  `'pending' | 'sent' | 'failed'`.

If a value above becomes obsolete in the future:

- Stop writing it (update the operator-send service and any callers).
- Migrate existing rows (if any) to a still-supported value via a one-off
  migration before removing application-level writes.
- Leave the old value in the `enum` list permanently.

### New fields

- `authorClientUserId?: ObjectId<User>` — required when `type === 'human'`
  (enforced by the `pre('validate')` and `pre('findOneAndUpdate')` hooks).
  Indexed (single-field) to support future operator-activity dashboards.
- `deliveryStatus?: 'pending' | 'sent' | 'failed'` — transport delivery
  outcome for operator-authored rows. Separate from `status`
  (lifecycle/visibility) by design: mixing the two would break inbox-read
  filters that rely on `status: 'active'`. No mandatory index in Phase 2.
- `idempotencyKey?: string` — per-conversation client-supplied UUID v4.

### Partial-unique compound index

```
{ conversationId: 1, idempotencyKey: 1 }
```

with `partialFilterExpression: { idempotencyKey: { $exists: true } }` and
name `message_idempotency_key_idx`.

- Created by Mongoose `autoIndex` on schema load. Safe because zero
  existing documents carry `idempotencyKey`, so the index is empty.
- This is the SOLE idempotency primitive for the operator outbound path.
  `processed_events` is NOT touched on this write path (Phase 2 does not
  modify the inbound `(channel, messageId)` primitive).
- Per-conversation scope: the same key on a different conversation is a
  new request.

## Idempotency contract

Clients MUST send `Idempotency-Key: <uuid-v4>` on every
`POST /inbox/conversations/:id/messages` request. The endpoint:

1. Cheap-path replay: if a prior row with the same
   `(conversationId, idempotencyKey)` exists, return it without
   dispatching.
2. Race-recovery: if the `INSERT` races a concurrent identical request
   and Mongo raises `E11000` against
   `message_idempotency_key_idx`, the service re-reads via
   `findByIdempotencyKey` and returns the prior row.

A crash between `INSERT` (step 2) and the gateway dispatch (step 3)
leaves a row with `deliveryStatus: 'pending'`. Retries with the SAME key
hit the replay branch and do NOT re-dispatch. To force a retry the
operator must issue a NEW `Idempotency-Key`.

## Audit queries

Find operator-authored rows by user:

```javascript
db.messages.find(
  { type: 'human', authorClientUserId: ObjectId('...') },
  { _id: 1, conversationId: 1, deliveryStatus: 1, createdAt: 1 },
);
```

Find delivery failures over the last 24 hours:

```javascript
db.messages.find(
  {
    type: 'human',
    deliveryStatus: 'failed',
    createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  },
  { conversationId: 1, channelId: 1, idempotencyKey: 1, createdAt: 1 },
);
```

Find rows stuck in `'pending'` (Phase-3 alert candidate — see below):

```javascript
db.messages.find(
  {
    type: 'human',
    deliveryStatus: 'pending',
    createdAt: { $lt: new Date(Date.now() - 60 * 1000) },
  },
  { conversationId: 1, idempotencyKey: 1, createdAt: 1 },
);
```

## TikTok caveat — `conversation_id` not available on operator-send

TikTok's outbound `/message/send/` endpoint requires a `conversation_id`
returned by the inbound webhook payload to be passed back verbatim. That
identifier is not currently available on the operator-send path (the
operator-outbound flow resolves the `Channel`, the hire-channel
configuration, and `Contact.externalId`, but not the per-thread TikTok
`conversation_id`).

Consequences in Phase 2:

- Operator-send to TikTok will land in `deliveryStatus: 'failed'` on
  every attempt, because the TikTok adapter cannot satisfy the outbound
  contract without the missing identifier.
- The conversation list still bubbles up (touch fires on failure too),
  and the persisted row stays in the thread so the operator sees the
  attempt — exactly as for any other transport failure.
- On-call should treat the TikTok failed-row metric SEPARATELY from
  genuine transport errors on other channels: a TikTok `'failed'` row
  is, in Phase 2, structurally expected rather than a regression signal.
  When triaging the `deliveryStatus === 'failed'` audit query above,
  exclude TikTok before drawing conclusions about provider health.

Phase 3 will resolve TikTok conversation context (persist the inbound
`conversation_id` on the thread, then thread it through to the adapter)
so operator outbound on TikTok reaches `'sent'` like the other channels.
Until then, frontend UX should treat TikTok operator replies as a
known-bad path.

## Phase-3 follow-ups (declared, not implemented)

The following items are intentionally out of scope for Phase 2; they are
recorded here so on-call has context if they surface.

- **Stuck-`pending` alert.** A metric counter on
  `type === 'human' AND deliveryStatus === 'pending' AND
   createdAt < now() - 60s` should fire an alert. The query above is the
  read shape; the counter and alert wiring are deferred.
- **Granular delivery-failure taxonomy.** Phase 2 collapses all downstream
  channel failures into HTTP 502 with `deliveryStatus: 'failed'`. Phase 3
  will introduce a richer taxonomy (transient vs permanent) and may add
  retry mechanics.
- **`MessagePersistenceService` convergence.** The operator-send write
  surface is intentionally separate from `MessagePersistenceService` in
  Phase 2. A future refactor will accept an options bag
  (`touchOnSuccess`, `attribution`, `idempotencyKey?`) so all `Message`
  writes flow through a single seam.

## Rollback notes

- The `'human'` enum value and the `deliveryStatus` enum values MUST stay
  in the schema even if the Phase-2 application code is reverted. Removing
  them would fail validation against any row that has already been
  written.
- The partial-unique index can be dropped if Phase 2 is reverted, but is
  safe to keep — it indexes only operator-authored rows.
- `processed_events` is unchanged in Phase 2; no rollback action required
  for the inbound idempotency path.
