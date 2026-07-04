---
name: extract-team-from-rooftop
description: Achieve a complete rooftop team extraction end to end. Use when a team must be recovered from a rooftop by air.
version: 0.1.0
memory: judgment
duration: reinforced
uses:
  - b-212
  - rooftop-hoist
---

# Extract Team From Rooftop

Outcome: composes domain skills by name — it does not duplicate their
instructions.

## Steps

1. Get airborne and on station with `b-212`.
2. Recover each team member with `rooftop-hoist`.
3. The outcome is achieved when the full team is aboard and clear of the
   objective — anything less is an abort, not a partial success.
