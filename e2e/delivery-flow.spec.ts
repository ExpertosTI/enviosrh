import { test, expect } from '@playwright/test';

test.describe('Flujo crítico de envíos', () => {
  test('login operador y navegar a nuevo envío', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/correo|usuario|email/i).fill('enviorh');
    await page.getByPlaceholder(/contraseña|password/i).fill('101284');
    await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();
    await expect(page).toHaveURL(/operador/);
    await page.goto('/operador/nuevo');
    await expect(page.getByText(/nuevo envío/i)).toBeVisible();
  });

  test('mapa en vivo requiere auth', async ({ page }) => {
    await page.goto('/operador/mapa');
    await expect(page).toHaveURL(/login/);
  });

  test('tracking público sin token inválido', async ({ page }) => {
    await page.goto('/tracking/invalid-token-xyz');
    await expect(page.locator('body')).toBeVisible();
  });
});
