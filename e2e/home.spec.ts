import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`home feature text meets contrast at ${width}px in ${colorScheme} preference`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.emulateMedia({ colorScheme });
      await page.goto("/");
      const feature = page.locator(".card").filter({ has: page.getByRole("heading", { name: /Balances and receipts/ }) });
      await expect(feature).toBeVisible();
      const layout = await feature.evaluate((card) => {
        const style = getComputedStyle(card);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        const luminance = (color: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const rgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
          const linear = rgb.map((component) => {
            const channel = component / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
        };
        // The feature gradient has opaque endpoints whose RGB channels all darken in the same direction.
        const backgrounds = [style.backgroundColor, ...Array.from(style.backgroundImage.matchAll(/rgba?\([^)]*\)/g), ([color]) => color)];
        const contrast = Array.from(card.querySelectorAll("h2, p"), (element) => {
          const text = luminance(getComputedStyle(element).color);
          return Math.min(...backgrounds.map((color) => {
            const background = luminance(color);
            return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
          }));
        });
        return { contrast, width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth };
      });

      expect(layout.contrast).toHaveLength(3);
      for (const ratio of layout.contrast) expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(layout.width).toBeLessThanOrEqual(layout.viewport);
    });
  }
}
