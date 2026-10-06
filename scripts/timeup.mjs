// 動作確認用：ミニ模試を途中で放置し、時間切れで結果画面に移ることを確かめる（約 2 分かかる）。
//   node scripts/timeup.mjs
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'ja-JP' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}#/q/shisoku/mini?seed=11`);
await page.waitForSelector('.expr');
// 3 問だけ答えて、あとは放置する。4 問目は選ぶだけで「次へ」を押さない
for (let i = 0; i < 3; i++) {
  await page.locator('.choice').first().click();
  await page.locator('.quiz-foot .btn.primary').click();
  await page.waitForTimeout(100);
}
await page.locator('.choice').nth(1).click();
const t0 = Date.now();
await page.waitForFunction(() => location.hash.startsWith('#/result'), null, { timeout: 150000 });
const waited = Math.round((Date.now() - t0) / 1000);
await page.waitForSelector('.result-head');
const head = (await page.locator('.result-head').innerText()).replace(/\s+/g, ' ');
const marks = await page.locator('details.rev .mk').allInnerTexts();
const saved = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('tamatebako:v1'));
  return { logs: s.logs.length, session: s.sessions[s.sessions.length - 1] };
});
console.log(JSON.stringify({ waited, head, marks: marks.join(''), saved, errors }, null, 1));
await browser.close();
