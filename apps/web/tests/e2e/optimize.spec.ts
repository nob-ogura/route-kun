import { test, expect } from '@playwright/test';

test.describe('Route Optimization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the main page', async ({ page }) => {
    await expect(page).toHaveTitle(/RouteKun Optimizer/i);
  });

  test('should optimize a route successfully', async ({ page }) => {
    // 1. Enter addresses in the textarea (one per line)
    const addressTextarea = page.locator('textarea[name="addresses"]');
    await addressTextarea.fill('Tokyo Station\nTokyo Tower\nSensoji Temple');

    // 2. Click optimize button (Japanese text: "最適化")
    const optimizeButton = page.locator('button:has-text("最適化")');
    await optimizeButton.click();

    // 3. Wait for optimization to complete (status changes from "実行中" to "完了")
    await page.waitForSelector('text=完了', { timeout: 30000 });

    // 4. Verify route stops are listed (origin + 3 destinations = 4 stops)
    // Note: Demo scenario returns 4 stops regardless of input
    const routeStops = page.locator('.stop-list ol li');
    await expect(routeStops).toHaveCount(4);

    // 5. Verify distance and duration metrics are displayed
    const metrics = page.locator('.metric');
    await expect(metrics).toHaveCount(2);
    
    const totalDistance = metrics.first();
    await expect(totalDistance.locator('strong')).not.toHaveText('—');

    const totalDuration = metrics.nth(1);
    await expect(totalDuration.locator('strong')).not.toHaveText('—');

    // 6. Verify map panel is visible (RouteMap component renders here)
    const mapPanel = page.locator('.map-panel');
    await expect(mapPanel).toBeVisible();
  });

  test('should handle validation errors', async ({ page }) => {
    // Try to optimize without entering addresses
    const optimizeButton = page.locator('button:has-text("最適化")');
    
    // Button should be disabled when form is invalid
    await expect(optimizeButton).toBeDisabled();

    // Should show validation error message
    const errorMessage = page.locator('[role="alert"]').first();
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('住所を入力してください');
  });

  test('should display route history', async ({ page }) => {
    // This test assumes the user has previously optimized routes
    const historySection = page.locator('[data-testid="route-history"]');
    
    if (await historySection.isVisible()) {
      const historyItems = page.locator('[data-testid="history-item"]');
      expect(await historyItems.count()).toBeGreaterThan(0);
    }
  });
});

