# Play Pack Pilot database package

This package owns the production PostgreSQL/Drizzle schema. The first active
migration establishes the normalized approved-source and sweepstakes evidence
model. The JSON-payload SQLite store under `artifacts/api-server` remains a local
demo adapter until later phases move services onto repositories backed by this
package.

## Commands

Run from the repository root:

```text
node node_modules/typescript/bin/tsc -p lib/db/tsconfig.json --noEmit
node lib/db/node_modules/drizzle-kit/bin.cjs generate --config lib/db/drizzle.config.ts
node lib/db/node_modules/drizzle-kit/bin.cjs check --config lib/db/drizzle.config.ts
node --test lib/db/test/*.test.mjs
```

`pnpm --filter @workspace/db run push` requires `DATABASE_URL` and is for an
explicitly selected development database only. Production uses reviewed
migrations, not schema push.

## Migration safety

- Migration `0000_normalized_sweepstakes_sources.sql` is a fresh normalized
  baseline. It creates objects and contains no drop, truncate, delete, or data
  rewrite statements.
- Do not apply this baseline over a database that already contains the historical
  `.migration-backup` `sweepstakes` table. First inventory the target and create a
  dedicated legacy-to-normalized bridge migration; a naming collision should
  fail closed rather than silently reinterpret old records.
- Do not deploy the normalized schema as the active API store until authenticated
  request context and tenant-scoped repositories are in place.
- Rules versions and change events intentionally use restrictive deletes so
  historical evidence is not silently cascaded away.
