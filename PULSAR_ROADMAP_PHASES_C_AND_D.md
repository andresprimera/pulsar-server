# Pulsar Roadmap -- Stability & Scalability Phases

*Last updated: 2026-03-01*

------------------------------------------------------------------------

# Overview

This document outlines the remaining architectural hardening steps for
Pulsar.

Phases included:

-   Phase C --- Idempotency Guard (Planned, not implemented)
-   Phase D --- Conversation Summary Compression (Implemented)
-   Optional Future Enhancements

This document serves as an engineering reference and implementation
checklist.

------------------------------------------------------------------------

# Phase C --- Idempotency Guard (PLANNED)

## Goal

Prevent duplicate message processing caused by webhook retries or race
conditions.

Webhooks (WhatsApp, Instagram, TikTok) may retry deliveries. Without
idempotency protection, this can cause:

-   Duplicate LLM executions
-   Duplicate database messages
-   Duplicate outbound replies
-   Increased cost
-   Inconsistent conversation state

------------------------------------------------------------------------

## Design Principle

Uniqueness should be enforced using:

(channelId + messageId)

This combination uniquely identifies a message per channel.

------------------------------------------------------------------------

## Implementation Plan (Future)

### 1. Database-Level Protection

Add a unique compound index to Message schema:

MessageSchema.index( { channelId: 1, "metadata.messageId": 1 }, {
unique: true } );

This guarantees atomic protection at database level.

------------------------------------------------------------------------

### 2. Safe Insert Pattern

When persisting a user message:

-   Attempt insert
-   If duplicate key error occurs:
    -   Log duplicate
    -   Skip processing
    -   Do NOT call AgentService

------------------------------------------------------------------------

### 3. Location of Idempotency Logic

Idempotency check should live in:

MessagePersistenceService

NOT in:

-   Channels
-   Orchestrator
-   AgentService

Channels should remain thin adapters.

------------------------------------------------------------------------

### 4. Validation Checklist (When Implemented)

-   Same webhook payload twice → only one LLM execution
-   Same payload concurrently → no duplicate messages
-   Different channels with same messageId → allowed
-   System remains non-blocking

------------------------------------------------------------------------

## Why Phase C Is Deferred

Current architecture is stable and functional. Duplicate webhook retries
are unlikely in controlled environments. Phase C is a resilience
hardening step, not a correctness blocker.

------------------------------------------------------------------------

# Phase D --- Conversation Summary Compression (IMPLEMENTED)

## Goal

Prevent unbounded LLM context growth in long conversations.

Instead of sending entire message history, system maintains a sliding
window with periodic summaries.

------------------------------------------------------------------------

## Current Flow

After each outgoing agent message:

1.  Estimate token count for conversation context
2.  If token count exceeds threshold:
    -   Generate summary via LLM
    -   Store summary as type="summary" message
3.  Future context loads messages only AFTER last summary

------------------------------------------------------------------------

## Threshold Configuration

Environment variable:

CONVERSATION_TOKEN_THRESHOLD=2000

Default: 2000 tokens (estimated).

------------------------------------------------------------------------

## Token Estimation

Current method:

Approximate words × 1.3

Note: Not model-accurate. Can be replaced with provider-aware tokenizer
in future.

------------------------------------------------------------------------

## Architectural Characteristics

-   Asynchronous (non-blocking)
-   Triggered after agent reply
-   Sliding window model
-   No channel changes required
-   Stored as summary messages

------------------------------------------------------------------------

## Limitations

-   Token estimation is approximate
-   Storage growth not capped (only context usage bounded)
-   Summaries are stored as messages instead of conversation field

------------------------------------------------------------------------

## Possible Future Improvements

-   Model-aware tokenizer (e.g., tiktoken)
-   Hard context cap safeguard
-   Archive old messages after summary
-   Cap summary length
-   Move summary to conversation-level field

------------------------------------------------------------------------

# Current Architecture Status

The system now has:

-   Clean channel adapters
-   Centralized orchestration
-   Deterministic contact resolution
-   Conversation entity
-   Context enrichment
-   Summary compression

Remaining major hardening step: Phase C (Idempotency)

------------------------------------------------------------------------

# Recommended Priority Order

1.  Phase C -- Idempotency Guard
2.  Token-aware compression refinement
3.  Storage archival strategy
4.  Observability metrics (LLM cost tracking)

------------------------------------------------------------------------

# Conclusion

Pulsar architecture is stable and production-ready.

Phase C is recommended before high-scale production traffic. Phase D is
already operational and effectively bounds LLM context growth.
