import { describe, test, expect, beforeAll, beforeEach } from "vitest"
import { migrate } from "../db/migrate.ts"
import { db } from "../db/client.ts"
import { app } from "../app.ts"
import { resetRateLimiters } from "../middleware/rate-limit.ts"

beforeAll(async () => {
	await migrate()
})

beforeEach(async () => {
	await db`TRUNCATE users CASCADE`
	resetRateLimiters()
})

describe("POST /auth/register", () => {
	test("creates a user and returns 201 with the new user", async () => {
		const payload = {
			email: "user@test.test",
			username: "user",
			display_name: "Test User",
			password: "TestTest1000",
		}

		const res = await app.request("/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		})

		expect(res.status).toBe(201)

		const body = await res.json()

		expect(body.user.password_hash).toBeUndefined()

		expect(body.user.email).toBe(payload.email)
		expect(body.user.username).toBe(payload.username)
	})

	test("returns 400 when the request body is not valid JSON", async () => {
		const res = await app.request("/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "this is not json",
		})

		expect(res.status).toBe(400)
	})

	test("returns 400 when the input is invalid", async () => {
		const payload = {
			email: "user-test-test",
			username: "user",
			display_name: "Test User",
			password: "TestTest1000",
		}

		const res = await app.request("/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		})

		expect(res.status).toBe(400)
	})

	test("returns 409 when the email is already registered", async () => {
		const payload = {
			email: "user@test.test",
			username: "user",
			display_name: "Test User",
			password: "TestTest1000",
		}

		const firstRegistrationRes = await app.request("/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		})

		expect(firstRegistrationRes.status).toBe(201)

		const sameEmailPayload = {
			email: "user@test.test",
			username: "user123",
			display_name: "Test User 123",
			password: "TestTest1020330",
		}

		const secondRegistrationRes = await app.request("/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(sameEmailPayload),
		})

		expect(secondRegistrationRes.status).toBe(409)

		const body = await secondRegistrationRes.json()

		expect(body.error.toLowerCase()).toContain("email")
	})

	test("returns 409 when the username is already taken", async () => {
		const payload = {
			email: "user@test.test",
			username: "user",
			display_name: "Test User",
			password: "TestTest1000",
		}

		const firstRegistrationRes = await app.request("/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		})

		expect(firstRegistrationRes.status).toBe(201)

		const sameUsernamePayload = {
			email: "different@test.test",
			username: "user",
			display_name: "Test User 123",
			password: "TestTest1020330",
		}

		const secondRegistrationRes = await app.request("/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(sameUsernamePayload),
		})

		expect(secondRegistrationRes.status).toBe(409)

		const body = await secondRegistrationRes.json()

		expect(body.error.toLowerCase()).toContain("username")
	})

	test("stores an uppercase-containing email lowercased in the database", async () => {
		const payload = {
			email: "USER@Test.teST",
			username: "user",
			display_name: "Test User",
			password: "TestTest1000",
		}

		const res = await app.request("/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		})

		expect(res.status).toBe(201)

		const body = await res.json()

		expect(body.user.email).toBe("user@test.test")

		// Read the column back rather than trusting the response, so normalising only
		// on the way out would still fail this.
		const [stored] = await db<
			{ email: string }[]
		>`SELECT email FROM users WHERE id = ${body.user.id}`

		expect(stored.email).toBe("user@test.test")
	})

	test("re-uses a soft-deleted user's email successfully", async () => {
		const payload = {
			email: "user@test.test",
			username: "user",
			display_name: "Test User",
			password: "TestTest1000",
		}

		const res = await app.request("/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		})

		expect(res.status).toBe(201)

		const body = await res.json()

		await softDeleteUser(body.user.id)

		const sameEmailPayload = {
			email: "user@test.test",
			username: "user123",
			display_name: "Test User 123",
			password: "TestTest1000",
		}

		const sameEmailRes = await app.request("/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(sameEmailPayload),
		})

		expect(sameEmailRes.status).toBe(201)

		const sameEmailBody = await sameEmailRes.json()

		// A genuinely new account, not the old row revived: soft-delete must leave
		// the original in place.
		expect(sameEmailBody.user.id).not.toBe(body.user.id)
	})

	test("rejects a username differing only in case from an existing, active one", async () => {
		const payload = {
			email: "user@test.test",
			username: "user",
			display_name: "Test User",
			password: "TestTest1000",
		}

		const res = await app.request("/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		})

		expect(res.status).toBe(201)

		const sameUsernamePayload = {
			email: "sameusername@test.test",
			username: "uSeR",
			display_name: "Test User 123",
			password: "TestTest1000",
		}

		const sameUsernameRes = await app.request("/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(sameUsernamePayload),
		})

		expect(sameUsernameRes.status).toBe(409)

		const body = await sameUsernameRes.json()

		expect(body.error.toLowerCase()).toContain("username")
	})

	test("preserves the capitalisation of the username it was given", async () => {
		const payload = {
			email: "user@test.test",
			username: "EdoB",
			display_name: "Test User",
			password: "TestTest1000",
		}

		const res = await app.request("/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		})

		expect(res.status).toBe(201)

		const body = await res.json()

		expect(body.user.username).toBe("EdoB")

		// Guards the decision itself: uniqueness is enforced over lower(username), so
		// nothing may fold the stored value on the way in.
		const [stored] = await db<
			{ username: string }[]
		>`SELECT username FROM users WHERE id = ${body.user.id}`

		expect(stored.username).toBe("EdoB")
	})
})

async function registerTestUser() {
	const registrationPayload = {
		email: "user@test.test",
		username: "user",
		display_name: "Test User",
		password: "TestTest1000",
	}

	const registrationRes = await app.request("/auth/register", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(registrationPayload),
	})

	return registrationRes
}

async function softDeleteUser(id: string) {
	await db`UPDATE users SET deleted_at = NOW() WHERE id = ${id}`
}

describe("POST /auth/login", () => {
	test("returns 200 when credentials are valid, and sends a valid session cookie", async () => {
		await registerTestUser()

		const loginPayload = {
			email: "user@test.test",
			password: "TestTest1000",
		}

		const loginRes = await app.request("/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(loginPayload),
		})

		expect(loginRes.status).toBe(200)

		const setCookie = loginRes.headers.get("set-cookie")
		expect(setCookie).toContain("session=")
		expect(setCookie).toContain("HttpOnly")
	})

	test("returns 401 when the password is wrong", async () => {
		await registerTestUser()

		const loginPayload = {
			email: "user@test.test",
			password: "TestTest99999",
		}

		const loginRes = await app.request("/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(loginPayload),
		})

		expect(loginRes.status).toBe(401)
	})

	test("returns 401 when the email does not match any registered email", async () => {
		await registerTestUser()

		const loginPayload = {
			email: "user101@test.test",
			password: "TestTest1000",
		}

		const loginRes = await app.request("/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(loginPayload),
		})

		expect(loginRes.status).toBe(401)
	})

	test("returns 200 when the email is typed in a different case", async () => {
		await registerTestUser()

		const loginPayload = {
			email: "USER@Test.teST",
			password: "TestTest1000",
		}

		const loginRes = await app.request("/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(loginPayload),
		})

		expect(loginRes.status).toBe(200)
	})

	test("returns 401 for a soft-deleted user given the correct password", async () => {
		const registrationRes = await registerTestUser()

		expect(registrationRes.status).toBe(201)

		const { user } = await registrationRes.json()

		await softDeleteUser(user.id)

		const loginPayload = {
			email: "user@test.test",
			password: "TestTest1000",
		}

		const loginRes = await app.request("/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(loginPayload),
		})

		expect(loginRes.status).toBe(401)
	})

	test("authenticates the live row when a soft-deleted row shares the email", async () => {
		const deletedRes = await registerTestUser()

		expect(deletedRes.status).toBe(201)

		const { user: deletedUser } = await deletedRes.json()

		await softDeleteUser(deletedUser.id)

		const returningPayload = {
			email: "user@test.test",
			username: "user123",
			display_name: "Test User 123",
			// Deliberately not the soft-deleted row's password: a lookup that picks the
			// wrong row must fail rather than pass by coincidence.
			password: "DifferentPass456",
		}

		const returningRes = await app.request("/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(returningPayload),
		})

		expect(returningRes.status).toBe(201)

		const loginRes = await app.request("/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				email: "user@test.test",
				password: "DifferentPass456",
			}),
		})

		expect(loginRes.status).toBe(200)
	})
})

describe("POST /auth/logout", () => {
	test("returns 200, and the session cookie is cleared", async () => {
		const logoutRes = await app.request("/auth/logout", {
			method: "POST",
		})

		expect(logoutRes.status).toBe(200)

		const setCookie = logoutRes.headers.get("set-cookie")
		expect(setCookie).toContain("Max-Age=0")
	})
})

describe("auth rate limiting", () => {
	test("returns 429 after too many failed login attempts", async () => {
		await registerTestUser()

		const wrongPayload = {
			email: "user@test.test",
			password: "WrongPassword999",
		}

		for (let i = 0; i < 10; i++) {
			const res = await app.request("/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(wrongPayload),
			})

			expect(res.status).toBe(401)
		}

		const blockedRes = await app.request("/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(wrongPayload),
		})

		expect(blockedRes.status).toBe(429)
	})

	test("does not count successful logins against the limit", async () => {
		await registerTestUser()

		const correctPayload = {
			email: "user@test.test",
			password: "TestTest1000",
		}

		for (let i = 0; i < 15; i++) {
			const res = await app.request("/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(correctPayload),
			})

			expect(res.status).toBe(200)
		}
	})
})
