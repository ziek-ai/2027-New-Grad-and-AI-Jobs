import { readFileSync } from "node:fs";
import { validate } from "./validate.mjs";
// Fixed maintained hosts avoid contributor-controlled network targets or arbitrary redirect fetches.
const hosts = new Set([
	"jobs.ashbyhq.com",
	"job-boards.greenhouse.io",
	"job-boards.eu.greenhouse.io",
	"boards.greenhouse.io",
	"jobs.lever.co",
	"careers.smartrecruiters.com",
]);
const jobs = validate(JSON.parse(readFileSync("data/jobs.json", "utf8")));
const results = [];
for (const job of jobs) {
	const url = new URL(job.applyUrl);
	if (!hosts.has(url.hostname) || url.port) {
		results.push({ applyUrl: job.applyUrl, state: "unknown", reason: "host_requires_maintainer_review" });
		continue;
	}
	try {
		const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10000) });
		await r.body?.cancel();
		results.push({
			applyUrl: job.applyUrl,
			state: [404, 410].includes(r.status) ? "needs_review" : r.ok ? "reachable" : "unknown",
			httpStatus: r.status,
		});
	} catch {
		results.push({ applyUrl: job.applyUrl, state: "unknown", reason: "network_failure" });
	}
}
console.log(
	JSON.stringify(
		{ results, note: "Reachable is not proof of hiring. A failed request never changes status or proves closure." },
		null,
		2,
	),
);
