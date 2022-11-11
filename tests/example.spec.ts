import { test, expect } from '@playwright/test';

test('homepage has headings and links', async ({ page }) => {
  await page.goto('http://localhost:4321/');

  await expect(page).toHaveTitle(/Collected.Press/);

  await expect(page.getByRole('heading', { name: 'Examples' })).toBeVisible();
  // expect(screenTest(Heading('Examples'))).toBeVisible();

  const getStarted = page.getByRole('link', { name: 'View Source on GitHub' });

  // Expect an attribute "to be strictly equal" to the value.
  await expect(getStarted).toHaveAttribute('href', 'https://github.com/ThatCollected/collected-press');

  // Click the get started link.
  // await getStarted.click();

  // Expects the URL to contain intro.
  // await expect(page).toHaveURL(/.*intro/);
});
