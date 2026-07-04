---
name: invoice-dispute
description: Resolve customer invoice disputes and chargebacks. Use when a customer contests a charge, requests a refund on an invoice, or a chargeback lands in Stripe.
version: 0.1.0
domain: billing
apis:
  - stripe
secrets:
  - STRIPE_KEY
---

# Invoice Dispute

## When to use this skill

A customer contests a charge, asks for a refund on a specific invoice, or a
chargeback notification arrives. For general billing questions that are not
disputes, this skill does not apply.

## Procedure

1. Pull the invoice and payment records from Stripe (authenticate with the
   `STRIPE_KEY` environment variable — never paste key values into files).
2. Classify the dispute: duplicate charge, service not received, amount wrong,
   or fraud claim. The [dispute playbook](references/dispute-playbook.md) maps
   each class to a resolution path.
3. Draft the customer response following the [company tone guide](../../../references/tone.md).
4. Refunds up to $500: process directly. Above $500: escalate per the
   [escalation policy](../../../references/escalation-policy.md).

## Boundaries

- Never process a refund above $500 without human approval.
- Never share internal fraud signals with the customer.
