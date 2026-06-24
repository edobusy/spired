import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { authRouter } from "./routes/auth.ts"

export const app = new Hono()

app.onError((err, c) => {
	if (err instanceof HTTPException) {
		return c.json({ error: err.message }, err.status)
	}

	console.error(err)
	return c.json({ error: "Internal server error" }, 500)
})

app.get("/health", (c) => c.json({ status: "ok" }))

app.route("/auth", authRouter)
