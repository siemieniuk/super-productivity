import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { Dictionary } from '@ngrx/entity';

import { TrashService } from './trash.service';
import { TrashActions } from './store/trash.actions';
import { selectAllTrashedItems, selectTrashedTaskItems } from './store/trash.reducer';
import { selectProjectFeatureState } from '../project/store/project.selectors';
import { TaskSharedActions } from '../../root-store/meta/task-shared.actions';
import { GlobalConfigService } from '../config/global-config.service';
import { DEFAULT_TASK, Task, TaskWithSubTasks } from '../tasks/task.model';
import { TaskRestoreContext, TrashedTask } from './trash.model';

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({ ...DEFAULT_TASK, id, title: id, projectId: 'P1', ...over }) as Task;

const withSub = (main: Task, subTasks: Task[] = []): TaskWithSubTasks => ({
  ...main,
  subTaskIds: subTasks.map((s) => s.id),
  subTasks,
});

const trashed = (id: string, ctx: Partial<TaskRestoreContext> = {}): TrashedTask => ({
  id,
  entityType: 'TASK',
  data: task(id),
  restoreContext: { tagIds: [], subTaskIds: [], backlog: false, ...ctx },
  deletedAt: 1000,
});

const projectState = (over: Record<string, unknown> = {}): any => ({
  ids: ['P1'],
  entities: {
    P1: { id: 'P1', title: 'P1', taskIds: [], backlogTaskIds: [], ...over },
  },
});

describe('TrashService', () => {
  let store: MockStore;
  let dispatchSpy: jasmine.Spy;
  let service: TrashService;
  let isTrashEnabled: boolean;

  const trashItems = (items: TrashedTask[]): void => {
    store.overrideSelector(selectAllTrashedItems, items);
    store.overrideSelector(selectTrashedTaskItems, items);
    store.refreshState();
  };

  beforeEach(() => {
    isTrashEnabled = true;

    TestBed.configureTestingModule({
      providers: [
        TrashService,
        provideMockStore(),
        {
          provide: GlobalConfigService,
          useValue: { appFeatures: () => ({ isTrashEnabled }) },
        },
      ],
    });

    store = TestBed.inject(MockStore);
    store.overrideSelector(selectAllTrashedItems, []);
    store.overrideSelector(selectTrashedTaskItems, []);
    store.overrideSelector(selectProjectFeatureState, projectState());
    dispatchSpy = spyOn(store, 'dispatch').and.callThrough();
    service = TestBed.inject(TrashService);
  });

  afterEach(() => {
    store.resetSelectors();
  });

  describe('deleteTask', () => {
    it('should snapshot to trash AND remove the task from the active state', () => {
      const t = withSub(task('T1'));

      service.deleteTask(t);

      const types = dispatchSpy.calls.allArgs().map(([a]) => a.type);
      expect(types).toEqual([
        TrashActions.moveToTrash.type,
        TaskSharedActions.deleteTask.type,
      ]);
    });

    it('should snapshot before the delete so backlog membership is still readable', () => {
      store.overrideSelector(
        selectProjectFeatureState,
        projectState({ backlogTaskIds: ['T1'] }),
      );
      store.refreshState();

      service.deleteTask(withSub(task('T1')));

      const { items } = dispatchSpy.calls.first().args[0];
      expect((items[0].restoreContext as TaskRestoreContext).backlog).toBe(true);
    });

    it('should snapshot the subtasks alongside the main task', () => {
      const sub = task('S1', { parentId: 'T1' });

      service.deleteTask(withSub(task('T1'), [sub]));

      const { items } = dispatchSpy.calls.first().args[0];
      expect(items.map((i: TrashedTask) => i.id)).toEqual(['T1', 'S1']);
    });

    it('should only hard-delete when trash is disabled', () => {
      isTrashEnabled = false;

      service.deleteTask(withSub(task('T1')));

      const types = dispatchSpy.calls.allArgs().map(([a]) => a.type);
      expect(types).toEqual([TaskSharedActions.deleteTask.type]);
    });
  });

  describe('deleteTasks', () => {
    const entities = (): { entities: Dictionary<Task>; tasks: Task[] } => {
      const sub = task('S1', { parentId: 'T1' });
      return {
        entities: { T1: task('T1', { subTaskIds: ['S1'] }), S1: sub },
        tasks: [task('T1', { subTaskIds: ['S1'] }), sub],
      };
    };

    it('should snapshot to trash AND remove the tasks from the active state', () => {
      const { entities: e, tasks } = entities();

      service.deleteTasks(['T1'], e, tasks);

      const types = dispatchSpy.calls.allArgs().map(([a]) => a.type);
      expect(types).toEqual([
        TrashActions.moveToTrash.type,
        TaskSharedActions.deleteTasks.type,
      ]);
    });

    it('should build one record per task when a parent and its subtask are both selected', () => {
      const { entities: e, tasks } = entities();

      service.deleteTasks(['T1', 'S1'], e, tasks);

      const { items } = dispatchSpy.calls.first().args[0];
      expect(items.map((i: TrashedTask) => i.id)).toEqual(['T1', 'S1']);
    });

    it('should only hard-delete when trash is disabled', () => {
      isTrashEnabled = false;
      const { entities: e, tasks } = entities();

      service.deleteTasks(['T1'], e, tasks);

      const types = dispatchSpy.calls.allArgs().map(([a]) => a.type);
      expect(types).toEqual([TaskSharedActions.deleteTasks.type]);
    });
  });

  describe('restore', () => {
    const restoreAction = (): ReturnType<typeof TaskSharedActions.restoreDeletedTask> =>
      dispatchSpy.calls
        .allArgs()
        .map(([a]) => a)
        .find((a) => a.type === TaskSharedActions.restoreDeletedTask.type);

    it('should re-add the task through a persistent op so it survives a restart', () => {
      trashItems([trashed('T1', { projectId: 'P1' })]);

      service.restore('T1', 'TASK');

      const types = dispatchSpy.calls.allArgs().map(([a]) => a.type);
      expect(types).toEqual([
        TaskSharedActions.restoreDeletedTask.type,
        TrashActions.restoreFromTrash.type,
      ]);
      expect(restoreAction().meta.isPersistent).toBe(true);
    });

    it('should restore the task with its trashed subtasks into its project list', () => {
      trashItems([
        trashed('T1', { projectId: 'P1', subTaskIds: ['S1'], tagIds: ['TG1'] }),
        trashed('S1', { parentId: 'T1', tagIds: ['TG1'] }),
      ]);

      service.restore('T1', 'TASK');

      const a = restoreAction();
      expect(Object.keys(a.deletedTaskEntities)).toEqual(['T1', 'S1']);
      expect(a.task.subTasks.map((st) => st.id)).toEqual(['S1']);
      expect(a.projectContext).toEqual({
        projectId: 'P1',
        taskIdsForProject: ['T1'],
        taskIdsForProjectBacklog: [],
      });
      expect(a.parentContext).toBeUndefined();
      expect(a.tagTaskIdMap).toEqual({ TG1: ['T1', 'S1'] });
    });

    it('should restore a backlog task into the backlog', () => {
      trashItems([trashed('T1', { projectId: 'P1', backlog: true })]);

      service.restore('T1', 'TASK');

      expect(restoreAction().projectContext?.taskIdsForProjectBacklog).toEqual(['T1']);
    });

    it('should re-link a subtask to its parent instead of a project list', () => {
      trashItems([trashed('S1', { parentId: 'T1', projectId: 'P1' })]);

      service.restore('S1', 'TASK');

      const a = restoreAction();
      expect(a.parentContext).toEqual({ parentTaskId: 'T1', subTaskIds: [] });
      expect(a.projectContext).toBeUndefined();
    });

    it('should do nothing for an id that is no longer in the trash', () => {
      service.restore('T1', 'TASK');

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it("should consume the restored task's subtask records too", () => {
      trashItems([
        trashed('T1', { subTaskIds: ['S1'] }),
        trashed('S1', { parentId: 'T1' }),
      ]);

      service.restore('T1', 'TASK');

      expect(dispatchSpy).toHaveBeenCalledWith(
        TrashActions.restoreFromTrash({
          itemId: 'T1',
          itemIds: ['T1', 'S1'],
          entityType: 'TASK',
        }),
      );
    });

    it('should not touch records of unrelated trashed tasks', () => {
      trashItems([trashed('T1'), trashed('T2')]);

      service.restore('T1', 'TASK');

      expect(dispatchSpy.calls.mostRecent().args[0].itemIds).toEqual(['T1']);
    });
  });

  describe('permanentlyDelete', () => {
    it("should delete the task's subtask records too, so none are left orphaned", () => {
      trashItems([
        trashed('T1', { subTaskIds: ['S1'] }),
        trashed('S1', { parentId: 'T1' }),
      ]);

      service.permanentlyDelete(['T1']);

      expect(dispatchSpy).toHaveBeenCalledWith(
        TrashActions.permanentlyDeleteFromTrash({ itemIds: ['T1', 'S1'] }),
      );
    });

    it('should not duplicate ids when a parent and its subtask are both selected', () => {
      trashItems([
        trashed('T1', { subTaskIds: ['S1'] }),
        trashed('S1', { parentId: 'T1' }),
      ]);

      service.permanentlyDelete(['T1', 'S1']);

      expect(dispatchSpy.calls.mostRecent().args[0].itemIds).toEqual(['T1', 'S1']);
    });

    it('should do nothing for an empty selection', () => {
      service.permanentlyDelete([]);

      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });
});
