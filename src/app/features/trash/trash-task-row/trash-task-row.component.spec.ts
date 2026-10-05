import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { provideMockStore, MockStore } from '@ngrx/store/testing';

import { TrashTaskRowComponent } from './trash-task-row.component';
import { TrashedTask } from '../trash.model';
import { DEFAULT_TASK, Task } from '../../tasks/task.model';
import { ProjectState } from '../../project/project.model';
import { selectProjectFeatureState } from '../../project/store/project.selectors';
import { TagListComponent } from '../../tag/tag-list/tag-list.component';
import { TaskPriorityIndicatorComponent } from '../../tasks/task-priority-indicator/task-priority-indicator.component';
import { DateTimeFormatService } from '../../../core/date-time-format/date-time-format.service';

const trashedTask = (): TrashedTask => ({
  id: 'T1',
  entityType: 'TASK',
  data: { ...DEFAULT_TASK, id: 'T1', title: 'T1', projectId: 'P1' } as Task,
  restoreContext: { tagIds: [], subTaskIds: [], backlog: false },
  deletedAt: 1000,
});

describe('TrashTaskRowComponent', () => {
  let fixture: ComponentFixture<TrashTaskRowComponent>;

  const selectToggle = (): HTMLElement =>
    fixture.nativeElement.querySelector('.select-toggle');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrashTaskRowComponent, TranslateModule.forRoot()],
      providers: [
        provideMockStore(),
        {
          provide: DateTimeFormatService,
          useValue: { currentLocale: signal('en-US') },
        },
      ],
    })
      // These children pull in work-context/plugin services that are irrelevant
      // here — drop them and let the unknown elements pass through.
      .overrideComponent(TrashTaskRowComponent, {
        remove: { imports: [TagListComponent, TaskPriorityIndicatorComponent] },
        add: { schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    TestBed.inject(MockStore).overrideSelector(selectProjectFeatureState, {
      ids: [],
      entities: {},
    } as ProjectState);

    fixture = TestBed.createComponent(TrashTaskRowComponent);
    fixture.componentRef.setInput('item', trashedTask());
    await fixture.whenStable();
  });

  it('gives the select toggle an accessible name', () => {
    expect(selectToggle().getAttribute('aria-label')).toBeTruthy();
  });

  it('hides the decorative glyph from assistive technology', () => {
    expect(
      selectToggle().querySelector('.select-toggle-svg')?.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('reflects the selected state via aria-checked', async () => {
    expect(selectToggle().getAttribute('aria-checked')).toBe('false');

    fixture.componentRef.setInput('selected', true);
    await fixture.whenStable();

    expect(selectToggle().getAttribute('aria-checked')).toBe('true');
  });
});
