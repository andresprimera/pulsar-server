# Multi-Agent Routing Architecture

This document describes the WhatsApp routing system that enables multiple agents to share a single phone number.

## Problem Statement

Previously, one WhatsApp phone number could only be used by one agent per client. This limitation meant:
- Clients needed multiple phone numbers for multiple agents
- Users couldn't easily switch between specialized agents
- No way to route based on message intent or conversation context

## Solution: Phased Routing Strategy

The routing system uses a cascade of strategies to determine which agent should handle an incoming message.

---

## Phase 1: Deterministic Routing ✅ **[IMPLEMENTED]**

### Strategy Cascade

When a message arrives, the router tries these strategies in order:

#### 1. **Single Candidate** (instant)
If only one agent uses this phone number → route directly to that agent.

#### 2. **Explicit Selection** (~1ms)
User types a number or agent name:
- `"2"` → selects second agent from prompt
- `"sales"` → matches "Sales Agent"
- `"Customer Service Agent"` → exact match

#### 3. **Sticky Routing** (~5ms)
Check recent conversation history:
- Find most recent message from this user across candidate agents
- Route to the agent they last spoke with
- Provides continuity across conversations

#### 4. **Keyword Scoring** (~1ms)
Extract keywords from agent names and match against message:
- "Sales Agent" → tokens: ["sales", "agent"]
- Message: "I want to talk about pricing" → no match
- Message: "Connect me to sales" → matches "sales" → routes to Sales Agent

#### 5. **Ambiguity Prompt** (fallback)
If all strategies fail, send clarification:
```
I can route your message to the right specialist.
Please reply with the number or name of the agent:
1) Customer Service Agent
2) Sales Agent
```

### Cost & Performance
- **Cost**: $0 per message (database lookups only)
- **Latency**: 5-10ms average
- **Accuracy**: 100% after user clarifies once

---

## Phase 2: LLM Semantic Routing ✅ **[IMPLEMENTED]**

### Opt-in Strategy

Enabled via environment variable:
```bash
ENABLE_SEMANTIC_ROUTING=true
```

When enabled, adds **Strategy 4.5** (runs after keyword matching, before ambiguity prompt):

#### LLM Semantic Analysis (~500ms, ~$0.002/message)

Uses a small LLM to interpret message intent:

**Example**:
```
Message: "My order hasn't arrived"
Candidates: Customer Service Agent, Sales Agent

LLM analyzes → "order issue" = customer service
→ Routes to Customer Service Agent
```

**Implementation**:
- Uses `gpt-4o-mini` (fast, cheap)
- System prompt includes agent names and inferred purposes
- LLM responds with just a number (1, 2, etc.)
- Falls back to ambiguity prompt if uncertain

**Cost-Benefit**:
| Scenario | Deterministic Result | LLM Benefit |
|----------|---------------------|-------------|
| "Hello" | Ambiguity prompt | No benefit |
| "I need help with my order" | Ambiguity prompt | Routes to Customer Service |
| "How much does X cost?" | Ambiguity prompt | Routes to Sales |
| "2" or "sales" | Direct match | No LLM call (explicit wins) |

### Configuration

Add to `.env`:
```bash
# Enable LLM semantic routing (default: false)
ENABLE_SEMANTIC_ROUTING=true

# Required for semantic routing
OPENAI_API_KEY=sk-...
```

---

## Phase 3: Agent-Initiated Re-routing

**Status:** Planned (see [TODO.md](../TODO.md#phase-3-agent-initiated-re-routing))

Agents will be able to transfer conversations to other agents when they determine they're not the right specialist. This requires implementing an agent tool framework and conversation state management.

For detailed requirements and implementation plan, see the TODO file.

---

## Architecture Diagrams

### Message Flow

```
┌─────────────────────┐
│ WhatsApp Message    │
│ from: +1234567890   │
│ text: "Hello"       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ WhatsappRoutingService                  │
│                                         │
│ 1. Find candidates by phoneNumberId    │
│ 2. Run strategy cascade:                │
│    ├─ Single? → resolve                 │
│    ├─ Explicit selection? → resolve     │
│    ├─ Sticky (recent history)? → resolve│
│    ├─ Keyword match? → resolve          │
│    ├─ [Phase 2] LLM semantic? → resolve │
│    └─ Ambiguous → send prompt           │
└──────────┬──────────────────────────────┘
           │
           ▼
      ┌─────────┐
      │Resolved?│
      └────┬────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌────────┐   ┌─────────────┐
│ Route  │   │Send Prompt  │
│to Agent│   │"Choose 1-2" │
└────────┘   └─────────────┘
```

### Strategy Priority

```
Priority: High                                Low
         →→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→

┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  Single  │→│ Explicit │→│  Sticky  │→│ Keyword  │→│   LLM    │→│Ambiguous │
│Candidate │  │Selection │  │ Routing  │  │  Match   │  │ Semantic │  │  Prompt  │
└──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
   FREE          FREE          FREE          FREE         $0.002      User action
   0ms           1ms           5ms           1ms          500ms       required
```

---

## Testing

### Unit Tests
- `whatsapp-routing.service.spec.ts`: All routing strategies
- `whatsapp.service.spec.ts`: Integration with webhook handler

### Manual Testing

1. **Single agent** (should route immediately):
   ```bash
   curl -X POST http://localhost:3000/whatsapp/webhook \
     -H "Content-Type: application/json" \
     -d '{
       "entry": [{
         "changes": [{
           "value": {
             "messages": [{"from": "1234", "id": "msg1", "type": "text", "text": {"body": "hello"}}],
             "metadata": {"phone_number_id": "phone-with-one-agent"}
           }
         }]
       }]
     }'
   ```

2. **Multiple agents, explicit selection**:
   ```bash
   # First message triggers prompt
   # Second message: type "1" or "sales"
   ```

3. **Semantic routing** (requires `ENABLE_SEMANTIC_ROUTING=true`):
   ```bash
   # Message: "I need help with my order"
   # Should route to Customer Service without prompt
   ```

---

## Configuration Reference

```bash
# .env

# Phase 2: Enable LLM semantic routing (optional)
ENABLE_SEMANTIC_ROUTING=false  # default: false

# Required for semantic routing
OPENAI_API_KEY=sk-...

# Existing configuration
MONGODB_URI=mongodb://localhost:27017/pulsar
SECRET_ENCRYPTION_KEY=your-key
```

---

## Future Enhancements

For planned features and improvements, see [TODO.md](../TODO.md).

Key areas include:
- Agent-initiated re-routing (Phase 3)
- Multi-channel routing support
- Routing metrics and analytics
- Advanced ML-based routing strategies

---