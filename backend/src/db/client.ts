import postgres from "postgres"
import { config } from "../config.ts"

const connectionString = config.databaseUrl

export const db = postgres(connectionString)
