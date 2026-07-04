---
name: incident-response
description: Coordinate production incident response from detection to postmortem. Use when an alert fires, a P0 ticket arrives, or someone declares an incident.
version: 0.1.0
domain: engineering
---

# Incident Response

## When to use this skill

A production alert fires, a P0 support ticket arrives, or anyone declares an
incident.

## Procedure

1. Declare severity (SEV1: customer-facing outage; SEV2: degraded; SEV3:
   internal only) and open an incident channel.
2. Check current component status with [scripts/statuspage.sh](scripts/statuspage.sh).
3. Assign roles: incident commander, comms, operator. One person per role.
4. Post customer updates every 30 minutes for SEV1, hourly for SEV2 — follow
   the [company tone guide](../../../references/tone.md).
5. After resolution, schedule the postmortem within 48 hours.

## Boundaries

- Never speculate about root cause in customer-facing updates.
- Rollback beats forward-fix while customers are impacted.
