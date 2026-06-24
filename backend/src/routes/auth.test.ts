import { describe, test, expect, beforeAll, beforeEach } from "vitest"
import { migrate } from "../db/migrate.ts"
import { db } from "../db/client.ts"
import { app } from "../app.ts"

beforeAll(async () => {
	await migrate()
})

beforeEach(async () => {
	await db`TRUNCATE users CASCADE`
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
