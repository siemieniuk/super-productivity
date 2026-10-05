import { expect, test } from '../../fixtures/test.fixture';

test.describe('Trash', () => {
  test('a task restored from the trash survives an app reload', async ({
    page,
    workViewPage,
    taskPage,
  }) => {
    await page.goto('/#/config');
    await page.locator('collapsible', { hasText: 'App Features' }).click();
    const trashSwitch = page.getByRole('switch', { name: 'Trash bin (experimental)' });
    await trashSwitch.click();
    await expect(trashSwitch).toBeChecked();

    await page.goto('/#/tag/TODAY/tasks');
    await workViewPage.waitForTaskList();
    await workViewPage.addTask('Restore me');
    await expect(taskPage.getTaskByText('Restore me')).toBeVisible();

    await page.locator('task').first().click({ button: 'right' });
    await page.locator('.mat-mdc-menu-content button.color-warn').click();
    await expect(page.locator('task')).toHaveCount(0);

    await page.goto('/#/trash');
    const row = page.locator('trash-task-row', { hasText: 'Restore me' });
    await row.locator('button', { hasText: 'restore' }).click();
    await expect(row).toHaveCount(0);

    await page.reload();
    await page.goto('/#/tag/TODAY/tasks');
    await workViewPage.waitForTaskList();
    await expect(taskPage.getTaskByText('Restore me')).toBeVisible();
  });
});
