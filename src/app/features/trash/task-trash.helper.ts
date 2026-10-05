import { Task, TaskWithSubTasks } from '../tasks/task.model';
import { Project } from '../project/project.model';
import { TaskRestoreContext, TrashedItem, TrashedTask } from './trash.model';
import { RestoreDeletedTaskPayload } from '../../root-store/meta/undo-task-delete.meta-reducer';

/**
 * Builds one TrashedItem per task (main + each subtask) so that the trash page
 * can display each independently, and so that restore can target individual
 * pieces if needed. The main task carries the backlog flag derived from the
 * current project state.
 */
export const buildTrashedTaskItems = (
  taskWithSub: TaskWithSubTasks,
  project: Project | undefined,
  now: number = Date.now(),
): TrashedItem<Task>[] => {
  const mainTaskBacklog = !!project?.backlogTaskIds?.includes(taskWithSub.id);

  const mainItem: TrashedTask = {
    id: taskWithSub.id,
    entityType: 'TASK',
    data: stripSubTasks(taskWithSub),
    restoreContext: {
      projectId: taskWithSub.projectId || undefined,
      tagIds: [...taskWithSub.tagIds],
      parentId: taskWithSub.parentId || undefined,
      subTaskIds: [...(taskWithSub.subTaskIds || [])],
      backlog: mainTaskBacklog,
    } satisfies TaskRestoreContext,
    deletedAt: now,
  };

  const subItems: TrashedTask[] = (taskWithSub.subTasks || []).map((sub) => ({
    id: sub.id,
    entityType: 'TASK',
    data: sub,
    restoreContext: {
      projectId: sub.projectId || undefined,
      tagIds: [...sub.tagIds],
      parentId: taskWithSub.id,
      subTaskIds: [],
      backlog: false,
    } satisfies TaskRestoreContext,
    deletedAt: now,
  }));

  return [mainItem, ...subItems];
};

/**
 * Expands root trash ids to the full set of task records they own: each id plus
 * the records of its trashed subtasks (a parent and its subtasks are trashed as
 * separate records, see buildTrashedTaskItems).
 *
 * Restoring or permanently deleting a parent consumes its subtask records too —
 * without this, restoring a parent re-adds the subtask entities while their
 * trash records linger, and permanently deleting a parent leaves the subtask
 * records behind as unrestorable orphans.
 *
 * Ids not present in `allItems` are only kept when asked for directly, so a
 * stale subTaskIds entry cannot resurrect a record that is no longer trashed.
 */
export const expandTaskTrashIds = (
  rootIds: readonly string[],
  allItems: readonly TrashedItem[],
): string[] => {
  const byId = new Map(allItems.map((item) => [item.id, item]));
  const result: string[] = [];
  const seen = new Set<string>();

  const visit = (id: string, isRoot: boolean): void => {
    if (seen.has(id)) return;
    const item = byId.get(id);
    if (!item && !isRoot) return;
    seen.add(id);
    result.push(id);
    if (item?.entityType !== 'TASK') return;
    // Validated rather than cast: these records come off disk, and older ones
    // may predate any given restoreContext field.
    const { subTaskIds } = item.restoreContext;
    if (!Array.isArray(subTaskIds)) return;
    subTaskIds.forEach((subId) => {
      if (typeof subId === 'string') visit(subId, false);
    });
  };

  rootIds.forEach((id) => visit(id, true));
  return result;
};

/**
 * Builds the persistent restoreDeletedTask payload for a trashed task and its
 * trashed subtasks, so the restore is written to the op-log like any undo.
 */
export const buildRestoreDeletedTaskPayload = (
  mainItem: TrashedTask,
  allItems: readonly TrashedItem[],
): RestoreDeletedTaskPayload => {
  const ctx = mainItem.restoreContext;
  const subItems = expandTaskTrashIds([mainItem.id], allItems)
    .slice(1)
    .map((id) => allItems.find((i): i is TrashedTask => i.id === id))
    .filter((i): i is TrashedTask => i?.entityType === 'TASK');
  const restoredItems = [mainItem, ...subItems];

  const tagTaskIdMap: Record<string, string[]> = {};
  for (const item of restoredItems) {
    for (const tagId of item.restoreContext.tagIds || []) {
      (tagTaskIdMap[tagId] ??= []).push(item.id);
    }
  }

  return {
    task: { ...mainItem.data, subTasks: subItems.map((i) => i.data) },
    projectContext:
      !ctx.parentId && ctx.projectId
        ? {
            projectId: ctx.projectId,
            taskIdsForProject: ctx.backlog ? [] : [mainItem.id],
            taskIdsForProjectBacklog: ctx.backlog ? [mainItem.id] : [],
          }
        : undefined,
    // Empty captured order: a restored subtask is appended to its parent.
    parentContext: ctx.parentId
      ? { parentTaskId: ctx.parentId, subTaskIds: [] }
      : undefined,
    tagTaskIdMap,
    deletedTaskEntities: Object.fromEntries(restoredItems.map((i) => [i.id, i.data])),
  };
};

// Remove subTasks from Task — the subTasks field lives on TaskWithSubTasks only
// and is redundant since subtasks are stored as their own trashed items.
const stripSubTasks = (t: TaskWithSubTasks): Task => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { subTasks, ...rest } = t;
  return rest as Task;
};
