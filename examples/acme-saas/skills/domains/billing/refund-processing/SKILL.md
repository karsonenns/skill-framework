---
name: refund-processing
description: Process approved refunds and confirm them to the customer. Use when a refund has been approved and needs to be executed in Stripe.
version: 0.1.0
domain: billing
apis:
  - stripe
secrets:
  - STRIPE_KEY
---

# Refund Processing

## When to use this skill

A refund has already been approved (by `invoice-dispute` or a human) and
needs to be executed. This skill does not decide whether to refund — see
[invoice-dispute](../invoice-dispute/SKILL.md) for that.

## Procedure

1. Verify the approval trail: who approved, for which invoice, what amount.
2. Execute the refund in Stripe (authenticate with the `STRIPE_KEY`
   environment variable).
3. Confirm to the customer using the [company tone guide](../../../references/tone.md):
   amount, invoice number, and when it will land.
4. Log the refund reference id back to the originating ticket.

## Boundaries

- Refund exactly the approved amount — any difference goes back for approval.
- Never execute a refund with no written approval trail.
