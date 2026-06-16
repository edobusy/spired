import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		env: {
			DATABASE_URL: "postgres://spired:spired@localhost:5433/spired_test",
			DATABASE_TEST_URL: "postgres://spired:spired@localhost:5433/spired_test",
			JWT_SECRET: "test-secret-not-used-in-production",
			CORS_ORIGIN: "http://localhost:3000",
		},
	},
})
