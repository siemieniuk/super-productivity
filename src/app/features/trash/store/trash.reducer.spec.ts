import { Action, ActionReducer } from '@ngrx/store';

import { initialTrashState, trashReducer, TrashState } from './trash.reducer';
import { TrashActions } from './trash.actions';
import { TrashedTask } from '../trash.model';
import { DEFAULT_TASK, Task } from '../../tasks/task.model';
import { taskSharedCrudMetaReducer } from '../../../root-store/meta/task-shared-meta-reducers/task-shared-crud.reducer';
import { createStateWithExistingTasks } from '../../../root-store/meta/task-shared-meta-reducers/test-utils';
import { TASK_FEATURE_NAME } from '../../tasks/store/task.reducer';

const trashed = (id: string, over: Partial<TrashedTask> = {}): TrashedTask => ({
  id,
  entityType: 'TASK',
  data: { ...DEFAULT_TASK, id, title: id } as Task,
  restoreContext: { tagIds: [], subTaskIds: [], backlog: false },
  deletedAt: 1000,
  ...over,
});

const parent = trashed('T1', {
  restoreContext: { tagIds: [], subTaskIds: ['S1'], backlog: false },
  deletedAt: 2000,
});
const sub = trashed('S1', {
  restoreContext: { tagIds: [], subTaskIds: [], parentId: 'T1', backlog: false },
  deletedAt: 2000,
});

const stateWith = (items: TrashedTask[]): TrashState =>
  trashReducer(initialTrashState, TrashActions.loadTrashSuccess({ items }));

describe('trashReducer', () => {
  it('should hydrate from IndexedDB and mark itself loaded', () => {
    const state = stateWith([parent, sub]);

    expect(state.loaded).toBe(true);
    expect(state.ids).toEqual(['T1', 'S1']);
  });

  it('should add trashed items, newest first', () => {
    const state = trashReducer(
      stateWith([trashed('OLD', { deletedAt: 1 })]),
      TrashActions.moveToTrash({ items: [parent, sub] }),
    );

    expect(state.ids).toEqual(['T1', 'S1', 'OLD']);
  });

  it('should drop the restored item AND its subtask records', () => {
    const state = trashReducer(
      stateWith([parent, sub, trashed('OTHER')]),
      TrashActions.restoreFromTrash({
        itemId: 'T1',
        itemIds: ['T1', 'S1'],
        entityType: 'TASK',
      }),
    );

    // Leaving S1 behind would show a subtask in the trash that is active again.
    expect(state.ids).toEqual(['OTHER']);
  });

  it('should drop permanently deleted items', () => {
    const state = trashReducer(
      stateWith([parent, sub, trashed('OTHER')]),
      TrashActions.permanentlyDeleteFromTrash({ itemIds: ['T1', 'S1'] }),
    );

    expect(state.ids).toEqual(['OTHER']);
  });

  it('should drop everything on empty trash', () => {
    const state = trashReducer(stateWith([parent, sub]), TrashActions.emptyTrash());

    expect(state.ids).toEqual([]);
  });
});

describe('permanent deletion does not resurrect tasks', () => {
  let metaReducer: ActionReducer<any, Action>;

  beforeEach(() => {
    metaReducer = taskSharedCrudMetaReducer(
      jasmine.createSpy('reducer').and.callFake((state) => state),
    );
  });

  // The reported symptom of the missing hard delete was a permanently deleted
  // task reappearing in its original list. Nothing in the task meta-reducer may
  // re-add task entities for these actions.
  it('should not touch task state on permanentlyDeleteFromTrash', () => {
    const state = createStateWithExistingTasks(['task1']);

    const result = metaReducer(
      state,
      TrashActions.permanentlyDeleteFromTrash({ itemIds: ['T1', 'S1'] }),
    );

    expect(result[TASK_FEATURE_NAME]).toBe(state[TASK_FEATURE_NAME]);
  });

  it('should not touch task state on emptyTrash', () => {
    const state = createStateWithExistingTasks(['task1']);

    const result = metaReducer(state, TrashActions.emptyTrash());

    expect(result[TASK_FEATURE_NAME]).toBe(state[TASK_FEATURE_NAME]);
  });
});
