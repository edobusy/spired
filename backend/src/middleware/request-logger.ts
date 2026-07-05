import { createMiddleware } from "hono/factory"
import pino from "pino"

export function requestLogger(logger: pino.Logger) {
	return createMiddleware(async (c, next) => {
		const startTime = performance.now()

		const requestId = crypto.randomUUID()
		const method = c.req.method
		const path = c.req.path

		await next()

		const statusCode = c.res.status
		const responseTime = performance.now() - startTime

		logger.info(
			{ requestId, method, path, statusCode, responseTime },
			"request completed",
		)
	})
}
