# Database Schema

The full data model for Spired!. This is the complete designed schema. For which tables have migrations written so far, see [STATUS.md](../STATUS.md).

Primary keys are UUIDs unless noted. Timestamps are stored with time zone.

## Cascade behaviour

Defined once here to avoid repeating it per table.

| When this row is deleted | These rows are also deleted (CASCADE) |
|---|---|
| `users` row | `user_roles`, `user_items`, `log_entries`, `reviews`, `follows` (both directions), `lists` (and their `list_tiers` and `list_items`), `activity_events` where actor |
| `users` row | `content_items.submitted_by` set to NULL (content survives) |
| `users` row | `content_items.actioned_by` set to NULL (moderation record survives) |
| `users` row | `user_roles.assigned_by` set to NULL (assignment survives) |
| `content_items` row | Its extension table row, `content_item_relations` (both directions), `user_items`, `log_entries`, `reviews`, `list_items`, `activity_events` where `content_item_id` matches |
| `lists` row | `list_tiers`, `list_items` |
| `list_tiers` row | `list_items` where `tier_id` matches |
| `roles` row | `user_roles` |

> Note: users, content, and reviews will move to soft-delete (`deleted_at`) rather than hard cascade. See the decision log for why. The cascade rules above describe the current design for the tables that keep it.

## Users

One row per registered account.

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key, auto-generated |
| email | Text | Unique, used to log in, not shown publicly |
| email_verified | Boolean | Default false. True once the user clicks the confirmation email. |
| username | Text | Unique URL handle (e.g. spired.com/edob). Set at registration, never changed. |
| display_name | Text | Shown on the profile, can be changed |
| password_hash | Text | Password stored in hashed form, never plain text |
| bio | Text | Optional profile description |
| location | Text | Optional free text |
| website | Text | Optional link |
| pronouns | Text | Optional short text |
| avatar_url | Text | Optional link to profile picture (Cloudflare R2) |
| created_at | Timestamp | When the account was created |
| updated_at | Timestamp | When the profile was last modified |

## Roles

Every permission role that exists on the platform. New roles can be added here without touching anything else.

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key, auto-generated |
| name | Text | Unique role identifier, e.g. `admin`, `moderator`, `trusted_contributor` |
| description | Text | Optional description of what the role allows |

**Seed roles:**

| Name | Description |
|---|---|
| `admin` | Full platform access |
| `moderator` | Can approve and reject content submissions |
| `trusted_contributor` | Submissions skip the moderation queue |

## User Roles

Links users to roles. A user can have zero, one, or many roles at once.

| Column | Type | Notes |
|---|---|---|
| user_id | UUID | Foreign key to Users |
| role_id | UUID | Foreign key to Roles |
| assigned_at | Timestamp | When the role was granted |
| assigned_by | UUID | Nullable. Foreign key to Users (the admin who granted it). Null for system-assigned roles. |

Primary key: `(user_id, role_id)`. A user cannot hold the same role twice.

## Content Items

The core catalogue. Every game, supplement, adventure, actual play, and tool is a row here. Shared fields live in `content_items`. Category-specific fields live in their own extension table, linked back by `content_item_id`.

### content_items (shared across all five types)

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key, auto-generated |
| category | Enum | `game`, `supplement`, `adventure`, `actual_play`, `tool` |
| title | Text | The name of the item |
| description | Text | Optional summary |
| cover_image_url | Text | Optional cover art (Cloudflare R2) |
| submitted_by | UUID | Nullable. Foreign key to Users. Set to NULL if the submitting user is deleted. |
| approval_status | Enum | `pending`, `approved`, `rejected`. Default `pending`. |
| actioned_by | UUID | Nullable. Foreign key to Users (the moderator who approved or rejected it). Set to NULL if that user is deleted. |
| actioned_at | Timestamp | Nullable. When the submission was approved or rejected. |
| rejection_reason | Text | Nullable. Populated when approval_status is rejected. |
| search_vector | tsvector | Generated column: `to_tsvector('english', title \|\| ' ' \|\| coalesce(description, ''))`. Indexed with GIN for full-text search. |
| created_at | Timestamp | When the entry was submitted |
| updated_at | Timestamp | When the entry was last edited |

### games

| Column | Type | Notes |
|---|---|---|
| content_item_id | UUID | Primary key, foreign key to content_items |
| publisher | Text | Optional |
| published_year | Integer | Optional |
| edition | Text | Optional, e.g. "5th Edition" |
| external_url | Text | Optional. The official or publisher page — informational, not a store link. |

### supplements

| Column | Type | Notes |
|---|---|---|
| content_item_id | UUID | Primary key, foreign key to content_items |
| publisher | Text | Optional |
| published_year | Integer | Optional |
| external_url | Text | Optional |

### adventures

| Column | Type | Notes |
|---|---|---|
| content_item_id | UUID | Primary key, foreign key to content_items |
| publisher | Text | Optional |
| published_year | Integer | Optional |
| external_url | Text | Optional |
| adventure_type | Enum | Optional: `one_shot`, `campaign`, `mini_campaign` |

### actual_plays

| Column | Type | Notes |
|---|---|---|
| content_item_id | UUID | Primary key, foreign key to content_items |
| format | Enum | `podcast`, `youtube`, `twitch`, `live_show` |
| channel_url | Text | Optional link to the channel or feed |
| status | Enum | `ongoing`, `completed`, `hiatus`. The production status of the show, not the user's engagement status. |

### tools

| Column | Type | Notes |
|---|---|---|
| content_item_id | UUID | Primary key, foreign key to content_items |
| tool_type | Enum | `vtt`, `character_builder`, `map_maker`, `dice_roller`, `generator`, `other` |
| external_url | Text | Optional. The official or publisher page — informational, not a store link. |

### tool_platforms

A tool can be available on multiple platforms. One row per (tool, platform) pair.

| Column | Type | Notes |
|---|---|---|
| tool_id | UUID | Foreign key to tools (content_item_id) |
| platform | Enum | `browser`, `ios`, `android`, `desktop` |

Primary key: `(tool_id, platform)`

### content_item_relations

Links any content item to another it belongs to, runs on, or expands. A content item with no rows here is standalone or system-agnostic. The child is always the more specific or dependent item. The parent is always the broader, foundational item.

| Column | Type | Notes |
|---|---|---|
| child_id | UUID | Foreign key to content_items (the dependent item) |
| parent_id | UUID | Foreign key to content_items (the foundational item) |
| relation_type | Enum | What kind of relationship it is |

**Relation types:**

| Value | Meaning |
|---|---|
| `system` | The parent is the ruleset the child is built for |
| `setting` | The parent is the world or lore the child takes place in |
| `expansion` | The parent is a specific work the child directly builds upon |

Primary key: `(child_id, parent_id, relation_type)`

Check constraint: `child_id != parent_id`. An item cannot be its own parent.

## User Items

One row per user per content item. Tracks the user's standing relationship with an item: their status and ownership. Exists independently of whether the user has written a review or a log entry.

| Column | Type | Notes |
|---|---|---|
| user_id | UUID | Foreign key to Users |
| content_item_id | UUID | Foreign key to content_items |
| status | Enum | Nullable: `played`, `playing`, `want_to_play`, `abandoned`. Null when a user marks ownership without a play status. |
| is_owned | Boolean | Whether the user owns it. Default false. |
| created_at | Timestamp | When the item was added to the library |
| updated_at | Timestamp | When status or ownership last changed |

Primary key: `(user_id, content_item_id)`

Check constraint: `status IS NOT NULL OR is_owned = TRUE`. A row must carry at least one piece of meaningful data.

**Status labels by content category** (a frontend concern, not the schema):

| Status | Games / Supplements / Adventures | Actual Plays | Tools |
|---|---|---|---|
| `played` | Played / Read / Run | Watched | Used |
| `playing` | Playing / Reading / Running | Watching | Using |
| `want_to_play` | Want to Play / Read / Run | Want to Watch | Want to Try |
| `abandoned` | Abandoned | Abandoned | Abandoned |

## Log Entries

A session diary. Many rows per user per content item. Records individual instances of play, reading, or viewing.

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to Users |
| content_item_id | UUID | Foreign key to content_items |
| played_on | Date | Required. The date of the session. Defaults to submission date if not given. |
| rating | Smallint | Optional, 1 to 10 spires |
| notes | Text | Optional session notes |
| visibility | Enum | `private`, `public`. Default `private`. |
| is_repeat | Boolean | Default false. True if a rerun, rewatch, or replay. |
| created_at | Timestamp | When the entry was submitted |

Check constraint: `rating IS NOT NULL OR notes IS NOT NULL`. A log entry cannot be empty.

Check constraint: `rating >= 1 AND rating <= 10`

**Current rating derivation:** the most recent log entry (ordered by `played_on DESC, created_at DESC`) where `rating IS NOT NULL`. Overridden by the review rating if a rated review exists (see Reviews).

## Reviews

A user's published written take on a content item. Distinct from a log entry, and not tied to a specific session. Multiple reviews per user per item are allowed, since a user may revisit their opinion after years of play.

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to Users |
| content_item_id | UUID | Foreign key to content_items |
| rating | Smallint | Optional, 1 to 10 spires |
| body | Text | Required, the review text |
| contains_spoilers | Boolean | Default false |
| visibility | Enum | `public`, `private`. Default `public`. |
| created_at | Timestamp | |
| updated_at | Timestamp | |

Check constraint: `rating >= 1 AND rating <= 10`

**Canonical rating precedence.** A user's current rating for a content item is:

1. The rating from their most recent review (by `created_at`) where `rating IS NOT NULL`.
2. If no review carries a rating, the most recent log entry rating (by `played_on DESC, created_at DESC`) where `rating IS NOT NULL`.

## Follows

The social graph. One-way follows, no mutual acceptance required. Profiles are always public.

| Column | Type | Notes |
|---|---|---|
| follower_id | UUID | Foreign key to Users, the user doing the following |
| followed_id | UUID | Foreign key to Users, the user being followed |
| created_at | Timestamp | |

Primary key: `(follower_id, followed_id)`

Check constraint: `follower_id != followed_id`. Self-follows are not permitted.

Indexes: on `follower_id` (who am I following?) and on `followed_id` (who follows me?).

## Lists

A curated collection of content items, created by a user. Two types: ranked (strict order) and tier (items grouped into named buckets).

### lists

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to Users |
| title | Text | Required |
| description | Text | Optional |
| list_type | Enum | `ranked`, `tier` |
| visibility | Enum | `public`, `private` |
| created_at | Timestamp | |
| updated_at | Timestamp | |

### list_tiers

Populated only for tier lists. Each row defines one tier bucket.

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| list_id | UUID | Foreign key to lists |
| name | Text | The tier label: "S", "A", "Must Play", etc. |
| color | Text | Optional hex colour |
| position | Integer | Top-to-bottom display order, step of 1000 |

Unique constraint: `(list_id, name)`. No duplicate tier names within a list.

Unique constraint: `(list_id, position)`. No two tiers share a position within a list.

### list_items

The content items within a list.

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| list_id | UUID | Foreign key to lists |
| content_item_id | UUID | Foreign key to content_items |
| tier_id | UUID | Nullable. Foreign key to list_tiers, populated for tier lists, null for ranked lists. The referenced tier must belong to the same list. |
| position | Integer | For ranked lists: overall rank. For tier lists: order within the tier. Step of 1000. |
| notes | Text | Optional note about this item's place in the list |
| added_at | Timestamp | |

Unique constraint: `(list_id, content_item_id)`. An item cannot appear in the same list twice.

## Activity Events

A log of platform activity that powers the activity feed. Fan-out on read, with no pre-computed per-user feed tables: a user's feed is a query over this table filtered by their follows. Only public-facing actions generate a row. Private log entries and private reviews do not emit events.

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| actor_id | UUID | Foreign key to Users, who performed the action |
| event_type | Enum | `logged`, `reviewed`, `status_changed`, `list_created`, `followed` |
| subject_type | Text | The type of subject: `log_entry`, `review`, `user_item`, `list`, `user` |
| subject_id | UUID | The id of the subject record |
| content_item_id | UUID | Nullable. Foreign key to content_items, populated for content-related events (logged, reviewed, status_changed), null for list_created and followed. Lets the feed join directly to content_items without chaining through the subject. |
| created_at | Timestamp | |

Index on `(actor_id, created_at DESC)` for feed queries.

**Feed query:**

```sql
SELECT ae.*, ci.title AS content_title, ci.cover_image_url
FROM activity_events ae
JOIN follows f ON f.followed_id = ae.actor_id
LEFT JOIN content_items ci ON ci.id = ae.content_item_id
WHERE f.follower_id = :current_user_id
ORDER BY ae.created_at DESC
LIMIT 20
```
