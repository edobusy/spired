import postgres from "postgres"
import { config } from "../config.ts"
import { logger } from "../logger.ts"

const connectionString = config.databaseUrl

export const db = postgres(connectionString, {
	onnotice: (notice) => {
		logger.debug({ notice }, "postgres notice")
	},
})
