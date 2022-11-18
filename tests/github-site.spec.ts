import { test, expect } from '@playwright/test';

test('homepage has headings and links', async ({ page }) => {
  await page.goto('http://localhost:4321/github-site/RoyalIcing/RoyalIcing');

  await expect(page).toHaveTitle(/Collected.Press/);

  await expect(page.getByRole('heading', { name: 'Patrick Smith — Product Developer & Design Engineer' })).toBeVisible();
  // expect(screenTest(Heading('Examples'))).toBeVisible();

  await expect(page.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/RoyalIcing');

  // Click the get started link.
  // await getStarted.click();

  // Expects the URL to contain intro.
  // await expect(page).toHaveURL(/.*intro/);
});

test('can navigate between pages', async ({ page }) => {
  await page.goto('http://localhost:4321/github-site/RoyalIcing/RoyalIcing');

  await expect(page).toHaveTitle(/Collected.Press/);

  // expect(screenTest(Heading('Examples'))).toBeVisible();

  await page.getByRole('link', { name: '2020' }).click();

  await expect(page).toHaveURL('http://localhost:4321/github-site/RoyalIcing/RoyalIcing/2020');
});

test('each article’s title is listed as links', async ({ page }) => {
  await page.goto('http://localhost:4321/github-site/RoyalIcing/RoyalIcing/2020');

  await page.getByRole('link', { name: 'My most used commands for front-end' }).click();

  await expect(page).toHaveURL('http://localhost:4321/github-site/RoyalIcing/RoyalIcing/2020/most-used-commands-for-front-end');
});
