import { db } from "./client.ts"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { logger } from "../logger.ts"

export async function migrate() {
	await db`CREATE TABLE IF NOT EXISTS schema_migrations (
                filename TEXT PRIMARY KEY,
                applied_at TIMESTAMP NOT NULL DEFAULT NOW()
             )`

	const migrationsDir = join(import.meta.dirname, "migrations")

	const dirContents = await readdir(migrationsDir)

	const migrations = dirContents.filter((f) => f.endsWith(".sql")).sort()

	for (const filename of migrations) {
		const [existing] =
			await db`SELECT filename from schema_migrations WHERE filename = ${filename}`

		if (existing) {
			logger.info({ filename }, "migration already applied")
			continue
		}

		const content = await readFile(join(migrationsDir, filename), "utf-8")

		await db.begin(async (tx) => {
			await tx.unsafe(content)
			await tx`INSERT INTO schema_migrations (filename) VALUES (${filename})`
		})

		logger.info({ filename }, "applied migration")
	}
}
