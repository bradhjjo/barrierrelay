import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const work = resolve(root, 'tools/video/.work');
await mkdir(work, { recursive: true });
const { id } = JSON.parse(await readFile(resolve(root, 'extension/key.json'), 'utf8'));
const profile = await mkdtemp(resolve(tmpdir(), 'barrierrelay-video-'));
const common = String.raw`
await taskSpaces.useOrCreate('barrierrelay-video');
page.setDefaultTimeout(180000);
const pause = ms => page.waitForTimeout(ms);
async function viewport() {
  await cdp('Emulation.setDeviceMetricsOverride', {width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  // Headless-only activation: background targets otherwise emit no live compositor frames.
  await cdp('Page.bringToFront');
}
async function settled() {
  await page.waitForFunction(() => !document.querySelector('.notice')?.textContent.includes('Working'));
  const error = await page.locator('main [role="alert"]').allTextContents();
  if (error.length) throw Error(error.join('\n'));
}
async function click(name) { await page.getByRole('button',{name,exact:true}).click(); await pause(1200); }
async function overlay(text) {
  await page.evaluate(text => {
    document.getElementById('video-recorder-label')?.remove();
    const el = document.createElement('div'); el.id='video-recorder-label'; el.textContent=text;
    el.style.cssText='position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:8px;background:#102e34;color:white;font:600 18px system-ui;pointer-events:none;box-shadow:0 2px 14px #0003';
    document.body.append(el);
    if (!document.getElementById('video-recorder-style')) {
      const style=document.createElement('style'); style.id='video-recorder-style';
      style.textContent='.routing{transition:transform .7s,box-shadow .7s}.routing.video-focus{transform:scale(1.025);box-shadow:0 0 0 4px #18b9a3,0 12px 36px #0002}.routing.video-focus tbody tr:last-child{background:#d9f7ef}';
      document.head.append(style);
    }
  },text);
}
async function routeFocus(on=true) { await page.evaluate(on=>document.querySelector('.routing')?.classList.toggle('video-focus',on),on); }
async function start(id) {
  // Recorder-only privacy mask; never change application data or control state.
  await page.evaluate(() => {
    for(const el of document.querySelectorAll('p')) if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(el.textContent)) {el.style.filter='blur(7px)';el.title='Synthetic contact details blurred for recording';}
    for(const el of document.querySelectorAll('img.capture')) {el.style.filter='blur(3px)';el.title='Local capture image blurred for recording';}
  });
  await page.screencast.start({path:WORK+'/'+id+'.webm',size:{width:1920,height:1080},quality:95});
}
async function stop(id) { await pause(2000); await page.screencast.stop(); }
`;
async function ego(body, nano=false) {
  const env = { ...process.env, EGO_LINUX_CHROME:resolve(root,'tools/video/chrome.mjs'), EGO_LINUX_PROFILE:nano?resolve(homedir(),'.cache/barrierrelay/chrome-nano'):profile, EGO_LINUX_HEADLESS:'1', EGO_LINUX_CURSOR:'0', XDG_STATE_HOME:resolve(work,nano?'nano-state':process.argv[2]==='closing'?'closing-state':'extension-state'), VIDEO_NANO:nano?'1':'0' };
  const child = spawn('ego-browser',['nodejs'], {cwd:root,env,stdio:['pipe','inherit','inherit']});
  child.stdin.end(`const WORK=${JSON.stringify(work)};const EXT=${JSON.stringify(id)};\n${common}\n${body}`);
  try {
    await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('ego-browser exited '+code)));});
  } finally {
    for(const flag of ['--cleanup-session','--stop']) {
      const cleanup=spawnSync('ego-browser',[flag],{cwd:root,env,encoding:'utf8'});
      if(cleanup.status!==0) console.error(cleanup.stderr);
    }
  }
}
const only=process.argv[2];
if (!only || only==='capture') await ego(String.raw`
await page.goto('http://127.0.0.1:5173/fixtures/pairs/02-icon-pay-button/broken.html');
await viewport();
await cdp('Extensions.loadUnpacked',{path:${JSON.stringify(resolve(root,'extension/dist'))}},null);
await start('01-problem');
for(let i=0;i<20;i++){await page.keyboard.press('Tab');await pause(450);if(await page.evaluate(()=>document.activeElement?.tagName==='BUTTON'))break;}
if(!await page.evaluate(()=>document.activeElement?.tagName==='BUTTON'))throw Error('Pay button not focused');
await overlay('Screen reader announcement SIMULATION: “button”');
await pause(6000); await stop('01-problem');
await page.goto('chrome-extension://'+EXT+'/options.html');
await page.locator('#origin').selectOption('http://127.0.0.1:5173');
await click('Save');
await page.goto('http://127.0.0.1:5173/fixtures/pairs/02-icon-pay-button/broken.html');await viewport();
await overlay('Real extension capture · temporary model-free profile');
await start('02-capture');
for(let i=0;i<20;i++){await page.keyboard.press('Tab');await pause(450);if(await page.evaluate(()=>document.activeElement?.tagName==='BUTTON'))break;}
const targets=await cdp('Target.getTargets',{filter:[{type:'tab'}]},null);
const tab=targets.targetInfos.find(t=>t.url.includes('/fixtures/pairs/02-icon-pay-button/broken.html'));
await cdp('Extensions.triggerAction',{id:EXT,targetId:tab.targetId},null);
await page.waitForFunction(()=>[...document.querySelectorAll('div')].some(e=>e.shadowRoot?.querySelector('textarea')));
await pause(1500);
// Only focus the existing control; actual keystrokes populate the extension dialog.
await page.evaluate(()=>[...document.querySelectorAll('div')].find(e=>e.shadowRoot?.querySelector('textarea')).shadowRoot.querySelector('textarea').focus());
for(const char of 'I need to pay, but my screen reader only says button.'){await page.keyboard.type(char);await pause(60);}
await page.getByRole('checkbox',{name:'Screen reader',exact:false}).check();
await pause(1800);
await page.getByRole('button',{name:'Capture and open report',exact:false}).focus();
await page.keyboard.press('Enter');
await pause(3500);
// Chrome-created extension tabs are not listed in the task-space facade.
// Attach through raw ego CDP to this task-created target; never navigate/recreate its one-time URL.
const all=await cdp('Target.getTargets',{},null);
const report=all.targetInfos.find(t=>t.type==='page'&&t.url?.startsWith('http://127.0.0.1:5173/report'));
if(!report)throw Error('Extension did not open the report');
await page.screencast.stop();
const {sessionId:handoffSession}=await cdp('Target.attachToTarget',{targetId:report.targetId,flatten:true},null);
await cdp('Page.enable',{},handoffSession);
await cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false},handoffSession);
await cdp('Page.bringToFront',{},handoffSession);
const intake=await cdp('Runtime.evaluate',{expression:'document.body.innerText',returnByValue:true},handoffSession);
if(!intake.result.value.includes('extension')||!intake.result.value.includes('(no accessible name)'))throw Error('Not a genuine extension capture');
await cdp('Runtime.evaluate',{expression:'('+function() {
  for(const image of document.querySelectorAll('img.capture')) image.style.filter='blur(3px)';
  const label=document.createElement('div');label.textContent='Real extension handoff · capture image blurred for recording';
  label.style.cssText='position:fixed;top:12px;left:400px;z-index:99999;background:#102e34;color:white;padding:12px;font:20px system-ui';document.body.append(label);
  document.querySelector('section[aria-labelledby=\"capture-heading\"]').scrollIntoView();
}.toString()+')()'},handoffSession);
const {spawn:encoderSpawn}=await import('node:child_process');
const encoder=encoderSpawn('ffmpeg',['-y','-v','error','-f','image2pipe','-framerate','10','-i','pipe:0','-c:v','libvpx','-deadline','realtime','-cpu-used','6','-b:v','4M',WORK+'/02-handoff.webm'],{stdio:['pipe','ignore','inherit']});
const encoded=new Promise((resolve,reject)=>{encoder.on('error',reject);encoder.on('exit',code=>code===0?resolve():reject(Error('Handoff encoder failed')));});
await page.drainEvents();
await cdp('Page.startScreencast',{format:'jpeg',quality:95,maxWidth:1920,maxHeight:1080},handoffSession);
let lastFrame,frameCount=0;
for(let tick=0;tick<60;tick++){
  await pause(100);
  for(const event of await page.drainEvents()) if(event.method==='Page.screencastFrame'&&event.sessionId===handoffSession){
    lastFrame=Buffer.from(event.params.data,'base64');await cdp('Page.screencastFrameAck',{sessionId:event.params.sessionId},handoffSession);
  }
  if(lastFrame){encoder.stdin.write(lastFrame);frameCount++;}
}
await cdp('Page.stopScreencast',{},handoffSession);encoder.stdin.end();await encoded;
if(!frameCount)throw Error('No real handoff screencast frames');
await cdp('Target.closeTarget',{targetId:report.targetId},null);
await taskSpaces.complete('barrierrelay-video',{keep:false});
`);
if (!only || only==='nano') await ego(String.raw`
await page.goto('http://127.0.0.1:5173/report?fixture=02-icon-pay-button&variant=broken');await viewport();await settled();
await click('Prepare private on-device AI');await settled();
if(await page.locator('section[aria-labelledby="report-device-heading"] strong').innerText()!=='available')throw Error('Nano unavailable');
await start('03-offline');
await cdp('Network.enable');
await cdp('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
if(await page.evaluate(()=>navigator.onLine))throw Error('Network not offline');
await overlay('Network: offline (DevTools emulation) · app + model already prepared');
await page.getByRole('button',{name:'Create private draft',exact:true}).scrollIntoViewIfNeeded();
await pause(1700);await click('Create private draft');await settled();
let rows=await page.locator('.routing tbody').innerText();
if(!/On-device/.test(rows)||!/Offline/.test(rows))throw Error('Not real offline on-device inference: '+rows);
await routeFocus();await pause(3500);await routeFocus(false);
await page.locator('textarea').first().focus();await page.keyboard.press('Control+Home');await page.keyboard.type('[demo] ');
await click('Run self-check');await settled();
if(!await page.evaluate(()=>document.body.textContent.includes('Self-check passed.')))throw Error('Self check failed');
await routeFocus();await pause(2200);await stop('03-offline');
await routeFocus(false);
await overlay('Privacy review · original note + image excluded');
await page.getByText('3. What leaves your device',{exact:true}).scrollIntoViewIfNeeded();
await start('04-privacy');await pause(2200);
await page.getByRole('checkbox',{name:'Include keyboard focus trail',exact:true}).check();await pause(3000);
await page.getByRole('checkbox',{name:'Include keyboard focus trail',exact:true}).uncheck();await pause(2000);
const payloadText=await page.locator('pre.payload').innerText();const payload=JSON.parse(payloadText);
if(/"(?:userNote|regionPng|facts)"\s*:/.test(payloadText))throw Error('Raw capture leaked to preview');
await page.locator('pre.payload').focus();await page.keyboard.press('ArrowDown');await pause(3000);await stop('04-privacy');
await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
await overlay('Network: online · real cloud request · edited for time if needed');
await start('05-cloud');await click('Get a fix plan');await settled();
const sources=await page.locator('.sources a').allTextContents();if(!sources.length)throw Error('No retrieved W3C sources');
rows=await page.locator('.routing tbody').innerText();if(!rows.includes('Cloud'))throw Error('Cloud row missing');
await routeFocus();await pause(3000);await routeFocus(false);
await page.locator('.sources').scrollIntoViewIfNeeded();await pause(4500);await stop('05-cloud');
await overlay('Real Firestore ticket · link access, not verified site ownership');
await click('Create shareable ticket');await settled();
const owner=await page.getByTestId('owner-link').getAttribute('href');
await pause(1800);await page.getByTestId('owner-link').click();await settled();
await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="ticket-status"]')));
await overlay('Site owner repair desk · link-based prototype access');await start('06-repair');await pause(2500);
await page.getByRole('button',{name:'Acknowledge',exact:true}).scrollIntoViewIfNeeded();await click('Acknowledge');await settled();
await click('Mark fixed');await settled();
await page.locator('#verify-fixture').selectOption('02-icon-pay-button');
await overlay('Synthetic fixed-fixture check · no live website is patched');await pause(2500);
await click('Verify fix');await settled();
if(await page.getByTestId('ticket-status').innerText()!=='verified')throw Error('Ticket not verified');
await page.getByTestId('ticket-status').scrollIntoViewIfNeeded();await pause(4000);await stop('06-repair');
const receipt={completed:true,owner,payloadBytes:payload.bytes,sources,routing:rows};
await (await import('node:fs/promises')).writeFile(WORK+'/hybrid-receipt.json',JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt));
await taskSpaces.complete('barrierrelay-video',{keep:false});
`,true);
if (!only || only==='sources') {
  const receipt=JSON.parse(await readFile(resolve(work,'hybrid-receipt.json'),'utf8'));
  await ego(`
await page.goto(${JSON.stringify('http://127.0.0.1:5173'+new URL(receipt.owner).pathname)});await viewport();await settled();
await page.locator('.sources').scrollIntoViewIfNeeded();
await overlay('Retrieved W3C sources · same real ticket, separate close-up');
await pause(1000);await start('05-sources');await pause(6500);await stop('05-sources');
await taskSpaces.complete('barrierrelay-video',{keep:false});
`);
}
if (!only || only==='closing') {
  const html=await readFile(resolve(root,'tools/video/closing.html'),'utf8');
  await ego(`
await page.goto(${JSON.stringify('data:text/html;charset=utf-8,'+encodeURIComponent(html))});
await viewport();
await start('07-closing'); await pause(24000); await stop('07-closing');
await taskSpaces.complete('barrierrelay-video',{keep:false});
`);
}
await writeFile(resolve(work,'recording-run.json'),JSON.stringify({recordedAt:new Date().toISOString(),mode:only??'all',temporaryProfile:profile},null,2));
