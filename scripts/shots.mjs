// 動作確認用：ビルドしたアプリを Edge で開き、主な画面を操作してスクリーンショットを撮る。
//   npm run build && npx vite preview --port 4173 --strictPort   （別のターミナルで）
//   node scripts/shots.mjs <出力フォルダ>
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const OUT = process.argv[2] ?? 'shots';
mkdirSync(OUT, { recursive: true });

const NOW = Date.now();
const logs = (f, n, acc, t, p = 'x') =>
  Array.from({ length: n }, (_, i) => ({ f, p, ok: i < Math.round(n * acc) ? 1 : 0, t, at: NOW - (n - i) * 60000, m: 'drill' }));
const SEEDED = {
  v: 1,
  logs: [...logs('shisoku', 40, 0.75, 14, 'int2'), ...logs('zuhyo', 12, 0.67, 35, 'rate'), ...logs('ronri', 16, 0.75, 18, 'C'), ...logs('shushi', 24, 0.83, 12, 'B')],
  sessions: [],
  seen: {},
  tipsRead: {},
  settings: { cutoff: 50, keisuTime: 0, gengoTime: 0, testDate: '', goal: '' },
};

const problems = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true });

async function open({ width, height, dark = false, seed = null }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: dark ? 'dark' : 'light',
    hasTouch: width < 600,
    isMobile: width < 600,
    serviceWorkers: 'block',
    locale: 'ja-JP',
  });
  if (seed) await ctx.addInitScript((s) => localStorage.setItem('tamatebako:v1', JSON.stringify(s)), seed);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  return { ctx, page };
}

const shot = (page, name, full = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
const goto = async (page, hash) => {
  await page.goto(`${BASE}#${hash}`);
  await page.waitForTimeout(300);
};
/** 横にはみ出している要素がないか（スマホで横スクロールが出ないこと） */
const checkOverflow = async (page, label) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 1) problems.push(`overflow: ${label} が横に ${over}px はみ出している`);
};

// ---------- スマホ（390×844）：初回の流れを最後まで ----------
{
  const { ctx, page } = await open({ width: 390, height: 844 });
  await goto(page, '/');
  await checkOverflow(page, 'ホーム');
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.waitForTimeout(300);
  for (let i = 0; i < 10; i++) {
    await checkOverflow(page, `四則逆算 ${i + 1}問目`);
    await page.locator('.choice').nth(i % 5).click();
    await page.waitForTimeout(120);
    await page.locator('.quiz-foot .btn.primary').click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(600);
  if (!(await page.locator('.result-head').count())) problems.push('flow: ドリルの後に結果画面が出ていない');
  await page.locator('details.rev').first().click();
  await page.waitForTimeout(150);
  await checkOverflow(page, '結果');
  await shot(page, 'm-result', true);
  await goto(page, '/f/shisoku');
  await checkOverflow(page, '形式ページ');
  await shot(page, 'm-format');
  await goto(page, '/settings');
  await checkOverflow(page, '設定');
  await ctx.close();
}

// ---------- スマホ：式の長い四則逆算、図表の種類ごと、空欄推測、言語 ----------
{
  const { ctx, page } = await open({ width: 390, height: 844, seed: SEEDED });

  // いちばん長い式が出る seed を探して撮る
  let longest = { seed: 1, len: 0 };
  for (let s = 1; s <= 40; s++) {
    await page.goto(`${BASE}#/q/shisoku/drill?seed=${s}`);
    await page.waitForSelector('.expr');
    const len = (await page.locator('.expr').getAttribute('aria-label')).length;
    await checkOverflow(page, `四則逆算 seed ${s}`);
    if (len > longest.len) longest = { seed: s, len };
  }
  await goto(page, `/q/shisoku/drill?seed=${longest.seed}`);
  await shot(page, 'm-shisoku-long');
  await page.locator('.choice').first().click();
  await page.waitForTimeout(150);
  await shot(page, 'm-shisoku-revealed');

  // 図表の種類ごとに 1 枚
  const seen = new Set();
  for (let s = 1; s <= 60 && seen.size < 5; s++) {
    await page.goto(`${BASE}#/q/zuhyo/drill?seed=${s}`);
    await page.waitForSelector('.fig');
    await checkOverflow(page, `図表 seed ${s}`);
    const kind = await page.evaluate(() => {
      const f = document.querySelector('.fig');
      if (f.querySelector('table')) return 'table';
      if (f.querySelector('.band')) return 'band';
      if (f.querySelector('.pie-wrap')) return 'pie';
      return f.querySelector('polyline') ? 'line' : 'bar';
    });
    if (seen.has(kind)) continue;
    seen.add(kind);
    await shot(page, `m-zuhyo-${kind}`);
  }
  if (seen.size < 5) problems.push(`zuhyo: 出なかった図表がある（出たのは ${[...seen].join(', ')}）`);

  // 空欄推測：列の多い表・見出しの長い表を確かめる
  for (const s of [1, 2, 3, 4, 5, 6, 7, 8]) {
    await page.goto(`${BASE}#/q/kuuran/drill?seed=${s}`);
    await page.waitForSelector('.fig');
    await checkOverflow(page, `空欄推測 seed ${s}`);
    if (s <= 2) await shot(page, `m-kuuran-${s}`);
  }
  await page.locator('.calc-toggle').click();
  await page.waitForTimeout(150);
  await shot(page, 'm-kuuran-calc');

  await goto(page, '/q/ronri/drill?seed=1');
  await checkOverflow(page, '論理的読解');
  for (let i = 0; i < 4; i++) await page.locator('.item').nth(i).locator('.abc button').nth(i % 3).click();
  await page.locator('.quiz-foot .btn.primary').click();
  await page.waitForTimeout(200);
  await page.locator('.item').first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 300));
  await page.waitForTimeout(150);
  await shot(page, 'm-ronri-revealed');

  // ミニ模試：解かずに放置し、時間切れで結果画面へ移ることを確かめる（趣旨判定は 105 秒）
  await goto(page, '/q/shisoku/mini?seed=3');
  await page.locator('.choice').first().click();
  await page.locator('.quiz-foot .btn.primary').click();
  await page.waitForTimeout(200);
  if ((await page.locator('.timer').count()) !== 1) problems.push('mini: タイマーが出ていない');
  await ctx.close();
}

// ---------- 小さい画面（360×640）とダークモード ----------
{
  const { ctx, page } = await open({ width: 360, height: 640 });
  for (let s = 1; s <= 25; s++) {
    await page.goto(`${BASE}#/q/shisoku/drill?seed=${s}`);
    await page.waitForSelector('.expr');
    await checkOverflow(page, `360px 四則逆算 seed ${s}`);
  }
  await shot(page, 's-shisoku');
  await ctx.close();
}
{
  const { ctx, page } = await open({ width: 390, height: 844, dark: true, seed: SEEDED });
  await goto(page, '/');
  await page.waitForTimeout(800);
  await shot(page, 'd-home');
  await goto(page, '/q/zuhyo/drill?seed=5');
  await shot(page, 'd-zuhyo');
  await ctx.close();
}

// ---------- PC（1280×800） ----------
{
  const { ctx, page } = await open({ width: 1280, height: 800, seed: SEEDED });
  await goto(page, '/');
  await page.waitForTimeout(800);
  await shot(page, 'p-home');
  await goto(page, '/q/zuhyo/drill?seed=7');
  await shot(page, 'p-zuhyo');
  await goto(page, '/q/ronri/drill?seed=7');
  await shot(page, 'p-ronri');
  await goto(page, '/q/shisoku/drill?seed=7');
  // キーボードで答える（1〜5 で選択、Enter で次へ）
  await page.keyboard.press('2');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const count = await page.locator('.quiz-top .count').innerText();
  if (!count.startsWith('2')) problems.push(`keyboard: 2 問目に進んでいない（表示 ${count}）`);
  await ctx.close();
}

// ---------- 解説の表示（縦に長い画面で、まちがえたときの解説を全部写す） ----------
{
  const { ctx, page } = await open({ width: 390, height: 1900, seed: SEEDED });
  for (const f of ['shisoku', 'zuhyo', 'kuuran']) {
    let found = false;
    for (let s = 1; s <= 40 && !found; s++) {
      await page.goto(`${BASE}#/q/${f}/drill?seed=${s}`);
      await page.waitForSelector('.choice');
      await page.locator('.choice').first().click();
      await page.waitForSelector('.exp');
      await checkOverflow(page, `解説 ${f} seed ${s}`);
      // 「選んだ答えが違う理由」が出る問題を撮る
      if (await page.locator('.diag').count()) {
        await shot(page, `e-${f}`);
        found = true;
      }
    }
    if (!found) problems.push(`explain: ${f} で「違う理由」が一度も出なかった`);
  }
  await goto(page, '/q/ronri/drill?seed=2');
  for (let i = 0; i < 4; i++) await page.locator('.item').nth(i).locator('.abc button').first().click();
  await page.locator('.quiz-foot .btn.primary').click();
  await page.waitForSelector('.lesson');
  await checkOverflow(page, '解説 論理的読解');
  await page.locator('.items').scrollIntoViewIfNeeded();
  await shot(page, 'e-ronri', true);
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'no problems found');
