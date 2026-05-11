# Role rollout runbook

This runbook covers operational concerns for the role-based authorization
layer added in `feature/role-based-authorization`. The system uses two
tier-disjoint enums:

- **Admin tier:** `super_admin` | `support` (default for new rows: `support`).
- **Client tier:** `owner` | `operator` (default for new rows: `operator`).

The bootstrap admin (seeded by `AdminUserSeederService` from `SEED_ADMIN_*`
env vars) is always inserted with `role: 'super_admin'`. The first user of
a fresh client (created by `OnboardingService.registerAndHire`) is always
inserted with `clientRole: 'owner'`. Subsequent users created by future
team-management endpoints inherit the schema default `'operator'`.

## Forward-only enum constraint

Per [`docs/rules/data-modeling.md`](../rules/data-modeling.md) §"Forward-only
enum evolution": once a role value has been shipped in the schema's `enum`
array, it must NEVER be removed — even on rollback. Removing a value will
cause Mongoose validation errors against any document already persisted with
that value.

If a role becomes obsolete:

- Stop writing it (remove from controllers' decorators, remove from
  service-layer creation paths).
- Migrate existing rows to a still-supported value via
  `AdminUserRepository.setRole` or `UserRepository.setClientRole`.
- Leave the old value in the `enum` list permanently.

Adding a new role is forward-compatible: extend the union, the
`ROLE_PERMISSIONS` map (lockstep test catches this), and the schema enum.

## Audit queries

Confirm owner assignments per client:

```javascript
db.users.find(
  { clientRole: 'owner' },
  { clientId: 1, email: 1, createdAt: 1 },
);
```

Confirm at least one super_admin exists:

```javascript
db.admin_users.find(
  { role: 'super_admin' },
  { email: 1, status: 1, createdAt: 1 },
);
```

Spot any row missing a role (should be impossible after release N because
both fields are `required: true` with defaults; a non-zero result indicates
a Mongoose `lean()` write or direct shell insert that bypassed validation):

```javascript
db.admin_users.find(
  { role: { $exists: false } },
  { email: 1, createdAt: 1 },
);

db.users.find(
  { clientRole: { $exists: false } },
  { clientId: 1, email: 1, createdAt: 1 },
);
```

Count users per role per client (sanity check after onboarding bursts):

```javascript
db.users.aggregate([
  { $group: { _id: { clientId: '$clientId', clientRole: '$clientRole' }, n: { $sum: 1 } } },
  { $sort: { '_id.clientId': 1, '_id.clientRole': 1 } },
]);
```

## Correcting a misassigned role

A misassigned admin role is corrected by a single `setRole` call (or shell
update). Example: promoting a `support` admin to `super_admin`:

```typescript
// In a Nest console / one-off script:
await adminUserRepository.setRole(adminUserId, 'super_admin');
```

Or via `mongosh`:

```javascript
db.admin_users.updateOne(
  { _id: ObjectId('...') },
  { $set: { role: 'super_admin' } },
);
```

A misassigned client role uses the symmetric `UserRepository.setClientRole`:

```javascript
db.users.updateOne(
  { _id: ObjectId('...') },
  { $set: { clientRole: 'owner' } },
);
```

The change takes effect on the **next request** for that user — no session
invalidation is needed because `validateAndTouch` re-reads the user document
on every request and `RolesGuard` reads the freshly-stamped role.

## Demotion semantics

Demoting a user (e.g. `super_admin` → `support`) takes effect on the next
request. This matches the existing `status` semantics — a user marked
`status: 'disabled'` mid-session is rejected the same way. There is no
explicit session invalidation step. If immediate revocation is required, use
the existing session-revocation paths
(`AdminSessionsService.revokeAllForAdmin` /
`ClientSessionsService.revokeAllForUser`).

## Deployment

This feature is deployed in a single release. The DB is **wiped** before
deploy. `AdminUserSeederService` recreates the bootstrap super-admin on
startup, and onboarding flows recreate the first user per client as
`owner`. Subsequent users inherit the `operator` default. No bootstrap
migration is needed.

If a fresh deploy is performed without wiping, the schema defaults
(`'support'` for admin, `'operator'` for client) cover any pre-existing rows
that get touched (Mongoose validators stamp the default on first
`save()` of a partial doc), but legacy rows that are not modified retain
absent fields. To be safe for an unwipe deploy, run the audit queries above
and run `setRole` / `setClientRole` for any rows missing the field.

## Rollback

Rolling back to a release without role enforcement leaves the persisted
`role` and `clientRole` fields in place; old code paths simply ignore them.
The forward-only enum rule still applies — never remove a shipped enum
value.
