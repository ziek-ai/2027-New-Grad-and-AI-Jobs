import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
	activeDirections,
	buildFeaturedDiscoveries,
	companiesWithJobs,
	renderReadmeCatalog,
	selectPublicJobs,
	sortJobsDeterministic,
} from "./generate-readme.mjs";
import { validate, validateCompanies } from "./validate.mjs";

const companies = validateCompanies(JSON.parse(readFileSync("data/companies.json", "utf8")));
const jobs = validate(JSON.parse(readFileSync("data/jobs.json", "utf8")), companies);
const publicJobs = selectPublicJobs(jobs);

test("public catalog keeps every non-closed job exactly once across companies", () => {
	const grouped = companiesWithJobs(publicJobs, companies);
	const listed = grouped.flatMap((entry) => entry.jobs.map((job) => job.id));
	assert.equal(listed.length, publicJobs.length);
	assert.equal(new Set(listed).size, publicJobs.length);
	assert.equal(grouped.length, new Set(publicJobs.map((job) => job.companyId)).size);
});

test("companies sort alphabetically and jobs within a company are deterministic", () => {
	const grouped = companiesWithJobs(publicJobs, companies);
	const names = grouped.map((entry) => entry.company.name);
	assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
	for (const entry of grouped) {
		const ids = entry.jobs.map((job) => job.id);
		assert.deepEqual(
			ids,
			sortJobsDeterministic(entry.jobs).map((job) => job.id),
		);
	}
});

test("career-direction navigation only includes non-empty categories", () => {
	const directions = activeDirections(publicJobs);
	assert.ok(directions.length > 0);
	for (const direction of directions) {
		assert.ok(direction.count > 0);
		assert.ok(
			publicJobs.some((job) => direction.categories.includes(job.category)),
		);
	}
	const empty = activeDirections([]);
	assert.equal(empty.length, 0);
});

test("featured discoveries only link jobs present in the public set", () => {
	const featured = buildFeaturedDiscoveries(publicJobs);
	const ids = new Set(publicJobs.map((job) => job.id));
	for (const feature of featured) {
		assert.ok(feature.jobs.length >= 1);
		for (const job of feature.jobs) assert.ok(ids.has(job.id));
	}
});

test("rendered catalog stays compact and lists every public job apply URL", () => {
	const markdown = renderReadmeCatalog({ publicJobs, allCompanies: companies });
	const companyCount = companiesWithJobs(publicJobs, companies).length;
	assert.match(
		markdown,
		new RegExp(`\\*\\*${publicJobs.length} jobs · ${companyCount} companies · United States\\*\\*`),
	);
	assert.ok(markdown.includes("Your next opportunity might have a job title you've never searched for."));
	assert.ok(!markdown.includes("Featured career discoveries"));
	assert.ok(!markdown.includes("Your career is bigger than your job search"));
	assert.ok(!markdown.includes("| Catalog | Count |"));
	for (const job of publicJobs) {
		assert.ok(markdown.includes(job.applyUrl), `missing apply URL for ${job.id}`);
		assert.ok(markdown.includes(job.role), `missing role for ${job.id}`);
		assert.ok(markdown.includes(job.company), `missing company for ${job.id}`);
	}
	assert.ok(markdown.includes("indexes/functions.md"));
	assert.equal(markdown, renderReadmeCatalog({ publicJobs, allCompanies: companies }));
});

test("closed jobs are excluded from the public catalog", () => {
	const closed = {
		...publicJobs[0],
		id: "J999",
		status: "closed",
		publishStatus: "closed",
		requisitionId: "ashby:closed-fixture",
		applyUrl: "https://jobs.ashbyhq.com/example/closed-fixture",
	};
	const selected = selectPublicJobs([...publicJobs, closed]);
	assert.equal(selected.length, publicJobs.length);
	assert.ok(!selected.some((job) => job.id === "J999"));
});
