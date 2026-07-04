# acme-saas example

A complete, lintable Skill Framework tree for a fictional SaaS company.
Everything the main README claims is demonstrated here.

```sh
cd examples/acme-saas
npx skillfw lint                 # zero findings
npx skillfw deploy --dry-run     # Terraform-style plan for four runtimes
STRIPE_KEY=sk_test_x npx skillfw deploy   # compiles + writes skillfw.lock
```

Layout highlights:

- `skills/domains/billing/` has two skills that reference each other
  (`invoice-dispute` decides, `refund-processing` executes).
- `skills/orchestrators/customer-escalation/` composes domain skills via
  `uses:` and duplicates none of their instructions.
- `skills/references/` holds shared org knowledge; skills link to it with
  relative paths, and deploy rewrites those links per target.
- `skillfw.yaml` maps the `STRIPE_KEY` secret to `env://STRIPE_KEY` — the
  value never appears in any skill file, and deploy verifies it resolves.
