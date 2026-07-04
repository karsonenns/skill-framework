---
name: customer-escalation
description: Run an escalated customer issue end to end across support, billing, and engineering. Use when a customer issue spans multiple teams or an account is at risk.
version: 0.1.0
uses:
  - ticket-triage
  - invoice-dispute
  - incident-response
---

# Customer Escalation

Cross-domain workflow. This orchestrator composes domain skills by name — it
does not duplicate their instructions.

## Steps

1. Triage the inbound issue with `ticket-triage` to establish severity and
   ownership.
2. If the issue is a contested charge or refund, hand off to `invoice-dispute`.
3. If the issue is a production defect at P0/P1, hand off to
   `incident-response`.
4. Track every hand-off in the escalation thread; the escalation is resolved
   only when the owning skill's procedure completes and the customer confirms.

## Boundaries

- The orchestrator routes and tracks — resolution steps live in the domain
  skills listed under `uses:`.
