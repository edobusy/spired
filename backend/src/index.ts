import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { migrate } from "./db/migrate.ts"
import { config } from "./config.ts"

const app = new Hono()

app.get("/health", (c) => c.text("ok"))

await migrate()

console.log("Migrations complete")

serve({ fetch: app.fetch, port: config.port })
console.log(`Listening on :${config.port}`)
