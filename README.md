# RTP — Robot Task Protocol

> The open standard for AI agents to discover, commission, and pay for physical robot tasks over the internet.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.0--draft-blue)]()
[![x402](https://img.shields.io/badge/payment-x402-green)]()
[![Spraay](https://img.shields.io/badge/reference_impl-Spraay-blue)](https://gateway.spraay.app)

---

## What is RTP?

RTP sits between AI agents and physical robots. It defines a common language — a standard task envelope, capability vocabulary, payment flow, and lifecycle state machine — that works across any robot hardware, connection type, or manufacturer.

**Spraay Gateway** ([gateway.spraay.app](https://gateway.spraay.app)) is the reference implementation.

## The Problem

Robots today speak thousands of proprietary languages — ROS topics, vendor SDKs, custom REST APIs. AI agents have no standard way to:

- **Discover** what robots are available and what they can do
- **Commission** a task with a guaranteed atomic payment
- **Receive** a standardized result regardless of hardware

## The Solution

Any robot that implements RTP becomes instantly hireable by any AI agent — with USDC micropayments via [x402](https://www.x402.org/), atomic escrow, and standardized task lifecycle management.

```javascript
// An AI agent hiring a robot in 3 lines
const robots = await client.discover({ capability: 'pick' })
const result = await client.hire(robots[0], {
  task: 'pick',
  parameters: { item: 'SKU-421', from_location: 'bin_A3' }
})
console.log(result.status) // COMPLETED
```

## How It Works

```
Agent discovers robot via .well-known/x402.json
       ↓
Agent sends Task Envelope + x402 USDC payment
       ↓
Gateway validates payment → holds in escrow
       ↓
Task dispatched to robot (webhook / xmtp / wifi / websocket)
       ↓
Robot executes → reports result
       ↓
Escrow releases to operator → agent receives result
```

## Protocol Stack

RTP occupies a distinct layer in the emerging machine economy:

| Layer | Role | Example |
|---|---|---|
| **Blockchain Infrastructure** | Machine identity, on-chain state | [peaq](https://peaq.xyz) |
| **Spatial Coordination** | Physical-world awareness for robots | [Auki](https://auki.io) |
| **Payment + Task Protocol** | Agent-to-robot task dispatch & payment | **RTP + Spraay** |
| **Payment Rails** | HTTP-native micropayments | [x402](https://www.x402.org/) |

These layers are complementary, not competing. RTP could use peaq machine IDs as an identity layer and Auki for spatial coordination while handling the payment and task dispatch.

## Specification

📄 **[RTP 1.0 Draft Specification](spec/RTP-1.0.md)**

The full spec defines:
- **Robot Identity** — resolvable `rtp://` URIs for every device
- **Capability Vocabulary** — 15 standard action verbs (`pick`, `place`, `scan`, `deliver`, `weld`, etc.)
- **Task Envelope** — universal JSON structure for any task to any robot
- **Lifecycle State Machine** — `PENDING → DISPATCHED → IN_PROGRESS → COMPLETED/FAILED/TIMEOUT`
- **Payment Standard** — x402 with atomic escrow (pay-per-task in USDC)
- **Discovery** — auto-registration in `.well-known/x402.json`

## SDK

```bash
npm install @spraay/rtp-sdk
```

📦 **[SDK Repository](https://github.com/plagtech/rtp-sdk)** — TypeScript SDK for both device operators and AI agents.

**Device side** (robot operator):
```javascript
import { RTPDevice } from '@spraay/rtp-sdk'

const robot = new RTPDevice({
  name: 'WarehouseBot-01',
  capabilities: ['pick', 'place', 'scan'],
  pricePerTask: '0.05',
  paymentAddress: '0xYourWallet',
  apiKey: 'your-spraay-key',
  connection: { type: 'webhook', webhookUrl: 'https://yourserver.com/rtp/task' }
})

robot.onTask('pick', async (params, task) => {
  await myRobotArm.pick(params.item, params.from_location)
  await task.complete({ output: `Moved ${params.item}` })
})

await robot.register()
robot.listen(3100)
```

**Agent side** (AI agent hiring robots):
```javascript
import { RTPClient } from '@spraay/rtp-sdk'

const client = new RTPClient({ wallet: myX402Wallet })
const robots = await client.discover({ capability: 'pick', maxPrice: '0.10' })
const result = await client.hire(robots[0], {
  task: 'pick',
  parameters: { item: 'SKU-00421', from_location: 'bin_A3' }
})
```

## Compatible Devices

| Device Type | SDK Direct | Install Method | Connection |
|---|---|---|---|
| Linux robot (ROS/ROS2) | ✅ | SSH / npm | webhook, websocket |
| Raspberry Pi | ✅ | SD card, USB, Docker | webhook, wifi |
| Arduino / ESP32 | ⚠️ Bridge | Serial via Pi | webhook via bridge |
| Industrial (KUKA/ABB/Fanuc) | ⚠️ External server | Vendor API bridge | webhook |
| Drones (ArduPilot/PX4) | ✅ | Companion computer | webhook, xmtp |
| IoT / Smart devices | ✅ | SSH / device API | webhook |
| Windows machines | ✅ | npm / Docker | webhook |

📖 **[Full Device Compatibility Guide](docs/DEVICE-COMPATIBILITY.md)**

## Gateway API

Base URL: `https://gateway.spraay.app/robots`

| Endpoint | Method | Description |
|---|---|---|
| `/robots/register` | POST | Register a robot with capabilities, pricing, connection config |
| `/robots/{id}/task` | POST | Submit task + x402 payment (returns 402 → pay → execute) |
| `/robots/{id}/complete` | POST | Robot reports task result, triggers escrow release |
| `/robots/{id}/tasks/{task_id}` | GET | Poll task status |
| `/robots` | GET | Discover robots (filter by capability, chain, price, tag) |
| `/robots/{id}` | GET | Full robot capability profile |

## Supported Chains

| Chain | Asset | Status |
|---|---|---|
| Base | USDC | ✅ Live |
| Arbitrum | USDC | ✅ Live |
| Ethereum | USDC | ✅ Live |
| Polygon | USDT | ✅ Live |
| + 7 more | Various | Via Spraay Gateway |

## Roadmap

- [x] RTP 1.0 Draft Specification
- [x] TypeScript SDK (device + agent client)
- [x] Device Compatibility Guide
- [ ] `rtp-device init` CLI wizard
- [ ] Python SDK
- [ ] Docker image (`spraay/rtp-device`)
- [ ] Hardware dongle (USB plug-and-play for non-technical operators)
- [ ] AgentRank integration (robot reputation scores)
- [ ] Task bundles (multi-robot atomic task sequences)
- [ ] Robot-to-robot delegation

## Use Cases

**Warehouse Automation** — AI agents hire pick-and-place robots by the task. Small businesses rent robot time instead of buying hardware.

**Drone Services** — Agents commission aerial surveys, deliveries, or patrols with automatic USDC payment per flight.

**3D Printing on Demand** — Upload a file, pay per print. The printer is an RTP endpoint.

**Smart Building Management** — HVAC, locks, lighting — all controllable and payable per action via RTP.

**Manufacturing** — CNC machines, welders, and assembly robots accept jobs from any agent, any chain.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). PRs welcome for:
- Additional capability vocabulary proposals
- New connection type specifications
- Reference implementations in other languages
- Hardware compatibility reports
- Security review and feedback

## License

MIT — open standard, free to implement.

---

*Built by [Spraay Protocol](https://spraay.app) · [@Spraay_app](https://twitter.com/Spraay_app)*
*Reference implementation: [gateway.spraay.app](https://gateway.spraay.app)*
*Author: [@plagtech](https://github.com/plagtech)*
