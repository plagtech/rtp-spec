/**
 * RTP Example: Warehouse Pick-and-Place Robot
 *
 * This example shows how a warehouse robot operator connects
 * their robot to the RTP network via the Spraay SDK.
 *
 * The robot registers its capabilities (pick, place, scan, sort),
 * sets pricing, and listens for incoming paid tasks from AI agents.
 */

import { RTPDevice } from '@spraay/rtp-sdk'

// --------------------------------------------------
// 1. Configure the device
// --------------------------------------------------

const robot = new RTPDevice({
  name: 'WarehouseBot-01',
  description: '6-axis pick-and-place robot in Warehouse Zone A',
  capabilities: ['pick', 'place', 'scan', 'sort'],
  pricePerTask: '0.05',       // 0.05 USDC per task
  currency: 'USDC',
  chain: 'base',
  paymentAddress: '0xYourOperatorWalletAddress',
  apiKey: process.env.SPRAAY_API_KEY!,
  connection: {
    type: 'webhook',
    webhookUrl: 'https://your-server.com/rtp/task',
    secret: process.env.RTP_WEBHOOK_SECRET!
  },
  tags: ['warehouse', 'industrial', 'zone-a'],
  metadata: {
    manufacturer: 'Universal Robots',
    model: 'UR5e',
    firmware: '5.14.0'
  }
})

// --------------------------------------------------
// 2. Define task handlers for each capability
// --------------------------------------------------

/**
 * PICK — Retrieve an item from a location.
 * Parameters: { item: string, from_location: string }
 */
robot.onTask('pick', async (params, task) => {
  console.log(`📦 Picking ${params.item} from ${params.from_location}`)

  // Report that we've started
  await task.progress()

  // --- Your robot-specific code here ---
  // await robotArm.moveTo(params.from_location)
  // await robotArm.grip()
  // await robotArm.lift()

  // Simulate execution for demo
  await sleep(3000)

  await task.complete({
    output: `Picked ${params.item} from ${params.from_location}`,
    data: {
      weight_grams: 450,
      grip_force_n: 12.5
    }
  })
})

/**
 * PLACE — Set an item down at a location.
 * Parameters: { item: string, to_location: string }
 */
robot.onTask('place', async (params, task) => {
  console.log(`📍 Placing ${params.item} at ${params.to_location}`)
  await task.progress()

  // --- Your robot-specific code here ---
  // await robotArm.moveTo(params.to_location)
  // await robotArm.release()

  await sleep(2000)

  await task.complete({
    output: `Placed ${params.item} at ${params.to_location}`
  })
})

/**
 * SCAN — Read a barcode or capture sensor data.
 * Parameters: { target: string, sensor_type: string }
 */
robot.onTask('scan', async (params, task) => {
  console.log(`🔍 Scanning ${params.target} with ${params.sensor_type}`)
  await task.progress()

  // --- Your scanner code here ---
  // const result = await scanner.read(params.target)

  const mockBarcode = 'SKU-' + Math.random().toString(36).substr(2, 8).toUpperCase()

  await task.complete({
    output: `Scanned: ${mockBarcode}`,
    data: {
      barcode: mockBarcode,
      sensor_type: params.sensor_type || 'barcode',
      confidence: 0.99
    }
  })
})

/**
 * SORT — Categorize and route items.
 * Parameters: { items: string[], criteria: string }
 */
robot.onTask('sort', async (params, task) => {
  console.log(`🔀 Sorting ${params.items?.length || 0} items by ${params.criteria}`)
  await task.progress()

  // --- Your sorting logic here ---
  await sleep(5000)

  await task.complete({
    output: `Sorted ${params.items?.length || 0} items by ${params.criteria}`,
    data: {
      sorted_count: params.items?.length || 0,
      bins_used: ['A', 'B', 'C']
    }
  })
})

// --------------------------------------------------
// 3. Register and start listening
// --------------------------------------------------

async function main() {
  try {
    const { robotId, endpoint } = await robot.register()
    console.log(`\n🤖 Robot registered!`)
    console.log(`   ID:       ${robotId}`)
    console.log(`   Endpoint: ${endpoint}`)
    console.log(`   Price:    0.05 USDC per task`)
    console.log(`   Chain:    Base`)
    console.log(`\nListening for tasks...\n`)

    // Start the webhook listener
    robot.listen(3100)
  } catch (err) {
    console.error('Registration failed:', err)
    process.exit(1)
  }
}

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

main()
