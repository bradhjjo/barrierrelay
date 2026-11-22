import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rename, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { scenes } from './scenes.mjs';
const work = resolve('tools/video/.work');
const out = resolve(work, 'delivery');
const delivery = resolve('docs/video');
const receipt = JSON.parse(await readFile(resolve(work, 'hybrid-receipt.json'), 'utf8'));
if (receipt.ticket?.lifecycle.at(-1) !== 'verified' || !receipt.recapture?.sameCheckout) {
  throw Error('Record a successful patched-page re-capture before rendering.');
}
await mkdir(out,{recursive:true});
function run(command,args){const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:32*1024*1024});if(r.status!==0)throw Error(r.stderr||r.error?.message||command+' failed');return r.stdout;}
function duration(path){return Number(run('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',path]).trim());}
function stamp(n){const ms=Math.round(n*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;}
function seconds(t){const [h,m,s]=t.replace(',','.').split(':').map(Number);return h*3600+m*60+s;}
// Keep the TTS start times and clamp ends at the next cue's start.
let offset = 0;
const captions = [];
const timeline = [];
for (const scene of scenes) {
  const voiceSeconds = duration(resolve(work, 'audio', scene.id + '.mp3'));
  const length = voiceSeconds + 0.65 + (scene.id === '02-capture' ? 2.5 : 0);
  timeline.push({ id: scene.id, title: scene.title, start: offset, end: offset + length, duration: length, voiceSeconds });
  const local = await readFile(resolve(work, 'audio', scene.id + '.srt'), 'utf8');
  for (const block of local.trim().split(/\r?\n\r?\n/)) {
    const [index, timing, ...lines] = block.split(/\r?\n/);
    if (!/^\d+$/.test(index) || !timing?.includes(' --> ')) throw Error('Invalid TTS cue in ' + scene.id);
    const [start, end] = timing.split(' --> ').map(seconds);
    // Edge TTS drops the closing quotation mark after the period.
    const text = lines.join(' ').replace(/“button\.(?!”)/, '“button.”');
    const wrapped = [];
    let line = '';
    for (const word of text.split(' ')) {
      const joined = [line, word].filter(Boolean).join(' ');
      if (line && joined.length > 65) {
        wrapped.push(line);
        line = word;
      } else {
        line = joined;
      }
    }
    wrapped.push(line);
    captions.push({ start: offset + start, end: offset + end, text: wrapped.join('\n') });
  }
  offset += length;
}
if (offset > 175) throw Error(`Narration too long: ${offset}s; shorten script before rendering`);
const srt = captions.map((cue, i) => {
  const end = Math.min(cue.end, captions[i + 1]?.start ?? cue.end);
  if (stamp(end) <= stamp(cue.start)) throw Error('Invalid final cue timing for caption ' + (i + 1));
  return `${i + 1}\n${stamp(cue.start)} --> ${stamp(end)}\n${cue.text}\n\n`;
}).join('');
await writeFile(resolve(out, 'barrierrelay-demo.srt'), srt);
await writeFile(resolve(out, 'timeline.json'), JSON.stringify(timeline, null, 2));

const offline = timeline.find(scene => scene.id === '03-offline');
const routingCue = captions.find(cue => cue.text.startsWith('The routing row shows on-device inference'));
if (!routingCue) throw Error('Missing offline routing narration cue');
// Leave room for frame rounding and the audio joins on each side of the cue.
const routingStart = routingCue.start - offline.start - 0.25;
const routingLength = routingCue.end - routingCue.start + 0.4;
const offlineRaw = resolve(work, '03-offline.webm');
const { waiting, routing, selfCheck } = JSON.parse(await readFile(resolve(work, 'offline-cuts.json'), 'utf8'));
if (!(0 < waiting && waiting < routing && routing < selfCheck && selfCheck < duration(offlineRaw))) {
  throw Error('Invalid offline footage cut points');
}
// Drop the recorded inference wait. Match the actual routing row and self-check to narration.
const offlineParts = [
  { start: 0, end: waiting, length: routingStart },
  { start: routing, end: selfCheck, length: routingLength },
  { start: selfCheck, end: duration(offlineRaw), length: offline.duration - routingStart - routingLength },
];
const offlineFilters = offlineParts.map(({ start, end, length }, i) => {
  const speed = Math.min(1, length / (end - start));
  return `[o${i}]trim=start=${start}:end=${end},setpts=${speed}*(PTS-STARTPTS),fps=30,tpad=stop_mode=clone:stop_duration=${length},trim=duration=${length}[v${i}]`;
});
run('ffmpeg', ['-y', '-v', 'error', '-i', offlineRaw, '-filter_complex_threads', '2', '-filter_complex',
  ['[0:v]split=3[o0][o1][o2]', ...offlineFilters, '[v0][v1][v2]concat=n=3:v=1:a=0[story]'].join(';'),
  '-map', '[story]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', resolve(work, '03-offline-combined.mp4')]);

// Normalize each shot before joining managed and raw CDP recordings.
const shots = {
  '02-capture': ['02-capture', '02-handoff'],
  '06-repair': ['06-owner', '06-diff', '06-arm', '06-recapture', '06-verify'],
};
const repair = timeline.find(scene => scene.id === '06-repair');
const repairSrt = await readFile(resolve(work, 'audio', '06-repair.srt'), 'utf8');
const repairStarts = ['Here is the source diff.', 'The owner marks it fixed', 'I reload the patched page', 'The ticket verifies'].map(cue => {
  const block = repairSrt.split(/\r?\n\r?\n/).find(text => text.includes(cue));
  if (!block) throw Error('Missing repair narration cue: ' + cue);
  return seconds(block.split(/\r?\n/)[1].split(' --> ')[0]);
});
const repairCuts = [0, ...repairStarts, repair.duration];
for (const [scene, parts] of Object.entries(shots)) {
  const inputs = parts.flatMap(part => ['-i', resolve(work, part + '.webm')]);
  const filters = parts.map((name, i) => {
    const normalize = `[${i}:v]scale=1920:1080,setsar=1`;
    if (scene !== repair.id) return `${normalize},fps=30,setpts=PTS-STARTPTS[v${i}]`;
    const length = repairCuts[i + 1] - repairCuts[i];
    const speed = Math.min(1, length / duration(resolve(work, name + '.webm')));
    return `${normalize},setpts=${speed}*(PTS-STARTPTS),fps=30,tpad=stop_mode=clone:stop_duration=${length},trim=duration=${length}[v${i}]`;
  });
  const order = parts.map((_, i) => `[v${i}]`).join('');
  run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex_threads', '2', '-filter_complex',
    `${filters.join(';')};${order}concat=n=${parts.length}:v=1:a=0[story]`,
    '-map', '[story]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', resolve(work, scene + '-combined.mp4')]);
}
const font=run('fc-match',['-f','%{file}','sans']).trim();
for(const scene of timeline){
  const fitted = scene.id === offline.id || scene.id === repair.id;
  const raw=resolve(work,shots[scene.id] || fitted ? scene.id + '-combined.mp4' : scene.id + '.webm');const rawSeconds=duration(raw);
  const speed=fitted?1:Math.min(1,scene.duration/rawSeconds);
  // Whole-scene timing adjustments are explicitly labeled. Padding freezes only the last real frame.
  const label = scene.id === '07-closing' ? 'ARCHITECTURE CARD' : 'REAL APP CAPTURE  |  EDITED FOR TIME';
  // The capture and re-capture already carry the checkout's browser badge.
  const suffix = {
    '01-problem': '  |  DEMO EMAIL/ADDRESS BLURRED',
    '03-offline': '  |  NANO WAIT SHORTENED',
  }[scene.id] ?? '';
  const filter = `setpts=${speed}*(PTS-STARTPTS),fps=30,scale=1920:1080,setsar=1,tpad=stop_mode=clone:stop_duration=${scene.duration},trim=duration=${scene.duration},drawtext=fontfile=${font}:text='${label + suffix}':fontsize=15:fontcolor=white:box=1:boxcolor=0x102e34@0.9:boxborderw=8:x=28:y=1044`;
  run('ffmpeg',['-y','-v','error','-i',raw,'-i',resolve(work,'audio',scene.id+'.mp3'),'-vf',filter,'-af','apad','-t',String(scene.duration),'-r','30','-c:v','libx264','-preset','fast','-threads','6','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','48000','-ac','2',resolve(work,scene.id+'.mp4')]);
  console.log(scene.id+' rendered');
}
await writeFile(resolve(work,'concat.txt'),timeline.map(s=>`file '${work}/${s.id}.mp4'`).join('\n'));
run('ffmpeg',['-y','-v','error','-f','concat','-safe','0','-i',resolve(work,'concat.txt'),'-vf',`subtitles=${out}/barrierrelay-demo.srt:force_style='FontName=Liberation Sans,FontSize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00182020,BorderStyle=3,Outline=2,Shadow=0,MarginV=25'`,'-c:v','libx264','-preset','fast','-threads','6','-crf','20','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','160k','-movflags','+faststart',resolve(out,'barrierrelay-demo.mp4')]);
run('ffmpeg',['-y','-v','error','-ss',String(routingCue.start + 2),'-i',resolve(out,'barrierrelay-demo.mp4'),'-frames:v','1','-vf','scale=1280:720',resolve(out,'thumbnail.png')]);
const proof=JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',resolve(out,'barrierrelay-demo.mp4')]));
const video=proof.streams.find(s=>s.codec_type==='video'),audio=proof.streams.find(s=>s.codec_type==='audio');
if(Number(proof.format.duration)>175||video.width!==1920||video.height!==1080||video.codec_name!=='h264'||video.r_frame_rate!=='30/1'||audio?.codec_name!=='aac')throw Error('Final video fails delivery contract');
proof.format.filename = 'barrierrelay-demo.mp4';
await writeFile(resolve(out,'ffprobe.json'),JSON.stringify(proof,null,2));
const review = {
  problem: timeline[0].end - 3,
  capture: timeline[1].start + 6,
  handoff: timeline[1].end - 3,
  offline: routingCue.start + 2,
  privacy: timeline[3].end - 3,
  cloud: timeline[4].end - 2,
  'owner-opening': repair.start + 2,
  'source-diff': repair.start + repairCuts[1] + 2,
  'patched-checkout': repair.start + repairCuts[3] + 1,
  repair: repair.end - 3,
  closing: timeline[6].start + 4,
};
for (const [name, timestamp] of Object.entries(review)) {
  run('ffmpeg', ['-y', '-v', 'error', '-ss', String(timestamp), '-i', resolve(out, 'barrierrelay-demo.mp4'),
    '-frames:v', '1', '-vf', 'scale=1280:720', resolve(out, 'review-' + name + '.png')]);
}
await writeFile(resolve(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
await mkdir(delivery, { recursive: true });
const files = ['barrierrelay-demo.mp4', 'barrierrelay-demo.srt', 'ffprobe.json', 'timeline.json', 'thumbnail.png', 'receipt.json',
  ...Object.keys(review).map(name => 'review-' + name + '.png')];
for (const filename of files) await rename(resolve(out, filename), resolve(delivery, filename));
console.log(JSON.stringify({duration:proof.format.duration,bytes:(await stat(resolve(delivery,'barrierrelay-demo.mp4'))).size,timeline},null,2));
