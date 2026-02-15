# Pulsar Server - TODO

## Agent Routing Enhancements

### Phase 3: Agent-Initiated Re-routing ⏳

**Priority:** Medium  
**Estimated Effort:** 3-5 days  
**Prerequisites:** Agent tool framework, message metadata updates

#### Overview

Allow agents to hand off conversations when they determine they're not the right specialist.

#### Use Case

```
User: "My order hasn't arrived"
→ Routes to Sales Agent (based on keyword)

Sales Agent (via LLM tool use):
  "I see this is about order fulfillment. Let me connect you to Customer Service."
  → Calls re-routing tool
  → Transfers conversation to Customer Service Agent
```

#### Implementation Requirements

##### 1. Agent Tool Framework
- [ ] Define `transferConversation` tool schema
- [ ] Expose tool to LLM via function calling
- [ ] Add tool descriptions to agent system prompts
- [ ] Create tool execution handler in agent service

**Files to modify:**
- `src/agent/agent.service.ts` - Add tool calling support
- `src/agent/contracts/agent-tools.ts` - New file for tool definitions

##### 2. Conversation State Transfer
- [ ] Add `transferredTo` and `transferredFrom` fields to Message schema
- [ ] Create conversation transfer record in database
- [ ] Update sticky routing to respect transfers
- [ ] Include transfer context in new agent's history

**Files to modify:**
- `src/database/schemas/message.schema.ts` - Add transfer fields
- `src/database/repositories/message.repository.ts` - Add transfer queries
- `src/channels/whatsapp/whatsapp-routing.service.ts` - Check active transfers
- `src/channels/shared/message-persistence.service.ts` - Handle transfer messages

##### 3. User Communication
- [ ] Agent sends transfer message before handoff
- [ ] New agent acknowledges transfer with context
- [ ] Maintain conversation continuity

**Example flow:**
```typescript
// Agent A detects need for transfer
tools: [{
  name: 'transferConversation',
  parameters: {
    targetAgentId: 'agent-2',
    reason: 'Order fulfillment issue requires customer service'
  }
}]

// System sends to user:
"I'll transfer you to our Customer Service team who can better assist with your order issue."

// New agent receives enriched context:
context.transferInfo = {
  fromAgent: 'Sales Agent',
  reason: 'Order fulfillment issue',
  conversationSummary: '...'
}
```

##### 4. Routing Logic Updates

Add transfer check as highest priority strategy:

```typescript
async resolveRoute(phoneNumberId, externalUserId, incomingText) {
  // NEW: Check for active transfer (highest priority)
  const transfer = await this.getActiveTransfer(externalUserId, phoneNumberId);
  if (transfer) {
    return { kind: 'resolved', candidate: transfer.targetAgent };
  }
  
  // ... existing strategies ...
}
```

**Files to modify:**
- `src/channels/whatsapp/whatsapp-routing.service.ts` - Add transfer resolution
- `src/database/repositories/conversation-transfer.repository.ts` - New repository

##### 5. Safety & Constraints
- [ ] Agents can only transfer within same client
- [ ] Transfer requires explicit tool call (prevent accidental transfers)
- [ ] Log all transfers for audit trail
- [ ] Rate limit transfers (max 2 per conversation to prevent loops)
- [ ] Transfer expires after N messages (auto-return to original agent)

**Configuration:**
```bash
# .env
MAX_TRANSFERS_PER_CONVERSATION=2
TRANSFER_EXPIRY_MESSAGES=10
```

##### 6. Database Schema

```typescript
// New schema: conversation-transfer.schema.ts
class ConversationTransfer {
  userId: Types.ObjectId;
  channelId: Types.ObjectId;
  fromAgentId: Types.ObjectId;
  toAgentId: Types.ObjectId;
  reason: string;
  status: 'active' | 'completed' | 'expired';
  transferredAt: Date;
  expiresAfterMessageCount: number;
  currentMessageCount: number;
}
```

##### 7. Testing Requirements
- [ ] Unit tests for transfer tool execution
- [ ] Unit tests for transfer routing priority
- [ ] E2E test: successful transfer flow
- [ ] E2E test: transfer rate limiting
- [ ] E2E test: transfer expiry after N messages
- [ ] E2E test: cross-client transfer rejection

#### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Transfer loops (A→B→A→B) | High | Rate limit + audit trail |
| Orphaned transfers | Medium | Expiry mechanism + cleanup job |
| User confusion | Medium | Clear transfer messages |
| Cross-client leakage | High | Validate client ownership |

---

## Other Enhancements

### Multi-Channel Support
- [ ] Extend routing system to Email and TikTok channels
- [ ] Implement channel-specific routing strategies
- [ ] Share conversation history across channels (same user)

### Routing Metrics & Analytics
- [ ] Track which routing strategy wins most often
- [ ] Monitor LLM semantic routing accuracy
- [ ] Measure average time-to-resolution per strategy
- [ ] Dashboard for routing performance

### Agent Configuration
- [ ] Add agent descriptions in database (for better LLM routing)
- [ ] Support routing preferences per ClientAgent (e.g., "always prompt")
- [ ] Allow agents to declare expertise areas/keywords

### Advanced Routing
- [ ] Multi-turn LLM routing (analyze conversation context)
- [ ] Learn from user selections (ML-based routing)
- [ ] Support routing rules DSL (e.g., "route sales keywords to agent X")
- [ ] Time-based routing (business hours aware)

---

## Technical Debt

### Testing
- [ ] Add E2E tests for multi-agent WhatsApp routing
- [ ] Add integration tests for sticky routing across sessions
- [ ] Test LLM semantic routing with various message types

### Documentation
- [ ] Add API documentation for routing endpoints
- [ ] Create client onboarding guide for multi-agent setup
- [ ] Document routing strategy selection logic

### Performance
- [ ] Add caching for agent descriptions/metadata
- [ ] Optimize sticky routing queries (consider Redis)
- [ ] Monitor LLM semantic routing latency

---

## Completed ✅

### Phase 1: Deterministic Routing
- [x] Single candidate resolution
- [x] Explicit selection (number/name)
- [x] Sticky routing from message history
- [x] Keyword-based matching
- [x] Ambiguity prompt fallback

### Phase 2: LLM Semantic Routing
- [x] Optional LLM-based intent detection
- [x] Feature flag configuration
- [x] Fallback to ambiguity prompt on uncertainty
- [x] Cost-effective implementation (gpt-4o-mini)

