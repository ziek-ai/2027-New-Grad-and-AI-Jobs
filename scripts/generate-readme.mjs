import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { validate, validateCompanies } from "./validate.mjs";

/** Closed listings stay out of the public catalog; held LinkedIn drafts still appear when status is active. */
export function selectPublicJobs(allJobs) {
	return allJobs.filter((job) => job.status !== "closed" && job.publishStatus !== "closed");
}

export const DIRECTIONS = [
	{ id: "ai", title: "AI applications and agents", categories: ["AI"], anchor: "ai" },
	{ id: "research", title: "AI research", categories: ["Research", "ML"], anchor: "research" },
	{ id: "swe", title: "Software engineering", categories: ["SWE"], anchor: "swe" },
	{ id: "fde", title: "Forward-deployed engineering", categories: ["FDE"], anchor: "fde" },
	{ id: "infrastructure", title: "Infrastructure", categories: ["Infrastructure"], anchor: "infrastructure" },
	{ id: "data", title: "Data and analytics", categories: ["Data"], anchor: "data" },
];

const labels = {
	new_grad: "New Grad",
	early_career: "Early Career",
	entry: "Entry",
};

const workplaceLabels = {
	remote: "Remote",
	hybrid: "Hybrid",
	onsite: "On-site",
	unknown: "See posting",
};

const categoryHeadings = {
	AI: "AI",
	ML: "ML",
	SWE: "SWE",
	FDE: "FDE",
	Data: "Data",
	Infrastructure: "Infrastructure",
	Research: "Research",
};

export const esc = (value) =>
	String(value ?? "—")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll("|", "\\|")
		.replaceAll("[", "\\[")
		.replaceAll("]", "\\]")
		.replaceAll("`", "\\`")
		.replaceAll(/\r?\n/g, " ");

export const url = (value) => new URL(value).toString().replaceAll("(", "%28").replaceAll(")", "%29");

export const money = (job) => {
	if (job.salaryMinUsd == null && job.salaryMaxUsd == null) return "Not disclosed";
	const fmt = (n) => `$${Math.round(n / 1000)}k`;
	if (job.salaryMinUsd != null && job.salaryMaxUsd != null)
		return `${fmt(job.salaryMinUsd)}–${fmt(job.salaryMaxUsd)}`;
	return fmt(job.salaryMinUsd ?? job.salaryMaxUsd);
};

export const logo = (path, name) => `<img src="${path}" alt="${esc(name)}" width="28" height="28" />`;

export const companySlug = (name) =>
	String(name)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

export const briefEligibility = (job) => {
	const text = (job.eligibility ?? "").trim();
	if (!text) return "See posting";
	return text.length > 90 ? `${text.slice(0, 87).trim()}…` : text;
};

export const verifiedDay = (job) =>
	(job.lastVerifiedAt ?? "").slice(0, 10) || job.sourceReviewedAt || "—";

export function sortJobsDeterministic(rows) {
	return [...rows].sort(
		(a, b) => a.role.localeCompare(b.role) || a.id.localeCompare(b.id),
	);
}

export function companiesWithJobs(publicJobs, allCompanies) {
	const counts = new Map();
	for (const job of publicJobs) counts.set(job.companyId, (counts.get(job.companyId) ?? 0) + 1);
	return [...allCompanies]
		.filter((company) => counts.has(company.id))
		.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
		.map((company) => ({
			company,
			jobs: sortJobsDeterministic(publicJobs.filter((job) => job.companyId === company.id)),
		}));
}

export function activeDirections(publicJobs) {
	return DIRECTIONS.filter((direction) =>
		publicJobs.some((job) => direction.categories.includes(job.category)),
	).map((direction) => ({
		...direction,
		count: publicJobs.filter((job) => direction.categories.includes(job.category)).length,
	}));
}

export function catalogStats(publicJobs, groupedCompanies) {
	const categories = [...new Set(publicJobs.map((job) => job.category))].sort((a, b) =>
		a.localeCompare(b),
	);
	const verifiedTimes = publicJobs
		.map((job) => job.lastVerifiedAt ?? (job.sourceReviewedAt ? `${job.sourceReviewedAt}T00:00:00.000Z` : null))
		.filter(Boolean)
		.sort();
	return {
		jobCount: publicJobs.length,
		companyCount: groupedCompanies.length,
		categories,
		categoryLabel: categories.join(", "),
		lastVerifiedDay: verifiedTimes.length ? verifiedTimes.at(-1).slice(0, 10) : null,
	};
}

/**
 * Featured discoveries are editorial angles grounded in concrete listings.
 * Only emit a card when every linked job still exists in the public set.
 */
export function buildFeaturedDiscoveries(publicJobs) {
	const byId = new Map(publicJobs.map((job) => [job.id, job]));
	const features = [];

	const fde = publicJobs.find((job) => job.category === "FDE");
	const backendish = publicJobs.find(
		(job) =>
			job.category === "SWE" &&
			/software engineer|developer|backend|full.?stack/i.test(job.role),
	);
	if (fde && backendish) {
		features.push({
			id: "fde-adjacent",
			title: "Backend-curious graduates can explore forward-deployed engineering",
			body: `${backendish.company}'s ${backendish.role} is a classic software track. ${fde.company}'s ${fde.role} is customer-facing systems work with a different day-to-day — still employer-defined new-grad hiring, not an automatic alternate path.`,
			jobs: [backendish, fde],
		});
	}

	const projectsFriendly = publicJobs.find((job) =>
		/internship or relevant|side project|coursework|or equivalent practical/i.test(
			`${job.eligibility ?? ""} ${job.summary ?? ""}`,
		),
	);
	const experienceExplicit = publicJobs.find(
		(job) =>
			job.id !== projectsFriendly?.id &&
			/professional .+ experience|0–1 years|0-1 years|[0-9]\+ years/i.test(job.eligibility ?? ""),
	);
	if (projectsFriendly && experienceExplicit) {
		features.push({
			id: "eligibility-signals",
			title: "Eligibility signals differ even among new-grad titles",
			body: `${projectsFriendly.company} (${projectsFriendly.role}) publishes pathways that include relevant projects or adjacent experience. ${experienceExplicit.company} (${experienceExplicit.role}) states a more explicit experience or education bar. Read each posting — adjacent skills never invent eligibility.`,
			jobs: [projectsFriendly, experienceExplicit],
		});
	}

	const researchBsMs = publicJobs.find(
		(job) => job.category === "Research" && /BS\/MS|Bachelor|Master/i.test(job.role) && !/PhD/i.test(job.role),
	);
	const researchPhd = publicJobs.find(
		(job) => job.category === "Research" && /PhD/i.test(job.role),
	);
	if (researchBsMs && researchPhd) {
		features.push({
			id: "research-degree-tracks",
			title: "AI research openings split by degree track",
			body: `${researchBsMs.company} lists both ${researchBsMs.role} and ${researchPhd.role}. Educational expectations are employer-stated and not interchangeable.`,
			jobs: [researchBsMs, researchPhd],
		});
	}

	// Prefer stable known IDs when present so featured order stays deterministic across regenerations.
	const preferred = [
		features.find((f) => f.id === "fde-adjacent"),
		features.find((f) => f.id === "eligibility-signals"),
		features.find((f) => f.id === "research-degree-tracks"),
	].filter(Boolean);

	return preferred.slice(0, 3).map((feature) => ({
		...feature,
		jobs: feature.jobs.filter((job) => byId.has(job.id)),
	}));
}

function renderFeatured(features) {
	if (!features.length) return "_No featured discoveries available for the current catalog._";
	return features
		.map((feature, index) => {
			const links = feature.jobs
				.map(
					(job) =>
						`[${esc(job.company)} — ${esc(job.role)}](${url(job.applyUrl)}) · [company](#company-${companySlug(job.company)})`,
				)
				.join("<br>");
			return (
				`${index + 1}. **${esc(feature.title)}**\n\n` +
				`   ${esc(feature.body)}\n\n` +
				`   ${links}`
			);
		})
		.join("\n\n");
}

function renderCompanyDirectory(grouped) {
	return grouped
		.map(({ company, jobs: rows }) => {
			const heading = `### ${logo(company.logoPath, company.name)} ${esc(company.name)}`;
			const table =
				`| Role | Location | Workplace | Pay (USD) | Eligibility | Verified | Apply |\n` +
				`| --- | --- | --- | --- | --- | --- | --- |\n` +
				rows
					.map(
						(job) =>
							`| **${esc(job.role)}** | ${esc(job.location)} | ${esc(workplaceLabels[job.workplace] ?? job.workplace)} | ${esc(money(job))} | ${esc(briefEligibility(job))} | ${esc(verifiedDay(job))} | [Apply](${url(job.applyUrl)}) |`,
					)
					.join("\n");
			return `<a id="company-${companySlug(company.name)}"></a>\n\n${heading}\n\n${table}`;
		})
		.join("\n\n");
}

export function renderReadmeCatalog({ publicJobs, allCompanies }) {
	const grouped = companiesWithJobs(publicJobs, allCompanies);
	const directions = activeDirections(publicJobs);
	const stats = catalogStats(publicJobs, grouped);
	const featured = buildFeaturedDiscoveries(publicJobs);
	const verificationLine = stats.lastVerifiedDay
		? `Latest listing verification in this catalog: **${stats.lastVerifiedDay}** (per-row dates below). Recheck every employer posting before you apply — openings change.`
		: `Verification dates are listed per role below. Recheck every employer posting before you apply — openings change.`;

	const directionNav = directions.length
		? directions
				.map(
					(direction) =>
						`- [${esc(direction.title)}](indexes/functions.md#${direction.anchor}) (${direction.count})`,
				)
				.join("\n")
		: "- _No categorized roles in the current public set._";

	return [
		`## Your CS degree isn't just for Software Engineering.`,
		``,
		`Explore graduate opportunities across AI research, agent engineering, software, infrastructure, data and forward-deployed engineering.`,
		``,
		`**Your career is bigger than your job search.** Discover opportunities you didn't know existed. Understand what employers need. Explore where your skills could take you next.`,
		``,
		`| Catalog | Count |`,
		`| --- | --- |`,
		`| Verified job records | **${stats.jobCount}** |`,
		`| Companies | **${stats.companyCount}** |`,
		`| Role categories present | ${esc(stats.categoryLabel)} |`,
		`| Geographic scope | United States |`,
		``,
		verificationLine,
		``,
		`## Discover by career direction`,
		``,
		`Only directions with at least one current listing are shown. Counts come from this repository's validated data.`,
		``,
		directionNav,
		``,
		`Full function index: [indexes/functions.md](indexes/functions.md) · [all companies](indexes/companies.md) · [recent](indexes/recent.md) · [disclosed pay](indexes/salary.md)`,
		``,
		`## Featured career discoveries`,
		``,
		`Short, employer-backed examples from listings already in this catalog. They highlight adjacent paths and differing requirements — they do **not** expand eligibility.`,
		``,
		renderFeatured(featured),
		``,
		`## Browse companies and their openings`,
		``,
		`Companies are alphabetical. Every qualifying role for an employer appears together. Pay shows only disclosed figures; otherwise **Not disclosed**. Apply links go to the original employer posting — no account required here.`,
		``,
		renderCompanyDirectory(grouped),
		``,
		`## Open access`,
		``,
		`- Browse and apply through direct employer links above — no Ziek login, subscription, or waitlist required to use this directory.`,
		`- Source data lives in [\`data/jobs.json\`](data/jobs.json) and [\`data/companies.json\`](data/companies.json); schema in [\`data/SCHEMA.md\`](data/SCHEMA.md).`,
		`- Suggest corrections or new US new-grad roles via [GitHub Issues](https://github.com/ziek-ai/2027-New-Grad-and-AI-Jobs/issues) / [CONTRIBUTING.md](CONTRIBUTING.md).`,
		`- Optional: follow Ziek elsewhere if useful — this repository stays useful on its own.`,
	].join("\n");
}

function groups(rows, key) {
	const result = new Map();
	for (const row of rows) {
		const name = row[key];
		result.set(name, [...(result.get(name) ?? []), row]);
	}
	return [...result].sort(([a], [b]) => String(a).localeCompare(String(b)));
}

/** Public indexes link to employer apply URLs + README company anchors (job/company cards stay local). */
function miniTable(rows, logoPrefix = "../") {
	return (
		"| Logo | Company | Role | Pay | Apply |\n| --- | --- | --- | --- | --- |\n" +
		rows
			.map(
				(j) =>
					`| ${logo(`${logoPrefix}${j.logoPath}`, j.company)} | [${esc(j.company)}](../README.md#company-${companySlug(j.company)}) | [${esc(j.role)}](${url(j.applyUrl)}) | ${esc(money(j))} | [Employer](${url(j.applyUrl)}) |`,
			)
			.join("\n")
	);
}

function pruneGeneratedDir(dir, keepRelativePaths) {
	if (!existsSync(dir)) return;
	for (const name of readdirSync(dir)) {
		if (!name.endsWith(".md")) continue;
		const relative = join(dir, name);
		if (!keepRelativePaths.has(relative)) unlinkSync(relative);
	}
}

export function generateAll({ check = false } = {}) {
	const companies = validateCompanies(JSON.parse(readFileSync("data/companies.json", "utf8")));
	const jobs = validate(JSON.parse(readFileSync("data/jobs.json", "utf8")), companies);
	const companyById = new Map(companies.map((c) => [c.id, c]));
	const publicJobs = selectPublicJobs(jobs);
	const sortedForIndexes = sortJobsDeterministic(publicJobs);
	const files = new Map();
	const original = readFileSync("README.md", "utf8");
	const catalog = renderReadmeCatalog({ publicJobs, allCompanies: companies });

	const nextReadme = original.includes("<!-- CATALOG:START -->")
		? original.replace(
				/<!-- CATALOG:START -->[\s\S]*?<!-- CATALOG:END -->/,
				() => `<!-- CATALOG:START -->\n\n${catalog}\n\n<!-- CATALOG:END -->`,
			)
		: original.replace(
				/<!-- JOBS:START -->[\s\S]*?<!-- JOBS:END -->/,
				() => `<!-- CATALOG:START -->\n\n${catalog}\n\n<!-- CATALOG:END -->`,
			);

	files.set("README.md", nextReadme);

	files.set(
		"indexes/companies.md",
		"# Companies\n\nAlphabetical employers with at least one current public role. Deep links open the README company section.\n\n" +
			companiesWithJobs(publicJobs, companies)
				.map(
					({ company, jobs: rows }) =>
						`- ${logo(`../${company.logoPath}`, company.name)} **[${esc(company.name)}](../README.md#company-${companySlug(company.name)})** — ${rows.length} role${rows.length === 1 ? "" : "s"} · [careers](${url(company.careersUrl)})`,
				)
				.join("\n") +
			"\n",
	);

	const directionSections = activeDirections(publicJobs)
		.map((direction) => {
			const rows = sortJobsDeterministic(
				publicJobs.filter((job) => direction.categories.includes(job.category)),
			);
			return `## ${esc(direction.title)}\n\n<a id="${direction.anchor}"></a>\n\n${miniTable(rows)}`;
		})
		.join("\n\n");

	const legacyFunctionSections = groups(sortedForIndexes, "category")
		.map(
			([name, rows]) =>
				`## ${esc(categoryHeadings[name] ?? labels[name] ?? name)}\n\n${miniTable(sortJobsDeterministic(rows))}`,
		)
		.join("\n\n");

	files.set(
		"indexes/functions.md",
		`# Job functions / career directions\n\n` +
			`Navigable career directions (non-empty only), then raw category indexes.\n\n` +
			`## Career directions\n\n` +
			directionSections +
			`\n\n## Categories\n\n` +
			legacyFunctionSections +
			`\n`,
	);

	files.set(
		`indexes/levels.md`,
		`# Career levels\n\n` +
			groups(sortedForIndexes, "careerLevel")
				.map(
					([name, rows]) =>
						`## ${esc(labels[name] ?? name)}\n\n${miniTable(sortJobsDeterministic(rows))}`,
				)
				.join("\n\n") +
			`\n`,
	);

	const salarySorted = [...publicJobs]
		.filter((j) => j.salaryMaxUsd != null)
		.sort((a, b) => (b.salaryMaxUsd ?? 0) - (a.salaryMaxUsd ?? 0) || a.id.localeCompare(b.id));

	files.set(
		"indexes/salary.md",
		"# Disclosed pay (USD)\n\nSorted by maximum disclosed figure. Unknown compensation is omitted here and shown as **Not disclosed** in the company directory.\n\n" +
			"| Rank | Logo | Company | Role | Min | Max | Type |\n| --- | --- | --- | --- | --- | --- | --- |\n" +
			salarySorted
				.map(
					(j, i) =>
						`| ${i + 1} | ${logo(`../${j.logoPath}`, j.company)} | [${esc(j.company)}](../README.md#company-${companySlug(j.company)}) | [${esc(j.role)}](${url(j.applyUrl)}) | ${j.salaryMinUsd ?? "—"} | ${j.salaryMaxUsd ?? "—"} | ${esc(j.salaryType ?? "")} |`,
				)
				.join("\n") +
			"\n",
	);

	const recent = [...publicJobs].sort(
		(a, b) => b.addedAt.localeCompare(a.addedAt) || a.id.localeCompare(b.id),
	);
	const verified = [...publicJobs].sort(
		(a, b) =>
			(b.lastVerifiedAt ?? "").localeCompare(a.lastVerifiedAt ?? "") || a.id.localeCompare(b.id),
	);
	files.set(
		"indexes/recent.md",
		"# Recently added and verified\n\n## Recently added\n\n" +
			miniTable(recent) +
			"\n\n## Recently verified\n\n" +
			miniTable(verified) +
			"\n",
	);

	for (const company of companies) {
		const rows = sortJobsDeterministic(publicJobs.filter((j) => j.companyId === company.id));
		files.set(
			`companies/${company.id}.md`,
			`# ${esc(company.name)}\n\n` +
				`${logo(`../${company.logoPath}`, company.name)}\n\n` +
				`| Field | Value |\n| --- | --- |\n` +
				`| ID | \`${company.id}\` |\n` +
				`| Website | [${esc(company.website)}](${url(company.website)}) |\n` +
				`| Careers | [${esc(company.careersUrl)}](${url(company.careersUrl)}) |\n` +
				`| HQ | ${esc(company.hq)} |\n` +
				`| About | ${esc(company.about)} |\n` +
				`| Notes | ${esc(company.notes ?? "—")} |\n` +
				`| Logo | [\`${company.logoPath}\`](../${company.logoPath}) |\n\n` +
				`## Roles\n\n${rows.length ? miniTable(rows) : "_No current public roles._"}\n`,
		);
	}

	for (const job of publicJobs) {
		const company = companyById.get(job.companyId);
		files.set(
			`jobs/${job.id}.md`,
			`# ${esc(job.role)}\n\n` +
				`${logo(`../${job.logoPath}`, job.company)} **[${esc(job.company)}](../companies/${job.companyId}.md)** · \`${job.id}\`\n\n` +
				`> ${esc(job.summary)}\n\n` +
				`| Field | Value |\n| --- | --- |\n` +
				`| Company | ${esc(job.company)} (\`${job.companyId}\`) |\n` +
				`| Level / function | ${esc(labels[job.careerLevel] ?? job.careerLevel)} / ${esc(job.category)} |\n` +
				`| Location | ${esc(job.location)} · ${esc(workplaceLabels[job.workplace] ?? job.workplace)} |\n` +
				`| Pay | ${esc(money(job))} · ${esc(job.salaryType ?? "—")} |\n` +
				`| Eligibility | ${esc(job.eligibility ?? "See posting")} |\n` +
				`| Apply | [Employer posting](${url(job.applyUrl)}) |\n` +
				`| Provider / req | ${esc(job.provider)} · \`${esc(job.requisitionId ?? "—")}\` |\n` +
				`| Status | ${esc(job.status)} · verified ${esc(verifiedDay(job))} |\n` +
				`| Publish plan | ${esc(job.publishStatus)} · planned ${esc(job.plannedPostDateEt ?? "—")} ET |\n` +
				`| LinkedIn | ${job.linkedinPostUrl ? `[Post](${url(job.linkedinPostUrl)})` : "—"} · parent \`${esc(job.parentLinkedInPostId ?? "—")}\` |\n` +
				`| Logo | [\`${job.logoPath}\`](../${job.logoPath}) |\n` +
				`| Notes | ${esc(job.notes ?? "—")} |\n\n` +
				`## Description\n\n${esc(job.description)}\n\n` +
				(company
					? `## Company\n\n${esc(company.about)} · [company card](../companies/${company.id}.md)\n`
					: ""),
		);
	}

	for (const [path, content] of files) {
		if (check) {
			if (path === "README.md") {
				if (readFileSync(path, "utf8") !== content) throw Error("Generated index stale: " + path);
				continue;
			}
			if (existsSync(path) && readFileSync(path, "utf8") !== content)
				throw Error("Generated index stale: " + path);
		} else {
			mkdirSync(path.split("/").slice(0, -1).join("/") || ".", { recursive: true });
			writeFileSync(path, content);
		}
	}

	if (!check) {
		pruneGeneratedDir(
			"companies",
			new Set([...files.keys()].filter((path) => path.startsWith("companies/"))),
		);
		pruneGeneratedDir(
			"jobs",
			new Set([...files.keys()].filter((path) => path.startsWith("jobs/"))),
		);
		pruneGeneratedDir(
			"indexes",
			new Set([...files.keys()].filter((path) => path.startsWith("indexes/"))),
		);
	}

	return {
		generated: files.size,
		jobs: publicJobs.length,
		companies: companiesWithJobs(publicJobs, companies).length,
		directions: activeDirections(publicJobs).length,
		featured: buildFeaturedDiscoveries(publicJobs).length,
	};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const summary = generateAll({ check: process.argv.includes("--check") });
	console.log(JSON.stringify(summary));
}
