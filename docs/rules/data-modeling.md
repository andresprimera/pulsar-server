# Data Modeling Conventions

## Embedded Subdocuments

Embedded subdocuments use `@Schema({ _id: false })` — no separate collection, no auto-generated `_id`.

```typescript
@Schema({ _id: false })
export class HireChannelConfig {
  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true })
  channelId: Types.ObjectId;

  @Prop({ required: true, enum: ChannelProvider })
  provider: ChannelProvider;
  // ...
}

export const HireChannelConfigSchema = SchemaFactory.createForClass(HireChannelConfig);
```

Then embed in the parent schema:

```typescript
@Prop({ type: [HireChannelConfigSchema], required: true })
channels: HireChannelConfig[];
```

## Schema Indexes

- Add `index: true` on frequently queried fields (`status`, routing identifiers)
- Use compound indexes for routing queries
- Use unique indexes for business constraints
- Define compound/unique indexes after `SchemaFactory.createForClass()`

```typescript
export const ClientAgentSchema = SchemaFactory.createForClass(ClientAgent);

// Business constraint: one hire per client-agent pair
ClientAgentSchema.index({ clientId: 1, agentId: 1 }, { unique: true });

// Routing indexes
ClientAgentSchema.index({ status: 1, 'channels.phoneNumberId': 1 });
ClientAgentSchema.index({ status: 1, 'channels.tiktokUserId': 1 });
ClientAgentSchema.index({ status: 1, 'channels.instagramAccountId': 1 });
```

## Schema Conventions

All schemas follow this pattern:

```typescript
@Schema({ collection: 'collection_name', timestamps: true })
export class EntityName extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({
    required: true,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
    index: true,
  })
  status: 'active' | 'inactive' | 'archived';

  createdAt: Date;
  updatedAt: Date;
}

export const EntityNameSchema = SchemaFactory.createForClass(EntityName);
```

Key conventions:
- `timestamps: true` — auto `createdAt` / `updatedAt`
- `collection` — explicit collection name (snake_case, plural)
- Extend `Document` for Mongoose type safety
- Export `Schema` constant via `SchemaFactory.createForClass()`
- References use `Types.ObjectId` with `ref`

## Status Default on Create

Service `create()` methods MUST explicitly set `status: 'active'`:

```typescript
async create(dto: CreateAgentDto) {
  return this.agentRepository.create({
    ...dto,
    status: 'active',  // Explicit, don't rely on schema default
  });
}
```

## Transaction & Multi-Document Writes

Multi-document writes that must be atomic MUST use MongoDB transactions:

```typescript
const session = await this.connection.startSession();
session.startTransaction();

try {
  // Pre-transaction validation (fail fast, before session)
  await this.agentRepository.validateHireable(dto.agentId);

  // All writes pass the session
  const client = await this.clientRepository.create({ ... }, session);
  const user = await this.userRepository.create({ ... }, session);

  await session.commitTransaction();
  return { client, user };
} catch (error) {
  try { await session.abortTransaction(); } catch { /* already aborted */ }

  // Map MongoDB E11000 → ConflictException
  if (error?.code === 11000) {
    throw new ConflictException('Duplicate resource');
  }
  throw error;
} finally {
  session.endSession();
}
```

Repository methods accept optional `session?: ClientSession` for this purpose:

```typescript
async create(data: Partial<Entity>, session?: ClientSession): Promise<Entity> {
  const [doc] = await this.model.create([data], { session });
  return doc;
}
```

## Repository Conventions

- Repositories return `null` for not-found cases — the **service layer** throws `NotFoundException`
- Exception: `findByIdOrFail()` in `ChannelRepository` throws directly (validation convenience, not the default pattern)
- Always call `.exec()` on Mongoose queries
- Use `Partial<Entity>` for create/update data types
