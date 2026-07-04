# Skill Framework Lint action

Runs [`sf lint`](../docs/lint-rules.md) on your skill tree in CI. Findings
show up as annotations on the PR; the job fails if any error-severity
finding remains.

```yaml
name: skills
on: [pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: karsonenns/skill-framework/action@main
        with:
          path: .            # or e.g. .claude/skills for an existing tree
```

| Input | Default | Meaning |
|---|---|---|
| `path` | `.` | directory to lint |
| `version` | `latest` | skillfw version to run |
| `node-version` | `20` | Node.js to set up |
