/**
 * RTP — Robot Task Protocol
 * Shared type definitions for device operators and agent clients.
 *
 * @module @spraay/rtp-sdk
 */

// --------------------------------------------------
// Connection Types
// --------------------------------------------------

export type ConnectionType = 'webhook' | 'xmtp' | 'wifi' | 'websocket'

// --------------------------------------------------
// Task Lifecycle
// --------------------------------------------------

export type TaskStatus =
  | 'PENDING'
  | 'DISPATCHED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'TIMEOUT'

// --------------------------------------------------
// Capabilities
// --------------------------------------------------

/** Standard RTP capability verbs. Custom capabilities use reverse-domain notation. */
export type Capability =
  | 'move'
  | 'pick'
  | 'place'
  | 'scan'
  | 'sort'
  | 'inspect'
  | 'deliver'
  | 'patrol'
  | 'charge'
  | 'capture'
  | 'transmit'
  | 'weld'
  | 'assemble'
  | 'dispense'
  | 'print'
  | (string & {}) // allow custom capabilities

// --------------------------------------------------
// Device Configuration
// --------------------------------------------------

export interface ConnectionConfig {
  /** Connection transport type */
  type: ConnectionType
  /** Operator's webhook URL (for type: 'webhook') */
  webhookUrl?: string
  /** HMAC signing secret for webhook verification */
  secret?: string
  /** Robot's XMTP wallet address (for type: 'xmtp') */
  xmtpAddress?: string
  /** WiFi relay URL (for type: 'wifi') */
  relayUrl?: string
  /** Local network address (for type: 'wifi') */
  localAddress?: string
  /** WebSocket endpoint URL (for type: 'websocket') */
  wsUrl?: string
}

export interface RTPDeviceConfig {
  /** Human-readable device name */
  name: string
  /** Device description */
  description?: string
  /** List of supported capability verbs */
  capabilities: Capability[]
  /** Price per task in specified currency (decimal string, e.g. "0.05") */
  pricePerTask: string
  /** Payment currency (default: "USDC") */
  currency?: string
  /** Blockchain network for payment (default: "base") */
  chain?: string
  /** Operator's wallet address for receiving payments */
  paymentAddress: string
  /** Spraay API key for authentication */
  apiKey: string
  /** Gateway base URL (default: "https://gateway.spraay.app") */
  gatewayUrl?: string
  /** Connection configuration */
  connection: ConnectionConfig
  /** Searchable tags */
  tags?: string[]
  /** Arbitrary metadata (manufacturer info, firmware version, etc.) */
  metadata?: Record<string, any>
}

// --------------------------------------------------
// Task Envelope (sent from gateway to robot)
// --------------------------------------------------

export interface TaskEnvelope {
  /** RTP protocol version */
  rtp_version: string
  /** Unique task identifier */
  task_id: string
  /** Target robot identifier */
  robot_id: string
  /** Capability verb */
  task: Capability
  /** Task-specific parameters */
  parameters: Record<string, any>
  /** x402 payment metadata */
  payment: {
    /** Signed x402 payment payload */
    x402_token: string
    /** Payment amount (decimal string) */
    amount: string
    /** Payment asset symbol */
    currency: string
    /** Blockchain network */
    chain: string
  }
  /** Agent's callback URL for receiving results */
  callback_url?: string
  /** Maximum execution time in seconds */
  timeout_seconds: number
  /** ISO 8601 timestamp of task creation */
  issued_at: string
}

// --------------------------------------------------
// Task Result (from robot to gateway)
// --------------------------------------------------

export interface TaskResult {
  /** Whether the task succeeded */
  success: boolean
  /** Human-readable output summary */
  output?: string
  /** Structured result data */
  data?: Record<string, any>
  /** Execution duration in seconds */
  duration_seconds?: number
  /** Error description (on failure) */
  error?: string
}

// --------------------------------------------------
// Result Envelope (sent from robot to gateway)
// --------------------------------------------------

export interface ResultEnvelope {
  /** RTP protocol version */
  rtp_version: string
  /** Task identifier being reported on */
  task_id: string
  /** Reporting robot identifier */
  robot_id: string
  /** Terminal status */
  status: TaskStatus
  /** Task result */
  result: TaskResult
  /** ISO 8601 completion timestamp */
  completed_at: string
}

// --------------------------------------------------
// Agent Client Types
// --------------------------------------------------

export interface RTPClientConfig {
  /** Gateway base URL (default: "https://gateway.spraay.app") */
  gatewayUrl?: string
  /** x402-compatible wallet/signer */
  wallet: {
    signPayment: (paymentDetails: any) => Promise<string>
  }
  /** Polling interval in milliseconds (default: 2000) */
  pollInterval?: number
}

export interface DiscoverOptions {
  /** Filter by capability verb */
  capability?: Capability
  /** Filter by payment chain */
  chain?: string
  /** Maximum price per task (decimal string) */
  maxPrice?: string
  /** Filter by tags */
  tags?: string[]
}

export interface HireOptions {
  /** Capability verb to execute */
  task: Capability
  /** Task-specific parameters */
  parameters?: Record<string, any>
  /** Agent's callback URL */
  callbackUrl?: string
  /** Timeout in seconds (default: 60) */
  timeoutSeconds?: number
}

// --------------------------------------------------
// Robot Profile (returned from discovery)
// --------------------------------------------------

export interface RobotProfile {
  /** Unique robot identifier */
  robot_id: string
  /** RTP URI */
  rtp_uri: string
  /** Human-readable name */
  name: string
  /** Description */
  description?: string
  /** Supported capabilities */
  capabilities: Capability[]
  /** Price per task */
  price_per_task: string
  /** Payment currency */
  currency: string
  /** Payment chain */
  chain: string
  /** Current availability */
  status: 'online' | 'offline' | 'busy'
  /** x402 task endpoint */
  x402_endpoint: string
  /** Tags */
  tags?: string[]
  /** Metadata */
  metadata?: Record<string, any>
}
