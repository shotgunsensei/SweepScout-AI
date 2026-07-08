# SweepScout Companion Extension

Chrome Manifest V3 companion extension for SweepScout AI.

## Build

```bash
corepack pnpm --dir artifacts/sweepscout-extension build
```

The build emits an unpacked Chrome extension to `artifacts/sweepscout-extension/dist`.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select `artifacts/sweepscout-extension/dist`.

## Runtime Setup

- Default API base: `http://localhost:5000/api`
- Default dashboard URL: `http://localhost:5173/dashboard`
- Use the popup to change either URL.
- Click **Sync Approved Profile** after enabling profile prefill consent inside SweepScout.

## Safety Boundaries

- The extension never clicks submit buttons.
- Prefill only uses the locally synced approved profile.
- SSN, banking, payment, password, terms, consent, and CAPTCHA fields are highlighted and left manual.
- One-click save calls `POST /api/extension/save`; scoring and dedupe stay server-owned.
