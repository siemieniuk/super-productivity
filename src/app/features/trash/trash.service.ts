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
import { TrashedItem, TrashEntityType } from './trash.model';
import { buildTrashedTaskItems } from './task-trash.helper';
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

  /** Soft-deletes when trash is enabled, otherwise dispatches a hard delete. */
  deleteTask(task: TaskWithSubTasks): void {
    if (this._isEnabled()) {
      this._moveTaskToTrash(task);
      return;
    }
    this._store.dispatch(TaskSharedActions.deleteTask({ task }));
  }

  /** Soft-deletes when trash is enabled, otherwise dispatches a hard delete. */
  deleteTasks(taskIds: string[], entities: Dictionary<Task>, tasks: Task[]): void {
    if (this._isEnabled()) {
      this._moveTasksToTrashByIds(taskIds, entities);
      return;
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
        const allItems: ReturnType<typeof buildTrashedTaskItems> = [];
        const now = Date.now();
        for (const id of taskIds) {
          const t = entities[id];
          if (!t) continue;
          const subTasks = (t.subTaskIds || [])
            .map((sid) => entities[sid])
            .filter((s): s is Task => !!s);
          const withSub: TaskWithSubTasks = { ...t, subTasks };
          const project = t.projectId ? projectState.entities[t.projectId] : undefined;
          allItems.push(...buildTrashedTaskItems(withSub, project, now));
        }
        this.moveToTrash(allItems);
      });
  }

  restore(itemId: string, entityType: TrashEntityType): void {
    this._store.dispatch(TrashActions.restoreFromTrash({ itemId, entityType }));
  }

  permanentlyDelete(itemIds: string[]): void {
    if (itemIds.length === 0) return;
    this._store.dispatch(TrashActions.permanentlyDeleteFromTrash({ itemIds }));
  }

  emptyTrash(): void {
    this._store.dispatch(TrashActions.emptyTrash());
  }
}
