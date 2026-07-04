---
name: release-notes
description: Draft customer-facing release notes from merged changes. Use when a release ships or when asked to summarize what changed for customers.
version: 0.1.0
domain: product
---

# Release Notes

## When to use this skill

A release is shipping and customers need to know what changed, or someone
asks for a summary of recent product changes.

## Procedure

1. Collect merged changes since the last release tag.
2. Filter to customer-visible changes — skip refactors, internal tooling,
   and dependency bumps.
3. Group into: **New**, **Improved**, **Fixed**.
4. Write one plain-language sentence per item. Lead with the user benefit,
   not the implementation. Follow the [company tone guide](../../../references/tone.md).
5. Flag any breaking change prominently at the top with migration steps.

## Boundaries

- Never announce a feature that is behind an unreleased flag.
- Security fixes are described generically until disclosure is coordinated.
