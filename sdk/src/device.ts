/**
 * RTP Device SDK
 *
 * Allows robot/device operators to register their hardware on the RTP
 * network and receive paid tasks from AI agents via Spraay Gateway.
 *
 * @example
 * ```typescript
 * import { RTPDevice } from '@spraay/rtp-sdk'
 *
 * const robot = new RTPDevice({
 *   name: 'WarehouseBot-01',
 *   capabilities: ['pick', 'place'],
 *   pricePerTask: '0.05',
 *   paymentAddress: '0xYourWallet',
 *   apiKey: 'your-key',
 *   connection: { type: 'webhook', webhookUrl: 'https://yourserver.com/rtp/task' }
 * })
 *
 * robot.onTask('pick', async (params, task) => {
 *   // execute task...
 *   await task.complete({ output: 'Done' })
 * })
 *
 * await robot.register()
 * robot.listen(3100)
 * ```
 *
 * @module @spraay/rtp-sdk
 */

import axios from 'axios'
import crypto from 'crypto'
import express, { Request, Response } from 'express'
import {
  RTPDeviceConfig,
  TaskEnvelope,
  TaskResult,
  Capability
} from './types'

// --------------------------------------------------
// Task Context (passed to handlers)
// --------------------------------------------------

/** Context object passed to task handlers with control methods. */
export interface TaskContext {
  /** Unique task identifier */
  taskId: string
  /** Report successful completion with result data */
  complete: (result: TaskResult) => Promise<void>
  /** Report task failure with error message */
  fail: (error: string) => Promise<void>
  /** Update status to IN_PROGRESS (call after acknowledgment) */
  progress: () => Promise<void>
}

/** Handler function for a specific capability. */
export type TaskHandler = (
  params: Record<string, any>,
  task: TaskContext
) => Promise<void>

// --------------------------------------------------
// RTPDevice Class
// --------------------------------------------------

export class RTPDevice {
  private config: Required<
    Pick<RTPDeviceConfig, 'currency' | 'chain' | 'gatewayUrl'>
  > &
    RTPDeviceConfig
  private robotId: string | null = null
  private handlers: Map<string, TaskHandler> = new Map()
  private gateway: string

  constructor(config: RTPDeviceConfig) {
    this.config = {
      currency: 'USDC',
      chain: 'base',
      gatewayUrl: 'https://gateway.spraay.app',
      ...config
    }
    this.gateway = this.config.gatewayUrl
  }

  /** Get the registered robot ID (null if not yet registered). */
  get id(): string | null {
    return this.robotId
  }

  /**
   * Register a handler for a specific capability verb.
   * When the gateway dispatches a task matching this verb,
   * the handler is invoked with the task parameters and a control context.
   *
   * @param capability - The capability verb to handle (e.g., 'pick', 'scan')
   * @param handler - Async function that executes the task
   * @returns this (for chaining)
   */
  onTask(capability: Capability, handler: TaskHandler): this {
    if (!this.config.capabilities.includes(capability)) {
      console.warn(
        `⚠️  Handler registered for "${capability}" but it's not in declared capabilities. ` +
          `Add it to your capabilities list to make it discoverable.`
      )
    }
    this.handlers.set(capability, handler)
    return this
  }

  /**
   * Register this device with the Spraay Gateway.
   * Creates the robot profile and x402 endpoint.
   *
   * @returns Robot ID and x402 endpoint URL
   * @throws If registration fails (invalid API key, network error, etc.)
   */
  async register(): Promise<{ robotId: string; endpoint: string }> {
    const response = await axios.post(
      `${this.gateway}/robots/register`,
      {
        name: this.config.name,
        description: this.config.description,
        capabilities: this.config.capabilities,
        price_per_task: this.config.pricePerTask,
        currency: this.config.currency,
        chain: this.config.chain,
        payment_address: this.config.paymentAddress,
        connection: this.config.connection,
        tags: this.config.tags,
        metadata: this.config.metadata
      },
      {
        headers: { 'X-API-Key': this.config.apiKey }
      }
    )

    this.robotId = response.data.robot_id

    console.log(`✅ RTP Device registered: ${this.robotId}`)
    console.log(`📡 x402 endpoint: ${response.data.x402_endpoint}`)
    console.log(
      `🔗 RTP URI: rtp://${new URL(this.gateway).host}/${this.robotId}`
    )

    return {
      robotId: this.robotId!,
      endpoint: response.data.x402_endpoint
    }
  }

  /**
   * Update device registration (pricing, capabilities, etc.)
   *
   * @param updates - Fields to update
   */
  async update(
    updates: Partial<
      Pick<
        RTPDeviceConfig,
        'name' | 'description' | 'capabilities' | 'pricePerTask' | 'tags'
      >
    >
  ): Promise<void> {
    if (!this.robotId) throw new Error('Device not registered. Call register() first.')

    await axios.patch(
      `${this.gateway}/robots/${this.robotId}`,
      {
        ...(updates.name && { name: updates.name }),
        ...(updates.description && { description: updates.description }),
        ...(updates.capabilities && { capabilities: updates.capabilities }),
        ...(updates.pricePerTask && { price_per_task: updates.pricePerTask }),
        ...(updates.tags && { tags: updates.tags })
      },
      {
        headers: { 'X-API-Key': this.config.apiKey }
      }
    )

    console.log(`✅ Device ${this.robotId} updated`)
  }

  /**
   * Remove this device from the RTP network.
   */
  async deregister(): Promise<void> {
    if (!this.robotId) return

    await axios.delete(`${this.gateway}/robots/${this.robotId}`, {
      headers: { 'X-API-Key': this.config.apiKey }
    })

    console.log(`🗑️  Device ${this.robotId} deregistered`)
    this.robotId = null
  }

  /**
   * Start a local HTTP server to receive task envelopes via webhook.
   * Only needed for webhook connection type.
   *
   * @param port - Port to listen on (default: 3100)
   */
  listen(port: number = 3100): void {
    if (this.config.connection.type !== 'webhook') {
      console.warn(
        `⚠️  listen() is designed for webhook connections. ` +
          `Your connection type is "${this.config.connection.type}".`
      )
    }

    const app = express()
    app.use(express.json())

    // Health check
    app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        robot_id: this.robotId,
        capabilities: this.config.capabilities,
        handlers: Array.from(this.handlers.keys())
      })
    })

    // Task receiver
    app.post('/rtp/task', async (req: Request, res: Response) => {
      const envelope: TaskEnvelope = req.body

      // Verify HMAC signature if secret configured
      if (this.config.connection.secret) {
        const sig = req.headers['x-rtp-signature'] as string
        const expected =
          'sha256=' +
          crypto
            .createHmac('sha256', this.config.connection.secret)
            .update(JSON.stringify(envelope))
            .digest('hex')

        if (sig !== expected) {
          console.error(`❌ Invalid signature for task ${envelope.task_id}`)
          return res.status(401).json({ error: 'Invalid signature' })
        }
      }

      console.log(
        `📥 Task received: ${envelope.task_id} — ${envelope.task} ` +
          `(${envelope.payment.amount} ${envelope.payment.currency})`
      )

      // Acknowledge immediately (gateway expects fast response)
      res.json({ status: 'IN_PROGRESS', task_id: envelope.task_id })

      // Execute the task asynchronously
      await this._executeTask(envelope)
    })

    app.listen(port, () => {
      console.log(`🤖 RTP Device listening on port ${port}`)
      console.log(`   Health: http://localhost:${port}/health`)
      console.log(`   Tasks:  http://localhost:${port}/rtp/task`)
    })
  }

  // --------------------------------------------------
  // Internal Methods
  // --------------------------------------------------

  private async _executeTask(envelope: TaskEnvelope): Promise<void> {
    const handler = this.handlers.get(envelope.task)

    if (!handler) {
      console.error(`❌ No handler for capability: ${envelope.task}`)
      await this._reportResult(
        envelope.task_id,
        {
          success: false,
          error: `No handler registered for capability: ${envelope.task}`
        },
        'FAILED'
      )
      return
    }

    const startTime = Date.now()
    let resolved = false

    const context: TaskContext = {
      taskId: envelope.task_id,

      complete: async (result: TaskResult) => {
        if (resolved) return
        resolved = true
        result.duration_seconds = Math.round((Date.now() - startTime) / 1000)
        result.success = true
        await this._reportResult(envelope.task_id, result, 'COMPLETED')
        console.log(
          `✅ Task ${envelope.task_id} completed in ${result.duration_seconds}s`
        )
      },

      fail: async (error: string) => {
        if (resolved) return
        resolved = true
        await this._reportResult(
          envelope.task_id,
          {
            success: false,
            error,
            duration_seconds: Math.round((Date.now() - startTime) / 1000)
          },
          'FAILED'
        )
        console.error(`❌ Task ${envelope.task_id} failed: ${error}`)
      },

      progress: async () => {
        try {
          await axios.patch(
            `${this.gateway}/robots/${this.robotId}/tasks/${envelope.task_id}`,
            { status: 'IN_PROGRESS' },
            { headers: { 'X-API-Key': this.config.apiKey } }
          )
        } catch {
          // Non-critical — don't fail the task over a status update
        }
      }
    }

    try {
      // Set timeout watchdog
      const timeout = setTimeout(async () => {
        if (resolved) return
        resolved = true
        await this._reportResult(
          envelope.task_id,
          { success: false, error: 'Task execution timed out' },
          'TIMEOUT'
        )
        console.error(
          `⏰ Task ${envelope.task_id} timed out after ${envelope.timeout_seconds}s`
        )
      }, envelope.timeout_seconds * 1000)

      await handler(envelope.parameters, context)
      clearTimeout(timeout)
    } catch (err: any) {
      if (!resolved) {
        await context.fail(err.message || 'Unexpected error during task execution')
      }
    }
  }

  private async _reportResult(
    taskId: string,
    result: TaskResult,
    status: string
  ): Promise<void> {
    if (!this.robotId) {
      console.error('Cannot report result — device not registered')
      return
    }

    try {
      await axios.post(
        `${this.gateway}/robots/${this.robotId}/complete`,
        {
          rtp_version: '1.0',
          task_id: taskId,
          robot_id: this.robotId,
          status,
          result,
          completed_at: new Date().toISOString()
        },
        {
          headers: { 'X-API-Key': this.config.apiKey }
        }
      )
    } catch (err: any) {
      console.error(
        `Failed to report result for task ${taskId}: ${err.message}`
      )
    }
  }
}
