import { test, expect } from '@playwright/test';

test.describe('Route Optimization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the main page', async ({ page }) => {
    await expect(page).toHaveTitle(/Route Kun/i);
  });

  test('should optimize a route successfully', async ({ page }) => {
    // This is a placeholder test that demonstrates the structure
    // Real implementation would interact with the address form and map

    // 1. Enter origin address
    const originInput = page.locator('input[name="origin"]').first();
    await originInput.fill('Tokyo Station');

    // 2. Enter destination addresses
    const addDestinationButton = page.locator('button:has-text("Add Destination")').first();
    
    // Add first destination
    await addDestinationButton.click();
    const destination1 = page.locator('input[name^="destination"]').first();
    await destination1.fill('Tokyo Tower');

    // Add second destination
    await addDestinationButton.click();
    const destination2 = page.locator('input[name^="destination"]').nth(1);
    await destination2.fill('Sensoji Temple');

    // 3. Click optimize button
    const optimizeButton = page.locator('button:has-text("Optimize")').first();
    await optimizeButton.click();

    // 4. Wait for results
    await page.waitForSelector('[data-testid="route-result"]', { timeout: 30000 });

    // 5. Verify map is displayed
    const mapContainer = page.locator('[data-testid="map-container"]');
    await expect(mapContainer).toBeVisible();

    // 6. Verify route stops are listed
    const routeStops = page.locator('[data-testid="route-stop"]');
    await expect(routeStops).toHaveCount(3); // origin + 2 destinations

    // 7. Verify distance and duration are displayed
    const totalDistance = page.locator('[data-testid="total-distance"]');
    await expect(totalDistance).toBeVisible();

    const totalDuration = page.locator('[data-testid="total-duration"]');
    await expect(totalDuration).toBeVisible();
  });

  test('should handle validation errors', async ({ page }) => {
    // Try to optimize without entering addresses
    const optimizeButton = page.locator('button:has-text("Optimize")').first();
    await optimizeButton.click();

    // Should show validation error
    const errorMessage = page.locator('[role="alert"]').first();
    await expect(errorMessage).toBeVisible();
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

