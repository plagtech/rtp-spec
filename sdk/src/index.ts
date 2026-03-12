/**
 * @spraay/rtp-sdk
 *
 * Robot Task Protocol SDK — connect any robot to the x402 payment network.
 *
 * Device side: Use RTPDevice to register robots and receive paid tasks.
 * Agent side:  Use RTPClient to discover robots and hire them for tasks.
 *
 * @example
 * ```typescript
 * // Device
 * import { RTPDevice } from '@spraay/rtp-sdk'
 *
 * // Agent
 * import { RTPClient } from '@spraay/rtp-sdk'
 *
 * // Types
 * import { TaskEnvelope, Capability, TaskStatus } from '@spraay/rtp-sdk'
 * ```
 */

export { RTPDevice } from './device'
export type { TaskContext, TaskHandler } from './device'
export { RTPClient } from './client'
export * from './types'
