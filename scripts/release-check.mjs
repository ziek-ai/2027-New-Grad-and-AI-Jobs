import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { validate, validateCompanies } from "./validate.mjs";

const companies = validateCompanies(JSON.parse(readFileSync("data/companies.json", "utf8")));
const jobs = validate(JSON.parse(readFileSync("data/jobs.json", "utf8")), companies);
if (!jobs.length) throw Error("Refusing empty public release");
if (jobs.some((job) => ["internship", "co_op"].includes(job.careerLevel)))
	throw Error("Release contains internship/co-op rows");

const banned = [".env", ".env.local", "evaluation", "editorial", "node_modules", "candidate", "resume", "credentials"];
const textExt = new Set([".md", ".json", ".mjs", ".js", ".yml", ".yaml", ".txt", ".svg", ".css", ".html"]);

function scan(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === ".git") continue;
		if (banned.includes(entry.name.toLowerCase())) throw Error("Private artifact: " + entry.name);
		const path = resolve(dir, entry.name);
		if (entry.isSymbolicLink()) throw Error("Symlink forbidden");
		if (entry.isDirectory()) {
			scan(path);
			continue;
		}
		const ext = extname(entry.name).toLowerCase();
		if (!textExt.has(ext) && !entry.name.startsWith(".")) continue;
		if (statSync(path).size > 2_000_000) continue;
		const text = readFileSync(path, "utf8");
		if (
			/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@|eyJhbGciOi[A-Za-z0-9_.-]{60,}/.test(
				text,
			)
		)
			throw Error("Potential credential in " + path);
	}
}

scan(process.cwd());
console.log(
	JSON.stringify({
		jobs: jobs.length,
		companies: companies.length,
		secretsScan: "passed",
		internships: 0,
		schema: "jobs-db-v2",
	}),
);
