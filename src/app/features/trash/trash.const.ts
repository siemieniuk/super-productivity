/**
 * Fallback retention window for trashed items.
 *
 * `globalConfig.trash` is optional because state persisted before the trash
 * feature existed does not carry it (see AGENTS.md sync-correctness rule 11),
 * so every read needs this runtime default.
 */
export const TRASH_DEFAULT_RETENTION_DAYS = 30;
