/**
 * RTP Example: AI Agent Hiring Robots
 *
 * This example shows how an AI agent discovers available robots
 * on the RTP network, hires one for a task, and handles the result.
 *
 * The agent pays in USDC via x402 — payment, escrow, and polling
 * are all handled automatically by the SDK.
 */

import { RTPClient } from '@spraay/rtp-sdk'

// --------------------------------------------------
// 1. Initialize the agent client
// --------------------------------------------------

// Your x402-compatible wallet (Coinbase CDP, viem, ethers, etc.)
const wallet = {
  // This is a placeholder — replace with your actual wallet/signer
  // Compatible with: Coinbase x402 client, viem wallets, ethers signers
  signPayment: async (paymentDetails: any) => {
    // Sign the x402 payment payload
    // In production, this calls your wallet's signing method
    console.log(`💰 Signing payment: ${paymentDetails.amount} ${paymentDetails.currency}`)
    return 'signed_x402_payment_token'
  }
}

const client = new RTPClient({
  wallet,
  gatewayUrl: 'https://gateway.spraay.app',
  pollInterval: 2000  // Check task status every 2 seconds
})

// --------------------------------------------------
// 2. Discover available robots
// --------------------------------------------------

async function discoverRobots() {
  console.log('🔍 Discovering robots...\n')

  // Find robots that can pick items, priced under 0.10 USDC
  const robots = await client.discover({
    capability: 'pick',
    chain: 'base',
    maxPrice: '0.10'
  })

  console.log(`Found ${robots.length} robot(s):\n`)
  for (const robot of robots) {
    console.log(`  🤖 ${robot.name}`)
    console.log(`     ID:           ${robot.robot_id}`)
    console.log(`     Capabilities: ${robot.capabilities.join(', ')}`)
    console.log(`     Price:        ${robot.price_per_task} ${robot.currency}`)
    console.log(`     Chain:        ${robot.chain}`)
    console.log(`     Status:       ${robot.status}`)
    console.log()
  }

  return robots
}

// --------------------------------------------------
// 3. Hire a robot for a task
// --------------------------------------------------

async function hireRobot() {
  const robots = await discoverRobots()

  if (robots.length === 0) {
    console.log('No robots available. Try again later.')
    return
  }

  // Pick the first available robot
  const target = robots[0]
  console.log(`\n📋 Hiring ${target.name} for a pick task...\n`)

  try {
    const result = await client.hire(target, {
      task: 'pick',
      parameters: {
        item: 'SKU-00421',
        from_location: 'bin_A3',
        to_location: 'conveyor_1'
      },
      callbackUrl: 'https://my-agent.example.com/task-complete',
      timeoutSeconds: 60
    })

    console.log(`\n✅ Task complete!`)
    console.log(`   Status:   ${result.status}`)
    console.log(`   Output:   ${result.result?.output}`)
    console.log(`   Duration: ${result.result?.duration_seconds}s`)

    if (result.result?.data) {
      console.log(`   Data:     ${JSON.stringify(result.result.data)}`)
    }
  } catch (err: any) {
    console.error(`❌ Task failed: ${err.message}`)
  }
}

// --------------------------------------------------
// 4. Advanced: Multi-robot task sequence
// --------------------------------------------------

async function multiRobotWorkflow() {
  console.log('🔄 Starting multi-robot workflow...\n')

  // Step 1: Find a scanner robot
  const scanners = await client.discover({ capability: 'scan' })
  if (scanners.length === 0) throw new Error('No scanner available')

  // Step 2: Scan the item first
  console.log('Step 1: Scanning item...')
  const scanResult = await client.hire(scanners[0], {
    task: 'scan',
    parameters: {
      target: 'incoming_package_001',
      sensor_type: 'barcode'
    }
  })

  const barcode = scanResult.result?.data?.barcode
  console.log(`  Scanned: ${barcode}\n`)

  // Step 3: Find a pick-and-place robot
  const pickers = await client.discover({ capability: 'pick' })
  if (pickers.length === 0) throw new Error('No picker available')

  // Step 4: Pick the scanned item
  console.log('Step 2: Picking item...')
  const pickResult = await client.hire(pickers[0], {
    task: 'pick',
    parameters: {
      item: barcode,
      from_location: 'intake_belt'
    }
  })
  console.log(`  ${pickResult.result?.output}\n`)

  // Step 5: Place it at the sorted destination
  console.log('Step 3: Placing item...')
  const placeResult = await client.hire(pickers[0], {
    task: 'place',
    parameters: {
      item: barcode,
      to_location: 'shelf_B7'
    }
  })
  console.log(`  ${placeResult.result?.output}\n`)

  console.log('✅ Workflow complete: scanned → picked → placed')
}

// --------------------------------------------------
// Run
// --------------------------------------------------

async function main() {
  // Simple single-task example
  await hireRobot()

  // Or run the multi-robot workflow:
  // await multiRobotWorkflow()
}

main().catch(console.error)
