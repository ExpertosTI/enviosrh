import { test, expect } from '@playwright/test';

test('login page loads', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText(/Envíos App/i)).toBeVisible();
});

test('features page loads', async ({ page }) => {
  await page.goto('/enviosapp');
  await expect(page).toHaveURL(/enviosapp/);
});
