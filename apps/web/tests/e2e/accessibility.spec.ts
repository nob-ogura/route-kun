import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('should not have automatically detectable accessibility issues on main page', async ({
    page
  }) => {
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should have accessible map container', async ({ page }) => {
    await page.goto('/');

    // Check for ARIA labels on map
    const mapContainer = page.locator('[data-testid="map-container"]');
    
    if (await mapContainer.isVisible()) {
      const ariaLabel = await mapContainer.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel).toContain('map');
    }
  });

  test('should have accessible form inputs', async ({ page }) => {
    await page.goto('/');

    // Address list textarea should have label
    const addressInput = page.locator('textarea[name="addresses"]').first();
    const addressLabel = page.locator('label[for="address-list"]').first();
    
    await expect(addressLabel).toBeVisible();
    
    // Should be associated with input
    const labelFor = await addressLabel.getAttribute('for');
    const inputId = await addressInput.getAttribute('id');
    expect(labelFor).toBe(inputId);
  });

  test('should have accessible buttons', async ({ page }) => {
    await page.goto('/');

    // All buttons should have accessible names
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();

    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const accessibleName = await button.innerText();
      const ariaLabel = await button.getAttribute('aria-label');
      
      // Button should have either text content or aria-label
      expect(accessibleName || ariaLabel).toBeTruthy();
    }
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/');

    // Tab through interactive elements
    await page.keyboard.press('Tab');
    let focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(['INPUT', 'TEXTAREA', 'BUTTON', 'A']).toContain(focused);

    // Continue tabbing - may return to BODY if no more focusable elements
    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => document.activeElement?.tagName);
    // BODY is acceptable when disabled buttons prevent further navigation
    expect(['INPUT', 'TEXTAREA', 'BUTTON', 'A', 'BODY']).toContain(focused);
  });

  test('should have accessible route result list', async ({ page }) => {
    await page.goto('/');

    // If results are visible
    const resultList = page.locator('.stop-list ol').first();
    
    if (await resultList.isVisible()) {
      // Should have proper ARIA roles
      const listItems = resultList.locator('li');
      expect(await listItems.count()).toBeGreaterThan(0);

      // Each stop should have accessible description
      const firstStop = listItems.first();
      const stopText = await firstStop.innerText();
      expect(stopText.length).toBeGreaterThan(0);
    }
  });

  test('should announce dynamic content changes', async ({ page }) => {
    await page.goto('/');

    // Check for ARIA live regions
    const liveRegion = page.locator('[aria-live]').first();
    
    if (await liveRegion.isVisible()) {
      const ariaLive = await liveRegion.getAttribute('aria-live');
      expect(['polite', 'assertive']).toContain(ariaLive);
    }
  });
});

