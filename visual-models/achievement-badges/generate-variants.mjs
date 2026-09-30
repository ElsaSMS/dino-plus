import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const tierNames = { wood: '木', bronze: '铜', silver: '银', gold: '金', crystal: '水晶', hidden: '隐藏' };
const families = [
  { tier: 'wood', sample: '初入黄沙', variants: [
    ['outfit', '自有风姿']
  ] },
  ...['bronze', 'silver', 'gold'].map((tier) => ({ tier, sample: '逐光行远', variants: [
    ['extreme', '万里归途'],
    ['thorn', '一跃凌棘'],
    ['bird', '雄踞长空'],
    ['air-chain', '横渡苍穹'],
    ['cliff', '绝壑回身']
  ] })),
  { tier: 'crystal', sample: '双曜同辉', variants: [
    ['beak', '毫厘惊鸿'],
    ['shield-bird', '碎光截羽'],
    ['jetpack-cliff', '虹焰填壑'],
    ['triple-warning', '三响从容']
  ] },
  { tier: 'hidden', sample: '逐光行远', variants: [
    ['extreme', '万里归途'],
    ['thorn', '一跃凌棘'],
    ['bird', '雄踞长空'],
    ['air-chain', '横渡苍穹'],
    ['cliff', '绝壑回身']
  ] }
];

for (const { tier, sample, variants } of families) {
  const base = fs.readFileSync(path.join(directory, `${tier}.svg`), 'utf8');
  const label = base.match(/<text\b[^>]*\bid="achievement-name"[^>]*>([^<]+)<\/text>/g);
  if (!label || label.length !== 1 || !label[0].includes(`>${sample}</text>`)) {
    throw new Error(`${tier}.svg needs exactly one achievement-name label containing ${sample}`);
  }
  for (const [slug, name] of variants) {
    const svg = base.replaceAll(sample, name).replace(
      /(<title\b[^>]*>)[^<]*(<\/title>)/,
      (_, opening, closing) => `${opening}${name} · ${tierNames[tier]}徽章${closing}`
    );
    fs.writeFileSync(path.join(directory, `${tier}-${slug}.svg`), svg, 'utf8');
  }
}

console.log('Generated achievement-labelled badge variants.');
