# Skill Framework Lint action

Runs `sf lint` on your skill tree in CI; findings become PR annotations and
the job fails on any error-severity finding.

```yaml
on: [pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: karsonenns/skill-framework/action@main
        with:
          path: .   # or e.g. .claude/skills; also: version (npm tag), node-version
```
