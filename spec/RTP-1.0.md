# RTP — Robot Task Protocol

### Version 1.0 Draft Specification

**Author:** Spraay Protocol
**Date:** March 2026
**Status:** Draft
**GitHub:** [github.com/plagtech/rtp-spec](https://github.com/plagtech/rtp-spec)
**Reference Implementation:** [gateway.spraay.app](https://gateway.spraay.app)

---

## Abstract

The Robot Task Protocol (RTP) is an open standard that defines a common language for AI agents to discover, commission, and pay for physical robot tasks over the internet. RTP sits on top of the [x402 payment protocol](https://www.x402.org/) and provides a standardized task envelope, capability vocabulary, identity scheme, and lifecycle state machine that works across any robot hardware, connection type, or manufacturer.

Spraay Gateway (`gateway.spraay.app`) serves as the reference implementation.

---

## Table of Contents

1. [Motivation](#1-motivation)
2. [Core Concepts](#2-core-concepts)
3. [Robot Identity](#3-robot-identity)
4. [Capability Vocabulary](#4-capability-vocabulary)
5. [Connection Types](#5-connection-types)
6. [The Task Envelope](#6-the-task-envelope)
7. [Task Lifecycle](#7-task-lifecycle)
8. [Result Envelope](#8-result-envelope)
9. [Payment Standard](#9-payment-standard)
10. [Discovery](#10-discovery)
11. [Gateway API Reference](#11-gateway-api-reference)
12. [Security Considerations](#12-security-considerations)
13. [Conformance](#13-conformance)
14. [Extensibility](#14-extensibility)
15. [Reference Implementation](#15-reference-implementation)
16. [Appendices](#appendices)

---

## 1. Motivation

Robots today speak thousands of proprietary languages — ROS topics, vendor SDKs, custom REST APIs. AI agents have no standard way to:

- **Discover** what robots are available and what they can do
- **Commission** a task with a guaranteed atomic payment
- **Receive** a standardized result regardless of hardware

RTP solves this by defining the protocol layer between agent intent and physical execution, with x402 as the payment primitive. The result is a world where any AI agent can hire any robot, on any chain, with a single HTTP request.

---

## 2. Core Concepts

### 2.1 Robot

Any physical or virtual actuator that can receive a task envelope, execute it, and report a result. This includes robotic arms, drones, autonomous vehicles, IoT actuators, 3D printers, CNC machines, smart locks, or software robots.

### 2.2 Operator

The entity that owns and controls a robot. The operator registers the robot, sets pricing, and operates the connection endpoint that receives task commands.

### 2.3 Agent

Any software agent (AI or human-driven) that discovers robots, submits task envelopes, and pays for task execution via x402.

### 2.4 Gateway

A registry and relay that maintains robot registrations, enforces x402 payment requirements, holds escrow, and routes task envelopes to the appropriate robot connection. The gateway is a trusted intermediary that ensures atomicity between payment and task execution.

---

## 3. Robot Identity

Every robot registered under RTP receives a unique resolvable identifier:

```
rtp://{gateway_host}/{robot_id}
```

**Example:**

```
rtp://gateway.spraay.app/robo_abc123
```

This identifier resolves to the robot's full capability profile via:

```
GET https://{gateway_host}/robots/{robot_id}
```

### 3.1 Identity Properties

| Property | Description |
|----------|-------------|
| `robot_id` | Unique identifier assigned at registration (e.g., `robo_abc123`) |
| `rtp_uri` | Fully qualified RTP URI |
| `name` | Human-readable device name |
| `operator` | Operator's payment address (wallet) |
| `registered_at` | ISO 8601 timestamp of registration |

### 3.2 External Identity Integration

RTP identities can be linked to external identity systems. For example, a robot registered on [peaq](https://peaq.xyz) with a peaqID can include its machine DID in the `metadata` field at registration, enabling cross-protocol identity resolution.

---

## 4. Capability Vocabulary

RTP defines a standard set of capability verbs. Robots declare which capabilities they support at registration time.

### 4.1 Core Capabilities

| Verb | Description |
|------|-------------|
| `move` | Relocate the robot or an end effector to a position |
| `pick` | Grasp or retrieve an object |
| `place` | Set down or deposit an object at a location |
| `scan` | Capture sensor data (barcode, vision, lidar, RFID, etc.) |
| `sort` | Categorize and route objects |
| `inspect` | Examine and report on an object or area |
| `deliver` | Transport an object from origin to destination |
| `patrol` | Monitor an area over a duration |
| `charge` | Return to or initiate a charging cycle |
| `capture` | Record video, audio, or image data |
| `transmit` | Send data to an external endpoint |
| `weld` | Perform a welding operation |
| `assemble` | Combine components into an assembly |
| `dispense` | Release a measured quantity of material |
| `print` | Output a physical object or document |

### 4.2 Custom Capabilities

Operators MAY declare custom capabilities using reverse-domain notation:

```json
{
  "capabilities": ["pick", "place", "com.acmerobotics.palletize"]
}
```

Custom capabilities MUST NOT conflict with core capability verb names.

### 4.3 Capability Parameters

Each capability verb has suggested standard parameters (see [Appendix B](#appendix-b-standard-capability-parameters)). Operators MAY extend parameters for custom use cases. Agents SHOULD include at minimum the standard parameters for a given capability.

---

## 5. Connection Types

RTP supports four connection types. The gateway routes task envelopes to the robot using whichever type the operator registered.

| Type | Transport | Best For |
|------|-----------|----------|
| `webhook` | HTTPS POST to operator's URL | Any internet-connected robot or server |
| `xmtp` | XMTP encrypted messaging | Crypto-native / wallet-addressed robots |
| `wifi` | HTTP via local relay | LAN-connected robots without public endpoints |
| `websocket` | WSS persistent connection | Real-time / low-latency bidirectional control |

### 5.1 Connection Configuration

At registration, operators provide a `connection` object:

**Webhook:**
```json
{
  "type": "webhook",
  "webhookUrl": "https://operator-server.com/rtp/task",
  "secret": "hmac-signing-secret"
}
```

**XMTP:**
```json
{
  "type": "xmtp",
  "xmtpAddress": "0xRobotWalletAddress"
}
```

**WiFi Relay:**
```json
{
  "type": "wifi",
  "relayUrl": "https://relay.operator.com",
  "localAddress": "192.168.1.100:3100"
}
```

**WebSocket:**
```json
{
  "type": "websocket",
  "wsUrl": "wss://operator-server.com/rtp/ws"
}
```

---

## 6. The Task Envelope

Every task — regardless of robot type, hardware, or capability — is wrapped in a standard **Task Envelope**. This is the core of RTP.

### 6.1 Task Envelope Schema

```json
{
  "rtp_version": "1.0",
  "task_id": "task_xyz789",
  "robot_id": "robo_abc123",
  "task": "pick",
  "parameters": {
    "item": "SKU-00421",
    "from_location": "bin_A3",
    "to_location": "conveyor_1"
  },
  "payment": {
    "x402_token": "<x402_payment_payload>",
    "amount": "0.05",
    "currency": "USDC",
    "chain": "base"
  },
  "callback_url": "https://agent.example.com/task-complete",
  "timeout_seconds": 60,
  "issued_at": "2026-03-11T12:00:00Z"
}
```

### 6.2 Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rtp_version` | string | Yes | Protocol version string (e.g., `"1.0"`) |
| `task_id` | string | Yes | Unique task identifier (assigned by gateway) |
| `robot_id` | string | Yes | Target robot identifier |
| `task` | string | Yes | Capability verb from the standard vocabulary |
| `parameters` | object | No | Task-specific parameters (free-form JSON) |
| `payment` | object | Yes | x402 payment proof and metadata |
| `payment.x402_token` | string | Yes | Signed x402 payment payload |
| `payment.amount` | string | Yes | Payment amount (decimal string) |
| `payment.currency` | string | Yes | Payment asset symbol (e.g., `"USDC"`) |
| `payment.chain` | string | Yes | Blockchain network (e.g., `"base"`) |
| `callback_url` | string | No | URL where gateway sends result on completion |
| `timeout_seconds` | integer | No | Max execution time before TIMEOUT (default: 60) |
| `issued_at` | string | Yes | ISO 8601 timestamp of task creation |

---

## 7. Task Lifecycle

RTP defines a strict state machine for every task.

```
             ┌─────────────┐
             │   PENDING    │  ← Task envelope created, payment validating
             └──────┬───────┘
                    │ payment confirmed
             ┌──────▼───────┐
             │  DISPATCHED  │  ← Envelope sent to robot connection
             └──────┬───────┘
                    │ robot acknowledges
             ┌──────▼───────┐
             │ IN_PROGRESS  │  ← Robot is executing the task
             └──────┬───────┘
          ┌─────────┴──────────┐
   ┌──────▼──────┐      ┌──────▼──────┐
   │  COMPLETED  │      │   FAILED    │
   └──────┬──────┘      └──────┬──────┘
          │                    │
   payment released      payment returned
   to operator           to agent
          │                    │
   ┌──────▼──────┐      ┌──────▼──────┐
   │  callback   │      │  callback   │
   │   fired     │      │   fired     │
   └─────────────┘      └─────────────┘

  TIMEOUT → treated as FAILED if no completion within timeout_seconds
```

### 7.1 State Definitions

| State | Description |
|-------|-------------|
| `PENDING` | Task received, x402 payment being validated on-chain |
| `DISPATCHED` | Payment confirmed, task envelope sent to robot via connection |
| `IN_PROGRESS` | Robot has acknowledged receipt and begun execution |
| `COMPLETED` | Robot confirmed successful completion |
| `FAILED` | Robot reported failure or unrecoverable error |
| `TIMEOUT` | Task exceeded `timeout_seconds` without completion |

### 7.2 State Transitions

| From | To | Trigger |
|------|----|---------|
| `PENDING` | `DISPATCHED` | x402 payment validated on-chain |
| `PENDING` | `FAILED` | Payment validation fails |
| `DISPATCHED` | `IN_PROGRESS` | Robot acknowledges task receipt |
| `DISPATCHED` | `TIMEOUT` | No acknowledgment within timeout |
| `IN_PROGRESS` | `COMPLETED` | Robot POSTs result with `success: true` |
| `IN_PROGRESS` | `FAILED` | Robot POSTs result with `success: false` |
| `IN_PROGRESS` | `TIMEOUT` | Execution exceeds `timeout_seconds` |

---

## 8. Result Envelope

When a robot completes (or fails) a task, it MUST POST a **Result Envelope** back to the gateway:

```json
{
  "rtp_version": "1.0",
  "task_id": "task_xyz789",
  "robot_id": "robo_abc123",
  "status": "COMPLETED",
  "result": {
    "success": true,
    "output": "Item SKU-00421 moved from bin_A3 to conveyor_1",
    "data": {},
    "duration_seconds": 12
  },
  "completed_at": "2026-03-11T12:01:12Z"
}
```

### 8.1 Result Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rtp_version` | string | Yes | Protocol version |
| `task_id` | string | Yes | Task being reported on |
| `robot_id` | string | Yes | Reporting robot |
| `status` | string | Yes | Terminal state: `COMPLETED`, `FAILED`, or `TIMEOUT` |
| `result.success` | boolean | Yes | Whether the task succeeded |
| `result.output` | string | No | Human-readable summary |
| `result.data` | object | No | Structured result data (sensor readings, etc.) |
| `result.duration_seconds` | number | No | Actual execution duration |
| `result.error` | string | No | Error description (on failure) |
| `completed_at` | string | Yes | ISO 8601 completion timestamp |

### 8.2 Gateway Actions on Result

| Status | Escrow Action | Callback |
|--------|---------------|----------|
| `COMPLETED` | Release funds to operator wallet | Fire `callback_url` with result |
| `FAILED` | Return funds to agent wallet | Fire `callback_url` with error |
| `TIMEOUT` | Return funds to agent wallet | Fire `callback_url` with timeout |

---

## 9. Payment Standard

RTP mandates **x402** as the payment protocol. No other payment method is part of this standard.

### 9.1 Payment Flow

1. Agent calls the robot's x402-protected task endpoint
2. Gateway returns HTTP **`402 Payment Required`** with price and accepted assets
3. Agent attaches a signed x402 payment payload to the request header (`X-PAYMENT`)
4. Gateway validates payment on-chain and holds funds in **escrow**
5. Task is dispatched **only after** payment is confirmed
6. Escrow releases on `COMPLETED`; refund issues on `FAILED`/`TIMEOUT`

### 9.2 402 Response Format

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402_version": "1",
  "accepts": [
    {
      "chain": "base",
      "asset": "USDC",
      "contract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "amount": "0.05"
    }
  ],
  "payTo": "0xAd62f03C7514bb8c51f1eA70C2b75C37404695c8",
  "description": "RTP task: pick — WarehouseBot-01"
}
```

### 9.3 Supported Assets (Reference Implementation)

| Asset | Chain | Contract |
|-------|-------|----------|
| USDC | Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| USDC | Arbitrum | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| USDC | Ethereum | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| USDT | Polygon | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` |

Operators MAY specify which assets and chains they accept at registration. Gateways SHOULD support multiple chains and bridge between them where possible.

---

## 10. Discovery

### 10.1 Well-Known Resource

Gateways implementing RTP MUST expose robot resources at:

```
GET https://{gateway_host}/.well-known/x402.json
```

Each registered robot appears as a resource entry:

```json
{
  "path": "/robots/robo_abc123/task",
  "method": "POST",
  "price": "0.05",
  "currency": "USDC",
  "description": "WarehouseBot-01 — pick, place, scan, sort",
  "tags": ["robot", "rtp", "warehouse"],
  "rtp": {
    "version": "1.0",
    "robot_id": "robo_abc123",
    "capabilities": ["pick", "place", "scan", "sort"],
    "connection_type": "webhook"
  }
}
```

The `rtp` extension object is REQUIRED for robot resources. This allows agents to distinguish robot endpoints from other x402 services and filter by capability.

### 10.2 Robot Registry Endpoint

```
GET https://{gateway_host}/robots
```

Returns a filterable list of all registered robots. Supports query parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `capability` | string | Filter by supported capability verb |
| `chain` | string | Filter by accepted payment chain |
| `max_price` | string | Maximum price per task (decimal) |
| `tag` | string | Filter by tag (comma-separated for multiple) |
| `status` | string | Filter by availability: `online`, `offline`, `busy` |

**Example:**

```
GET /robots?capability=pick&chain=base&max_price=0.10
```

---

## 11. Gateway API Reference

### 11.1 Register Robot

```
POST /robots/register
```

**Headers:**
```
X-API-Key: operator-api-key
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "WarehouseBot-01",
  "description": "6-axis pick and place robot in Warehouse Zone A",
  "capabilities": ["pick", "place", "scan", "sort"],
  "price_per_task": "0.05",
  "currency": "USDC",
  "chain": "base",
  "payment_address": "0xOperatorWallet",
  "connection": {
    "type": "webhook",
    "webhookUrl": "https://operator.com/rtp/task",
    "secret": "hmac-signing-secret"
  },
  "tags": ["warehouse", "industrial"],
  "metadata": {}
}
```

**Response (201 Created):**
```json
{
  "robot_id": "robo_abc123",
  "rtp_uri": "rtp://gateway.spraay.app/robo_abc123",
  "x402_endpoint": "https://gateway.spraay.app/robots/robo_abc123/task",
  "registered_at": "2026-03-11T12:00:00Z"
}
```

### 11.2 Trigger Task (x402 Protected)

```
POST /robots/{robot_id}/task
```

Returns `402 Payment Required` on first call. Agent re-submits with `X-PAYMENT` header containing signed x402 payload.

**Request Body:**
```json
{
  "task": "pick",
  "parameters": {
    "item": "SKU-00421",
    "from_location": "bin_A3",
    "to_location": "conveyor_1"
  },
  "callback_url": "https://agent.example.com/task-complete",
  "timeout_seconds": 60
}
```

**Response (200 OK):**
```json
{
  "task_id": "task_xyz789",
  "robot_id": "robo_abc123",
  "status": "DISPATCHED",
  "escrow_id": "escrow_001",
  "dispatched_at": "2026-03-11T12:00:01Z"
}
```

### 11.3 Complete Task

```
POST /robots/{robot_id}/complete
```

Called by the robot/operator to report task completion or failure.

**Request Body:** Result Envelope (see [Section 8](#8-result-envelope))

**Response (200 OK):**
```json
{
  "task_id": "task_xyz789",
  "status": "COMPLETED",
  "escrow_released": true,
  "payment_tx": "0xTransactionHash"
}
```

### 11.4 Get Task Status

```
GET /robots/{robot_id}/tasks/{task_id}
```

**Response:**
```json
{
  "task_id": "task_xyz789",
  "robot_id": "robo_abc123",
  "status": "IN_PROGRESS",
  "task": "pick",
  "dispatched_at": "2026-03-11T12:00:01Z",
  "updated_at": "2026-03-11T12:00:05Z"
}
```

### 11.5 List Robots

```
GET /robots
```

**Response:**
```json
{
  "robots": [
    {
      "robot_id": "robo_abc123",
      "name": "WarehouseBot-01",
      "capabilities": ["pick", "place", "scan", "sort"],
      "price_per_task": "0.05",
      "currency": "USDC",
      "chain": "base",
      "status": "online",
      "x402_endpoint": "https://gateway.spraay.app/robots/robo_abc123/task"
    }
  ],
  "total": 1
}
```

### 11.6 Get Robot Profile

```
GET /robots/{robot_id}
```

Returns full registration data including capabilities, pricing, connection type, tags, and metadata.

### 11.7 Update Robot

```
PATCH /robots/{robot_id}
```

Update pricing, availability, capabilities, or connection config. Requires operator API key.

### 11.8 Deregister Robot

```
DELETE /robots/{robot_id}
```

Remove robot from registry and `.well-known/x402.json`. Requires operator API key. Active tasks must complete or timeout first.

---

## 12. Security Considerations

### 12.1 Operator Authentication

Robot registration and management endpoints require a valid Spraay API key (`X-API-Key` header). API keys are scoped per operator.

### 12.2 Task Authentication

x402 payment payloads are cryptographically signed by the agent's wallet and verified on-chain by the gateway. No unsigned task can be dispatched.

### 12.3 Webhook Verification

The gateway signs outbound task envelopes with HMAC-SHA256 using the operator's registered `secret`. Operators MUST verify the `X-RTP-Signature` header before processing any task.

```
X-RTP-Signature: sha256=<hmac_hex_digest>
```

### 12.4 Escrow Safety

Funds are held by the gateway's escrow primitive until task completion or timeout. Operators cannot withdraw escrowed funds before task resolution. Timeout triggers automatic refund to the agent.

### 12.5 Replay Protection

Each `task_id` is unique and single-use. The gateway rejects any task envelope with a previously used `task_id`. The `issued_at` timestamp must be within a configurable freshness window (default: 5 minutes).

### 12.6 Rate Limiting

Gateways SHOULD implement rate limiting per operator and per agent to prevent abuse. Recommended defaults: 100 registrations/hour per operator, 1000 tasks/hour per agent.

---

## 13. Conformance

An implementation is **RTP 1.0 conformant** if it:

1. Accepts Task Envelopes matching the schema in [Section 6](#6-the-task-envelope)
2. Implements the full state machine defined in [Section 7](#7-task-lifecycle)
3. Returns Result Envelopes matching the schema in [Section 8](#8-result-envelope)
4. Enforces x402 payment as defined in [Section 9](#9-payment-standard)
5. Exposes discovery at `.well-known/x402.json` as defined in [Section 10](#10-discovery)

Implementations MAY support a subset of connection types (e.g., webhook only) and still be conformant.

---

## 14. Extensibility

RTP is designed to be extended without breaking compatibility:

- **Custom capabilities** via reverse-domain notation ([Section 4.2](#42-custom-capabilities))
- **Custom parameters** in the task envelope `parameters` field
- **Custom result data** in the result envelope `data` field
- **Custom metadata** at registration via the `metadata` field
- Future versions will increment `rtp_version` and maintain backward compatibility

### 14.1 Extension Negotiation

Agents and robots can negotiate extensions via the `metadata` field. For example, a robot might advertise support for streaming video output:

```json
{
  "metadata": {
    "extensions": ["rtp-streaming-v1"],
    "stream_url": "wss://robot.operator.com/stream"
  }
}
```

---

## 15. Reference Implementation

**Spraay Gateway** — [gateway.spraay.app](https://gateway.spraay.app)

Full RTP 1.0 reference implementation including:
- All four connection types (webhook, XMTP, WiFi relay, WebSocket)
- x402 payment enforcement with multi-chain support
- Supabase-backed escrow with automatic release/refund
- Webhook relay with HMAC signing
- Auto-discovery via `.well-known/x402.json`
- Audit logging for all task lifecycle events

**SDK:** [`@spraay/rtp-sdk`](https://github.com/plagtech/rtp-sdk)
- TypeScript SDK for device operators and AI agent clients
- CLI setup wizard (`rtp-device init`)
- Docker deployment support

---

## Appendices

### Appendix A: Example — AI Agent Hires a Warehouse Robot

```
1. Agent calls GET gateway.spraay.app/.well-known/x402.json
   → Discovers robo_abc123 supports "pick" at 0.05 USDC on Base

2. Agent calls POST /robots/robo_abc123/task
   → Receives HTTP 402 with payment details

3. Agent signs x402 payment (0.05 USDC on Base)
   → Re-submits request with X-PAYMENT header

4. Gateway validates payment → holds 0.05 USDC in escrow
   → Dispatches Task Envelope to operator's webhook URL

5. Robot executes "pick" task (moves SKU-00421 from bin_A3 to conveyor_1)

6. Operator POSTs Result Envelope to /robots/robo_abc123/complete
   → status: COMPLETED, duration_seconds: 12

7. Gateway releases 0.05 USDC to operator wallet
   → Fires agent's callback_url with full result

Total time: ~15 seconds. Zero manual coordination.
```

### Appendix B: Standard Capability Parameters

#### `pick`
```json
{ "item": "string", "from_location": "string" }
```

#### `place`
```json
{ "item": "string", "to_location": "string" }
```

#### `deliver`
```json
{ "item": "string", "origin": "string", "destination": "string" }
```

#### `scan`
```json
{ "target": "string", "sensor_type": "barcode|vision|lidar|rfid" }
```

#### `patrol`
```json
{ "area": "string", "duration_seconds": 300, "interval_seconds": 30 }
```

#### `capture`
```json
{ "type": "image|video|audio", "duration_seconds": 10, "output_url": "string" }
```

#### `move`
```json
{ "target_position": "string|object", "speed": "slow|normal|fast" }
```

#### `sort`
```json
{ "items": "string[]", "criteria": "string", "destination_map": "object" }
```

#### `inspect`
```json
{ "target": "string", "checks": "string[]", "report_url": "string" }
```

#### `weld`
```json
{ "joint_id": "string", "weld_type": "spot|seam|arc", "parameters": "object" }
```

#### `assemble`
```json
{ "components": "string[]", "assembly_id": "string", "instructions_url": "string" }
```

#### `dispense`
```json
{ "material": "string", "quantity": "number", "unit": "string" }
```

#### `print`
```json
{ "file_url": "string", "material": "string", "quality": "draft|normal|fine" }
```

#### `transmit`
```json
{ "data": "object", "destination_url": "string", "format": "json|csv|binary" }
```

#### `charge`
```json
{ "return_to_station": true }
```

### Appendix C: RTP URI Scheme

```
rtp://{gateway_host}/{robot_id}
```

The `rtp://` scheme is informational and resolves via HTTPS:

```
rtp://gateway.spraay.app/robo_abc123
→ GET https://gateway.spraay.app/robots/robo_abc123
```

### Appendix D: Error Codes

| Code | Meaning |
|------|---------|
| `RTP_INVALID_ENVELOPE` | Task envelope missing required fields |
| `RTP_UNKNOWN_CAPABILITY` | Robot does not support requested capability |
| `RTP_PAYMENT_FAILED` | x402 payment validation failed |
| `RTP_ROBOT_OFFLINE` | Target robot is not currently available |
| `RTP_ROBOT_BUSY` | Robot is currently executing another task |
| `RTP_TIMEOUT` | Task exceeded timeout_seconds |
| `RTP_ESCROW_FAILED` | Escrow creation or release failed |
| `RTP_SIGNATURE_INVALID` | HMAC webhook signature verification failed |
| `RTP_RATE_LIMITED` | Request exceeds rate limit |

---

*RTP is an open standard. Contributions and implementations welcome.*
*Reference implementation: [Spraay Protocol](https://spraay.app) — [gateway.spraay.app](https://gateway.spraay.app)*
