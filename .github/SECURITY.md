# Security Policy

The latest released minor of `skillfw` receives security fixes. Please do
not open public issues for vulnerabilities — use GitHub's
[private vulnerability reporting](https://github.com/karsonenns/skill-framework/security/advisories/new)
or email hello@karson.org; expect an acknowledgement within a few days.

sf's secrets model is verify-only by design: secret values must never appear
in compiled trees, lockfiles, or logs — reports that they do are treated as
high severity.
