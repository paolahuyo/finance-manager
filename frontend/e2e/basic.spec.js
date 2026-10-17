import { test, expect } from '@playwright/test';

test.describe('Finance Manager', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows the header and the monthly summary', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Finance Manager');
    await expect(page.getByText('Balance del mes')).toBeVisible();
  });

  test('can navigate to the transactions form', async ({ page }) => {
    await page.getByRole('button', { name: 'Movimientos' }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo movimiento' })).toBeVisible();
  });

  test('can navigate to cards', async ({ page }) => {
    await page.getByRole('button', { name: 'Tarjetas' }).click();
    await expect(page.getByRole('heading', { name: 'Nueva tarjeta o deuda' })).toBeVisible();
  });
});
