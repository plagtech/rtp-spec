---
xrc: TBD
title: Spraay Payment Content Types
description: Content types for payment requests, receipts, and invoices over XMTP
author: plagtech (@plagtech)
discussions-to: TBD
status: Draft
type: Standards Track (XRC)
created: 2026-04-01
---

## Abstract

This XRC proposes three new content types for the XMTP messaging protocol that enable structured payment interactions between humans, AI agents, and devices:

- `spraay.app/payment-request:1.0` — Request payment from a conversation participant
- `spraay.app/payment-receipt:1.0` — Confirm that a payment was sent with on-chain proof
- `spraay.app/invoice:1.0` — A detailed invoice with line items, due date, and payment instructions

These content types transform XMTP from a messaging protocol into a messaging-and-payments protocol, enabling use cases like payroll, agent-to-agent commerce, device-to-device micropayments, and peer-to-peer invoicing — all within encrypted conversations.

## Motivation

XMTP already supports `transactionReference` and `walletSendCalls` content types, but these are low-level primitives tied to specific wallet interactions. They lack:

1. **Semantic meaning** — A transaction reference says "here's a tx hash" but not "this was payment for your invoice #1042"
2. **Multi-chain awareness** — No standard way to specify which blockchain a payment should occur on
3. **Request/response pattern** — No way to request payment and then confirm it was received as a matched pair
4. **Invoice structure** — No way to send itemized bills with due dates and payment terms
5. **Agent compatibility** — AI agents need structured, parseable payment messages, not just wallet prompts

The Spraay x402 Gateway already processes payments across 16+ blockchains. These content types formalize how those payments are requested, confirmed, and documented within XMTP conversations — enabling any XMTP-compatible app to render payment interactions natively.

### Use Cases

- **Payroll**: An employer agent sends a batch payment via Spraay, then sends each employee a `payment-receipt` in their XMTP DM
- **Agent commerce**: Agent A sends Agent B a `payment-request` for a service; Agent B pays via Spraay and sends back a `payment-receipt`
- **Device micropayments**: An RTP robot completes a task and sends a `payment-request` to the task issuer
- **Freelance invoicing**: A contractor sends a client an `invoice` via XMTP; the client pays and a `payment-receipt` is automatically generated
- **Subscription billing**: A service sends monthly `payment-request` messages that agents can auto-approve within spending limits

## Specification

The keywords "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

### Content Type 1: Payment Request

#### Content Type ID

```
authorityId: "spraay.app"
typeId: "payment-request"
versionMajor: 1
versionMinor: 0
```

#### Schema

The content value for this type MUST be a JSON object with the following structure:

```typescript
interface PaymentRequest {
  // REQUIRED fields
  requestId: string;         // Unique identifier (UUID v4)
  amount: string;            // Payment amount as decimal string (e.g. "5.00")
  token: string;             // Token symbol (e.g. "USDC", "ETH")
  chain: string;             // Target blockchain (e.g. "base", "ethereum", "solana")
  recipient: string;         // Recipient wallet address on the specified chain

  // OPTIONAL fields
  memo?: string;             // Human-readable description of what the payment is for
  expiresAt?: string;        // ISO 8601 timestamp after which the request is void
  metadata?: {               // Extensible metadata
    invoiceId?: string;      // Reference to an associated invoice
    orderId?: string;        // Reference to an external order
    taskId?: string;         // Reference to an RTP task
    [key: string]: unknown;  // Additional custom fields
  };
}
```

#### Encoding

The content MUST be encoded as UTF-8 JSON bytes.

#### Fallback

The fallback text MUST be a human-readable string in the format:

```
Payment request: {amount} {token} on {chain} — {memo}
```

Example: `Payment request: 5.00 USDC on Base — API usage for March 2026`

#### Behavior

- Receiving clients SHOULD render a payment request card with an "Approve" or "Pay" action
- AI agents receiving a payment request MAY auto-approve if the amount is within their configured spending limits
- A payment request SHOULD be considered expired if `expiresAt` is in the past
- Multiple payment requests MAY exist in a single conversation

---

### Content Type 2: Payment Receipt

#### Content Type ID

```
authorityId: "spraay.app"
typeId: "payment-receipt"
versionMajor: 1
versionMinor: 0
```

#### Schema

```typescript
interface PaymentReceipt {
  // REQUIRED fields
  receiptId: string;         // Unique identifier (UUID v4)
  requestId?: string;        // Reference to the PaymentRequest this fulfills
  amount: string;            // Actual amount paid
  token: string;             // Token symbol
  chain: string;             // Blockchain the payment was sent on
  sender: string;            // Sender wallet address
  recipient: string;         // Recipient wallet address
  txHash: string;            // On-chain transaction hash
  status: "confirmed" | "pending" | "failed";

  // OPTIONAL fields
  blockNumber?: number;      // Block number the tx was included in
  timestamp?: string;        // ISO 8601 timestamp of the transaction
  gasUsed?: string;          // Gas cost as decimal string
  explorerUrl?: string;      // Direct link to block explorer
  metadata?: {
    invoiceId?: string;
    orderId?: string;
    taskId?: string;
    batchId?: string;        // If part of a Spraay batch payment
    [key: string]: unknown;
  };
}
```

#### Encoding

The content MUST be encoded as UTF-8 JSON bytes.

#### Fallback

```
Payment receipt: {amount} {token} on {chain} — tx: {txHash}
```

Example: `Payment receipt: 5.00 USDC on Base — tx: 0xabc123...def`

#### Behavior

- Receiving clients SHOULD render a receipt card with a link to the block explorer
- If `requestId` is present, clients SHOULD visually link the receipt to its corresponding request
- AI agents SHOULD parse receipts to update their internal accounting state
- Clients MAY verify the `txHash` on-chain to confirm the payment independently

---

### Content Type 3: Invoice

#### Content Type ID

```
authorityId: "spraay.app"
typeId: "invoice"
versionMajor: 1
versionMinor: 0
```

#### Schema

```typescript
interface Invoice {
  // REQUIRED fields
  invoiceId: string;         // Unique identifier
  from: string;              // Issuer name or address
  to: string;                // Recipient name or address
  items: InvoiceItem[];      // Line items
  total: string;             // Total amount as decimal string
  token: string;             // Requested payment token
  chain: string;             // Requested payment chain
  payTo: string;             // Wallet address to pay

  // OPTIONAL fields
  issuedAt?: string;         // ISO 8601 timestamp
  dueDate?: string;          // ISO 8601 timestamp
  status?: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  notes?: string;            // Additional terms or notes
  metadata?: {
    recurringInterval?: string; // "monthly", "weekly", etc.
    contractId?: string;
    [key: string]: unknown;
  };
}

interface InvoiceItem {
  description: string;       // What the charge is for
  quantity: number;          // Number of units
  unitPrice: string;         // Price per unit as decimal string
  amount: string;            // Total for this line item (quantity * unitPrice)
}
```

#### Encoding

The content MUST be encoded as UTF-8 JSON bytes.

#### Fallback

```
Invoice {invoiceId}: {total} {token} due {dueDate} — {items.length} item(s)
```

Example: `Invoice INV-2026-042: 150.00 USDC due 2026-04-15 — 3 item(s)`

#### Behavior

- Receiving clients SHOULD render an invoice card showing line items, total, and a "Pay" action
- When paid, the payer SHOULD send a `payment-receipt` referencing the `invoiceId`
- The issuer MAY send an updated invoice with `status: "paid"` after receiving the receipt
- Overdue invoices (past `dueDate` with status not "paid") MAY trigger reminder logic in agents

---

## TypeScript Reference Implementation

### Content Type Definitions

```typescript
import type { ContentTypeId } from '@xmtp/content-type-primitives';

export const ContentTypePaymentRequest: ContentTypeId = {
  authorityId: 'spraay.app',
  typeId: 'payment-request',
  versionMajor: 1,
  versionMinor: 0,
};

export const ContentTypePaymentReceipt: ContentTypeId = {
  authorityId: 'spraay.app',
  typeId: 'payment-receipt',
  versionMajor: 1,
  versionMinor: 0,
};

export const ContentTypeInvoice: ContentTypeId = {
  authorityId: 'spraay.app',
  typeId: 'invoice',
  versionMajor: 1,
  versionMinor: 0,
};
```

### Payment Request Codec

```typescript
import type {
  ContentCodec,
  EncodedContent,
} from '@xmtp/content-type-primitives';

export interface PaymentRequest {
  requestId: string;
  amount: string;
  token: string;
  chain: string;
  recipient: string;
  memo?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export class PaymentRequestCodec implements ContentCodec<PaymentRequest> {
  contentType = ContentTypePaymentRequest;

  encode(content: PaymentRequest): EncodedContent {
    return {
      type: this.contentType,
      parameters: {},
      content: new TextEncoder().encode(JSON.stringify(content)),
    };
  }

  decode(content: EncodedContent): PaymentRequest {
    const json = new TextDecoder().decode(content.content);
    return JSON.parse(json) as PaymentRequest;
  }

  fallback(content: PaymentRequest): string {
    const memo = content.memo ? ` — ${content.memo}` : '';
    return `Payment request: ${content.amount} ${content.token} on ${content.chain}${memo}`;
  }

  shouldPush(): boolean {
    return true;
  }
}
```

### Payment Receipt Codec

```typescript
export interface PaymentReceipt {
  receiptId: string;
  requestId?: string;
  amount: string;
  token: string;
  chain: string;
  sender: string;
  recipient: string;
  txHash: string;
  status: 'confirmed' | 'pending' | 'failed';
  blockNumber?: number;
  timestamp?: string;
  gasUsed?: string;
  explorerUrl?: string;
  metadata?: Record<string, unknown>;
}

export class PaymentReceiptCodec implements ContentCodec<PaymentReceipt> {
  contentType = ContentTypePaymentReceipt;

  encode(content: PaymentReceipt): EncodedContent {
    return {
      type: this.contentType,
      parameters: {},
      content: new TextEncoder().encode(JSON.stringify(content)),
    };
  }

  decode(content: EncodedContent): PaymentReceipt {
    const json = new TextDecoder().decode(content.content);
    return JSON.parse(json) as PaymentReceipt;
  }

  fallback(content: PaymentReceipt): string {
    return `Payment receipt: ${content.amount} ${content.token} on ${content.chain} — tx: ${content.txHash.slice(0, 10)}...`;
  }

  shouldPush(): boolean {
    return true;
  }
}
```

### Invoice Codec

```typescript
export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: string;
  amount: string;
}

export interface Invoice {
  invoiceId: string;
  from: string;
  to: string;
  items: InvoiceItem[];
  total: string;
  token: string;
  chain: string;
  payTo: string;
  issuedAt?: string;
  dueDate?: string;
  status?: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  notes?: string;
  metadata?: Record<string, unknown>;
}

export class InvoiceCodec implements ContentCodec<Invoice> {
  contentType = ContentTypeInvoice;

  encode(content: Invoice): EncodedContent {
    return {
      type: this.contentType,
      parameters: {},
      content: new TextEncoder().encode(JSON.stringify(content)),
    };
  }

  decode(content: EncodedContent): Invoice {
    const json = new TextDecoder().decode(content.content);
    return JSON.parse(json) as Invoice;
  }

  fallback(content: Invoice): string {
    const due = content.dueDate ? ` due ${content.dueDate}` : '';
    return `Invoice ${content.invoiceId}: ${content.total} ${content.token}${due} — ${content.items.length} item(s)`;
  }

  shouldPush(): boolean {
    return true;
  }
}
```

### Usage Example: Agent-to-Agent Payment Flow

```typescript
import { Agent } from '@xmtp/agent-sdk';
import { PaymentRequestCodec, PaymentReceiptCodec } from '@spraay/xmtp-content-types';

// Initialize agent with Spraay codecs
const agent = await Agent.create(signer, {
  codecs: [new PaymentRequestCodec(), new PaymentReceiptCodec()],
});

// Agent A sends a payment request
const request: PaymentRequest = {
  requestId: crypto.randomUUID(),
  amount: '5.00',
  token: 'USDC',
  chain: 'base',
  recipient: '0xAgentA_Address',
  memo: 'Oracle data query — 50 calls',
};

const codec = new PaymentRequestCodec();
const encoded = codec.encode(request);
await conversation.send(encoded.content, { contentType: codec.contentType });

// Agent B receives the request, pays via Spraay gateway, sends receipt
const receipt: PaymentReceipt = {
  receiptId: crypto.randomUUID(),
  requestId: request.requestId,  // Links to the original request
  amount: '5.00',
  token: 'USDC',
  chain: 'base',
  sender: '0xAgentB_Address',
  recipient: '0xAgentA_Address',
  txHash: '0xabc123...the_actual_tx_hash',
  status: 'confirmed',
  explorerUrl: 'https://basescan.org/tx/0xabc123...',
};

const receiptCodec = new PaymentReceiptCodec();
const encodedReceipt = receiptCodec.encode(receipt);
await conversation.send(encodedReceipt.content, { contentType: receiptCodec.contentType });
```

### Usage Example: RTP Device Task Payment

```typescript
// Robot completes task, sends payment request to task issuer
const taskPaymentRequest: PaymentRequest = {
  requestId: crypto.randomUUID(),
  amount: '0.50',
  token: 'USDC',
  chain: 'base',
  recipient: '0xRobot_Wallet',
  memo: 'Task completed: package delivery to Building C',
  metadata: {
    taskId: 'rtp-task-20260401-001',
  },
};
```

## Backward Compatibility

These content types are additive and do not modify any existing XMTP content types or protocol behavior. Apps that do not support these types will display the fallback text, which provides a human-readable summary of the payment interaction.

The `transactionReference` and `walletSendCalls` content types remain available for lower-level wallet interactions. The Spraay payment content types operate at a higher semantic level and MAY reference underlying transaction references via the `txHash` field.

## Security Considerations

### Payment Request Spoofing

A malicious actor could send a `payment-request` impersonating a legitimate service. Clients SHOULD:
- Display the sender's XMTP identity prominently alongside any payment request
- Require user confirmation before executing payments
- Support allowlists for auto-approved payment requesters (for agent use cases)

### Receipt Verification

A `payment-receipt` includes a `txHash` that can be independently verified on-chain. Clients and agents SHOULD NOT trust a receipt without verifying the transaction exists and matches the claimed amount, token, chain, sender, and recipient.

### Amount Manipulation

All amounts are transmitted as strings to avoid floating-point precision issues. Implementations MUST parse amounts using decimal-safe arithmetic (e.g., BigNumber libraries) and MUST NOT use floating-point for financial calculations.

### Replay Protection

Each payment request and receipt has a unique ID (`requestId`, `receiptId`). Agents SHOULD track processed IDs and reject duplicates.

### Spending Limits

AI agents that auto-approve payment requests MUST implement configurable spending limits (per-request, per-conversation, per-time-period) to prevent drain attacks.

## Copyright

Copyright and related rights waived via CC0.
