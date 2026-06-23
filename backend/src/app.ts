import { Hono } from "hono"
import { authRouter } from "./routes/auth.ts"

export const app = new Hono()

app.get("/health", (c) => c.json({ status: "ok" }))

app.route("/auth", authRouter)
