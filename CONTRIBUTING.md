# Contributing (maintainers)

Public README is a **company-first career discovery catalog** generated from validated US new-grad roles.

Rules:
- `careerLevel` must be `new_grad`
- US locations only
- No internships / co-ops
- Direct employer ATS links
- Do not invent pay, sponsorship, workplace, or eligibility

```sh
npm test
npm run generate
npm run check
```

`npm run generate` rewrites `README.md` (catalog markers), public `indexes/*.md`, and local `companies/` + `jobs/` cards.
