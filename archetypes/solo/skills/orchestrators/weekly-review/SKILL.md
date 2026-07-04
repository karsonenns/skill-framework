---
name: weekly-review
description: Run the full weekly review across email, content, and projects. Use when asked to do the weekly review or at the scheduled review time.
version: 0.1.0
uses:
  - inbox-zero
  - content-calendar
  - project-triage
---

# Weekly Review

Cross-domain workflow. This orchestrator composes domain skills by name — it
does not duplicate their instructions.

## Steps

1. Clear the decks: run `inbox-zero`.
2. Plan the week's publishing with `content-calendar`.
3. Set dev priorities with `project-triage`.
4. Close with a three-line summary: biggest win, biggest risk, top priority
   for next week.

## Boundaries

- The review is time-boxed to 90 minutes; unfinished steps carry a task.
