import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { TrashedItem, TrashEntityType } from '../trash.model';

/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Trash actions.
 *
 * NOTE: Trash is currently a LOCAL-ONLY feature for MVP — actions are not
 * persisted to the op-log and do not sync across devices. Each client maintains
 * its own trash bin. A future iteration can add a TrashOperationHandler to sync
 * trash contents; see trash-lld.md Section 9.
 *
 * Task removal and re-adding are handled by the existing persistent
 * deleteTask / deleteTasks / restoreDeletedTask actions. These actions only
 * touch the trash state and IndexedDB store — never task/project/tag state,
 * which would not survive a restart since nothing here reaches the op-log.
 */
export const TrashActions = createActionGroup({
  source: 'Trash',
  events: {
    /** Write trashed item snapshots to the trash IndexedDB store. */
    'Move To Trash': props<{ items: TrashedItem[] }>(),

    /**
     * Drops restored records from the trash. The entity itself is re-added by
     * the persistent action TrashService.restore dispatches alongside.
     *
     * `itemId` is the item being restored. `itemIds` lists every trash record
     * consumed by that restore — for a task this is the item plus its trashed
     * subtasks, which are restored alongside it. Reducer and effect both work
     * off `itemIds` so in-memory state and IndexedDB drop the same records.
     */
    'Restore From Trash': props<{
      itemId: string;
      itemIds: string[];
      entityType: TrashEntityType;
    }>(),

    /** Permanently delete items from the trash (no restore possible). */
    'Permanently Delete From Trash': props<{ itemIds: string[] }>(),

    /** Permanently delete everything in the trash. */
    'Empty Trash': emptyProps(),

    /** Hydrate the in-memory trash state from IndexedDB. */
    'Load Trash Success': props<{ items: TrashedItem[] }>(),
  },
});
