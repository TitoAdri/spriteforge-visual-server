# Security policy

## Supported versions

Only the default branch is treated as supported. Preview, experiment and
archive branches are not production deployment targets.

## Reporting a vulnerability

Please do not open a public issue with credentials, personal data or exploit
details. Contact the maintainer privately at `security@spriteforge.xyz` with:

- a short description and affected component;
- reproducible steps or a minimal proof of concept;
- the impact you observed;
- any suggested mitigation.

We will acknowledge reports as soon as practical and will coordinate a fix or
disclosure timeline with the reporter.

## Secret handling

Provider keys, OAuth secrets, payment credentials, session secrets, SQLite
databases and user assets must stay outside Git. Use `generator/.env.example`
as the configuration template and keep real values in the deployment secret
store.
