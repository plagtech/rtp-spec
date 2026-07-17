# RTP-EXT-1 — Batch Task Dispatch

### Extension to RTP 1.0 Draft Specification

**Author:** Spraay Protocol
**Date:** July 2026
**Status:** Draft
**Requires:** RTP 1.0
**Reference Implementation:** [gateway.spraay.app](https://gateway.spraay.app)

---

## Abstract

RTP-EXT-1 extends the Robot Task Protocol with **batch task dispatch**: the ability for an agent to commission N tasks across N robots with a single payment and a single atomic on-chain settlement. Where RTP 1.0 defines one task, one robot, one payment, this extension defines one **Batch Envelope** containing many task envelopes, funded by one x402 payment, and settled to all operators in one transaction via the Spraay batch payments contract.

This is the protocol-level answer to fleet-scale work: "survey these 5 zones with 5 drones," "pick these 40 SKUs across 12 arms," "print this file on the 3 nearest printers" — one request, one payment, one settlement.

---

## Table of Contents

1. [Motivation](#1-motivation)
2. [The Batch Envelope](#2-the-batch-envelope)
3. [Atomicity Modes](#3-atomicity-modes)
4. [Batch Lifecycle](#4-batch-lifecycle)
5. [Payment & Settlement](#5-payment--settlement)
6. [Batch Result Envelope](#6-batch-result-envelope)
7. [Gateway API](#7-gateway-api)
8. [SDK Surface](#8-sdk-surface)
9. [Relationship to the XMTP Mesh](#9-relationship-to-the-xmtp-mesh)
10. [Security Considerations](#10-security-considerations)
11. [Conformance](#11-conformance)

---

## 1. Motivation

Real robot work is rarely a single task. A warehouse pick wave touches dozens of arms; an aerial survey needs multiple drones; a print job may fan out across a print farm. Under RTP 1.0, an agent must submit N separate task envelopes, sign N x402 payments, and the gateway must execute N on-chain settlements — N times the gas, N times the latency, N chances for partial payment failure.

Batch dispatch collapses this to:

- **1 Batch Envelope** — N task envelopes wrapped in one request
- **1 x402 payment** — funding the sum of all task prices
- **1 escrow hold** — the gateway holds the total until batch resolution
- **1 settlement transaction** — payouts to all operators via the Spraay batch payments contract (`0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC` on Base)

Batch settlement is the core primitive of the Spraay protocol; RTP-EXT-1 exposes it at the task layer.

---

## 2. The Batch Envelope

### 2.1 Schema

```json
{
  "rtp_version": "1.0",
  "rtp_ext": ["batch/1"],
  "batch_id": "batch_qr7m2k",
  "atomicity": "independent",
  "tasks": [
    {
      "robot_id": "robo_drone01",
      "task": "capture",
      "parameters": { "area": "zone_A", "resolution": "4k" },
      "timeout_seconds": 300
    },
    {
      "robot_id": "robo_drone02",
      "task": "capture",
      "parameters": { "area": "zone_B", "resolution": "4k" },
      "timeout_seconds": 300
    }
  ],
  "payment": {
    "x402_token": "<x402_payment_payload>",
    "amount": "0.10",
    "currency": "USDC",
    "chain": "base"
  },
  "callback_url": "https://agent.example.com/batch-complete",
  "issued_at": "2026-07-16T12:00:00Z"
}
```

### 2.2 Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rtp_version` | string | Yes | Base protocol version (`"1.0"`) |
| `rtp_ext` | array | Yes | MUST include `"batch/1"` |
| `batch_id` | string | Yes | Unique batch identifier (assigned by gateway) |
| `atomicity` | string | Yes | `"all_or_nothing"` or `"independent"` (see §3) |
| `tasks` | array | Yes | 2–100 task entries |
| `tasks[].robot_id` | string | Yes | Target robot for this entry |
| `tasks[].task` | string | Yes | Capability verb (RTP 1.0 §4) |
| `tasks[].parameters` | object | No | Task-specific parameters |
| `tasks[].timeout_seconds` | integer | No | Per-task timeout (default 60) |
| `payment` | object | Yes | Single x402 payment covering the batch total |
| `payment.amount` | string | Yes | MUST equal the sum of all task prices |
| `payment.chain` | string | Yes | Settlement chain. All tasks in a batch settle on one chain |
| `callback_url` | string | No | Fired once at batch resolution, with per-task results |
| `issued_at` | string | Yes | ISO 8601 timestamp |

### 2.3 Constraints

- A batch MUST contain between 2 and 100 tasks.
- All tasks in a batch MUST settle on the same `payment.chain`. Cross-chain batches are out of scope for `batch/1`.
- The same `robot_id` MAY appear multiple times (e.g., 5 sequential prints on one printer); the gateway queues per-robot entries in array order.
- Individual task entries do NOT carry their own `payment` object; payment exists only at the batch level.

---

## 3. Atomicity Modes

| Mode | Semantics | Settlement |
|------|-----------|------------|
| `independent` | Each task succeeds or fails on its own | Completed tasks pay their operators; failed/timed-out task amounts refund to the agent. One batch settlement covers both directions |
| `all_or_nothing` | The batch succeeds only if every task completes | Any `FAILED`/`TIMEOUT` marks the batch `BATCH_FAILED`; the full escrow refunds to the agent in one transaction. Robots that completed work in a failed batch are NOT paid — operators opt in per robot via `accepts_atomic_batches: true` at registration |

`independent` is the default and RECOMMENDED mode. `all_or_nothing` exists for workflows where partial completion has no value (e.g., a multi-robot assembly sequence).

Gateways MUST reject an `all_or_nothing` batch if any target robot has not opted in.

---

## 4. Batch Lifecycle

The batch has its own state machine, superimposed on the RTP 1.0 per-task state machine. Every task inside the batch still transitions through `PENDING → DISPATCHED → IN_PROGRESS → COMPLETED/FAILED/TIMEOUT` individually.

```
            ┌────────────────┐
            │ BATCH_PENDING  │ ← Envelope received, x402 payment validating
            └───────┬────────┘
                    │ payment confirmed (total amount escrowed)
            ┌───────▼────────┐
            │BATCH_DISPATCHED│ ← All task envelopes routed to robots
            └───────┬────────┘
                    │ all tasks reached a terminal state
            ┌───────▼────────┐
            │ BATCH_SETTLING │ ← Settlement tx submitted to batch contract
            └───────┬────────┘
         ┌──────────┼──────────────┐
  ┌──────▼──────┐ ┌─▼───────────┐ ┌▼────────────┐
  │BATCH_       │ │BATCH_       │ │BATCH_FAILED │
  │COMPLETED    │ │PARTIAL      │ │             │
  │all tasks OK │ │mixed results│ │0 OK, or A/N │
  └─────────────┘ └─────────────┘ │mode tripped │
                                  └─────────────┘
```

| State | Description |
|-------|-------------|
| `BATCH_PENDING` | Batch received, single x402 payment validating on-chain |
| `BATCH_DISPATCHED` | Escrow held; every task envelope dispatched |
| `BATCH_SETTLING` | All tasks terminal; batch settlement transaction in flight |
| `BATCH_COMPLETED` | All tasks `COMPLETED`; all operators paid in one tx |
| `BATCH_PARTIAL` | `independent` mode, mixed outcomes; payouts and refunds settled in one tx |
| `BATCH_FAILED` | Zero tasks completed, or `all_or_nothing` violated; full refund |

---

## 5. Payment & Settlement

### 5.1 Inbound: One Payment

The agent signs a single x402 payment for the batch. The gateway validates it exactly as in RTP 1.0 §9 and escrows the summed task-price total for the life of the batch.

> **Reference implementation (Spraay Gateway).** Consistent with how the deployed gateway handles single tasks in RTP 1.0 (the per-route x402 price is a **dispatch fee**, and the robot's `price_per_task` is tracked separately in escrow), the batch endpoint charges a flat x402 dispatch fee at the 402 challenge and escrows one record per `batch_id` for the sum of the target robots' task prices. That escrowed total — not the dispatch fee — is what settles to operators and refunds to the agent at resolution (§5.2).

### 5.2 Outbound: One Transaction

At `BATCH_SETTLING`, the gateway constructs a single call to the Spraay batch payments contract. The reference contract exposes `sprayToken(address token, Recipient[] recipients)`, where each `Recipient` is a `(address recipient, uint256 amount)` tuple — one entry per payout, plus one entry for the agent refund:

```
sprayToken(
  token:      USDC,
  recipients: [
    { recipient: operator_1,           amount: price_1 },
    { recipient: operator_2,           amount: price_2 },
    ...,
    { recipient: agent_refund_address, amount: refund_total }
  ]
)
```

- Each `COMPLETED` task contributes `{ operator_address, task_price }` to the recipients array.
- In `independent` mode, all failed/timed-out task prices are summed into a single refund entry to the agent.
- Reference contract: **`0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC`** (Base). Other chains use the Spraay batch contract deployed on that chain. Native-asset batches use `sprayETH(Recipient[])`; equal-split payouts MAY use `sprayEqual(token, recipients, amountPerRecipient)`.

This is the property that distinguishes RTP batch dispatch from a client-side loop: **N operators are paid atomically in one transaction**, with gas amortized across the batch rather than multiplied by it.

### 5.3 Fees

Gateways MAY charge a batch fee (flat or percentage) declared in the 402 response. The reference implementation prices the batch dispatch fee independently of the summed task prices (the batch contract applies its standard 0.3% settlement fee to the payout total).

---

## 6. Batch Result Envelope

Delivered to `callback_url` and available via polling:

```json
{
  "rtp_version": "1.0",
  "rtp_ext": ["batch/1"],
  "batch_id": "batch_qr7m2k",
  "status": "BATCH_PARTIAL",
  "atomicity": "independent",
  "tasks": [
    { "task_id": "task_a1", "robot_id": "robo_drone01", "status": "COMPLETED", "output": { "media_url": "https://..." } },
    { "task_id": "task_a2", "robot_id": "robo_drone02", "status": "TIMEOUT", "output": null }
  ],
  "settlement": {
    "tx_hash": "0xabc...",
    "chain": "base",
    "paid_out": "0.05",
    "refunded": "0.05"
  },
  "resolved_at": "2026-07-16T12:07:41Z"
}
```

---

## 7. Gateway API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/robots/batch` | POST | Submit Batch Envelope + x402 payment (402 → pay → dispatch) |
| `/robots/batch/{batch_id}` | GET | Poll batch status with per-task breakdown |
| `/robots/batch/{batch_id}/settlement` | GET | Settlement details incl. tx hash |

The 402 challenge for a batch quotes the batch **dispatch fee** so the agent signs one payment; the summed task prices are settled to operators from batch escrow at resolution.

> **Reference implementation (Spraay Gateway).** Consistent with RTP 1.0 §11, the deployed gateway exposes these on a flat, query-parameter surface rather than nested REST paths:
>
> | Spec path | Reference implementation |
> |-----------|--------------------------|
> | `POST /robots/batch` | `POST /api/v1/robots/batch` |
> | `GET /robots/batch/{batch_id}` | `GET /api/v1/robots/batch/status?batch_id={batch_id}` |
> | `GET /robots/batch/{batch_id}/settlement` | `GET /api/v1/robots/batch/settlement?batch_id={batch_id}` |

---

## 8. SDK Surface

```ts
import { RTPClient } from '@spraay/rtp-sdk'

const client = new RTPClient({ wallet: myX402Wallet })

// Discover N robots, hire them all in one payment
const drones = await client.discover({ capability: 'capture', maxPrice: '0.05' })

const batch = await client.hireBatch(
  drones.slice(0, 5).map((robot, i) => ({
    robot,
    task: 'capture',
    parameters: { area: `zone_${i}`, resolution: '4k' }
  })),
  { atomicity: 'independent' }
)

console.log(batch.status)              // BATCH_COMPLETED
console.log(batch.settlement.tx_hash)  // one tx, five operators paid
```

---

## 9. Relationship to the XMTP Mesh

RTP-EXT-1 and the RTP XMTP Mesh (`rtp-xmtp-mesh`) are two complementary paths for multi-robot work, not competing designs.

- **The mesh coordinator is the peer-to-peer path.** Robots discover and hire each other directly over XMTP, dependencies between steps are resolved locally, and coordination is *emergent* — there is no central authority sequencing the job. It is the right tool when the participants are autonomous agents negotiating amongst themselves.
- **EXT-1 batch is the gateway-native path.** A single agent commissions a fixed set of tasks through the gateway with **one payment in and one atomic settlement out** via the Spraay batch contract. It is the right tool when one issuer wants fleet-scale work funded and settled deterministically.

The two share the RTP 1.0 task envelope and lifecycle, so a task looks identical whether it arrives via a mesh step or a batch entry. They differ only in *who orchestrates* (peers vs. a single issuer) and *how settlement happens* (per-hop payments vs. one batch transaction).

They compose. A future revision MAY let a mesh coordinator settle its own subtask payouts through a batch envelope — collapsing many per-hop mesh payments into a single atomic batch settlement — giving emergent peer coordination the gas profile of gateway-native batch dispatch.

---

## 10. Security Considerations

- **Amount binding.** Gateways MUST verify `payment.amount` equals the sum of quoted task prices at 402 time; envelopes with mismatched totals are rejected before dispatch.
- **Escrow isolation.** Batch escrow MUST be tracked per `batch_id`; a batch settlement MUST NOT draw from any other batch's escrow.
- **Partial-failure griefing.** In `all_or_nothing` mode, a single malicious robot can zero out payment for honest robots in the batch; this is why opt-in is required and `independent` is the default.
- **Duplicate dispatch.** `batch_id` + array index MUST be idempotency keys; retried dispatches MUST NOT create duplicate tasks.
- **Settlement failure.** If the batch settlement transaction reverts, the gateway MUST retain escrow and retry; funds MUST NOT be released through any path other than the batch contract call recorded in the settlement object.

---

## 11. Conformance

A gateway conforms to RTP-EXT-1 if it:

1. Accepts Batch Envelopes at `/robots/batch` with `rtp_ext: ["batch/1"]`
2. Implements both atomicity modes with the opt-in rule for `all_or_nothing`
3. Holds a single escrow per batch and settles via a single batch-contract transaction
4. Exposes batch status and settlement endpoints
5. Continues to run each inner task through the unmodified RTP 1.0 task lifecycle

---

*Built by [Spraay Protocol](https://spraay.app) · Reference implementation: [gateway.spraay.app](https://gateway.spraay.app)*
