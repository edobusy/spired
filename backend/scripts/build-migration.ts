export function buildMigrationFilename(
	date: Date,
	description: string,
): string {
	if (!description || !/^[a-z0-9_]+$/.test(description)) {
		throw new Error(
			`Description should be written in snake_case: all lowercase, underscores replace spaces. Example: Test migration -> test_migration. Received: "${description}"`,
		)
	}

	// toISOString is always UTC, so the stamp is identical no matter which machine
	// generates it. Local getters would order migrations differently per contributor
	const dateString = date.toISOString().replace(/\D/g, "").slice(0, 14)

	const filename = `${dateString}_${description}.sql`

	return filename
}

export function buildMigrationTemplate(
	date: Date,
	description: string,
): string {
	// The guard makes an unwritten migration fail instead of applying as a no-op.
	// migrate.ts records applied files, so a silent no-op would burn the filename
	// and the real SQL written here later would never run
	return `-- ${description}
-- Created: ${date.toISOString()}

DO $$ BEGIN
	RAISE EXCEPTION 'Migration not implemented. Write your SQL above and delete this block.';
END $$;
`
}
