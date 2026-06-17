import { test, expect, describe } from "vitest"
import { createToken, verifyToken } from "./token.ts"

describe("createToken", () => {
	test("returns a non-empty string", async () => {
		const userId = "user-123"
		const token = await createToken(userId)

		expect(token.length).not.toBe(0)
	})

	test("returns a 3 dot-separated part token", async () => {
		const userId = "user-123"
		const token = await createToken(userId)
		const tokenParts = token.split(".")

		expect(tokenParts.length).toBe(3)
	})
})

describe("verifyToken", () => {
	test("returns 'user-123' from token created for 'user-123'", async () => {
		const userId = "user-123"
		const token = await createToken(userId)

		const verifiedUser = await verifyToken(token)

		expect(verifiedUser).toBe(userId)
	})

	test("returns null for tampered token", async () => {
		const userId = "user-123"
		let token = await createToken(userId)
		token += "tampered"

		const verifiedUser = await verifyToken(token)

		expect(verifiedUser).toBe(null)
	})

	test("returns null for invalid token", async () => {
		const token = "a/a.1sa"

		const verifiedUser = await verifyToken(token)

		expect(verifiedUser).toBe(null)
	})
})
