import { serve } from "@hono/node-server"
import { app } from "./app.ts"
import { migrate } from "./db/migrate.ts"
import { config } from "./config.ts"

await migrate()

console.log("Migrations complete")

serve({ fetch: app.fetch, port: config.port })
console.log(`Listening on :${config.port}`)
