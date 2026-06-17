import { describe, test, expect } from "vitest"
import { hashPassword, verifyPassword } from "./hash.ts"

describe("hashPassword", () => {
	test("transforms plain password into hash", async () => {
		const pwd = "password123"
		const hash = await hashPassword(pwd)

		expect(hash).not.toBe(pwd)
	})

	test("produces two different hashes from the same password input", async () => {
		const pwd = "password123"
		const hash1 = await hashPassword(pwd)
		const hash2 = await hashPassword(pwd)

		expect(hash1).not.toBe(hash2)
	})

	test("produces hashes that start with '$2b$' (bcrypt)", async () => {
		const pwd = "password123"
		const hash = await hashPassword(pwd)

		expect(hash.startsWith("$2b$")).toBe(true)
	})
})

describe("verifyPassword", () => {
	test("returns true when the hash produced for 'mypassword' matches the input hash", async () => {
		const pwd = "mypassword"
		const hash = await hashPassword(pwd)

		const verification = await verifyPassword(pwd, hash)

		expect(verification).toBe(true)
	})

	test("returns false when the input password is 'wrongpassword', but the stored hash is for 'mypassword'", async () => {
		const storedPwd = "mypassword"
		const hash = await hashPassword(storedPwd)

		const pwd = "wrongpassword"

		const verification = await verifyPassword(pwd, hash)

		expect(verification).toBe(false)
	})
})
