function requireEnv(name: string): string {
	const value = process.env[name]
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`)
	}
	return value
}

export const config = {
	databaseUrl: requireEnv("DATABASE_URL"),
	jwtSecret: requireEnv("JWT_SECRET"),
	corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
	port: Number(process.env.PORT) || 4000,
	isProduction: process.env.NODE_ENV === "production",
	logLevel: process.env.LOG_LEVEL ?? "info",
}
