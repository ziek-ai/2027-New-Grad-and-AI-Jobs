# Contributing (maintainers)

Public GitHub surface is the README jobs table only.

Local Jobs DB (not shown in README):

| Path | Purpose |
| --- | --- |
| `data/companies.json` | Company registry |
| `data/jobs.json` | Job rows (source of truth) |
| `data/SCHEMA.md` | Field reference |
| `logos/` | Logos used in the README table |
| `companies/` · `jobs/` · `indexes/` | Generated locally via `npm run generate` (gitignored) |

No internships or co-ops.

```sh
npm test
npm run generate   # refreshes README table + local maintainer cards
npm run check
```
