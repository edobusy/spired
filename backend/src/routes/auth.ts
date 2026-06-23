import { Hono } from "hono"
import { z } from "zod"
import postgres from "postgres"
import { db } from "../db/client.ts"
import { hashPassword } from "../lib/hash.ts"

const registerSchema = z.object({
	email: z.email(),
	username: z
		.string()
		.min(3)
		.max(30)
		.regex(/^[a-zA-Z0-9_]+$/),
	display_name: z.string().min(1).max(50),
	password: z.string().min(10),
})

export const authRouter = new Hono()

authRouter.post("/register", async (c) => {
	let body
	try {
		body = await c.req.json()
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400)
	}

	const parsed = registerSchema.safeParse(body)

	if (!parsed.success) {
		return c.json({ error: "Invalid input" }, 400)
	}

	const { email, username, display_name, password } = parsed.data

	const passwordHash = await hashPassword(password)

	try {
		const [user] = await db`
		    INSERT INTO users (email, username, display_name, password_hash)
		    VALUES (${email}, ${username}, ${display_name}, ${passwordHash})
		    RETURNING id, email, username, display_name, bio, avatar_url, created_at
	    `
		return c.json({ user }, 201)
	} catch (err) {
		// 23505 is the Postgres code for violation of the UNIQUE constraint
		if (err instanceof postgres.PostgresError && err.code === "23505") {
			switch (err.constraint_name) {
				case "users_email_key":
					return c.json({ error: "Email already registered" }, 409)
				case "users_username_key":
					return c.json({ error: "Username already taken" }, 409)
			}
		}

		throw err
	}
})
