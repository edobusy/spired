import { describe, test, expect, beforeAll, beforeEach } from "vitest"
import { migrate } from "../db/migrate.ts"
import { db } from "../db/client.ts"
import { app } from "../app.ts"
import { createToken } from "../lib/token.ts"

beforeAll(async () => {
	await migrate()
})

beforeEach(async () => {
	await db`TRUNCATE users CASCADE`
})

describe("requireAuth middleware", () => {
	test("returns 401 when no session cookie is present", async () => {
		const res = await app.request("/me", { method: "GET" })

		expect(res.status).toBe(401)
	})

	test("returns 401 when the session token is invalid", async () => {
		const res = await app.request("/me", {
			method: "GET",
			headers: { Cookie: "session=fake-token" },
		})

		expect(res.status).toBe(401)
	})

	test("returns 200 with the current user when the token is valid", async () => {
		const [user] = await db`
		    INSERT INTO users (email, username, display_name, password_hash)
		    VALUES ('test@test.test', 'testestest', 'Test User', 'test_hash')
		    RETURNING id
	    `

		const jwt = await createToken(user.id)

		const res = await app.request("/me", {
			method: "GET",
			headers: { Cookie: `session=${jwt}` },
		})

		expect(res.status).toBe(200)
		const body = await res.json()

		expect(body.user.id).toBe(user.id)
	})
})
