import { Dictionary } from '@ngrx/entity';
import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { take } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { TrashActions } from './store/trash.actions';
import {
  selectAllTrashedItems,
  selectTrashedTaskItems,
  selectTrashItemCount,
} from './store/trash.reducer';
import { TrashedItem, TrashedTask, TrashEntityType } from './trash.model';
import {
  buildRestoreDeletedTaskPayload,
  buildTrashedTaskItems,
  expandTaskTrashIds,
} from './task-trash.helper';
import { selectProjectFeatureState } from '../project/store/project.selectors';
import { Task, TaskWithSubTasks } from '../tasks/task.model';
import { GlobalConfigService } from '../config/global-config.service';
import { TaskSharedActions } from '../../root-store/meta/task-shared.actions';

@Injectable({ providedIn: 'root' })
export class TrashService {
  private readonly _store = inject(Store);
  private readonly _globalConfigService = inject(GlobalConfigService);

  readonly trashedItems = toSignal(this._store.select(selectAllTrashedItems), {
    initialValue: [] as TrashedItem[],
  });

  readonly trashedTasks = toSignal(this._store.select(selectTrashedTaskItems), {
    initialValue: [],
  });

  readonly trashItemCount = toSignal(this._store.select(selectTrashItemCount), {
    initialValue: 0,
  });

  moveToTrash(items: TrashedItem[]): void {
    if (items.length === 0) return;
    this._store.dispatch(TrashActions.moveToTrash({ items }));
  }

  /**
   * Soft-deletes when trash is enabled, otherwise dispatches a hard delete.
   *
   * A soft delete is a snapshot PLUS the regular delete: the snapshot goes to
   * the trash store and the task leaves the active state through the existing
   * persistent deleteTask action, so it shows up in the trash and nowhere else.
   * The snapshot is built before dispatching, while project/tag/backlog
   * membership is still in state.
   */
  deleteTask(task: TaskWithSubTasks): void {
    if (this._isEnabled()) {
      this._moveTaskToTrash(task);
    }
    this._store.dispatch(TaskSharedActions.deleteTask({ task }));
  }

  /** Soft-deletes when trash is enabled, otherwise dispatches a hard delete. */
  deleteTasks(taskIds: string[], entities: Dictionary<Task>, tasks: Task[]): void {
    if (this._isEnabled()) {
      this._moveTasksToTrashByIds(taskIds, entities);
    }
    this._store.dispatch(TaskSharedActions.deleteTasks({ taskIds, tasks }));
  }

  private _isEnabled(): boolean {
    return !!this._globalConfigService.appFeatures()?.isTrashEnabled;
  }

  private _moveTaskToTrash(task: TaskWithSubTasks): void {
    // Read the project synchronously so we can capture backlog membership
    // at the moment of deletion.
    this._store
      .select(selectProjectFeatureState)
      .pipe(take(1))
      .subscribe((projectState) => {
        const project = task.projectId
          ? projectState.entities[task.projectId]
          : undefined;
        this.moveToTrash(buildTrashedTaskItems(task, project));
      });
  }

  private _moveTasksToTrashByIds(taskIds: string[], entities: Dictionary<Task>): void {
    this._store
      .select(selectProjectFeatureState)
      .pipe(take(1))
      .subscribe((projectState) => {
        const itemsById = new Map<string, TrashedItem>();
        const now = Date.now();
        for (const id of taskIds) {
          const t = entities[id];
          if (!t) continue;
          const subTasks = (t.subTaskIds || [])
            .map((sid) => entities[sid])
            .filter((s): s is Task => !!s);
          const withSub: TaskWithSubTasks = { ...t, subTasks };
          const project = t.projectId ? projectState.entities[t.projectId] : undefined;
          // Keyed by id: selecting a parent and one of its subtasks would
          // otherwise build two records for that subtask, and the NgRx adapter
          // (first wins) and IndexedDB (last wins) would disagree on which.
          for (const item of buildTrashedTaskItems(withSub, project, now)) {
            if (!itemsById.has(item.id)) {
              itemsById.set(item.id, item);
            }
          }
        }
        this.moveToTrash([...itemsById.values()]);
      });
  }

  /**
   * The task comes back through the persistent restoreDeletedTask action (an
   * op-log write, so it survives restarts and syncs); restoreFromTrash only
   * drops the local trash records.
   */
  restore(itemId: string, entityType: TrashEntityType): void {
    const items = this.trashedItems();
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    if (entityType === 'TASK') {
      this._store.dispatch(
        TaskSharedActions.restoreDeletedTask(
          buildRestoreDeletedTaskPayload(item as TrashedTask, items),
        ),
      );
    }
    this._store.dispatch(
      TrashActions.restoreFromTrash({
        itemId,
        // Restoring a task also restores its trashed subtasks, so their records
        // leave the trash with it.
        itemIds: expandTaskTrashIds([itemId], items),
        entityType,
      }),
    );
  }

  permanentlyDelete(itemIds: string[]): void {
    if (itemIds.length === 0) return;
    this._store.dispatch(
      TrashActions.permanentlyDeleteFromTrash({
        // A parent's subtask records are unrestorable once the parent is gone,
        // so they go with it.
        itemIds: expandTaskTrashIds(itemIds, this.trashedItems()),
      }),
    );
  }

  emptyTrash(): void {
    this._store.dispatch(TrashActions.emptyTrash());
  }
}
