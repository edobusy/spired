import { test, describe, expect } from "vitest"
import { app } from "./app.ts"

describe("GET /health", () => {
	test("returns 200 with a status of ok", async () => {
		const res = await app.request("/health")

		expect(res.status).toBe(200)

		const data = await res.json()
		expect(data).toEqual({ status: "ok" })
	})
})

describe("security headers", () => {
	test("are properly set and sent as part of the response of any request", async () => {
		const res = await app.request("/health")

		expect(res.headers.get("content-security-policy")).toBe(
			"default-src 'none'; frame-ancestors 'none'",
		)
	})
})
