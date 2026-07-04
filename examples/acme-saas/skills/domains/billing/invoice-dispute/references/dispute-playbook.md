# Dispute Playbook

Loaded on demand — keep SKILL.md lean and the detail here.

| Dispute class | Resolution path |
|---|---|
| Duplicate charge | Verify both charges in Stripe; refund the duplicate immediately. |
| Service not received | Check provisioning logs; if we failed to deliver, refund and apologize. |
| Amount wrong | Compare invoice to the signed order form; correct and re-issue. |
| Fraud claim | Do not refund. Gather evidence and submit a chargeback response. |

## Evidence checklist for chargebacks

- Signed order form or checkout receipt
- Provisioning/usage logs showing the service was delivered
- All customer communication about the charge
