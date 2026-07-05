import { Hono } from "hono"
import pino from "pino"
import { test, describe, expect, beforeEach } from "vitest"
import { requestLogger } from "./request-logger.ts"
import type { AppEnv } from "../types.ts"

beforeEach(() => {
	lines.length = 0
})

const lines: string[] = []
const captureStream = {
	write: (line: string) => {
		lines.push(line)
	},
}
const logger = pino({}, captureStream)

const testApp = new Hono()
testApp.use(requestLogger(logger))
testApp.get("/", (c) => c.text("ok"))

describe("requestLogger middleware", () => {
	test("writes one JSON line with a requestId field when a request is processed", async () => {
		await testApp.request("/")

		expect(lines).toHaveLength(1)
		const log = JSON.parse(lines[0])
		expect(typeof log.requestId).toBe("string")
	})

	test("logs the request method, path, and response code", async () => {
		await testApp.request("/")

		const log = JSON.parse(lines[0])
		expect(log.method).toBe("GET")
		expect(log.path).toBe("/")
		expect(log.statusCode).toBe(200)
	})

	test("logs the response time in milliseconds", async () => {
		await testApp.request("/")

		const log = JSON.parse(lines[0])
		expect(typeof log.responseTime).toBe("number")
		expect(log.responseTime).toBeGreaterThanOrEqual(0)
	})

	test("attaches a request-scoped child logger to the context, tagged with the requestId", async () => {
		const app = new Hono<AppEnv>()
		app.use(requestLogger(logger))
		app.get("/", (c) => {
			c.get("logger").info("handler message")
			return c.text("ok")
		})

		await app.request("/")

		const messages = lines.map((line) => JSON.parse(line))
		const handlerLine = messages.find((m) => m.msg === "handler message")
		const completionLine = messages.find((m) => m.msg === "request completed")

		expect(handlerLine).toBeDefined()
		expect(handlerLine?.requestId).toBe(completionLine?.requestId)
	})
})
