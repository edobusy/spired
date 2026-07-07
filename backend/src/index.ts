import { serve } from "@hono/node-server"
import { app } from "./app.ts"
import { migrate } from "./db/migrate.ts"
import { config } from "./config.ts"
import { logger } from "./logger.ts"

await migrate()

logger.info("migrations complete")

serve({ fetch: app.fetch, port: config.port })
logger.info({ port: config.port }, "server listening")
