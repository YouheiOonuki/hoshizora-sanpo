// 星座の由来 12 話の読み上げの音声を作る（yorozu-plans ROADMAP 7.36.1 K140、企画書 84）。
//   npm i --no-save lamejs@1.2.1 && node tools/build-shinwa-audio.mjs [--only uma,ori]
// 読ませるのは tools/shinwa-yomi.js の yomi（tools/build-shinwa-yomi.mjs が作る）。1 段ずつ MeloTTS で読み、つないで 1 話 1 つの mp3 に。
// 出力: shinwa/audio/<slug>.mp3 と shinwa/audio/index.json（大きさ・秒・作った日）。利用時にサーバーは要らない（ページは押したときにこの mp3 を読む）
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { speakMp3, pool } from './tts-mp3.mjs';

const { YOMI } = createRequire(import.meta.url)('./shinwa-yomi.js');
const dir = new URL('../shinwa/audio/', import.meta.url);
mkdirSync(dir, { recursive: true });
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null;
const idxFile = new URL('index.json', dir);
const index = existsSync(idxFile) ? JSON.parse(readFileSync(idxFile, 'utf8')) : { model: '@cf/myshell-ai/melotts', format: 'mp3 32kbps 16kHz mono', source: 'tools/shinwa-yomi.js の yomi', files: {} };
// 1 段が長いと MeloTTS が崩れるので、句点で 120 字までに分ける
const split = (y) => y.split(/(?<=。)/).reduce((a, s) => { if (a.length && (a[a.length - 1] + s).length <= 120) a[a.length - 1] += s; else a.push(s); return a; }, []).filter((x) => x.trim());
await pool(YOMI.filter((s) => !only || only.has(s.slug)), 3, async (s) => {
  const { mp3, seconds } = await speakMp3(s.parts.flatMap((p) => split(p.yomi)));
  writeFileSync(new URL(s.slug + '.mp3', dir), mp3);
  index.files[s.slug] = { bytes: mp3.length, seconds: Math.round(seconds) };
  console.log(`${s.slug} ${Math.round(seconds)}秒 ${Math.round(mp3.length / 1024)}KB`);
});
index.made = new Date().toISOString().slice(0, 10);
index.files = Object.fromEntries(Object.entries(index.files).sort());
writeFileSync(idxFile, JSON.stringify(index, null, 1) + '\n');
const total = Object.values(index.files).reduce((a, x) => a + x.bytes, 0);
console.log(`全部で ${Object.keys(index.files).length} 話、${(total / 1024 / 1024).toFixed(2)} MB`);
