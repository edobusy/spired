import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		fileParallelism: false,
		// The rate-limiting cases perform a dozen or more bcrypt operations at cost 12,
		// which exceeds the 5s default on slower machines. Do not lower without making
		// the hashing cost configurable per environment first.
		testTimeout: 30000,
		env: {
			DATABASE_URL: "postgres://spired:spired@localhost:5433/spired_test",
			DATABASE_TEST_URL: "postgres://spired:spired@localhost:5433/spired_test",
			JWT_SECRET: "test-secret-not-used-in-production",
			CORS_ORIGIN: "http://localhost:3000",
			LOG_LEVEL: "silent",
		},
	},
})
