import { migrate } from "./db/migrate.ts"

await migrate()

console.log("Migrations complete")
