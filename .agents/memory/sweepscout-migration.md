---
name: SweepScout Vite+React migration
description: Conventions from migrating SweepScout AI (Next.js -> Vite+React) onto the pnpm workspace; useful for future frontend work on the sweepscout artifact.
---

# SweepScout frontend (artifact `sweepscout`)

- Frontend is Vite+React with the `wouter` router; base path is `import.meta.env.BASE_URL` (previewPath "/"). It talks to the `api-server` Express backend under `/api`.
- **API envelope:** backend always returns `{ ok: true, data }` or `{ ok: false, error }`. The frontend `src/lib/api.ts` (`apiGet`/`apiSend`) unwraps `data` and throws `ApiError` on `ok:false`. Any new endpoint must keep this shape or the client breaks.
- **Forms:** the original Next.js used server actions; migrated to `onSubmit` + `FormData` via `formToObject` + `useApiMutation` (`src/lib/forms.ts`). `useApiMutation` invalidates ALL queries on success. Checkboxes send `"on"` (backend `bool()` accepts). Some backend flags are enforced client-side via hidden inputs (e.g. `requireApprovalForEveryEntry=true`).

**Why:** manual approval is a hard product invariant — SweepScout never auto-submits entries; the locked checkbox + hidden flag exist so API callers can't bypass it.

**Gotcha:** the artifact has BOTH `src/components/ui.tsx` (custom primitives: PageHeader, Panel, Badge, SubmitButton, TextInput, Checkbox, MetricCard...) AND a scaffold `src/components/ui/` shadcn directory. Import `@/components/ui` resolves to the `.tsx` file (file wins over dir in Vite resolution). Don't confuse the two.
