# v1.0.2-era database

`ledger.db` is a synthetic database in the shape Ledger v1.0.2 produced, for the release
upgrade test. It holds only the demo data from that tag's own seed scripts (users `john`
and `jane`, 8 accounts, 91 transactions). It contains no real data and was never near `data/`.

## Rebuild

```
bash packages/server/test/fixtures/v1.0.2/build.sh
```

The script (needs network and the `v1.0.2` tag fetched):

1. `git archive v1.0.2` into a temporary folder outside the repo, then `npm ci` there.
2. With `DATABASE_PATH` pointing inside that folder: `npx tsx src/db/seed.ts`, then
   `npx tsx src/db/demo-seed.ts`, then every startup migration from `src/index.ts` of that tag,
   in the same order.
3. `VACUUM INTO` a single standalone file next to the script.

Tables, columns and row counts reproduce exactly. Bytes do not: password hashes use a random
salt and `created_at` columns hold the build time. `v102-fixture.test.ts` checks the schema.

`*.db` is git-ignored, so after a rebuild add it with `git add -f`.
