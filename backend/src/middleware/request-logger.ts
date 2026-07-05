import { createMiddleware } from "hono/factory"
import pino from "pino"
import type { AppEnv } from "../types.ts"

export function requestLogger(logger: pino.Logger) {
	return createMiddleware<AppEnv>(async (c, next) => {
		const startTime = performance.now()

		const requestId = crypto.randomUUID()
		const childLogger = logger.child({ requestId })
		c.set("logger", childLogger)

		const method = c.req.method
		const path = c.req.path

		await next()

		const statusCode = c.res.status
		const responseTime = performance.now() - startTime

		childLogger.info(
			{ method, path, statusCode, responseTime },
			"request completed",
		)
	})
}
