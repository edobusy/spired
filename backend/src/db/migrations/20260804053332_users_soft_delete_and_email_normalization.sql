-- users_soft_delete_and_email_normalization
-- Created: 2026-08-04T05:33:32.251Z

UPDATE users SET email = lower(email) WHERE email <> lower(email);

ALTER TABLE users ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email));

ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;

ALTER TABLE users ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE users ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE user_roles ALTER COLUMN assigned_at TYPE TIMESTAMPTZ USING assigned_at AT TIME ZONE 'UTC';

ALTER TABLE schema_migrations ALTER COLUMN applied_at TYPE TIMESTAMPTZ USING applied_at AT TIME ZONE 'UTC';

ALTER TABLE users DROP CONSTRAINT users_email_key;

ALTER TABLE users DROP CONSTRAINT users_username_key;

CREATE UNIQUE INDEX users_email_unique
	ON users (email)
	WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX users_username_lower_unique
	ON users (lower(username))
	WHERE deleted_at IS NULL;