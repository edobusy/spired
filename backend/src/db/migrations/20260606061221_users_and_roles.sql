CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               TEXT NOT NULL UNIQUE,
    email_verified      BOOLEAN NOT NULL DEFAULT false,
    username            TEXT NOT NULL UNIQUE,
    display_name        TEXT NOT NULL,
    password_hash       TEXT NOT NULL,
    bio                 TEXT,
    location            TEXT,
    website             TEXT,
    pronouns            TEXT,
    avatar_url          TEXT,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE roles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL UNIQUE,
    description         TEXT
);

CREATE TABLE user_roles (
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id             UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at         TIMESTAMP NOT NULL DEFAULT NOW(),
    assigned_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, role_id)
);

INSERT INTO roles (name, description) VALUES
    ('admin', 'Full platform access'),
    ('moderator', 'Can approve and reject content submissions'),
    ('trusted_contributor', 'Submissions skip the moderation queue');