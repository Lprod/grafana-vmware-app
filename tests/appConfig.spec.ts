import { test, expect } from './fixtures';

test('should be possible to save the datasource default', async ({ appConfigPage, page }) => {
  const saveButton = page.getByRole('button', { name: /Save defaults/i });

  await expect(saveButton).toBeDisabled();
});
