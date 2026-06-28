import type { Context } from "hono"
import { rateLimiter, MemoryStore } from "hono-rate-limiter"
import { getConnInfo } from "@hono/node-server/conninfo"
import { config } from "../config.ts"

const clientIp = (c: Context): string => {
	if (config.isProduction) {
		// Behind Railway's proxy the socket IP is the proxy's; trust the forwarded header it sets.
		// TODO(deploy): confirm which X-Forwarded-For entry Railway makes trustworthy.
		return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? ""
	}
	// getConnInfo throws when the Node bindings are absent (e.g. app.request() in tests);
	// "" fails closed into one shared bucket rather than crashing the request.
	try {
		return getConnInfo(c).remote.address ?? ""
	} catch {
		return ""
	}
}

// Separate stores so counts never mix and the double-count check stays quiet; the
// references let tests reset state between cases.
const loginStore = new MemoryStore()
const registerStore = new MemoryStore()

// skipSuccessfulRequests: only failed logins count, so a real user never burns their budget.
export const loginLimiter = rateLimiter({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	keyGenerator: clientIp,
	standardHeaders: "draft-7",
	skipSuccessfulRequests: true,
	store: loginStore,
})

export const registerLimiter = rateLimiter({
	windowMs: 60 * 60 * 1000,
	limit: 5,
	keyGenerator: clientIp,
	standardHeaders: "draft-7",
	store: registerStore,
})

export const resetRateLimiters = (): void => {
	loginStore.resetAll()
	registerStore.resetAll()
}
