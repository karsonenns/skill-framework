# Security Policy

## Supported versions

The latest released minor version of `skillfw` receives security fixes.

## Reporting a vulnerability

Please **do not** open a public issue for security reports. Use GitHub's
[private vulnerability reporting](https://github.com/karsonenns/skill-framework/security/advisories/new)
for this repository, or email hello@karson.org.

You can expect an acknowledgement within a few days. Please include a
reproduction if you can.

## Scope notes

Skill Framework's secrets model is *verify-only by design*: `sf` never reads
secret values into compiled output, and `sf lint` (SF011/SF012) exists to
catch credentials in skill files. Reports about secret values appearing in
compiled trees, lockfiles, or logs are treated as high severity.
