// Nano Banana image generator via Playwright
import { chromium } from "playwright";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Xianyu promo image prompt (Chinese, realistic style for better conversion)
const PROMPT = `A student desk with laptop showing colorful website design on screen, notebook with handwritten notes beside keyboard, a cup of coffee, warm afternoon sunlight through window, cozy casual vibe, realistic photo style, not overly polished, natural lighting --ar 1:1`;

const SITE = process.argv[2] || "https://nanobanana.im/create";
const OUTPUT = resolve(__dirname, "feishu-data", "promo-image.png");

async function main() {
  console.log(`Launching browser...`);
  console.log(`Target: ${SITE}`);

  const browser = await chromium.launch({ headless: false }); // need headed for some sites
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "zh-CN",
  });
  const page = await context.newPage();

  try {
    // Navigate to Nano Banana
    console.log(`Navigating to ${SITE}...`);
    await page.goto(SITE, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    // Take a screenshot to understand the page
    await page.screenshot({ path: resolve(__dirname, "feishu-data", "step1-page.png"), fullPage: false });
    console.log("Page loaded, screenshot saved.");

    // Try to find the prompt input - common selectors for AI image generators
    const inputSelectors = [
      'textarea[placeholder*="prompt" i]',
      'textarea[placeholder*="describe" i]',
      'textarea[placeholder*="描述" i]',
      'textarea[placeholder*="输入" i]',
      'textarea[placeholder*="prompt" i]',
      'textarea',
      '[contenteditable="true"]',
      'input[type="text"]',
      '#prompt',
      '[data-testid="prompt-input"]',
    ];

    let promptInput = null;
    for (const sel of inputSelectors) {
      promptInput = await page.$(sel);
      if (promptInput) {
        console.log(`Found input: ${sel}`);
        break;
      }
    }

    if (promptInput) {
      // Clear and type the prompt
      await promptInput.click();
      await page.waitForTimeout(500);
      await promptInput.fill("");
      await promptInput.type(PROMPT, { delay: 10 });
      console.log(`Prompt entered: ${PROMPT.substring(0, 80)}...`);
      await page.waitForTimeout(1000);

      // Take screenshot after entering prompt
      await page.screenshot({ path: resolve(__dirname, "feishu-data", "step2-prompt.png"), fullPage: false });

      // Try to find and click the generate button
      const generateSelectors = [
        'button:has-text("Generate")',
        'button:has-text("生成")',
        'button:has-text("Create")',
        'button[type="submit"]',
        '[role="button"]:has-text("Generate")',
        'button:has-text("Go")',
        'button:has-text("Start")',
        'button',
      ];

      let genBtn = null;
      for (const sel of generateSelectors) {
        genBtn = await page.$(sel);
        if (genBtn) {
          const text = await genBtn.textContent();
          console.log(`Found button: "${text?.trim()}" (${sel})`);
          break;
        }
      }

      if (genBtn) {
        await genBtn.click();
        console.log("Clicked generate button, waiting for image...");

        // Wait for image to be generated (can take 10-60 seconds)
        await page.waitForTimeout(5000);

        // Take screenshot after clicking
        await page.screenshot({ path: resolve(__dirname, "feishu-data", "step3-generating.png"), fullPage: false });

        // Wait longer and try to find the generated image
        for (let i = 0; i < 24; i++) { // wait up to 120 seconds
          console.log(`Waiting... ${(i+1)*5}s`);
          await page.waitForTimeout(5000);

          // Look for generated images
          const imgSelectors = [
            'img[src*="generated" i]',
            'img[src*="output" i]',
            'img[alt*="generated" i]',
            'img[alt*="Generated" i]',
            '.generated-image img',
            '[class*="result"] img',
            '[class*="output"] img',
            'img[src*="blob"]',
            'img[src*="firebasestorage"]',
            'img[src*="supabase"]',
            'img[src*="cloudfront"]',
            'img:not([src*="logo"]):not([src*="icon"]):not([src*="avatar"])',
          ];

          for (const sel of imgSelectors) {
            const imgs = await page.$$(sel);
            for (const img of imgs) {
              const src = await img.getAttribute("src");
              const naturalWidth = await img.evaluate(el => el.naturalWidth);
              if (src && naturalWidth > 200) {
                console.log(`Found large image: ${src.substring(0, 100)}... (${naturalWidth}px)`);
                // Download the image
                const response = await page.evaluate(async (url) => {
                  const res = await fetch(url);
                  const blob = await res.blob();
                  const reader = new FileReader();
                  return new Promise((resolve) => {
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                  });
                }, src);

                if (response) {
                  // Convert base64 to buffer
                  const base64 = response.split(",")[1];
                  const buf = Buffer.from(base64, "base64");
                  if (!existsSync(resolve(__dirname, "feishu-data"))) {
                    mkdirSync(resolve(__dirname, "feishu-data"), { recursive: true });
                  }
                  writeFileSync(OUTPUT, buf);
                  console.log(`Image saved to: ${OUTPUT} (${buf.length} bytes)`);
                  await browser.close();
                  console.log("DONE");
                  return;
                }
              }
            }
          }
        }
        console.log("Timed out waiting for generated image.");
      } else {
        console.log("Could not find generate button. Page state:");
        console.log(await page.title());
      }
    } else {
      console.log("Could not find prompt input. Page title:", await page.title());
    }

    // Final screenshot for debugging
    await page.screenshot({ path: resolve(__dirname, "feishu-data", "step-final.png"), fullPage: true });
    console.log("Final screenshot saved.");
  } catch (e) {
    console.error("Error:", e.message);
    await page.screenshot({ path: resolve(__dirname, "feishu-data", "error.png"), fullPage: true });
  } finally {
    await browser.close();
  }
}

main();
