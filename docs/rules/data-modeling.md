# Data Modeling Rules

`docs/rules/ARCHITECTURE_CONTRACT.md` has higher priority than this file.

## Schema shape
- Use explicit `collection` names and `timestamps: true`.
- Keep subdocuments embedded with `@Schema({ _id: false })` when they are not independent aggregates.
- Use `Types.ObjectId` + `ref` for references.

## Status conventions
- Status fields must use explicit enums with indexed values.
- Service-layer create flows must explicitly set `status: 'active'` instead of relying only on schema defaults.

## Indexing
- Add indexes for frequent lookup fields.
- Add compound indexes for routing and high-frequency filters.
- Add unique indexes for business invariants.
- Define compound/unique indexes after `SchemaFactory.createForClass(...)`.

## Transactions
- Any multi-document write that must be atomic must use a MongoDB transaction.
- Repositories participating in transactions must accept optional `session`.
- Map duplicate key (`E11000`) to conflict semantics in service layer.

## Repository behavior
- Repository not-found returns `null`; service layer decides domain/API exception behavior.
- Always execute Mongoose queries with `.exec()`.
