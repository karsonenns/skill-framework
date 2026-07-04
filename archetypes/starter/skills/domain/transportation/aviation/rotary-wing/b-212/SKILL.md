---
name: b-212
description: Operate the Bell 212 for insertion, extraction, and resupply. Use when a task requires rotary-wing flight in a B-212.
version: 0.1.0
memory: motor
duration: permanent
apis:
  - flight-ops
secrets:
  - FLIGHT_OPS_TOKEN
---

# B-212

## When to use this skill

Any tasking that puts a B-212 in the air: insertion, extraction, resupply.

## Procedure

1. File the sortie via the flight-ops API (authenticate with the
   `FLIGHT_OPS_TOKEN` environment variable — never paste values into files).
2. Compute weight and balance; a rooftop hoist changes the power margin.
3. Fly the profile; hover work follows [comms brevity](../../../../../references/comms-brevity.md).

## Boundaries

- No single-pilot night hoist operations.
- Abort if power margin drops below 10% in the hover.
