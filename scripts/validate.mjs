import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const JOB_KEYS = [
	"id",
	"companyId",
	"company",
	"role",
	"category",
	"careerLevel",
	"location",
	"workplace",
	"salaryMinUsd",
	"salaryMaxUsd",
	"salaryType",
	"eligibility",
	"summary",
	"description",
	"applyUrl",
	"plannedPostDateEt",
	"publishStatus",
	"publishedAtEt",
	"linkedinPostUrl",
	"sourceReviewedAt",
	"logoPath",
	"notes",
	"parentLinkedInPostId",
	"provider",
	"requisitionId",
	"status",
	"addedAt",
	"lastVerifiedAt",
];

const COMPANY_KEYS = ["id", "name", "website", "careersUrl", "logoPath", "hq", "about", "notes"];

const CAREER_LEVELS = new Set(["new_grad", "early_career", "entry"]);
const FORBIDDEN_LEVELS = new Set(["internship", "co_op"]);
const CATEGORIES = new Set(["AI", "ML", "SWE", "FDE", "Data", "Infrastructure", "Research"]);
const WORKPLACES = new Set(["remote", "hybrid", "onsite", "unknown"]);
const STATUSES = new Set(["active", "closed", "needs_verification"]);
const PUBLISH = new Set(["planned", "published", "closed", "held"]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function identity(job) {
	const u = new URL(job.applyUrl);
	for (const k of Array.from(u.searchParams.keys()))
		if (k.startsWith("utm_") || ["gh_src", "ref"].includes(k)) u.searchParams.delete(k);
	u.hash = "";
	u.pathname = u.pathname.replace(/\/application\/?$/, "");
	return job.requisitionId ? `${job.provider}|${job.company.trim().toLowerCase()}|${job.requisitionId}` : u.toString();
}

function assertKeys(obj, keys, label) {
	const actual = Object.keys(obj);
	if (actual.some((k) => !keys.includes(k))) throw Error(`${label}: unknown keys`);
	for (const k of keys) if (!(k in obj)) throw Error(`${label}: missing ${k}`);
}

function assertHttps(value, label) {
	if (value === null) return;
	const url = new URL(value);
	if (url.protocol !== "https:" || url.username || url.password) throw Error(`${label}: public HTTPS required`);
}

function assertDay(value, label) {
	if (value === null) return;
	if (typeof value !== "string" || !DAY.test(value)) throw Error(`${label}: expected YYYY-MM-DD or null`);
}

function assertNullString(value, label, max = 2000) {
	if (value === null) return;
	if (typeof value !== "string" || !value.trim() || value.length > max) throw Error(`Invalid ${label}`);
}

export function validateCompanies(companies) {
	if (!Array.isArray(companies) || companies.length > 5000) throw Error("Companies must be a bounded array");
	const ids = new Set();
	for (const company of companies) {
		assertKeys(company, COMPANY_KEYS, "company");
		if (typeof company.id !== "string" || !/^C\d{3,}$/.test(company.id) || ids.has(company.id))
			throw Error("Invalid or duplicate company id");
		ids.add(company.id);
		for (const k of ["name", "website", "careersUrl", "logoPath", "hq", "about"])
			if (typeof company[k] !== "string" || !company[k].trim()) throw Error(`Invalid company.${k}`);
		assertHttps(company.website, "company.website");
		assertHttps(company.careersUrl, "company.careersUrl");
		assertNullString(company.notes, "company.notes", 1000);
		if (!existsSync(company.logoPath)) throw Error(`Missing company logo: ${company.logoPath}`);
	}
	return companies;
}

export function validate(jobs, companies = null) {
	if (!Array.isArray(jobs) || jobs.length > 10000) throw Error("Jobs must be a bounded array (max 10000)");
	const companyById = new Map((companies ?? []).map((c) => [c.id, c]));
	const seen = new Set();
	const ids = new Set();
	for (const job of jobs) {
		assertKeys(job, JOB_KEYS, "job");
		if (typeof job.id !== "string" || !/^J\d{3,}$/.test(job.id) || ids.has(job.id))
			throw Error("Invalid or duplicate job id");
		ids.add(job.id);
		if (FORBIDDEN_LEVELS.has(job.careerLevel) || /intern|co-?op|co op/i.test(job.role))
			throw Error(`Internships/co-ops are not allowed: ${job.id}`);
		if (!CAREER_LEVELS.has(job.careerLevel)) throw Error(`Unknown career level: ${job.careerLevel}`);
		if (!CATEGORIES.has(job.category)) throw Error("Unknown job function");
		if (!WORKPLACES.has(job.workplace)) throw Error("Unknown workplace");
		if (!STATUSES.has(job.status)) throw Error("Invalid status");
		if (!PUBLISH.has(job.publishStatus)) throw Error("Invalid publishStatus");
		for (const k of ["companyId", "company", "role", "location", "summary", "description", "applyUrl", "logoPath", "provider", "sourceReviewedAt"])
			if (typeof job[k] !== "string" || !job[k].trim()) throw Error(`Invalid ${k}`);
		if (job.summary.length > 400 || job.description.length > 2000) throw Error("Summary/description too long");
		for (const k of ["salaryType", "eligibility", "notes", "parentLinkedInPostId", "requisitionId"])
			assertNullString(job[k], k, 1000);
		for (const k of ["salaryMinUsd", "salaryMaxUsd"]) {
			if (job[k] !== null && (typeof job[k] !== "number" || !Number.isInteger(job[k]) || job[k] < 0))
				throw Error(`Invalid ${k}`);
		}
		if (
			job.salaryMinUsd !== null &&
			job.salaryMaxUsd !== null &&
			job.salaryMinUsd > job.salaryMaxUsd
		)
			throw Error("salaryMinUsd > salaryMaxUsd");
		assertDay(job.plannedPostDateEt, "plannedPostDateEt");
		assertDay(job.publishedAtEt, "publishedAtEt");
		assertDay(job.sourceReviewedAt, "sourceReviewedAt");
		assertHttps(job.applyUrl, "applyUrl");
		assertHttps(job.linkedinPostUrl, "linkedinPostUrl");
		if (!existsSync(job.logoPath)) throw Error(`Missing job logo: ${job.logoPath}`);
		if (companies) {
			const company = companyById.get(job.companyId);
			if (!company) throw Error(`Unknown companyId ${job.companyId} on ${job.id}`);
			if (company.name !== job.company) throw Error(`Company name mismatch on ${job.id}`);
			if (company.logoPath !== job.logoPath) throw Error(`Logo path mismatch on ${job.id}`);
		}
		if (
			typeof job.addedAt !== "string" ||
			!Number.isFinite(Date.parse(job.addedAt)) ||
			Date.parse(job.addedAt) > Date.now()
		)
			throw Error("Invalid directory-added timestamp");
		if (
			job.lastVerifiedAt !== null &&
			(typeof job.lastVerifiedAt !== "string" ||
				!Number.isFinite(Date.parse(job.lastVerifiedAt)) ||
				Date.parse(job.lastVerifiedAt) > Date.now())
		)
			throw Error("Invalid verification date");
		if (job.status === "active" && job.lastVerifiedAt === null)
			throw Error("Active requires actual verification evidence");
		if (job.status === "active" && Date.now() - Date.parse(job.lastVerifiedAt) > 14 * 86400000)
			throw Error("Active verification expired; mark needs_verification");
		const id = identity(job);
		if (seen.has(id)) throw Error("Duplicate source requisition or application URL");
		seen.add(id);
	}
	return jobs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const companiesPath = "data/companies.json";
	const jobsPath = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? "data/jobs.json";
	const companiesRaw = readFileSync(companiesPath, "utf8");
	const jobsRaw = readFileSync(jobsPath, "utf8");
	const companies = validateCompanies(JSON.parse(companiesRaw));
	const jobs = validate(JSON.parse(jobsRaw), companies);
	if (process.argv.includes("--check-format")) {
		if (companiesRaw !== JSON.stringify(companies, null, 2) + "\n") throw Error("companies.json formatting");
		if (jobsRaw !== JSON.stringify(jobs, null, 2) + "\n") throw Error("jobs.json formatting");
	}
	console.log(JSON.stringify({ companies: companies.length, jobs: jobs.length, valid: true }));
}
