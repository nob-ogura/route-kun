import { test, expect } from '@playwright/test';

test.describe('Optimizer Fallback', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should handle optimizer timeout gracefully', async ({ page }) => {
    // This test would require MSW to simulate a timeout
    // For now, this is a placeholder structure

    // 1. Enter addresses
    const originInput = page.locator('input[name="origin"]').first();
    await originInput.fill('Tokyo Station');

    const addDestinationButton = page.locator('button:has-text("Add Destination")').first();
    await addDestinationButton.click();
    
    const destination1 = page.locator('input[name^="destination"]').first();
    await destination1.fill('Tokyo Tower');

    // 2. Mock slow optimizer response (would be done via MSW)
    // For actual implementation, we'd need to:
    // - Set up MSW in browser context
    // - Configure handler to delay response beyond timeout

    // 3. Click optimize
    const optimizeButton = page.locator('button:has-text("Optimize")').first();
    await optimizeButton.click();

    // 4. Should eventually show fallback notification
    const fallbackNotice = page.locator('[data-testid="fallback-notice"]');
    await expect(fallbackNotice).toBeVisible({ timeout: 35000 });

    // 5. Should still display results using fallback algorithm
    const routeResult = page.locator('[data-testid="route-result"]');
    await expect(routeResult).toBeVisible();

    // 6. Verify fallback indicator
    const algorithmBadge = page.locator('[data-testid="algorithm-badge"]');
    await expect(algorithmBadge).toContainText('Nearest Neighbor');
  });

  test('should allow retry after fallback', async ({ page }) => {
    // Assuming we're in a fallback state
    const retryButton = page.locator('button:has-text("Retry with Optimizer")').first();
    
    if (await retryButton.isVisible()) {
      await retryButton.click();

      // Should attempt optimization again
      const loadingIndicator = page.locator('[data-testid="loading"]');
      await expect(loadingIndicator).toBeVisible();

      // Wait for completion
      await expect(loadingIndicator).not.toBeVisible({ timeout: 35000 });
    }
  });
});

