<!-- togo-header -->
<div align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/togo-mark-dark.svg" /><img src=".github/assets/togo-mark.svg" alt="ToGO" height="64" /></picture>
  <h1>togo-framework/dashboard</h1>
  <p>
    <a href="https://to-go.dev/marketplace"><img src="https://img.shields.io/badge/marketplace-to--go.dev-1F8A99" alt="marketplace" /></a>
    <a href="https://pkg.go.dev/github.com/togo-framework/dashboard"><img src="https://pkg.go.dev/badge/github.com/togo-framework/dashboard.svg" alt="pkg.go.dev" /></a>
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT" />
  </p>
  <p><strong>Part of the <a href="https://to-go.dev">togo</a> framework.</strong></p>
</div>

## Install

```bash
togo install togo-framework/dashboard
```

<!-- /togo-header -->

<!-- togo-brand -->
<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/togo-mark-dark.svg" /><img src=".github/assets/togo-mark.svg" alt="ToGO" width="96" /></picture>
</p>
<h1 align="center">dashboard</h1>
<p align="center"><sub>part of the <a href="https://github.com/togo-framework">togo-framework</a> — the full-stack Go + React framework</sub></p>

The togo **dashboard + auth UI** plugin. Injects a prism-style Next.js suite into the
app `web/` — login, register, reset (OTP), two-factor, lock (PIN), profile, dashboard —
all localized via `trans()`. Depends on [auth](https://github.com/togo-framework/auth)
for the backend (plugin-depends-on-plugin).

```bash
togo install togo-framework/dashboard
```

Installing it pulls in `auth` automatically.


---

## 💎 Premium sponsors

togo is proudly sponsored by **ID8 Media** and **One Studio**.

<p align="center">
  <a href="https://id8media.com"><img src=".github/assets/id8media.svg" height="44" alt="ID8 Media" /></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://one-studio.co"><img src=".github/assets/one-studio.jpeg" height="44" alt="One Studio" /></a>
</p>

<!-- togo-sponsors -->
---

<div align="center">
  <h3>Premium sponsors</h3>
  <p>
    <a href="https://id8media.com"><strong>ID8 Media</strong></a> &nbsp;·&nbsp;
    <a href="https://one-studio.co"><strong>One Studio</strong></a>
  </p>
  <p><sub>Support togo — <a href="https://github.com/sponsors/fadymondy">become a sponsor</a>.</sub></p>
</div>
<!-- /togo-sponsors -->

## Web development and CI

`web/` is injected into a project by `togo install`, so it is checked inside a
harness: `node test-harness/assemble.mjs` copies `test-harness/template/` (a
minimal Next 16 project pinning `@fadymondy/nasaq ^1.2.0`) to `test-harness/.build`,
injects `web/` the way `togo install` does, and adds `test-harness/tests/`. Then,
in `.build`: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` (Vitest +
Testing Library, mocked fetch), `npm run build`.

### Auth dependency (follow-up)

The admin client targets the `/api/auth/admin/*` API of togo-framework/auth#5
(PR #6, target v0.10.0, unreleased). `go.mod` stays on auth v0.8.0 until that tag
exists; bump it then (no replace directive, no pseudo-version).
