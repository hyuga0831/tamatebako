// アイコン画像を作る（デザインを変えたときだけ `node scripts/make-icons.mjs` で作り直す）
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const BLUE = '#2a66d9';

/** ゲージの輪とチェックマーク。scale で中身の大きさ、round で角の丸みを変える */
function svg({ scale = 1, round = 112 } = {}) {
  const r = 150 * scale;
  const w = 44 * scale;
  const c = 2 * Math.PI * r;
  const p = (x, y) => `${256 + (x - 256) * scale} ${256 + (y - 256) * scale}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${round}" fill="${BLUE}"/>
  <circle cx="256" cy="256" r="${r}" fill="none" stroke="#fff" stroke-opacity="0.28" stroke-width="${w}"/>
  <circle cx="256" cy="256" r="${r}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * 0.25}" transform="rotate(-90 256 256)"/>
  <path d="M${p(196, 262)} L${p(238, 304)} L${p(318, 216)}" fill="none" stroke="#fff" stroke-width="${36 * scale}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

mkdirSync('public', { recursive: true });
writeFileSync('public/favicon.svg', svg());

const png = (source, size, file) => sharp(Buffer.from(source)).resize(size, size).png().toFile(`public/${file}`);

await png(svg(), 192, 'icon-192.png');
await png(svg(), 512, 'icon-512.png');
// マスク可能アイコンと iOS 用は、端まで塗って中身を小さめにする（OS 側が角を丸める）
await png(svg({ scale: 0.72, round: 0 }), 512, 'icon-maskable-512.png');
await png(svg({ scale: 0.82, round: 0 }), 180, 'apple-touch-icon.png');
console.log('icons written to public/');
