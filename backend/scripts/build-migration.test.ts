import { describe, test, expect } from "vitest"
import {
	buildMigrationFilename,
	buildMigrationTemplate,
} from "./build-migration.ts"

describe("buildMigrationFilename", () => {
	test("correctly sets up filename based on given date and provided migration description", () => {
		const date = new Date("2026-06-07T09:02:01+10:00")

		expect(buildMigrationFilename(date, "test_migration")).toBe(
			"20260606230201_test_migration.sql",
		)
	})

	test("throws when the description does not follow the convention", () => {
		const date = new Date("2026-06-07T09:02:01+10:00")

		expect(() => buildMigrationFilename(date, "Add soft delete")).toThrow()
	})

	test("throws when the description is missing or empty", () => {
		const date = new Date("2026-06-07T09:02:01+10:00")

		expect(() =>
			buildMigrationFilename(date, undefined as unknown as string),
		).toThrow()
		expect(() => buildMigrationFilename(date, "")).toThrow()
	})
})

describe("buildMigrationTemplate", () => {
	test("includes the description, the creation timestamp and the unimplemented guard", () => {
		const date = new Date("2026-06-07T09:02:01+10:00")

		const template = buildMigrationTemplate(date, "test_migration")

		expect(template).toContain("test_migration")
		expect(template).toContain(date.toISOString())
		expect(template).toContain("RAISE EXCEPTION")
	})
})
