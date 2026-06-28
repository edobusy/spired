import { createMiddleware } from "hono/factory"
import { getCookie } from "hono/cookie"
import { verifyToken } from "../lib/token.ts"
import { db } from "../db/client.ts"

type AuthEnv = { Variables: { userId: string } }

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
	const token = getCookie(c, "session")

	if (!token) {
		return c.json({ error: "Unauthorized" }, 401)
	}

	const userId = await verifyToken(token)

	if (!userId) {
		return c.json({ error: "Unauthorized" }, 401)
	}

	c.set("userId", userId)

	await next()
})

export const requireRole = (roleName: string) => {
	return createMiddleware<AuthEnv>(async (c, next) => {
		const userId = c.get("userId")

		const [userRole] = await db`
			SELECT role_id
			FROM user_roles
			WHERE user_id = ${userId}
			AND role_id = (SELECT id FROM roles WHERE name = ${roleName})
		`

		if (!userRole) {
			return c.json({ error: "Forbidden" }, 403)
		}

		await next()
	})
}

export const requireOwnership = (
	tableName: string,
	ownerColumn: string = "user_id",
) => {
	return createMiddleware<AuthEnv>(async (c, next) => {
		const rowId = c.req.param("id")

		if (!rowId) {
			return c.json({ error: "Not Found" }, 404)
		}

		// Once we implement nested paths, let's parameterize id as well, as we will have to give multiple unique names
		// Example: /resource/:resourceId/component/:componentId
		// It cannot be: /resource/:id/component/:id
		const [resource] = await db`
			SELECT ${db(ownerColumn)} 
			FROM ${db(tableName)}
			WHERE id = ${rowId}
		`

		if (!resource) {
			return c.json({ error: "Not Found" }, 404)
		}

		if (resource[ownerColumn] !== c.get("userId")) {
			return c.json({ error: "Forbidden" }, 403)
		}

		await next()
	})
}
