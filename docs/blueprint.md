# Auto File Search Bot — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot that indexes and searches files from public/private chats added by admins. Users can search files with filters, preview results, and download files. Admins manage chat sources and configure settings.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Telegram users needing cross-chat file search
- Admins managing file repositories

## Success criteria

- Users can search and retrieve files from indexed chats
- Admins receive notifications for chat management events
- Indexing works for both public and private chats

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with search and admin options
- **/search** (command, actor: user, command: /search) — Initiate file search with text query and optional filters
- **/addchat** (command, actor: admin, command: /addchat) — Add a new chat to the index using chat ID or invite link
- **/removechat** (command, actor: admin, command: /removechat) — Remove a chat from indexing
- **/listchats** (command, actor: admin, command: /listchats) — Show all indexed chat sources
- **/reindex** (command, actor: admin, command: /reindex) — Force reindexing of a specific chat
- **Search Files** (button, actor: user, callback: search:start) — Open search interface in main menu
  - outputs: Search query input field
- **Add New Chat** (button, actor: admin, callback: admin:addchat) — Trigger /addchat command in admin console

## Flows

### onboarding
_Trigger:_ /start

1. Display main menu with search and admin options
2. Check user role for admin features

_Data touched:_ User

### chat_addition
_Trigger:_ /addchat

1. Validate chat access
2. Index existing files
3. Start monitoring new messages

_Data touched:_ ChatSource, FileRecord

### file_search
_Trigger:_ /search or search:start

1. Process query text and filters
2. Search indexed files
3. Display paginated results with preview/send buttons

_Data touched:_ SearchQuery, FileRecord

### result_preview
_Trigger:_ Preview button

1. Fetch file metadata
2. Generate thumbnail/preview
3. Display file details

_Data touched:_ FileRecord

### file_delivery
_Trigger:_ Send button

1. Retrieve file from Telegram
2. Send to user with caption

_Data touched:_ FileRecord

### admin_console
_Trigger:_ /listchats or /reindex

1. Display chat list or start reindexing
2. Show indexing status

_Data touched:_ ChatSource

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **FileRecord** _(retention: persistent)_ — Indexed file metadata for search and retrieval
  - fields: file_id, filename, mime_type, size, file_type_tag, chat_id, chat_name, message_id, caption, upload_date, uploader, extracted_text, tags
- **ChatSource** _(retention: persistent)_ — Telegram chat source configuration
  - fields: chat_id, name, is_public, added_by, date_added
- **User** _(retention: persistent)_ — User preferences and access roles
  - fields: user_id, username, role, language, result_limit
- **SearchQuery** _(retention: session)_ — User search parameters and filters
  - fields: text, file_type, date_range, chat_source, size_filter

## Integrations

- **Telegram** (required) — Bot API messaging and file access
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- /addchat
- /removechat
- /listchats
- /reindex
- configure result limits
- set language preferences

## Notifications

- New chat added alert
- Indexing completion status
- Error notifications for failed indexing

## Permissions & privacy

- Admins can add/remove chat sources
- User preferences stored securely
- No file content stored beyond metadata and file_id

## Edge cases

- Bot not in chat when using ID-based /addchat
- Large search result sets exceeding message limits
- OCR failure for non-text files

## Required tests

- Admin can add and remove chat sources
- User search returns paginated results
- Preview and Send buttons work for all file types
- Error notifications trigger correctly

## Assumptions

- Admins manually add chats via command
- Indexing runs automatically on chat addition
- Telegram file_id remains valid for retrieval
