import { sign, verify } from "hono/jwt"
import { config } from "../config.ts"

const EXPIRY_DAYS = 30

export function createToken(userId: string): Promise<string> {
	const expirySeconds =
		Math.floor(Date.now() / 1000) + EXPIRY_DAYS * 24 * 60 * 60
	return sign({ sub: userId, exp: expirySeconds }, config.jwtSecret)
}

export async function verifyToken(token: string): Promise<string | null> {
	try {
		const payload = await verify(token, config.jwtSecret, "HS256")
		const userId = payload.sub
		if (!userId || typeof userId !== "string") {
			return null
		}

		return userId
	} catch {
		return null
	}
}
