# RTP-SPEC-003: Session Protocol

**Version:** 1.0.0-draft
**Author:** plagtech (@plagtech)
**Date:** 2026-04-01
**Status:** Draft
**Requires:** XMTP v3, Spraay x402 Gateway, RTP-SPEC-001, RTP-SPEC-002, XRC Spraay Payment Content Types

## Abstract

This specification defines the RTP Session Protocol — the complete message flow for a task lifecycle between an agent (task issuer) and a device (task executor) over XMTP, with payments via Spraay.

A session is an XMTP conversation (1:1 or group) that progresses through defined states: Discover → Negotiate → Assign → Execute → Prove → Pay → Rate. Each state transition is a structured XMTP message using Spraay and RTP content types.

## Motivation

Current IoT task delegation is fragmented: you discover devices on one platform, send commands on another, handle payments on a third, and manage reputation on a fourth. There is no unified protocol for the full lifecycle of "find a machine, give it a job, verify it did the job, pay it, and rate it."

RTP sessions unify this into a single XMTP conversation thread where every step — from discovery to payment — is an encrypted, verifiable, structured message.

## Session States

```
┌──────────┐    ┌───────────┐    ┌────────┐    ┌─────────┐
│ DISCOVER │───▶│ NEGOTIATE │───▶│ ASSIGN │───▶│ EXECUTE │
└──────────┘    └───────────┘    └────────┘    └─────────┘
                     │                              │
                     │ (reject)                     │
                     ▼                              ▼
                ┌──────────┐                  ┌─────────┐
                │ CLOSED   │                  │  PROVE  │
                └──────────┘                  └────┬────┘
                     ▲                             │
                     │                             ▼
                     │                        ┌─────────┐
                     │                        │   PAY   │
                     │                        └────┬────┘
                     │                             │
                     │                             ▼
                     │                        ┌─────────┐
                     └────────────────────────│  RATE   │
                                              └─────────┘
```

## Message Types

All session messages are sent as XMTP messages with custom content types under the `rtp.protocol` authority.

### Session Envelope

Every RTP session message MUST be wrapped in a session envelope:

```typescript
interface RTPSessionMessage {
  protocolVersion: "1.0.0";
  sessionId: string;          // UUID, created at NEGOTIATE
  messageType: RTPMessageType;
  sender: string;             // XMTP address of sender
  timestamp: string;          // ISO 8601
  payload: unknown;           // Type-specific payload (see below)
}

type RTPMessageType =
  | "task.request"            // Agent → Device: "Can you do this?"
  | "task.offer"              // Device → Agent: "Yes, here's my price"
  | "task.reject"             // Either → Either: "No thanks"
  | "task.assign"             // Agent → Device: "Do it"
  | "task.accept"             // Device → Agent: "Acknowledged, starting"
  | "task.status"             // Device → Agent: Progress update
  | "task.complete"           // Device → Agent: "Done, here's proof"
  | "task.proof"              // Device → Agent: Verification data
  | "payment.request"         // Device → Agent: Spraay payment request
  | "payment.receipt"         // Agent → Device: Spraay payment receipt
  | "session.rate"            // Either → Either: Rating + review
  | "session.close"           // Either → Either: Session ended
  | "session.dispute"         // Either → Either: Something went wrong
```

---

## Phase 1: Discover

Discovery happens BEFORE the session starts, via the Spraay gateway device registry (RTP-SPEC-002).

```
Agent                          Spraay Gateway
  │                                 │
  │  GET /rtp/devices?cap=...       │
  │────────────────────────────────▶│
  │                                 │
  │  [list of matching devices]     │
  │◀────────────────────────────────│
  │                                 │
  │  Agent selects best device      │
  │  based on: price, distance,     │
  │  trust score, availability      │
```

---

## Phase 2: Negotiate

The agent initiates a 1:1 XMTP conversation with the selected device and sends a task request.

### task.request

Sent by: Agent → Device

```typescript
interface TaskRequest {
  taskId: string;             // UUID
  capability: string;         // Required capability (e.g. "actuator.servo.rotate")
  description: string;        // Human-readable task description
  parameters: Record<string, unknown>; // Capability-specific parameters
  constraints?: {
    maxPrice?: string;        // Agent's max budget for this task
    maxDuration?: number;     // Max seconds to complete
    deadline?: string;        // ISO 8601 absolute deadline
    qualityLevel?: "low" | "medium" | "high";
  };
  location?: {
    latitude: number;
    longitude: number;
    description?: string;
  };
}
```

Example:
```json
{
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "capability": "actuator.servo.rotate",
  "description": "Rotate servo to 90 degrees and capture a photo",
  "parameters": {
    "angle": 90,
    "capturePhoto": true,
    "photoResolution": "1080p"
  },
  "constraints": {
    "maxPrice": "0.02",
    "maxDuration": 30
  }
}
```

### task.offer

Sent by: Device → Agent

```typescript
interface TaskOffer {
  taskId: string;             // References the original request
  accepted: true;
  price: string;              // Device's price for this task
  token: string;
  chain: string;
  estimatedDuration: number;  // Seconds
  conditions?: string;        // Any conditions or notes
}
```

### task.reject

Sent by: Either party

```typescript
interface TaskReject {
  taskId: string;
  reason: "price-too-low" | "capability-unavailable" | "busy"
        | "out-of-range" | "maintenance" | "price-too-high" | "other";
  message?: string;
}
```

---

## Phase 3: Assign

If the agent accepts the offer, it assigns the task.

### task.assign

Sent by: Agent → Device

```typescript
interface TaskAssign {
  taskId: string;
  offerId: string;            // Reference to the accepted offer
  agreedPrice: string;        // The agreed-upon price
  token: string;
  chain: string;
}
```

### task.accept

Sent by: Device → Agent

```typescript
interface TaskAccept {
  taskId: string;
  estimatedCompletion: string; // ISO 8601 timestamp
}
```

---

## Phase 4: Execute

The device performs the task and sends periodic status updates.

### task.status

Sent by: Device → Agent (periodic, during execution)

```typescript
interface TaskStatus {
  taskId: string;
  progress: number;           // 0-100 percentage
  phase: string;              // Description of current phase
  estimatedRemaining?: number; // Seconds remaining
  data?: Record<string, unknown>; // Intermediate data if relevant
}
```

---

## Phase 5: Prove

When the task is complete, the device sends proof.

### task.complete

Sent by: Device → Agent

```typescript
interface TaskComplete {
  taskId: string;
  success: boolean;
  completedAt: string;        // ISO 8601
  duration: number;           // Actual seconds taken
  result?: Record<string, unknown>; // Task-specific output data
}
```

### task.proof

Sent by: Device → Agent (immediately after task.complete)

```typescript
interface TaskProof {
  taskId: string;
  proofType: "photo" | "video" | "sensor-data" | "log" | "attestation" | "composite";
  evidence: ProofItem[];
}

interface ProofItem {
  type: "image" | "data" | "hash" | "url" | "attestation";
  content: string;            // Base64 data, URL, or hash
  mimeType?: string;          // e.g. "image/jpeg"
  description?: string;
  timestamp: string;          // When this evidence was captured
  gps?: {                     // Location proof
    latitude: number;
    longitude: number;
  };
}
```

For proof items larger than 1MB, use XMTP's remote attachment content type and reference the attachment URL in the `content` field.

---

## Phase 6: Pay

The device sends a Spraay payment request (using XRC Spraay Payment Content Types). The agent verifies the proof and pays.

### Payment Flow

```
Device                         Agent                      Spraay Gateway
  │                              │                              │
  │  payment.request             │                              │
  │  (spraay.app/payment-request)│                              │
  │─────────────────────────────▶│                              │
  │                              │                              │
  │                              │  POST /batch-payment         │
  │                              │─────────────────────────────▶│
  │                              │                              │
  │                              │  { txHash, status }          │
  │                              │◀─────────────────────────────│
  │                              │                              │
  │  payment.receipt             │                              │
  │  (spraay.app/payment-receipt)│                              │
  │◀─────────────────────────────│                              │
```

The `payment.request` and `payment.receipt` messages use the Spraay Payment Content Types defined in the companion XRC spec. The `metadata.taskId` field links the payment to the specific task.

---

## Phase 7: Rate

After payment, either party can rate the other.

### session.rate

Sent by: Either → Either

```typescript
interface SessionRating {
  taskId: string;
  sessionId: string;
  rater: string;              // Address of the rater
  rated: string;              // Address of the entity being rated
  rating: number;             // 1-5 stars
  dimensions?: {
    speed?: number;           // 1-5
    quality?: number;         // 1-5
    reliability?: number;     // 1-5
    communication?: number;   // 1-5
  };
  comment?: string;
  attestation?: {
    provider: "prooflayer";
    attestationId: string;    // ProofLayer EAS attestation UID
    chain: string;
  };
}
```

Ratings SHOULD be submitted to ProofLayer as EAS attestations on Base, creating an on-chain reputation trail for both agents and devices.

### session.close

Sent by: Either party

```typescript
interface SessionClose {
  sessionId: string;
  reason: "completed" | "cancelled" | "timeout" | "dispute-resolved";
  summary?: {
    totalPaid: string;
    token: string;
    chain: string;
    tasksCompleted: number;
    duration: number;         // Total session seconds
  };
}
```

---

## Dispute Resolution

### session.dispute

Sent by: Either party, if something went wrong

```typescript
interface SessionDispute {
  sessionId: string;
  taskId: string;
  disputeType: "task-not-completed" | "poor-quality" | "payment-not-received"
             | "overcharged" | "wrong-result" | "other";
  description: string;
  evidence?: ProofItem[];     // Supporting evidence
}
```

Dispute resolution in v1.0 is manual — the conversation thread serves as the evidence record. Future versions MAY integrate with on-chain arbitration protocols.

---

## Complete Session Example

```
Agent                              Device (Raspberry Pi 5)
  │                                      │
  │  [1] task.request                    │
  │  "Rotate to 90° and take photo"      │
  │─────────────────────────────────────▶│
  │                                      │
  │  [2] task.offer                      │
  │  "0.01 USDC on Base, ~10 seconds"   │
  │◀─────────────────────────────────────│
  │                                      │
  │  [3] task.assign                     │
  │  "Agreed, proceed"                   │
  │─────────────────────────────────────▶│
  │                                      │
  │  [4] task.accept                     │
  │  "Starting now"                      │
  │◀─────────────────────────────────────│
  │                                      │
  │  [5] task.status                     │
  │  "50% — servo rotating"             │
  │◀─────────────────────────────────────│
  │                                      │
  │  [6] task.status                     │
  │  "80% — capturing photo"            │
  │◀─────────────────────────────────────│
  │                                      │
  │  [7] task.complete                   │
  │  "Success, 8 seconds"               │
  │◀─────────────────────────────────────│
  │                                      │
  │  [8] task.proof                      │
  │  { photo: base64..., gps: {...} }   │
  │◀─────────────────────────────────────│
  │                                      │
  │  [9] payment.request                 │
  │  "0.01 USDC to 0x742d..."           │
  │◀─────────────────────────────────────│
  │                                      │
  │  [Agent pays via Spraay gateway]     │
  │                                      │
  │  [10] payment.receipt                │
  │  "Paid, tx: 0xabc123..."            │
  │─────────────────────────────────────▶│
  │                                      │
  │  [11] session.rate                   │
  │  "5 stars, fast and reliable"        │
  │─────────────────────────────────────▶│
  │                                      │
  │  [12] session.rate                   │
  │  "5 stars, prompt payment"           │
  │◀─────────────────────────────────────│
  │                                      │
  │  [13] session.close                  │
  │  "completed"                         │
  │─────────────────────────────────────▶│
```

## Security Considerations

### Task Authorization

Devices MUST NOT execute tasks without an explicit `task.assign` message from the requesting agent. Status messages from unknown addresses MUST be ignored.

### Payment Before Proof

Agents SHOULD NOT pay before receiving and verifying proof of task completion. The protocol deliberately separates `task.complete` and `payment.request` to allow for verification.

### Proof Integrity

Photo/video proof SHOULD include EXIF metadata (GPS, timestamp) where available. Agents MAY cross-reference proof GPS coordinates with the device's registered location.

### Session Hijacking

All messages are encrypted end-to-end via XMTP MLS. An attacker cannot inject messages into an existing session without compromising a participant's XMTP identity.

### Economic Attacks

A device could accept a task and never complete it. Agents SHOULD implement timeouts based on `estimatedDuration` from the offer. If `task.complete` is not received within the deadline, the agent SHOULD send `session.close` with reason `timeout` and rate the device accordingly.

A malicious agent could request tasks and refuse to pay. Devices SHOULD track payment history per agent address and MAY require escrow or pre-payment for agents with low trust scores.

## Copyright

Copyright and related rights waived via CC0.
