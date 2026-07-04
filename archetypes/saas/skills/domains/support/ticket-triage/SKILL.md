---
name: ticket-triage
description: Triage inbound support tickets by severity and route them to the right queue. Use when new support tickets arrive or the triage queue needs processing.
version: 0.1.0
domain: support
apis:
  - zendesk
---

# Ticket Triage

## When to use this skill

New support tickets need severity classification and routing, or the triage
queue has unprocessed tickets.

## Procedure

1. Read the ticket and classify severity:
   - **P0** — production down or data loss for any customer
   - **P1** — core feature broken, no workaround
   - **P2** — degraded experience, workaround exists
   - **P3** — question, feature request, or cosmetic issue
2. Route: P0/P1 to the on-call engineering queue; P2 to product support;
   P3 to the async queue.
3. For billing-related tickets (charges, refunds, invoices), tag `billing`
   so the `invoice-dispute` skill can pick them up.
4. Reply to the customer within the severity SLA using the
   [company tone guide](../../../references/tone.md).

## Boundaries

- Never close a ticket without a customer-visible response.
- P0 tickets page the on-call immediately — do not batch them.
