import assert from "node:assert/strict";
import { test } from "node:test";
import { identity, validate } from "./validate.mjs";

const job = {
	id: "J900",
	companyId: "C900",
	company: "Fictional Co",
	role: "New Grad Software Engineer",
	category: "SWE",
	careerLevel: "new_grad",
	location: "Example City",
	workplace: "unknown",
	salaryMinUsd: 120000,
	salaryMaxUsd: 140000,
	salaryType: "Published base range",
	eligibility: "Class of 2027",
	summary: "Build product features.",
	description: "New grad software engineer building product features at Fictional Co.",
	applyUrl: "https://jobs.ashbyhq.com/example/one",
	plannedPostDateEt: "2026-11-26",
	publishStatus: "planned",
	publishedAtEt: null,
	linkedinPostUrl: null,
	sourceReviewedAt: "2026-11-26",
	logoPath: "logos/whatnot.svg",
	notes: null,
	parentLinkedInPostId: null,
	provider: "ashby",
	requisitionId: "ashby:one",
	status: "needs_verification",
	addedAt: "2026-11-24T00:00:00.000Z",
	lastVerifiedAt: null,
};

test("separate requisitions with identical titles remain separate", () =>
	assert.equal(
		validate([
			job,
			{
				...job,
				id: "J901",
				requisitionId: "ashby:two",
				applyUrl: "https://jobs.ashbyhq.com/example/two",
			},
		]).length,
		2,
	));

test("duplicate exact requisitions fail", () =>
	assert.throws(() => validate([job, { ...job, id: "J902", role: "Renamed role" }]), /Duplicate/));

test("internships are rejected", () =>
	assert.throws(
		() => validate([{ ...job, careerLevel: "internship", role: "Software Engineer Intern" }]), /Internships/),
);

test("internship in title is rejected even if level is new_grad", () =>
	assert.throws(() => validate([{ ...job, role: "Software Engineering Intern" }]), /Internships/),
);

test("unknown verification cannot become active", () =>
	assert.throws(() => validate([{ ...job, status: "active" }]), /verification/));

test("active source URL cannot be javascript", () =>
	assert.throws(() => validate([{ ...job, applyUrl: "javascript:alert(1)" }]), /HTTPS|Invalid URL/));

test("identity strips utm params", () =>
	assert.equal(
		identity({
			...job,
			applyUrl: "https://jobs.ashbyhq.com/example/one?utm_source=x",
			requisitionId: null,
		}),
		"https://jobs.ashbyhq.com/example/one",
	));

test("non-US locations are rejected", () =>
	assert.throws(() => validate([{ ...job, location: "London" }]), /Non-US/),
);
test("early_career is rejected", () =>
	assert.throws(() => validate([{ ...job, careerLevel: "early_career", role: "Early Career Engineer" }]), /new_grad/),
);
