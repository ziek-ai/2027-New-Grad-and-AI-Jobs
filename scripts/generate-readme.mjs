import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { validate, validateCompanies } from "./validate.mjs";

const companies = validateCompanies(JSON.parse(readFileSync("data/companies.json", "utf8")));
const jobs = validate(JSON.parse(readFileSync("data/jobs.json", "utf8")), companies);
const companyById = new Map(companies.map((c) => [c.id, c]));

const esc = (value) =>
	String(value ?? "—")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll("|", "\\|")
		.replaceAll("[", "\\[")
		.replaceAll("]", "\\]")
		.replaceAll("`", "\\`")
		.replaceAll(/\r?\n/g, " ");

const url = (value) => new URL(value).toString().replaceAll("(", "%28").replaceAll(")", "%29");

const labels = {
	new_grad: "New Grad",
	early_career: "Early Career",
	entry: "Entry",
};

const money = (job) => {
	if (job.salaryMinUsd == null && job.salaryMaxUsd == null) return "Not disclosed";
	const fmt = (n) => `$${Math.round(n / 1000)}k`;
	if (job.salaryMinUsd != null && job.salaryMaxUsd != null)
		return `${fmt(job.salaryMinUsd)}–${fmt(job.salaryMaxUsd)}`;
	return fmt(job.salaryMinUsd ?? job.salaryMaxUsd);
};

const logo = (path, name) => `<img src="${path}" alt="${esc(name)}" width="28" height="28" />`;

const sorted = [...jobs].sort(
	(a, b) =>
		(a.plannedPostDateEt ?? "9999").localeCompare(b.plannedPostDateEt ?? "9999") ||
		a.company.localeCompare(b.company) ||
		a.role.localeCompare(b.role) ||
		a.id.localeCompare(b.id),
);

/** Public README: jobs table only. */
const readmeBody =
	`| | Company | Role | Location | Pay (USD) | Apply |\n` +
	`| --- | --- | --- | --- | --- | --- |\n` +
	sorted
		.map(
			(j) =>
				`| ${logo(j.logoPath, j.company)} | **${esc(j.company)}** | **${esc(j.role)}** | ${esc(j.location)} | ${esc(money(j))} | [Apply](${url(j.applyUrl)}) |`,
		)
		.join("\n");

const original = readFileSync("README.md", "utf8");
const files = new Map();

files.set(
	"README.md",
	original.replace(
		/<!-- JOBS:START -->[\s\S]*?<!-- JOBS:END -->/,
		() => `<!-- JOBS:START -->\n\n${readmeBody}\n\n<!-- JOBS:END -->`,
	),
);

/** Maintainer-local indexes / cards — not linked from README. */
const groups = (rows, key) => {
	const result = new Map();
	for (const row of rows) {
		const name = row[key];
		result.set(name, [...(result.get(name) ?? []), row]);
	}
	return [...result].sort(([a], [b]) => String(a).localeCompare(String(b)));
};

const miniTable = (rows) =>
	"| Logo | Company | Role | Pay | Apply |\n| --- | --- | --- | --- | --- |\n" +
	rows
		.map(
			(j) =>
				`| ${logo(j.logoPath, j.company)} | ${esc(j.company)} | [${esc(j.role)}](../jobs/${j.id}.md) | ${esc(money(j))} | [Employer](${url(j.applyUrl)}) |`,
		)
		.join("\n");

const salarySorted = [...jobs]
	.filter((j) => j.salaryMaxUsd != null)
	.sort((a, b) => (b.salaryMaxUsd ?? 0) - (a.salaryMaxUsd ?? 0) || a.id.localeCompare(b.id));

files.set(
	"indexes/companies.md",
	"# Companies\n\n" +
		companies
			.map((c) => {
				const rows = jobs.filter((j) => j.companyId === c.id);
				return `- ${logo(`../${c.logoPath}`, c.name)} **[${esc(c.name)}](../companies/${c.id}.md)** — ${rows.length} role${rows.length === 1 ? "" : "s"} · [careers](${url(c.careersUrl)})`;
			})
			.join("\n") +
		"\n",
);

for (const [key, file, title] of [
	["careerLevel", "levels", "Career levels"],
	["category", "functions", "Job functions"],
]) {
	files.set(
		`indexes/${file}.md`,
		`# ${title}\n\n` +
			groups(sorted, key)
				.map(([name, rows]) => `## ${esc(labels[name] ?? name)}\n\n${miniTable(rows)}`)
				.join("\n\n") +
			"\n",
	);
}

files.set(
	"indexes/salary.md",
	"# Disclosed pay (USD)\n\nSorted by maximum disclosed figure.\n\n" +
		"| Rank | Logo | Company | Role | Min | Max | Type |\n| --- | --- | --- | --- | --- | --- | --- |\n" +
		salarySorted
			.map(
				(j, i) =>
					`| ${i + 1} | ${logo(`../${j.logoPath}`, j.company)} | ${esc(j.company)} | [${esc(j.role)}](../jobs/${j.id}.md) | ${j.salaryMinUsd ?? "—"} | ${j.salaryMaxUsd ?? "—"} | ${esc(j.salaryType ?? "")} |`,
			)
			.join("\n") +
		"\n",
);

const recent = [...jobs].sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.id.localeCompare(b.id));
const verified = [...jobs].sort(
	(a, b) => (b.lastVerifiedAt ?? "").localeCompare(a.lastVerifiedAt ?? "") || a.id.localeCompare(b.id),
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
	const rows = jobs.filter((j) => j.companyId === company.id);
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
			`## Roles\n\n${miniTable(rows)}\n`,
	);
}

for (const job of jobs) {
	const company = companyById.get(job.companyId);
	files.set(
		`jobs/${job.id}.md`,
		`# ${esc(job.role)}\n\n` +
			`${logo(`../${job.logoPath}`, job.company)} **[${esc(job.company)}](../companies/${job.companyId}.md)** · \`${job.id}\`\n\n` +
			`> ${esc(job.summary)}\n\n` +
			`| Field | Value |\n| --- | --- |\n` +
			`| Company | ${esc(job.company)} (\`${job.companyId}\`) |\n` +
			`| Level / function | ${esc(labels[job.careerLevel] ?? job.careerLevel)} / ${esc(job.category)} |\n` +
			`| Location | ${esc(job.location)} · ${esc(job.workplace)} |\n` +
			`| Pay | ${esc(money(job))} · ${esc(job.salaryType ?? "—")} |\n` +
			`| Eligibility | ${esc(job.eligibility ?? "See posting")} |\n` +
			`| Apply | [Employer posting](${url(job.applyUrl)}) |\n` +
			`| Provider / req | ${esc(job.provider)} · \`${esc(job.requisitionId ?? "—")}\` |\n` +
			`| Status | ${esc(job.status)} · verified ${esc(job.lastVerifiedAt?.slice(0, 10) ?? "—")} |\n` +
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

const check = process.argv.includes("--check");
for (const [path, content] of files) {
	if (check) {
		// README must stay in sync on CI. Local maintainer cards are gitignored.
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

console.log(JSON.stringify({ generated: files.size, jobs: jobs.length, companies: companies.length }));
