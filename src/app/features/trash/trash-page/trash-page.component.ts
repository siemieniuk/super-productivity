import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';

import { T } from '../../../t.const';
import { TrashService } from '../trash.service';
import { TrashedTask } from '../trash.model';
import { TRASH_DEFAULT_RETENTION_DAYS } from '../trash.const';
import { DialogConfirmComponent } from '../../../ui/dialog-confirm/dialog-confirm.component';
import { GlobalConfigService } from '../../config/global-config.service';
import { TrashTaskRowComponent } from '../trash-task-row/trash-task-row.component';

@Component({
  selector: 'trash-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, MatButton, TranslatePipe, TrashTaskRowComponent],
  templateUrl: 'trash-page.component.html',
  styleUrls: ['trash-page.component.scss'],
})
export class TrashPageComponent {
  private readonly _trashService = inject(TrashService);
  private readonly _matDialog = inject(MatDialog);
  private readonly _globalConfigService = inject(GlobalConfigService);

  readonly T = T;
  readonly trashedTasks = this._trashService.trashedTasks;
  readonly retentionDays = computed(
    () =>
      this._globalConfigService.cfg()?.trash?.retentionDays ??
      TRASH_DEFAULT_RETENTION_DAYS,
  );

  readonly selectedIds = signal<Set<string>>(new Set());

  readonly selectedCount = computed(() => this.selectedIds().size);

  toggleItem(id: string, checked: boolean): void {
    const next = new Set(this.selectedIds());
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.selectedIds.set(next);
  }

  restore(item: TrashedTask): void {
    this._trashService.restore(item.id, item.entityType);
    this._removeFromSelection(item.id);
  }

  deletePermanently(item: TrashedTask): void {
    this._trashService.permanentlyDelete([item.id]);
    this._removeFromSelection(item.id);
  }

  deleteSelected(): void {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;
    this._matDialog
      .open(DialogConfirmComponent, {
        data: {
          okTxt: T.TRASH.DELETE_PERMANENTLY,
          message: T.TRASH.EMPTY_TRASH_CONFIRM,
        },
      })
      .afterClosed()
      .subscribe((isConfirm) => {
        if (isConfirm) {
          this._trashService.permanentlyDelete(ids);
          this.selectedIds.set(new Set());
        }
      });
  }

  emptyTrash(): void {
    this._matDialog
      .open(DialogConfirmComponent, {
        data: {
          okTxt: T.TRASH.EMPTY_TRASH,
          message: T.TRASH.EMPTY_TRASH_CONFIRM,
        },
      })
      .afterClosed()
      .subscribe((isConfirm) => {
        if (isConfirm) {
          this._trashService.emptyTrash();
          this.selectedIds.set(new Set());
        }
      });
  }

  private _removeFromSelection(id: string): void {
    const sel = this.selectedIds();
    if (sel.has(id)) {
      const next = new Set(sel);
      next.delete(id);
      this.selectedIds.set(next);
    }
  }
}
