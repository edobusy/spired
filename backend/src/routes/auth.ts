import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { deleteCookie, setCookie } from "hono/cookie"
import { z } from "zod"
import postgres from "postgres"
import { db } from "../db/client.ts"
import { hashPassword, verifyPassword } from "../lib/hash.ts"
import { createToken } from "../lib/token.ts"
import { config } from "../config.ts"
import { loginLimiter, registerLimiter } from "../middleware/rate-limit.ts"

function validateBody<T extends z.ZodType>(schema: T) {
	const validator = zValidator("json", schema, (result, c) => {
		if (!result.success) {
			return c.json({ error: "Invalid input" }, 400)
		}
	})

	return validator
}

export const authRouter = new Hono()

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

authRouter.post(
	"/register",
	registerLimiter,
	validateBody(registerSchema),
	async (c) => {
		const { email, username, display_name, password } = c.req.valid("json")

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
	},
)

const loginSchema = z.object({
	email: z.email(),
	password: z.string().min(1),
})

authRouter.post(
	"/login",
	loginLimiter,
	validateBody(loginSchema),
	async (c) => {
		const { email, password } = c.req.valid("json")

		const [user] = await db<
			{ id: string; password_hash: string }[]
		>`SELECT id, password_hash FROM users WHERE email = ${email}`

		if (!user) {
			return c.json({ error: "Invalid credentials" }, 401)
		}

		const passwordMatch = await verifyPassword(password, user.password_hash)

		if (!passwordMatch) {
			return c.json({ error: "Invalid credentials" }, 401)
		}

		const jwt = await createToken(user.id)

		setCookie(c, "session", jwt, {
			httpOnly: true,
			secure: config.isProduction,
			sameSite: "Lax",
			maxAge: 60 * 60 * 24 * 30,
			path: "/",
		})

		return c.json({ ok: true }, 200)
	},
)

authRouter.post("/logout", async (c) => {
	deleteCookie(c, "session", { path: "/" })

	return c.json({ ok: true }, 200)
})
