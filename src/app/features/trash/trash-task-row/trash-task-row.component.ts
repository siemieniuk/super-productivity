import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';

import { T } from '../../../t.const';
import { TrashedTask } from '../trash.model';
import { TagListComponent } from '../../tag/tag-list/tag-list.component';
import { TaskPriorityIndicatorComponent } from '../../tasks/task-priority-indicator/task-priority-indicator.component';
import { selectProjectFeatureState } from '../../project/store/project.selectors';
import { LocaleDatePipe } from '../../../ui/pipes/locale-date.pipe';
import { DateTimeFormatService } from '../../../core/date-time-format/date-time-format.service';

@Component({
  selector: 'trash-task-row',
  templateUrl: './trash-task-row.component.html',
  styleUrl: './trash-task-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    MatIcon,
    MatIconButton,
    MatTooltip,
    TranslatePipe,
    LocaleDatePipe,
    TagListComponent,
    TaskPriorityIndicatorComponent,
  ],
})
export class TrashTaskRowComponent {
  private readonly _store = inject(Store);
  private readonly _dateTimeFormatService = inject(DateTimeFormatService);
  private readonly _projectState = toSignal(
    this._store.select(selectProjectFeatureState),
  );

  readonly item = input.required<TrashedTask>();
  readonly selected = input<boolean>(false);

  readonly restored = output<void>();
  readonly deleted = output<void>();
  readonly selectedChange = output<boolean>();

  readonly T = T;

  // Exposed so the template can pass the reactive locale to the now-pure
  // `localeDate` pipe, preserving re-render on a locale change.
  readonly locale = this._dateTimeFormatService.currentLocale;

  readonly task = computed(() => this.item().data);

  readonly projectName = computed(() => {
    const projectId = this.item().restoreContext.projectId;
    if (!projectId) return null;
    return this._projectState()?.entities[projectId]?.title ?? null;
  });

  onToggleSelect(event: Event): void {
    event.stopPropagation();
    if (event instanceof KeyboardEvent && event.key === ' ') {
      event.preventDefault();
    }
    this.selectedChange.emit(!this.selected());
  }
}
