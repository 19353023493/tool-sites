async (page) => {
  // Go to Nano Banana
  await page.goto('https://nanobanana.im/create', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Find the textarea/input for the prompt
  const textareas = await page.$$('textarea');
  let input = null;
  for (const ta of textareas) {
    const placeholder = await ta.getAttribute('placeholder');
    if (placeholder && (placeholder.includes('prompt') || placeholder.includes('describe') || placeholder.includes('描述'))) {
      input = ta;
      break;
    }
  }
  if (!input && textareas.length > 0) input = textareas[0];

  if (input) {
    // Type the prompt
    await input.click();
    await page.waitForTimeout(500);
    const prompt = "A student desk with laptop showing colorful website design on screen, notebook with handwritten notes beside keyboard, a cup of coffee, warm afternoon sunlight through window, cozy casual vibe, realistic photo style, not overly polished, natural lighting, 1:1 aspect ratio";
    await input.fill(prompt);
    await page.waitForTimeout(1000);

    // Find and click generate button
    const buttons = await page.$$('button');
    for (const btn of buttons) {
      const text = await btn.textContent();
      if (text && (text.includes('Generate') || text.includes('生成') || text.includes('Create') || text.includes('Start'))) {
        await btn.click();
        break;
      }
    }

    // Wait for generation
    await page.waitForTimeout(10000);

    // Find generated image
    const imgs = await page.$$('img');
    let bestSrc = null;
    let bestWidth = 0;
    for (const img of imgs) {
      const w = await img.evaluate(el => el.naturalWidth);
      if (w > bestWidth) {
        bestWidth = w;
        bestSrc = await img.getAttribute('src');
      }
    }

    return { success: true, imageSrc: bestSrc, width: bestWidth };
  }

  return { success: false, title: await page.title(), body: await page.textContent('body').then(t => t.substring(0, 500)) };
}