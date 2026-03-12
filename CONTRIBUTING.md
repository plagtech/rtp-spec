# Contributing to RTP

Thank you for your interest in contributing to the Robot Task Protocol! RTP is an open standard and we welcome contributions from the community.

## Ways to Contribute

### Specification Feedback
- Open an issue to propose changes to the RTP 1.0 spec
- Suggest new capability verbs with use cases
- Report ambiguities or inconsistencies in the spec

### New Connection Types
- Propose specifications for additional connection types beyond webhook, XMTP, WiFi, and WebSocket
- Examples: Bluetooth, LoRa, MQTT, gRPC

### Reference Implementations
- Build an RTP gateway in a different language (Python, Go, Rust)
- Create device-side SDK implementations for other platforms
- Port the TypeScript SDK to other languages

### Hardware Compatibility
- Test RTP with your robot/device hardware
- Submit compatibility reports as issues or PRs to the Device Compatibility Guide
- Share code examples for specific robot brands

### Documentation
- Improve existing docs
- Add tutorials and guides
- Translate documentation

## Process

1. **Open an issue first** — describe what you want to change and why
2. **Fork the repo** and create a feature branch
3. **Submit a PR** referencing the issue
4. **Review** — maintainers will review and provide feedback

## Spec Change Process

Changes to the RTP specification (anything in `spec/`) require:
1. An RFC-style issue describing the proposed change
2. Discussion period (minimum 7 days)
3. At least one maintainer approval
4. Backward compatibility analysis

## Code Style

- TypeScript for SDK contributions
- Standard Prettier formatting
- JSDoc comments on public APIs

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

*Questions? Open an issue or reach out to [@Spraay_app](https://twitter.com/Spraay_app).*
