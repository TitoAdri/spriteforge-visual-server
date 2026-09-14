# Contributing

Thanks for helping improve SpriteForge.

## Before opening a pull request

1. Keep provider credentials, user data, generated outputs and local `.env`
   files out of Git.
2. Run `node --test generator/test/*.test.mjs`.
3. Run `npm ci` and `npm audit --omit=dev --audit-level=high` from `generator/`.
4. Check frontend modules with `node --check` and review `git diff --check`.
5. Describe user-visible changes and any deployment considerations.

The CI workflow repeats these checks on every pull request. Please report
security issues through [`SECURITY.md`](SECURITY.md), not in a public issue.
