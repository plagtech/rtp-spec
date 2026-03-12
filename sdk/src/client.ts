/**
 * RTP Agent Client
 *
 * Allows AI agents to discover robots on the RTP network,
 * hire them for tasks, and handle results — all with automatic
 * x402 payment handling.
 *
 * @example
 * ```typescript
 * import { RTPClient } from '@spraay/rtp-sdk'
 *
 * const client = new RTPClient({ wallet: myX402Wallet })
 * const robots = await client.discover({ capability: 'pick' })
 * const result = await client.hire(robots[0], {
 *   task: 'pick',
 *   parameters: { item: 'SKU-421' }
 * })
 * ```
 *
 * @module @spraay/rtp-sdk
 */

import axios from 'axios'
import {
  RTPClientConfig,
  DiscoverOptions,
  HireOptions,
  RobotProfile,
  TaskStatus
} from './types'

// --------------------------------------------------
// RTPClient Class
// --------------------------------------------------

export class RTPClient {
  private config: Required<Pick<RTPClientConfig, 'gatewayUrl' | 'pollInterval'>> &
    RTPClientConfig
  private gateway: string

  constructor(config: RTPClientConfig) {
    this.config = {
      gatewayUrl: 'https://gateway.spraay.app',
      pollInterval: 2000,
      ...config
    }
    this.gateway = this.config.gatewayUrl
  }

  /**
   * Discover available robots on the RTP network.
   *
   * @param options - Filter by capability, chain, price, or tags
   * @returns Array of robot profiles matching the filters
   */
  async discover(options: DiscoverOptions = {}): Promise<RobotProfile[]> {
    const params: Record<string, string> = {}
    if (options.capability) params.capability = options.capability
    if (options.chain) params.chain = options.chain
    if (options.maxPrice) params.max_price = options.maxPrice
    if (options.tags?.length) params.tag = options.tags.join(',')

    const response = await axios.get(`${this.gateway}/robots`, { params })
    return response.data.robots || []
  }

  /**
   * Get full profile for a specific robot.
   *
   * @param robotId - The robot's unique identifier
   * @returns Full robot profile
   */
  async getRobot(robotId: string): Promise<RobotProfile> {
    const response = await axios.get(`${this.gateway}/robots/${robotId}`)
    return response.data
  }

  /**
   * Hire a robot to execute a task.
   *
   * Handles the full x402 payment flow automatically:
   * 1. Sends task request → receives 402 Payment Required
   * 2. Signs payment via wallet → re-submits with X-PAYMENT header
   * 3. Polls for completion → returns final result
   *
   * @param robot - Robot profile (from discover()) or object with robot_id
   * @param options - Task to execute with parameters
   * @returns Final task result including status and output
   * @throws If payment fails, robot is unavailable, or task times out
   */
  async hire(
    robot: RobotProfile | { robot_id: string; x402_endpoint?: string },
    options: HireOptions
  ): Promise<any> {
    const endpoint =
      robot.x402_endpoint ||
      `${this.gateway}/robots/${robot.robot_id}/task`

    const payload = {
      task: options.task,
      parameters: options.parameters || {},
      callback_url: options.callbackUrl,
      timeout_seconds: options.timeoutSeconds || 60
    }

    let response

    try {
      // First attempt — expect 402 Payment Required
      response = await axios.post(endpoint, payload)
    } catch (err: any) {
      if (err.response?.status !== 402) {
        throw new Error(
          `Task request failed: ${err.response?.status} — ${err.response?.data?.error || err.message}`
        )
      }

      // Handle x402 payment
      const paymentDetails = err.response.data

      let paymentToken: string
      try {
        paymentToken = await this.config.wallet.signPayment(paymentDetails)
      } catch (signErr: any) {
        throw new Error(`Payment signing failed: ${signErr.message}`)
      }

      // Retry with payment header
      response = await axios.post(endpoint, payload, {
        headers: { 'X-PAYMENT': paymentToken }
      })
    }

    const { task_id, robot_id } = response.data
    const robotId = robot_id || robot.robot_id

    // Poll for completion
    return await this._poll(robotId, task_id, options.timeoutSeconds || 60)
  }

  /**
   * Check the status of an existing task.
   *
   * @param robotId - Robot identifier
   * @param taskId - Task identifier
   * @returns Current task status and result (if complete)
   */
  async getTaskStatus(robotId: string, taskId: string): Promise<any> {
    const response = await axios.get(
      `${this.gateway}/robots/${robotId}/tasks/${taskId}`
    )
    return response.data
  }

  // --------------------------------------------------
  // Internal Methods
  // --------------------------------------------------

  /**
   * Poll task status until terminal state or timeout.
   */
  private async _poll(
    robotId: string,
    taskId: string,
    timeout: number
  ): Promise<any> {
    const deadline = Date.now() + timeout * 1000
    const terminalStates: TaskStatus[] = ['COMPLETED', 'FAILED', 'TIMEOUT']

    while (Date.now() < deadline) {
      await this._sleep(this.config.pollInterval)

      try {
        const { data } = await axios.get(
          `${this.gateway}/robots/${robotId}/tasks/${taskId}`
        )

        if (terminalStates.includes(data.status)) {
          return data
        }
      } catch (err: any) {
        // Transient error — keep polling
        if (err.response?.status >= 500) continue
        throw err
      }
    }

    throw new Error(
      `Task ${taskId} polling timed out after ${timeout}s. ` +
        `The task may still complete — check status manually.`
    )
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
