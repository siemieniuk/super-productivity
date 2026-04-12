import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { provideMockStore } from '@ngrx/store/testing';

import { TrashPageComponent } from './trash-page.component';
import { TRASH_FEATURE_NAME, initialTrashState } from '../store/trash.reducer';

describe('TrashPageComponent', () => {
  let component: TrashPageComponent;
  let fixture: ComponentFixture<TrashPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrashPageComponent, TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        provideMockStore({
          initialState: { [TRASH_FEATURE_NAME]: initialTrashState },
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TrashPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
