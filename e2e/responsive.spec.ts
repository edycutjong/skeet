import { test, expect } from '@playwright/test';

test.describe('Responsive Layout Checks', () => {
  test('Mobile view fits viewport without overflow', async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Verify main header is still visible
    const header = page.locator('h1');
    await expect(header).toBeVisible();

    // Check that there is no horizontal scrollbar
    const isHorizontalScrollable = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(isHorizontalScrollable).toBeFalsy();
  });

  test('Desktop view renders full inspector side-by-side', async ({ page }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Verify side-by-side elements are visible
    await expect(page.locator('text=Rounds Inspector')).toBeVisible();
    await expect(page.locator('text=Intra-Round Execution Timeline')).toBeVisible();
  });
});
