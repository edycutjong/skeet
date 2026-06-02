# Security Policy

## Supported Versions

We actively support and patch the following versions of Skeet:

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

We take the security of our trading agent, safe connections, and private key storage seriously. If you find any security vulnerability in this project, please report it responsibly.

**Do not open a public GitHub issue for security bugs.**

Instead, please send an email to:
**security@creator.bid** (or contact the hackathon triage team directly).

### What to Include
Please provide:
1. A detailed description of the vulnerability.
2. Steps to reproduce or a proof of concept (PoC).
3. The potential impact of the exploit.

### Response Time
We will acknowledge receipt of your report within 24 hours and aim to provide a detailed response and mitigation plan within 72 hours.

## Private Key & Credential Safety
Skeet is designed to run locally or in air-gapped environments. 
- **Do not** commit your `.env` file or hardcode your private key (`PK`), JWT tokens, or `BID_ACCESS_CODE` in any files.
- The `tradingSafe` and `treasurySafe` use cryptographic role enforcement (Safe Roles modifier) to limit transaction execution to valid roles.
- Ensure that the EOA PK used by the daemon has the minimum role permissions necessary to execute `tradeViaFactory` and nothing else.
