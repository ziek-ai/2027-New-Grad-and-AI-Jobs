# Ziek Jobs DB schema

Machine-readable new-grad / early-career catalog. **Internships and co-ops are rejected.**

## Files

| Path | Role |
| ---- | ---- |
| `data/companies.json` | Company registry (`C###`) with website, careers URL, logo, HQ, about |
| `data/jobs.json` | Job rows (`J###`) with salary, eligibility, summary/description, apply URL, publish plan |
| `logos/` | Official employer marks referenced by `logoPath` |
| `companies/` | Human-readable company cards (generated) |
| `jobs/` | Human-readable job cards (generated) |
| `indexes/` | Generated indexes by company, level, function, salary, recent |

## `careerLevel` allow-list

`new_grad` only (US roles)

Not allowed: internships, co-ops, early_career/entry, or non-US locations.

## `category` allow-list

`AI` · `ML` · `SWE` · `FDE` · `Data` · `Infrastructure` · `Research`

## Job fields

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | string | Stable Ziek job id (`J001`…) |
| `companyId` | string | FK → `companies.json` |
| `company` | string | Display name (must match company registry) |
| `role` | string | Employer role title |
| `category` | enum | Job function |
| `careerLevel` | enum | New-grad family only |
| `location` | string | As stated on posting |
| `workplace` | enum | `remote` · `hybrid` · `onsite` · `unknown` |
| `salaryMinUsd` / `salaryMaxUsd` | number \| null | USD integers when disclosed |
| `salaryType` | string \| null | How the range was published |
| `eligibility` | string \| null | Graduation / sponsorship / class year text from source |
| `summary` | string | Short public blurb (not a full JD paste) |
| `description` | string | Longer public summary; still not a verbatim JD dump |
| `applyUrl` | https URL | Direct employer application link |
| `plannedPostDateEt` | `YYYY-MM-DD` \| null | LinkedIn / social plan date (ET calendar day) |
| `publishStatus` | enum | `planned` · `published` · `closed` · `held` |
| `publishedAtEt` | `YYYY-MM-DD` \| null | Actual social publish day |
| `linkedinPostUrl` | https URL \| null | After publish |
| `sourceReviewedAt` | `YYYY-MM-DD` | Last human source check |
| `logoPath` | string | Repo-relative path under `logos/` |
| `notes` | string \| null | Maintainer notes |
| `parentLinkedInPostId` | string \| null | Batch / parent post id |
| `provider` | string | `greenhouse` · `ashby` · `lever` · `workday` · `other` |
| `requisitionId` | string \| null | Stable source id (`gh:…`, `ashby:…`) |
| `status` | enum | Listing lifecycle: `active` · `closed` · `needs_verification` |
| `addedAt` | ISO-8601 | Directory addition time (not employer post date) |
| `lastVerifiedAt` | ISO-8601 \| null | Required when `status=active` |

Unknown salary / eligibility stays `null`. Never invent sponsorship, visa, or pay.
