# RTP Device Compatibility & Installation Guide

> How to connect any robot, drone, IoT device, or machine to the RTP network.

This guide answers three questions for every machine type:
1. **Can it run the SDK directly**, or does it need a bridge?
2. **How does the software get onto it?**
3. **How does it connect to Spraay Gateway?**

---

## Quick Compatibility Matrix

| Machine Type | SDK Direct | Install Method | Connection | Difficulty |
|---|---|---|---|---|
| Linux robot (ROS/ROS2) | ✅ | SSH / npm | webhook, websocket | Easy |
| Raspberry Pi | ✅ | SD card, USB, Docker | webhook, wifi | Easy |
| Arduino / ESP32 | ❌ Bridge | Serial from Pi | webhook via bridge | Medium |
| Industrial (KUKA/ABB/Fanuc) | ❌ External server | Vendor API bridge | webhook | Medium |
| DJI Drone | ❌ External server | Mobile/companion | webhook | Medium |
| ArduPilot/PX4 Drone | ✅ Companion PC | SSH to companion | webhook, xmtp | Easy |
| IoT / Smart devices | ✅ Usually | SSH / device API | webhook | Easy |
| 3D Printers (OctoPrint) | ✅ | SSH / plugin | webhook | Easy |
| Windows machines | ✅ | npm / Docker | webhook | Easy |

---

## Category 1 — Linux-Based Robots

**Robots with a full Linux OS onboard.**

**Examples:** Universal Robots (UR3/UR5/UR10), Fetch Robotics, Boston Dynamics Spot, AgileX, Clearpath, most research robots, any robot running ROS/ROS2.

**Can run SDK directly:** ✅ Yes

### Installation

```bash
# Connect via SSH over WiFi or Ethernet
ssh operator@robot.local

# Install Node.js if not present
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install RTP SDK
npm install -g @spraay/rtp-sdk

# Run guided setup wizard
rtp-device init

# Start receiving tasks
rtp-device start
```

**Transfer method:** SSH directly — no USB needed. If the robot lacks internet, copy files via `scp`:

```bash
scp rtp.config.json operator@robot.local:/home/operator/
```

**Connection type:** `webhook` (robot runs its own HTTP server) or `websocket` (persistent connection)

---

## Category 2 — Raspberry Pi Based Robots

**DIY robots, hobbyist builds, Pi-controlled arms and drones.**

**Examples:** Pi-controlled robot arms, custom rovers, 3D printers running OctoPrint, any Raspberry Pi GPIO project.

**Can run SDK directly:** ✅ Yes

### Option A — SD Card (Pre-configured before first boot)

Flash Raspberry Pi OS onto SD card, then add a setup script to the boot partition:

```bash
#!/bin/bash
# firstboot.sh — place on /boot partition
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g @spraay/rtp-sdk
rtp-device init --config /boot/rtp.config.json
rtp-device start
```

Drop your `rtp.config.json` on the boot partition. Insert SD card, power on — it self-configures.

### Option B — USB from Laptop

Connect via SSH over USB OTG or WiFi, then install normally:

```bash
npm install -g @spraay/rtp-sdk
rtp-device init
rtp-device start
```

### Option C — Docker

```bash
docker run -d \
  -e API_KEY=your_spraay_key \
  -e WALLET=0xYourWallet \
  -e CAPABILITIES=pick,place \
  -e PRICE=0.05 \
  --device /dev/gpiomem \
  spraay/rtp-device:latest
```

### GPIO Example — Controlling a Physical Relay

```javascript
import { RTPDevice } from '@spraay/rtp-sdk'
import { Gpio } from 'onoff'

const relay = new Gpio(17, 'out')

const device = new RTPDevice({
  name: 'RelayController-01',
  capabilities: ['dispense'],
  pricePerTask: '0.01',
  paymentAddress: '0xYourWallet',
  apiKey: 'your-key',
  connection: {
    type: 'webhook',
    webhookUrl: 'http://your-ip:3100/rtp/task'
  }
})

device.onTask('dispense', async (params, task) => {
  relay.writeSync(1)                        // activate relay
  await sleep(params.duration_ms || 1000)   // hold for duration
  relay.writeSync(0)                        // deactivate
  await task.complete({ output: 'Dispensed' })
})

await device.register()
device.listen(3100)
```

**Connection type:** `webhook` or `wifi`

---

## Category 3 — Arduino / ESP32 / Microcontrollers

**No OS, no Node.js — runs bare firmware only.**

**Examples:** Arduino Uno/Mega, ESP32, ESP8266, STM32, any microcontroller-driven robot.

**Can run SDK directly:** ❌ No — **requires a bridge device**

### Architecture

```
[Spraay Gateway] ←WiFi→ [Pi running RTP SDK] ←USB/Serial→ [Arduino/ESP32]
```

A Raspberry Pi (or any Linux device) acts as the **RTP bridge**. It runs the SDK and translates task envelopes into serial commands the microcontroller understands.

### Bridge Setup (on the Pi)

```javascript
import { RTPDevice } from '@spraay/rtp-sdk'
import { SerialPort } from 'serialport'

const port = new SerialPort({ path: '/dev/ttyUSB0', baudRate: 9600 })

const device = new RTPDevice({
  name: 'ArduinoArm-01',
  capabilities: ['pick', 'place'],
  pricePerTask: '0.03',
  paymentAddress: '0xYourWallet',
  apiKey: 'your-key',
  connection: {
    type: 'webhook',
    webhookUrl: 'http://your-ip:3100/rtp/task'
  }
})

device.onTask('pick', async (params, task) => {
  // Send command over serial to Arduino
  port.write(`PICK:${params.from_location}\n`)

  // Wait for Arduino to respond "DONE"
  await waitForSerial(port, 'DONE', 30000)
  await task.complete({ output: 'Pick complete' })
})

await device.register()
device.listen(3100)
```

### Arduino Firmware (receives commands via serial)

```cpp
void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    if (cmd.startsWith("PICK:")) {
      String location = cmd.substring(5);
      executePickAt(location);
      Serial.println("DONE");
    }
    if (cmd.startsWith("PLACE:")) {
      String location = cmd.substring(6);
      executePlaceAt(location);
      Serial.println("DONE");
    }
  }
}
```

**Transfer method:** Upload firmware to Arduino via USB from laptop as normal. The bridge Pi connects separately via serial.

---

## Category 4 — Industrial Robots (Proprietary Controllers)

**KUKA, Fanuc, ABB, Yaskawa — locked-down controller systems.**

**Examples:** KUKA KR series, Fanuc R series, ABB IRB series, Yaskawa Motoman.

**Can run SDK directly:** ❌ No — controller is locked. SDK runs on an **external server**.

### Architecture

```
[Spraay Gateway] ←internet→ [Operator's Server running RTP SDK] ←ethernet/vendor API→ [Industrial Robot]
```

### Vendor Communication Protocols

| Brand | Protocol | SDK Runs On |
|---|---|---|
| KUKA | KUKA.Ethernet KRL | External Linux server |
| Fanuc | FANUC FOCAS / EtherPath | External server |
| ABB | ABB Robot Web Services (REST) | Any server with network access |
| Yaskawa | MotoPlus SDK / Ethernet | External server |

### Example — ABB Robot (REST API)

```javascript
import { RTPDevice } from '@spraay/rtp-sdk'
import axios from 'axios'

const device = new RTPDevice({
  name: 'ABB-IRB-4600',
  capabilities: ['weld', 'assemble'],
  pricePerTask: '0.25',
  paymentAddress: '0xYourWallet',
  apiKey: 'your-key',
  connection: {
    type: 'webhook',
    webhookUrl: 'https://your-server.com/rtp/task'
  }
})

device.onTask('weld', async (params, task) => {
  // Call ABB's built-in REST API
  await axios.post('http://robot.local/rw/rapid/tasks/T_ROB1/execute', {
    program: 'WeldRoutine',
    params: params
  })

  // Wait for robot to signal completion
  await pollRobotStatus('http://robot.local/rw/rapid/tasks/T_ROB1/status')
  await task.complete({ output: 'Weld executed' })
})

await device.register()
device.listen(3100)
```

**Transfer method:** No software transfer to the robot. Deploy the SDK to your server (Railway, VPS, local machine) and point it at the robot's network API.

---

## Category 5 — Drones

**Flying robots — varies by platform.**

### DJI (Proprietary)

**Can run SDK directly:** ❌ No — use companion mobile device or server via DJI Mobile SDK.

Same external server pattern as industrial robots. The SDK runs on a connected device that communicates with the DJI controller.

### ArduPilot / PX4 (Open Source)

**Can run SDK directly:** ✅ Yes — on the companion computer (Pi or Jetson).

```javascript
import { RTPDevice } from '@spraay/rtp-sdk'
import { connect } from 'node-mavlink'

const drone = await connect('/dev/ttyAMA0')

const device = new RTPDevice({
  name: 'SurveyDrone-01',
  capabilities: ['patrol', 'capture', 'deliver'],
  pricePerTask: '0.50',
  paymentAddress: '0xYourWallet',
  apiKey: 'your-key',
  connection: {
    type: 'webhook',
    webhookUrl: 'http://companion-ip:3100/rtp/task'
  }
})

device.onTask('patrol', async (params, task) => {
  await drone.setMode('AUTO')
  await drone.uploadMission(params.waypoints)
  await drone.startMission()
  await waitForMissionComplete(drone)
  await task.complete({ output: 'Patrol complete' })
})

device.onTask('capture', async (params, task) => {
  const image = await drone.captureImage()
  await uploadToIPFS(image, params.output_url)
  await task.complete({ output: 'Image captured', data: { url: params.output_url } })
})

await device.register()
device.listen(3100)
```

**Connection type:** `webhook` (companion computer) or `xmtp` (wallet-addressed drone)

---

## Category 6 — IoT / Smart Devices

**Not traditional robots, but fully RTP compatible.**

**Examples:** Smart locks, EV chargers, vending machines, 3D printers, CNC machines, HVAC systems.

**Can run SDK directly:** ✅ Usually yes (most run embedded Linux)

### 3D Printer (via OctoPrint)

```javascript
device.onTask('print', async (params, task) => {
  // Upload G-code file
  await axios.post('http://octoprint.local/api/files/local', {
    file: params.gcode_url
  }, { headers: { 'X-Api-Key': OCTOPRINT_KEY } })

  // Start print
  await axios.post('http://octoprint.local/api/job', { command: 'start' })

  // Poll until complete
  await waitForPrintComplete()
  await task.complete({ output: 'Print finished' })
})
```

### Smart Lock

```javascript
device.onTask('unlock', async (params, task) => {
  await lockApi.unlock(params.duration_seconds || 10)
  await task.complete({
    output: `Unlocked for ${params.duration_seconds}s`
  })
})
```

### EV Charger

```javascript
device.onTask('charge', async (params, task) => {
  await chargerApi.startSession(params.vehicle_id)
  await waitForChargingComplete(params.target_percent || 80)
  await task.complete({
    output: 'Charging complete',
    data: { kwh_delivered: getSessionKwh() }
  })
})
```

**Transfer method:** Usually SSH or the device's own management interface.

---

## Category 7 — Windows-Based Machines

**Industrial PCs, CNC controllers, manufacturing equipment running Windows.**

**Examples:** CNC machines running Mach3/Mach4, Windows-based industrial PCs, laser cutters with Windows controllers.

**Can run SDK directly:** ✅ Yes — Node.js runs on Windows.

### PowerShell Installation

```powershell
# Install Node.js from https://nodejs.org, then:
npm install -g @spraay/rtp-sdk
rtp-device init
rtp-device start
```

### Docker Desktop

```powershell
docker run -d `
  -e API_KEY=your_key `
  -e WALLET=0xYourWallet `
  -e CAPABILITIES=print,cut `
  -e PRICE=0.10 `
  spraay/rtp-device:latest
```

---

## Deployment Methods Summary

| Method | Best For | Command |
|---|---|---|
| **npm global** | Any machine with Node.js | `npm install -g @spraay/rtp-sdk` |
| **Docker** | Any machine with Docker | `docker run spraay/rtp-device` |
| **Python pip** | Pi / microcontroller-adjacent | `pip install spraay-rtp` *(coming soon)* |
| **SD Card** | Raspberry Pi (headless deploy) | Pre-flash config on boot partition |
| **USB Dongle** | Non-technical operators | Plug-and-play hardware *(future)* |

---

## CLI Quick Start

The fastest path for any supported device:

```bash
# Install
npm install -g @spraay/rtp-sdk

# Interactive setup — answers a few questions, generates config
rtp-device init

# Go live — registers with gateway and starts listening
rtp-device start
```

The `init` wizard walks through:
- Device name and description
- Capabilities (multi-select from standard verbs)
- Price per task (USDC)
- Payment wallet address
- Spraay API key
- Connection type and endpoint

Outputs `rtp.config.json` — no manual JSON editing required.

---

## Need Help?

- **SDK Repo:** [github.com/plagtech/rtp-sdk](https://github.com/plagtech/rtp-sdk)
- **Spec:** [github.com/plagtech/rtp-spec](https://github.com/plagtech/rtp-spec)
- **Gateway:** [gateway.spraay.app](https://gateway.spraay.app)
- **Twitter:** [@Spraay_app](https://twitter.com/Spraay_app)
- **Farcaster:** [@Spraay_app](https://warpcast.com/spraay_app)
