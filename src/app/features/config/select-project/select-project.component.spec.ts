import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { SelectProjectComponent, SelectProjectProps } from './select-project.component';
import { ProjectService } from '../../project/project.service';
import { MenuTreeService } from '../../menu-tree/menu-tree.service';
import { Project } from '../../project/project.model';
import { DEFAULT_PROJECT_ICON } from '../../project/project.const';

const PROJECTS = [
  { id: 'p1', title: 'Work', icon: 'rocket_launch', theme: { primary: '#ff0000' } },
  { id: 'p2', title: 'Home', icon: null, theme: { primary: '#00ff00' } },
] as unknown as Project[];

describe('SelectProjectComponent', () => {
  let fixture: ComponentFixture<SelectProjectComponent>;

  const render = async (
    value: string | string[],
    props: SelectProjectProps = {},
  ): Promise<HTMLElement> => {
    fixture = TestBed.createComponent(SelectProjectComponent);
    const formControl = new FormControl(value);
    Object.defineProperty(fixture.componentInstance, 'formControl', {
      get: () => formControl,
      configurable: true,
    });
    fixture.componentInstance.field = {
      props,
      options: { showError: () => false },
    } as FormlyFieldConfig<SelectProjectProps>;
    fixture.detectChanges();
    // MatSelect applies the initial value in a microtask.
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.mat-mdc-select-value') as HTMLElement;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        SelectProjectComponent,
        FormlyModule.forRoot(),
        TranslateModule.forRoot(),
        NoopAnimationsModule,
      ],
      providers: [
        { provide: ProjectService, useValue: { listInTreeOrder$: of(PROJECTS) } },
        {
          provide: MenuTreeService,
          useValue: { projectFolderMap: signal(new Map([['p1', 'Folder']])) },
        },
      ],
    }).compileComponents();
  });

  // Without a custom trigger MatSelect shows the option's textContent, which
  // spells out the icon's ligature name and the folder path as plain text.
  it('renders the selected project as an icon and title in the closed field', async () => {
    const closed = await render('p1');

    expect(closed.querySelector('mat-icon')?.textContent?.trim()).toBe('rocket_launch');
    expect(closed.querySelector('.option-title')?.textContent).toBe('Work');
    expect(closed.querySelector('.folder-subtitle')).toBeNull();
  });

  it('falls back to the default project icon in the closed field', async () => {
    const closed = await render('p2');

    expect(closed.querySelector('mat-icon')?.textContent?.trim()).toBe(
      DEFAULT_PROJECT_ICON,
    );
    expect(closed.querySelector('.option-title')?.textContent).toBe('Home');
  });

  it('keeps the comma-separated titles for multiple selection', async () => {
    const closed = await render(['p1', 'p2'], { multiple: true });

    expect(closed.querySelector('mat-icon')).toBeNull();
    expect(closed.textContent?.trim()).toBe('Work, Home');
  });
});
