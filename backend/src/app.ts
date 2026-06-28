import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { authRouter } from "./routes/auth.ts"
import { requireAuth } from "./middleware/auth.ts"
import { db } from "./db/client.ts"
import { secureHeaders } from "hono/secure-headers"

export const app = new Hono()

app.use(
	"*",
	secureHeaders({
		contentSecurityPolicy: {
			defaultSrc: ["'none'"],
			frameAncestors: ["'none'"],
		},
	}),
)

app.onError((err, c) => {
	if (err instanceof HTTPException) {
		return c.json({ error: err.message }, err.status)
	}

	console.error(err)
	return c.json({ error: "Internal server error" }, 500)
})

app.get("/health", (c) => c.json({ status: "ok" }))

app.get("/me", requireAuth, async (c) => {
	const userId = c.get("userId")
	const [user] =
		await db`SELECT id, email, username, display_name, bio, avatar_url, created_at FROM users WHERE id = ${userId}`

	if (!user) {
		return c.json({ error: "User not found" }, 404)
	}

	return c.json({ user })
})

app.route("/auth", authRouter)
