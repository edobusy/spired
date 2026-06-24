import { createMiddleware } from "hono/factory"
import { getCookie } from "hono/cookie"
import { verifyToken } from "../lib/token.ts"

export const requireAuth = createMiddleware<{ Variables: { userId: string } }>(
	async (c, next) => {
		const token = getCookie(c, "session")

		if (!token) {
			return c.json({ error: "Unauthorized" }, 401)
		}

		const userId = await verifyToken(token)

		if (!userId) {
			return c.json({ error: "Unauthorized" }, 401)
		}

		c.set("userId", userId)

		await next()
	},
)
