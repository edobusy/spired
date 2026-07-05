import type { Logger } from "pino"

export type AppEnv = {
	Variables: {
		logger: Logger
	}
}
