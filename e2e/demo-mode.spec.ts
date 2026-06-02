import { test, expect } from '@playwright/test';

test('Dashboard loads in demo mode when DB is empty or missing', async ({ page }) => {
  // Go to the dashboard root
  await page.goto('/');

  // Verify the page title
  const title = await page.title();
  expect(title).toContain('Skeet PVP');

  // Verify the main header text is visible
  const header = page.locator('h1');
  await expect(header).toBeVisible();
  await expect(header).toContainText('SKEET');

  // Verify the presence of demo mode badge
  const demoBadge = page.locator('span:has-text("DEMO REPLAY MODE")');
  const liveBadge = page.locator('span:has-text("LIVE DAEMON ACTIVE")');
  
  // One of the badges should be visible
  const isDemoVisible = await demoBadge.isVisible();
  const isLiveVisible = await liveBadge.isVisible();
  expect(isDemoVisible || isLiveVisible).toBeTruthy();

  // Verify telemetry cards are visible
  await expect(page.locator('text=Cumulative Profit')).toBeVisible();
  await expect(page.locator('text=Win Rate')).toBeVisible();
  await expect(page.locator('text=Rounds Skipped')).toBeVisible();
  await expect(page.locator('text=Current Bankroll')).toBeVisible();
});
