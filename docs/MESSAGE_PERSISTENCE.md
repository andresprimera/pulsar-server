# Message Persistence for WhatsApp Channel

This document describes the message persistence implementation for the WhatsApp channel in Pulsar.

## Overview

The WhatsApp channel now persists all user messages, agent responses, and conversation summaries to the database. This enables:

1. **Conversation Context**: Agents receive the full conversation history to provide contextual responses
2. **Automatic Summarization**: Long conversations are automatically summarized to maintain efficiency
3. **External User Management**: Users are identified by their WhatsApp phone numbers (external IDs)

## How It Works

### 1. Message Flow

When a WhatsApp message arrives:

```
Incoming Message
    ↓
Find/Create User (by phone number)
    ↓
Save User Message
    ↓
Fetch Conversation Context (messages since last summary)
    ↓
Send to Agent (with context)
    ↓
Save Agent Response
    ↓
Async Token Count & Summarize (if threshold exceeded)
```

### 2. Conversation Context

Messages are organized by:
- **Channel**: The WhatsApp channel
- **User**: The WhatsApp user (identified by phone number)
- **Agent**: The assigned agent

The system retrieves all messages since the last summary, providing the agent with relevant context.

### 3. Automatic Summarization

When the conversation token count exceeds `CONVERSATION_TOKEN_THRESHOLD`:

1. All messages since the last summary are collected
2. The LLM generates a concise summary
3. The summary is saved as a special "summary" message
4. Future context fetches will only include messages after this summary

This prevents conversations from growing too large and exceeding LLM context windows.

## Configuration

### Environment Variables

```env
# Maximum tokens before auto-summarization (default: 2000)
CONVERSATION_TOKEN_THRESHOLD=2000

# Existing MongoDB configuration
MONGODB_URI=mongodb://localhost:27017/pulsar

# Existing encryption key for credentials
SECRET_ENCRYPTION_KEY=your-encryption-key-here
```

### Token Threshold Guidelines

- **2000 tokens** (default): Conservative setting for 4k context window models
- **4000 tokens**: For 8k context window models
- **8000 tokens**: For 16k context window models

The threshold should leave room for:
- System prompts (~500-1000 tokens)
- Agent response (~500-1000 tokens)
- Conversation history (remaining space)

## Database Schema

### User Schema Updates

```typescript
{
  email: string;              // Existing
  name: string;               // Existing
  clientId: ObjectId;         // Existing
  status: string;             // Existing
  externalUserId?: string;    // NEW: WhatsApp phone number or other external ID
}
```

**Indexes:**
- `{ externalUserId: 1, clientId: 1 }` - For efficient external user lookups

### Message Schema

```typescript
{
  content: string;            // Message text or summary text
  type: 'user' | 'agent' | 'summary';  // Message type
  userId: ObjectId;           // Reference to User
  agentId: ObjectId;          // Reference to Agent
  channelId: ObjectId;        // Reference to Channel
  status: string;             // 'active', 'inactive', 'archived'
  createdAt: Date;            // Auto-generated timestamp
  updatedAt: Date;            // Auto-generated timestamp
}
```

## Token Counting

Currently uses a simple word-based estimation:
- Tokens ≈ Words × 1.3
- Works for most use cases
- TODO: Replace with tiktoken for accurate counts

## API Changes

### AgentService

The `run` method now accepts an optional `conversationHistory` parameter:

```typescript
async run(
  input: AgentInput,
  context: AgentContext,
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>
): Promise<AgentOutput>
```

### ConversationSummaryService

New service for background summarization:

```typescript
async checkAndSummarizeIfNeeded(
  channelId: ObjectId,
  userId: ObjectId,
  agentId: ObjectId,
  context: AgentContext
): Promise<void>
```

This is called asynchronously after each agent response (fire-and-forget).

## Testing

Run tests with:

```bash
# All repository tests
npm test -- --testPathPattern="repository.spec"

# Agent service tests
npm test -- --testPathPattern="agent.service.spec"

# All tests (excluding WhatsApp due to module resolution issue)
npm test -- --testPathPattern="(repository|agent.service|users|agents)"
```

## Future Improvements

1. **Proper Token Counting**: Replace word-based estimation with tiktoken library
2. **Configurable Summary Prompt**: Allow customization of the summarization prompt
3. **Summary Strategies**: Support different summarization strategies (extractive, abstractive, etc.)
4. **Message Deduplication**: Implement proper message ID deduplication to prevent double-processing
5. **Conversation Analytics**: Track conversation metrics (length, frequency, sentiment)

## Troubleshooting

### Messages Not Persisting

Check:
1. MongoDB connection is working
2. User collection has the `externalUserId` field
3. Message collection exists
4. Proper indexes are created

### Summaries Not Generated

Check:
1. `CONVERSATION_TOKEN_THRESHOLD` is set appropriately
2. LLM credentials are valid
3. Check logs for async errors in ConversationSummaryService

### Context Not Loading

Check:
1. Messages are being saved with correct `userId`, `agentId`, and `channelId`
2. MessageRepository.findConversationContext query is working
3. Check for database query errors in logs

## Architecture Notes

This implementation follows the existing Pulsar architecture:

- **Repositories**: Only layer that accesses Mongoose models
- **Services**: Contain business logic, use repositories for data access
- **Controllers**: Handle HTTP, delegate to services
- **No breaking changes**: All existing functionality continues to work
- **Backward compatible**: Existing users without `externalUserId` are unaffected
