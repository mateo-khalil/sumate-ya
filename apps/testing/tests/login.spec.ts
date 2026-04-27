import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:4321/login');
  await page.getByRole('textbox', { name: 'Email' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('mateoduran2010@gmail.com');
  await page.getByRole('textbox', { name: 'Contraseña' }).click();
  await page.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByText('⚠ Ocurrió un error al iniciar')).not.toBeVisible();
});
