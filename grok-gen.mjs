// Simple Playwright script: Go to grok.com, generate image, download it
import { chromium } from 'playwright';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT = `A student desk with laptop showing colorful website design on screen, notebook with handwritten notes beside keyboard, a cup of coffee, warm afternoon sunlight through window, cozy casual vibe, realistic photo style, not overly polished, natural lighting, 1:1 square format`;
const OUTPUT = resolve(__dirname, "feishu-data", "promo-image.png");

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    // Try Grok - grok.com (may redirect to x.com/i/grok)
    console.log("Trying Grok...");
    await page.goto("https://grok.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: resolve(__dirname, "feishu-data", "grok-page.png") });
    console.log("Grok page title:", await page.title());

    // Look for textarea
    const textarea = await page.$('textarea');
    if (textarea) {
      await textarea.fill(PROMPT);
      await page.waitForTimeout(1000);
      await page.screenshot({ path: resolve(__dirname, "feishu-data", "grok-prompt.png") });

      // Try pressing Enter to submit
      await page.keyboard.press('Enter');
      console.log("Submitted prompt, waiting for response...");
      await page.waitForTimeout(15000);
      await page.screenshot({ path: resolve(__dirname, "feishu-data", "grok-response.png") });

      // Try to find generated image
      const imgs = await page.$$('img');
      for (const img of imgs) {
        const src = await img.getAttribute('src');
        const w = await img.evaluate(el => el.naturalWidth);
        console.log(`Image: ${w}px, src: ${src?.substring(0, 80)}`);
        if (w > 300 && src) {
          // Try to download via fetch
          try {
            const response = await page.evaluate(async (url) => {
              const res = await fetch(url);
              const blob = await res.blob();
              return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              });
            }, src);
            const base64 = response.split(',')[1];
            if (base64) {
              const buf = Buffer.from(base64, 'base64');
              if (!existsSync(resolve(__dirname, "feishu-data"))) mkdirSync(resolve(__dirname, "feishu-data"), { recursive: true });
              writeFileSync(OUTPUT, buf);
              console.log(`SUCCESS: Saved ${buf.length} bytes to ${OUTPUT}`);
              await browser.close();
              return;
            }
          } catch (e) {
            console.log("Failed to download:", e.message);
          }
        }
      }
      console.log("Could not find generated image in Grok.");
    } else {
      console.log("No textarea found on Grok page.");
    }
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await browser.close();
  }
}

main();
