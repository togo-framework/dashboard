# dashboard

The togo **dashboard + auth UI** plugin. Injects a prism-style Next.js suite into the
app `web/` — login, register, reset (OTP), two-factor, lock (PIN), profile, dashboard —
all localized via `trans()`. Depends on [auth](https://github.com/togo-framework/auth)
for the backend (plugin-depends-on-plugin).

```bash
togo install togo-framework/dashboard
```

Installing it pulls in `auth` automatically.
