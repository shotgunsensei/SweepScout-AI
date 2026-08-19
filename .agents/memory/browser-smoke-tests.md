---
name: Browser smoke tests
description: How to run the sweepscout Playwright smoke suites in this environment
---

The sweepscout web artifact's browser smoke suites (artifacts/sweepscout/test/*-browser-smoke.mjs) run against a locally served production build: `PORT=4173 BASE_PATH=/ pnpm run build && pnpm run serve`, then `pnpm run test:browser*`.

**Why:** Playwright's downloaded Chromium fails here (missing libglib). Launch with `executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` — a Nix-provided browser that works headless.

**How to apply:** Any new Playwright script in this workspace should pass that env var as executablePath (fall back to undefined). Playwright itself is a dependency of artifacts/api-server, imported via relative path from sweepscout tests.
