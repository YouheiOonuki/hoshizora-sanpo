// 読み上げの音声をビルド時に作る部品（yorozu-plans ROADMAP 7.36.1 K140）。利用時にサーバーは要らない（作った mp3 を静的に配る）。
// Workers AI の MeloTTS（日本語を読めるのはこれだけ: 企画書 81 の 6 章）→ 16kHz に落とす → mp3（32kbps・モノラル）。
// 使う前に（リポジトリには入れない。生成のときだけ）:
//   npm i --no-save lamejs@1.2.1
// トークンは Secret Manager の cloudflare-r2-token（Workers AI の Read あり）と cloudflare-account-id を gcloud で読む（値は出さない）。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const secret = (name) => execFileSync('gcloud', ['secrets', 'versions', 'access', 'latest', '--secret=' + name], { encoding: 'utf8', shell: true }).replace(/\s+/g, '');
let cred = null;
const creds = () => (cred ??= { token: secret('cloudflare-r2-token'), account: secret('cloudflare-account-id') });

export async function runAI(model, body) {
  const { token, account } = creds();
  for (let i = 0; ; i++) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (j.success) return j.result;
    if (i >= 3) throw new Error(model + ' ' + JSON.stringify(j.errors || r.status).slice(0, 200));
    await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
  }
}

// lamejs の Node 向けの入口は MPEGMode の不具合で動かないので、同梱の 1 ファイル版を vm で読む
let lame = null;
function lamejs() {
  if (lame) return lame;
  const req = createRequire(import.meta.url);
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(req.resolve('lamejs/lame.all.js'), 'utf8'), ctx);
  return (lame = ctx.lamejs);
}

/** WAV（16bit）→ 16kHz の Int16Array（区間の平均で落とす） */
export function wavTo16k(wav) {
  const b = Buffer.from(wav);
  const rate = b.readUInt32LE(24);
  const di = b.indexOf(Buffer.from('data'));
  const n = Math.floor(b.readUInt32LE(di + 4) / 2);
  const ratio = rate / 16000, m = Math.floor(n / ratio), out = new Int16Array(m);
  for (let i = 0; i < m; i++) {
    const a = Math.floor(i * ratio), z = Math.max(a + 1, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let k = a; k < z; k++) s += b.readInt16LE(di + 8 + k * 2);
    out[i] = Math.round(s / (z - a));
  }
  return out;
}

/** 16kHz の Int16Array → mp3（32kbps） */
export function toMp3(pcm) {
  const enc = new (lamejs().Mp3Encoder)(1, 16000, 32);
  const out = [];
  for (let i = 0; i < pcm.length; i += 1152) { const b = enc.encodeBuffer(pcm.subarray(i, i + 1152)); if (b.length) out.push(Buffer.from(b)); }
  out.push(Buffer.from(enc.flush()));
  return Buffer.concat(out);
}

/** かなの文（いくつかに分けた列）→ mp3。文と文の間に 0.3 秒の無音 */
export async function speakMp3(parts) {
  const gap = new Int16Array(4800);
  const pcm = [];
  for (const [i, p] of parts.entries()) {
    const r = await runAI('@cf/myshell-ai/melotts', { prompt: p, lang: 'jp' });
    pcm.push(wavTo16k(Buffer.from(r.audio, 'base64')));
    if (i < parts.length - 1) pcm.push(gap);
  }
  const all = new Int16Array(pcm.reduce((a, x) => a + x.length, 0));
  let o = 0;
  for (const x of pcm) { all.set(x, o); o += x.length; }
  return { mp3: toMp3(all), seconds: all.length / 16000 };
}

/** mp3 を whisper で文字に戻す（確かめ用） */
export async function hearBack(mp3) {
  const r = await runAI('@cf/openai/whisper-large-v3-turbo', { audio: Buffer.from(mp3).toString('base64'), language: 'ja' });
  return String(r.text || '').trim();
}

/** 同時に n 本ずつ */
export async function pool(items, n, fn) {
  let i = 0;
  const out = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
