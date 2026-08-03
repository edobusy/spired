import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
	buildMigrationFilename,
	buildMigrationTemplate,
} from "./build-migration.ts"

const migrationsDir = join(import.meta.dirname, "..", "src", "db", "migrations")

try {
	const description = process.argv[2]
	const createdAt = new Date()

	// buildMigrationFilename owns the snake_case rule, so it has to run first:
	// a bad description must abort before anything touches the filesystem
	const filename = buildMigrationFilename(createdAt, description)
	const contents = buildMigrationTemplate(createdAt, description)

	const path = join(migrationsDir, filename)

	// wx fails when the file already exists, so an existing migration can never
	// be silently overwritten by a second run
	await writeFile(path, contents, { flag: "wx" })

	console.log(path)
} catch (error) {
	console.error(error instanceof Error ? error.message : error)
	process.exit(1)
}
