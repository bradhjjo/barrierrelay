import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDemo } from './demo-page.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const work = resolve(root, 'tools/video/.work');
await mkdir(work, { recursive: true });
const { id } = JSON.parse(await readFile(resolve(root, 'extension/key.json'), 'utf8'));

async function ego(body, { nano = false, checkout = '' } = {}) {
  const temporary = nano ? null : await mkdtemp(resolve(tmpdir(), 'barrierrelay-video-'));
  const env = {
    ...process.env,
    EGO_LINUX_CHROME: resolve(root, 'tools/video/chrome.mjs'),
    EGO_LINUX_PROFILE: temporary ?? resolve(homedir(), '.cache/barrierrelay/chrome-nano'),
    EGO_LINUX_HEADLESS: '1',
    EGO_LINUX_CURSOR: '0',
    EGO_BROWSER_SESSION_ID: 'barrierrelay-video-' + process.pid,
    XDG_STATE_HOME: resolve(work, nano ? 'nano-state' : 'closing-state'),
    VIDEO_NANO: nano ? '1' : '0',
  };
  const input = `const config = ${JSON.stringify({ work, id, checkout, extension: resolve(root, 'extension/dist') })};\n${body}`;
  const child = spawn('ego-browser', ['nodejs'], { cwd: root, env, stdio: ['pipe', 'inherit', 'inherit'] });
  child.stdin.end(input);
  try {
    await new Promise((done, fail) => {
      child.on('error', fail);
      child.on('exit', code => code === 0 ? done() : fail(Error('ego-browser exited ' + code)));
    });
  } finally {
    for (const flag of ['--cleanup-session', '--stop']) {
      const cleanup = spawnSync('ego-browser', [flag], { cwd: root, env, encoding: 'utf8' });
      if (cleanup.status !== 0) console.error('ego-browser cleanup failed:', flag);
    }
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}

const stage = process.argv[2] || 'all';
if (!['all', 'story', 'closing'].includes(stage)) throw Error('Use record.mjs [story|closing]');
if (stage !== 'closing') {
  await rm(resolve(work, 'hybrid-receipt.json'), { force: true });
  const demo = await serveDemo(work);
  try {
    await ego(await readFile(resolve(root, 'tools/video/story.js'), 'utf8'), {
      nano: true,
      checkout: demo.origin + '/checkout.html',
    });
  } finally {
    demo.close();
  }
}
if (stage !== 'story') {
  const html = await readFile(resolve(root, 'tools/video/closing.html'), 'utf8');
  await ego(`
await taskSpaces.useOrCreate('barrierrelay-video');
await page.goto(${JSON.stringify('data:text/html;charset=utf-8,' + encodeURIComponent(html))});
await cdp('Emulation.setDeviceMetricsOverride', {width:1920,height:1080,deviceScaleFactor:1,mobile:false});
await cdp('Page.bringToFront');
await page.screencast.start({path:config.work+'/07-closing.webm',size:{width:1920,height:1080},quality:95});
await page.waitForTimeout(20000);
await page.screencast.stop();
await taskSpaces.complete('barrierrelay-video',{keep:false});
`);
}
