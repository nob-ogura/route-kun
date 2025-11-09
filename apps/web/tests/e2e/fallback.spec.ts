import { test, expect } from '@playwright/test';

test.describe('Optimizer Fallback', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should handle optimizer timeout gracefully', async ({ page }) => {
    // Note: Currently uses demo scenario system. To test real timeout:
    // - Set up MSW in browser context with optimizerTimeoutHandler
    // - Modify page.tsx to make real API calls instead of selectDemoScenario

    // 1. Enter addresses with "fallback" keyword to trigger fallback scenario
    const addressTextarea = page.locator('textarea[name="addresses"]');
    await addressTextarea.fill('Tokyo Station\nTokyo Tower\nfallback');

    // 2. Click optimize (Japanese text: "最適化")
    const optimizeButton = page.locator('button:has-text("最適化")');
    await optimizeButton.click();

    // 3. Wait for optimization to complete
    await page.waitForSelector('text=完了', { timeout: 10000 });

    // 4. Should show fallback notification
    const fallbackNotice = page.locator('[data-testid="fallback-notice"]');
    await expect(fallbackNotice).toBeVisible();

    // 5. Should still display results using fallback algorithm
    const routeResult = page.locator('[data-testid="route-result"]');
    await expect(routeResult).toBeVisible();

    // 6. Verify fallback indicator (solver shows "nearest_neighbor" in fallback scenario)
    const algorithmBadge = page.locator('[data-testid="algorithm-badge"]');
    await expect(algorithmBadge).toContainText('nearest_neighbor');
  });

  test('should allow retry after fallback', async ({ page }) => {
    // 1. Set up fallback scenario first
    const addressTextarea = page.locator('textarea[name="addresses"]');
    await addressTextarea.fill('Tokyo Station\nTokyo Tower\nfallback');

    const optimizeButton = page.locator('button:has-text("最適化")');
    await optimizeButton.click();

    // 2. Wait for optimization to complete with fallback
    await page.waitForSelector('text=完了', { timeout: 10000 });
    const fallbackNotice = page.locator('[data-testid="fallback-notice"]');
    await expect(fallbackNotice).toBeVisible();

    // 3. Now retry button should be enabled (form is valid and status is success)
    const retryButton = page.locator('button:has-text("再実行")');
    await expect(retryButton).toBeEnabled();
    await retryButton.click();

    // 4. Should attempt optimization again
    await expect(page.locator('text=実行中')).toBeVisible();

    // 5. Wait for completion
    await expect(page.locator('span.status-chip:has-text("完了")')).toBeVisible({ timeout: 35000 });
  });
});

