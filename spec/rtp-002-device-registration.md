# RTP-SPEC-002: Device Registration Protocol

**Version:** 1.0.0-draft
**Author:** plagtech (@plagtech)
**Date:** 2026-04-01
**Status:** Draft
**Requires:** XMTP v3, Spraay x402 Gateway, RTP-SPEC-001

## Abstract

This specification defines how a physical device (robot, sensor, actuator, smart lock, drone, vending machine, or any IoT endpoint) registers itself on the XMTP network as an RTP-compatible device, advertises its capabilities, and becomes discoverable by agents and other devices.

The goal is to give every device a cryptographic identity, a communication channel, and a payment address — the three primitives needed for autonomous machine-to-machine commerce.

## Motivation

Today, IoT devices communicate through proprietary clouds (AWS IoT, Google Cloud IoT, Azure IoT Hub). This creates vendor lock-in, centralized points of failure, and no native payment capability. A device can report sensor data but cannot negotiate a price, accept a task, or get paid.

RTP (Robot Task Protocol) changes this by treating every device as an autonomous economic actor that:

1. Has an identity (XMTP inbox)
2. Can communicate (XMTP messages)
3. Can transact (Spraay x402 payments)
4. Can be discovered (capability registry)
5. Can build reputation (ProofLayer attestations)

This spec covers steps 1, 2, and 4.

## Device Tiers

Devices are classified into three tiers based on capability:

### Tier 1: Sensor (Report Only)

- **Hardware:** ESP32, Raspberry Pi Zero, Arduino with network module
- **Capabilities:** Read sensors, report data, respond to queries
- **Examples:** Temperature sensor, air quality monitor, GPS tracker, camera
- **Min requirements:** 512MB storage, WiFi or LoRa, keypair generation

### Tier 2: Actuator (Execute Commands)

- **Hardware:** Raspberry Pi 3+, industrial controller, smart lock, servo controller
- **Capabilities:** Everything in Tier 1, plus execute physical actions
- **Examples:** Smart lock, servo arm, relay switch, motorized gate, 3D printer
- **Min requirements:** 1GB storage, WiFi, keypair generation, actuator control

### Tier 3: Autonomous Agent (Negotiate and Execute)

- **Hardware:** Raspberry Pi 4/5, Jetson Nano, custom SBC with GPU
- **Capabilities:** Everything in Tier 2, plus negotiate tasks, manage payments, make decisions
- **Examples:** Delivery robot, autonomous drone, robotic arm with vision, self-driving cart
- **Min requirements:** 4GB RAM, 8GB storage, WiFi/cellular, keypair generation, LLM inference or API access

## Registration Flow

### Step 1: Generate Device Identity

The device MUST generate an Ethereum-compatible keypair on first boot. This keypair serves as both the device's wallet (for receiving payments) and the seed for its XMTP identity.

```
DEVICE_PRIVATE_KEY = generate_random_256bit()
DEVICE_ADDRESS = derive_ethereum_address(DEVICE_PRIVATE_KEY)
```

The private key MUST be stored in secure storage (hardware security module if available, encrypted filesystem otherwise). The private key MUST NOT be transmitted over any network.

For Tier 1 devices with constrained storage, the key MAY be derived deterministically from a device-specific seed (e.g., hardware serial number + manufacturer secret) using HKDF.

### Step 2: Create XMTP Identity

The device MUST create an XMTP client using its keypair:

```typescript
import { Client } from '@xmtp/node-sdk';

const signer = {
  getIdentifier: async () => ({
    identifier: DEVICE_ADDRESS,
    identifierKind: 'ETHEREUM',
  }),
  signMessage: async (message: Uint8Array) => {
    return sign(DEVICE_PRIVATE_KEY, message);
  },
};

const client = await Client.create(signer, {
  env: 'production',
  dbEncryptionKey: generateDbKey(),
  dbPath: '/data/rtp/xmtp.db',
});
```

After this step, the device has an XMTP inbox and can send and receive encrypted messages.

### Step 3: Register Capabilities

The device MUST announce its capabilities by publishing a Device Capability Manifest (DCM) to a well-known XMTP group topic or registry endpoint.

#### Device Capability Manifest Schema

```typescript
interface DeviceCapabilityManifest {
  // REQUIRED
  version: "1.0.0";
  deviceId: string;           // Unique device identifier (UUID or serial)
  address: string;            // Ethereum address (payment + identity)
  tier: 1 | 2 | 3;           // Device tier
  capabilities: string[];     // List of capability identifiers
  location: {
    latitude: number;
    longitude: number;
    radius: number;           // Service radius in meters
    description?: string;     // Human-readable location (e.g. "Anaheim, CA")
  };
  pricing: PricingRule[];     // What the device charges
  availability: {
    status: "online" | "busy" | "offline" | "maintenance";
    schedule?: WeeklySchedule; // Operating hours
  };
  registeredAt: string;       // ISO 8601 timestamp

  // OPTIONAL
  name?: string;              // Human-readable device name
  description?: string;       // What this device does
  manufacturer?: string;
  model?: string;
  firmware?: string;
  proofLayerScore?: number;   // Trust score from ProofLayer (0-100)
  maxConcurrentTasks?: number;
  supportedChains?: string[]; // Which chains it accepts payment on
  xmtpInboxId?: string;      // XMTP inbox ID for direct messaging
}

interface PricingRule {
  capability: string;         // Which capability this price applies to
  amount: string;             // Price as decimal string
  token: string;              // Payment token (e.g. "USDC")
  chain: string;              // Payment chain (e.g. "base")
  unit: string;               // What the price is per (e.g. "per-task", "per-hour", "per-reading")
}

interface WeeklySchedule {
  monday?: TimeRange[];
  tuesday?: TimeRange[];
  wednesday?: TimeRange[];
  thursday?: TimeRange[];
  friday?: TimeRange[];
  saturday?: TimeRange[];
  sunday?: TimeRange[];
}

interface TimeRange {
  start: string;              // "09:00" (24h format, UTC)
  end: string;                // "17:00"
}
```

#### Standard Capability Identifiers

Capabilities follow a hierarchical naming convention:

```
sensor.temperature
sensor.humidity
sensor.air-quality
sensor.gps
sensor.camera.photo
sensor.camera.video
sensor.camera.stream
actuator.lock.unlock
actuator.lock.lock
actuator.servo.rotate
actuator.relay.toggle
actuator.motor.drive
actuator.display.show
actuator.speaker.play
actuator.printer.print
agent.delivery.package
agent.delivery.food
agent.inspection.visual
agent.cleaning.floor
agent.security.patrol
agent.assembly.pick-and-place
```

New capabilities MAY be defined by device manufacturers using reverse-domain notation (e.g., `com.example.custom-capability`).

#### Example Manifest

```json
{
  "version": "1.0.0",
  "deviceId": "rtp-pi5-anaheim-001",
  "address": "0x742d35Cc6634C0532925a3b844Fc870f4C4dA001",
  "tier": 2,
  "capabilities": [
    "actuator.servo.rotate",
    "sensor.camera.photo",
    "sensor.temperature"
  ],
  "location": {
    "latitude": 33.8366,
    "longitude": -117.9143,
    "radius": 50,
    "description": "Anaheim, CA — Lab"
  },
  "pricing": [
    {
      "capability": "actuator.servo.rotate",
      "amount": "0.01",
      "token": "USDC",
      "chain": "base",
      "unit": "per-task"
    },
    {
      "capability": "sensor.camera.photo",
      "amount": "0.005",
      "token": "USDC",
      "chain": "base",
      "unit": "per-reading"
    }
  ],
  "availability": {
    "status": "online"
  },
  "registeredAt": "2026-04-01T12:00:00Z",
  "name": "Lab Servo Unit #1",
  "description": "Raspberry Pi 5 with SG90 servo and Pi Camera. Can rotate to specified angles and capture photos.",
  "manufacturer": "plagtech",
  "model": "rtp-pi-demo-v1",
  "supportedChains": ["base", "ethereum"],
  "maxConcurrentTasks": 1
}
```

### Step 4: Heartbeat

Online devices MUST send periodic heartbeat messages to maintain their registry presence.

```typescript
interface DeviceHeartbeat {
  deviceId: string;
  address: string;
  status: "online" | "busy" | "offline" | "maintenance";
  battery?: number;           // 0-100 percentage (for mobile devices)
  uptime?: number;            // Seconds since last boot
  tasksCompleted?: number;    // Lifetime task count
  currentLoad?: number;       // 0-100 percentage capacity utilization
  timestamp: string;          // ISO 8601
}
```

Heartbeat interval:
- Tier 1 devices: Every 5 minutes
- Tier 2 devices: Every 2 minutes
- Tier 3 devices: Every 1 minute

A device that misses 3 consecutive heartbeats SHOULD be marked as `offline` in the registry.

### Step 5: Discovery

Agents discover devices by querying the registry. The registry is implemented as a Spraay gateway endpoint:

```
GET /rtp/devices?capability=actuator.servo.rotate&lat=33.83&lng=-117.91&radius=5000
```

Response:
```json
{
  "devices": [
    {
      "deviceId": "rtp-pi5-anaheim-001",
      "address": "0x742d...a001",
      "capabilities": ["actuator.servo.rotate", "sensor.camera.photo"],
      "distance": 42,
      "pricing": { "actuator.servo.rotate": "0.01 USDC/task" },
      "availability": "online",
      "proofLayerScore": 87
    }
  ]
}
```

The discovery endpoint is itself an x402-paid endpoint on the Spraay gateway, creating a self-sustaining economic loop: agents pay to discover devices, devices pay to register, tasks generate payments in both directions.

## Security Considerations

### Key Management

Device private keys control both identity and funds. Compromise of a device key allows an attacker to impersonate the device and steal its balance. Devices SHOULD use hardware security modules (HSM) or trusted execution environments (TEE) where available. Tier 1 devices without HSM SHOULD keep minimal balances.

### Capability Fraud

A device could advertise capabilities it doesn't have. ProofLayer attestations after task completion provide a feedback mechanism. Devices with high failure rates will accumulate low trust scores, making them less likely to be selected by agents.

### Location Spoofing

A device could report a false location. For Tier 3 devices, location MAY be verified through GPS attestation services or cross-referenced with task completion proof (e.g., photos with GPS EXIF data).

### Denial of Service

A malicious actor could register many fake devices to pollute the registry. Registration SHOULD require a small x402 payment to the registry, creating an economic cost for spam.

## Copyright

Copyright and related rights waived via CC0.
