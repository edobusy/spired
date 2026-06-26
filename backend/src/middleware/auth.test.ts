import { describe, test, expect, beforeAll, beforeEach } from "vitest"
import { migrate } from "../db/migrate.ts"
import { db } from "../db/client.ts"
import { app } from "../app.ts"
import { createToken } from "../lib/token.ts"
import { Hono } from "hono"
import { requireAuth, requireRole } from "./auth.ts"

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

const testEndpoint = new Hono()

testEndpoint.get(
	"/moderator-only",
	requireAuth,
	requireRole("moderator"),
	(c) => {
		return c.json({ ok: true }, 200)
	},
)

describe("requireRole middleware", () => {
	test("returns 200 when the user has the necessary role to use the endpoint", async () => {
		const [user] = await db`
			INSERT INTO users (email, username, display_name, password_hash)
			VALUES ('test@test.test', 'testestest', 'Test User', 'test_hash')
			RETURNING id
		`

		const jwt = await createToken(user.id)

		await db`
			INSERT INTO user_roles (user_id, role_id) 
			VALUES (${user.id}, (SELECT id FROM roles WHERE name = 'moderator'))
		`

		const res = await testEndpoint.request("/moderator-only", {
			method: "GET",
			headers: { Cookie: `session=${jwt}` },
		})

		expect(res.status).toBe(200)
	})

	test("returns 403 when the user lacks the necessary role to use the endpoint", async () => {
		const [user] = await db`
			INSERT INTO users (email, username, display_name, password_hash)
			VALUES ('test@test.test', 'testestest', 'Test User', 'test_hash')
			RETURNING id
		`

		const jwt = await createToken(user.id)

		const res = await testEndpoint.request("/moderator-only", {
			method: "GET",
			headers: { Cookie: `session=${jwt}` },
		})

		expect(res.status).toBe(403)
	})

	test("returns 403 when the user has a different role but not the required one", async () => {
		const [user] = await db`
			INSERT INTO users (email, username, display_name, password_hash)
			VALUES ('test@test.test', 'testestest', 'Test User', 'test_hash')
			RETURNING id
		`

		const jwt = await createToken(user.id)

		await db`
			INSERT INTO user_roles (user_id, role_id) 
			VALUES (${user.id}, (SELECT id FROM roles WHERE name = 'trusted_contributor'))
		`

		const res = await testEndpoint.request("/moderator-only", {
			method: "GET",
			headers: { Cookie: `session=${jwt}` },
		})

		expect(res.status).toBe(403)
	})
})
