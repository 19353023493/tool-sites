import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(__dirname, 'promo-card.html');
const outputPath = resolve(__dirname, 'feishu-data', 'promo-image.png');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.screenshot({ path: outputPath, type: 'png' });
console.log(`Screenshot saved: ${outputPath}`);
await browser.close();
