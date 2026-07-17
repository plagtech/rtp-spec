# RTP-EXT-2 — Simulation Mode

### Extension to RTP 1.0 Draft Specification

**Author:** Spraay Protocol
**Date:** July 2026
**Status:** Draft
**Requires:** RTP 1.0 · Composes with: RTP-EXT-1 (Batch)
**Reference Implementation:** [gateway.spraay.app](https://gateway.spraay.app)

---

## Abstract

RTP-EXT-2 defines **simulation mode**: virtual robots that traverse the complete RTP lifecycle — discovery, 402 challenge, payment, escrow, dispatch, execution, result, settlement — without any physical hardware. A developer with zero robots can validate an end-to-end agent integration in minutes, including the x402 payment path, before a single device is registered.

Simulation is the adoption on-ramp for the protocol: hardware is the hardest dependency in robotics, so RTP removes it from the first mile.

---

## Table of Contents

1. [Motivation](#1-motivation)
2. [Sim Robots](#2-sim-robots)
3. [The `sim` Connection Type](#3-the-sim-connection-type)
4. [Behavior Directives](#4-behavior-directives)
5. [Payment in Simulation](#5-payment-in-simulation)
6. [Result Envelope](#6-result-envelope)
7. [Local Simulation (SDK)](#7-local-simulation-sdk)
8. [Batch Simulation](#8-batch-simulation)
9. [Gateway API](#9-gateway-api)
10. [Security Considerations](#10-security-considerations)
11. [Conformance](#11-conformance)

---

## 1. Motivation

Every other part of RTP can be tested from a laptop — except the robot. This creates a chicken-and-egg problem: agent developers won't integrate a protocol they can't test, and operators won't register hardware into a protocol with no agents.

Simulation mode breaks the loop:

- **Agent developers** test discovery, hiring, payment, timeout handling, and callbacks against gateway-hosted sim robots with deterministic, scriptable behavior.
- **Operators** test their device-side handlers locally before pointing real actuators at the protocol.
- **CI pipelines** run the full protocol round-trip on every commit, no hardware in the loop.

A sim task is a real task in every respect the protocol can observe: real 402 challenge, real payment validation, real state machine, real settlement. Only the physics is fake.

---

## 2. Sim Robots

### 2.1 Gateway-Hosted Sim Fleet

Conforming gateways SHOULD host a standing fleet of sim robots covering every core capability verb. The reference implementation exposes:

```
rtp://gateway.spraay.app/robo_sim_arm      capabilities: pick, place, sort, assemble
rtp://gateway.spraay.app/robo_sim_drone    capabilities: capture, deliver, patrol, scan, move
rtp://gateway.spraay.app/robo_sim_printer  capabilities: print, dispense
rtp://gateway.spraay.app/robo_sim_sensor   capabilities: scan, inspect, capture, transmit
rtp://gateway.spraay.app/robo_sim_welder   capabilities: weld, assemble, inspect
```

### 2.2 Identification

Sim robots are first-class registrations distinguished by a single boolean:

```json
{
  "robot_id": "robo_sim_arm",
  "name": "Sim Arm (gateway-hosted)",
  "sim": true,
  "capabilities": ["pick", "place", "sort", "assemble"],
  "price_per_task": "0.001"
}
```

- `sim: true` MUST appear in the robot's capability profile and in `.well-known/x402.json` discovery entries.
- Discovery MUST support filtering: `GET /robots?sim=true` and `GET /robots?sim=false`. The default discovery response includes both; agents that only want physical robots filter explicitly.
- Operators MAY register their own sim robots (e.g., a digital twin of a real device) using the same flag.

---

## 3. The `sim` Connection Type

RTP-EXT-2 adds a fifth connection type to RTP 1.0 §5:

| Type | Transport | Best For |
|------|-----------|----------|
| `sim` | In-process (gateway executes the task itself) | Testing, CI, digital twins |

```json
{
  "type": "sim",
  "profile": "default"
}
```

No webhook, no socket, no relay: the gateway's own sim executor receives the task envelope, applies the behavior directives (§4), and reports the result through the same internal path a real robot's completion would take. The RTP 1.0 state machine is unmodified.

---

## 4. Behavior Directives

Sim behavior is scripted by the agent per-task via a reserved `_sim` parameter block. This makes failure paths — the part real hardware makes hardest to test — deterministic.

```json
{
  "task": "pick",
  "parameters": {
    "item": "SKU-00421",
    "from_location": "bin_A3",
    "_sim": {
      "behavior": "fail",
      "delay_ms": 1500,
      "failure_reason": "GRIPPER_JAM"
    }
  }
}
```

| Directive | Type | Default | Description |
|-----------|------|---------|-------------|
| `behavior` | string | `"succeed"` | `succeed` \| `fail` \| `timeout` \| `random` |
| `delay_ms` | integer | `800` | Simulated execution time before the terminal state (capped at `timeout_seconds`) |
| `failure_reason` | string | `"SIM_FAILURE"` | Error code returned when `behavior: "fail"` |
| `success_rate` | number | `0.9` | Probability of success when `behavior: "random"` (0.0–1.0) |
| `output` | object | generated | Verbatim output to return on success; otherwise the executor generates capability-appropriate output |

### 4.1 Generated Outputs

When no `output` directive is given, the sim executor returns plausible, schema-valid output for the capability: `capture` returns a placeholder `media_url`, `scan` returns synthetic barcode/sensor JSON, `print` returns a fake job report with layer count and duration. This keeps agent-side result parsing honest.

### 4.2 Behavior on Real Robots

`_sim` directives sent to a robot where `sim: false` MUST be stripped by the gateway before dispatch and ignored if received. A physical robot MUST NOT change behavior based on `_sim` content.

---

## 5. Payment in Simulation

Simulation exercises the payment path — it does not bypass it. Two tiers:

| Tier | Chain | Asset | Purpose |
|------|-------|-------|---------|
| **Testnet sim** | `base-sepolia` | test USDC | Full x402 flow with faucet funds. RECOMMENDED for CI |
| **Mainnet sim** | `base` (or any supported chain) | USDC | Real-money dry run at micro price before pointing real budgets at real robots |

- Gateway-hosted sim robots MUST accept testnet payment and SHOULD also accept mainnet payment at a micro price (reference: `0.001 USDC`).
- The 402 challenge, payment validation, escrow hold, and settlement (including refund on simulated failure) are identical to production. A simulated `FAILED` task MUST trigger a real escrow refund — this is precisely the path developers most need to verify.
- Mainnet sim revenue settles to the gateway operator like any other task; sim mode is a paid endpoint at a nominal price, not a free tier that bypasses x402.

---

## 6. Result Envelope

Sim results extend the RTP 1.0 Result Envelope with one required field:

```json
{
  "task_id": "task_s1m123",
  "robot_id": "robo_sim_arm",
  "status": "COMPLETED",
  "simulated": true,
  "output": {
    "moved": "SKU-00421",
    "from": "bin_A3",
    "duration_ms": 1500
  },
  "completed_at": "2026-07-16T12:00:03Z"
}
```

`simulated: true` MUST be present on every result produced by a sim executor, and MUST propagate into callbacks, polling responses, and batch result envelopes. Agents MUST be able to distinguish simulated results from physical ones without re-fetching the robot profile.

---

## 7. Local Simulation (SDK)

The SDK ships an in-process sim device so operator-side handlers can be developed with no gateway round-trip at all:

```ts
import { RTPDevice, simTransport } from '@spraay/rtp-sdk'

const robot = new RTPDevice({
  name: 'DevBot',
  capabilities: ['pick', 'place'],
  pricePerTask: '0.001',
  connection: { type: 'sim' },
  transport: simTransport()          // in-memory, no network
})

robot.onTask('pick', async (params, task) => {
  await task.complete({ output: `picked ${params.item}` })
})

// Drive it from a local client in the same process
import { RTPClient, simWallet } from '@spraay/rtp-sdk'
const client = new RTPClient({ wallet: simWallet(), transport: robot.transport })
const result = await client.hire(robot.profile, { task: 'pick', parameters: { item: 'X' } })
// result.simulated === true, full lifecycle traversed in-memory
```

`simWallet()` produces structurally valid x402 payloads accepted only by `simTransport()`, so payment-handling code paths execute even offline.

---

## 8. Batch Simulation

RTP-EXT-2 composes with RTP-EXT-1. A batch MAY target sim robots, and MAY mix behaviors to test every settlement branch:

```ts
const batch = await client.hireBatch([
  { robot: simArm,   task: 'pick',    parameters: { item: 'A', _sim: { behavior: 'succeed' } } },
  { robot: simDrone, task: 'capture', parameters: { area: 'Z', _sim: { behavior: 'timeout' } } },
], { atomicity: 'independent' })

// batch.status === 'BATCH_PARTIAL'
// batch.settlement contains a real (testnet) batch tx: one payout + one refund
```

This is the cheapest way to verify `BATCH_PARTIAL` settlement math before real money and real hardware are involved. Batches mixing sim and physical robots MUST be rejected by the gateway (`ERR_MIXED_SIM_BATCH`) — a batch is either entirely simulated or entirely real.

---

## 9. Gateway API

No new endpoints. Sim robots live under the existing surface:

| Endpoint | Method | Sim-relevant behavior |
|----------|--------|----------------------|
| `/robots?sim=true` | GET | Discover the sim fleet |
| `/robots/{id}/task` | POST | 402 → pay (testnet or mainnet) → sim executor runs |
| `/robots/{id}/tasks/{task_id}` | GET | Status; result carries `simulated: true` |
| `/robots/batch` | POST | Sim batches per §8 |

> **Reference implementation (Spraay Gateway).** Consistent with RTP 1.0 §11, the deployed gateway exposes these on a flat, query-parameter surface: discovery is `GET /api/v1/robots/list?sim=true`, dispatch is `POST /api/v1/robots/task`, status is `GET /api/v1/robots/status?task_id={task_id}`, and sim batches are `POST /api/v1/robots/batch`.

---

## 10. Security Considerations

- **Sim/real confusion.** The `simulated: true` result flag and the `sim: true` profile flag are load-bearing: an agent paying mainnet prices MUST NOT be able to mistake a sim result for physical work. Gateways MUST NOT allow a registration to toggle `sim` after creation.
- **Sim fleet abuse.** Gateway-hosted sim robots are effectively free compute triggers; gateways SHOULD rate-limit sim tasks per wallet and keep `delay_ms` caps low.
- **`_sim` injection.** Stripping `_sim` before physical dispatch (§4.2) prevents an agent from smuggling directives that a poorly written device handler might act on.
- **Testnet/mainnet separation.** Escrow accounting MUST be segregated per chain; testnet sim volume MUST NOT appear in mainnet revenue or reputation metrics.

---

## 11. Conformance

A gateway conforms to RTP-EXT-2 if it:

1. Hosts or supports registration of robots with `sim: true` and the `sim` connection type
2. Supports `?sim=` discovery filtering
3. Executes behavior directives deterministically and strips `_sim` from physical dispatch
4. Runs the unmodified RTP 1.0 payment and lifecycle paths for sim tasks, including real escrow refunds on simulated failure
5. Marks every sim result with `simulated: true`
6. Rejects mixed sim/physical batches when RTP-EXT-1 is also implemented

---

*Built by [Spraay Protocol](https://spraay.app) · Reference implementation: [gateway.spraay.app](https://gateway.spraay.app)*
