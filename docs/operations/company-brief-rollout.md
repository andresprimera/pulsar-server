# Company brief and legacy org text (operations)

Application code reads **`companyBrief`** on the `clients` collection and **`promptSupplement`** on `client_agents` only. It does **not** read the legacy top-level string field that existed before this feature on `clients`.

## Rollout order

1. Run **Phase 1** backfill in production **before** serving a build that never reads the legacy field (see canonical pipeline in `backend/docs/plans/_plan-artifact-org-llm-context-v2.md`).
2. Deploy the application version that uses `companyBrief` / `promptSupplement` only.
3. Optionally run **Phase 2**: `$unset` the legacy field on `clients` for storage hygiene (same document as Phase 1).

## Verification

From the monorepo root:

```bash
rg brandVoice backend/src backend/test frontend/src
```

Expect **zero** matches (historical docs and this file are excluded from that gate by path).
