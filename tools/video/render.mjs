import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { scenes } from './scenes.mjs';
const work=resolve('tools/video/.work'), out=resolve('docs/video');
await mkdir(out,{recursive:true});
function run(command,args){const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:32*1024*1024});if(r.status!==0)throw Error(r.stderr||r.error?.message||command+' failed');return r.stdout;}
function duration(path){return Number(run('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',path]).trim());}
function stamp(n){const ms=Math.round(n*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;}
function seconds(t){const [h,m,s]=t.replace(',','.').split(':').map(Number);return h*3600+m*60+s;}
// Preserve actual TTS boundary times; do not estimate captions by word count.
let offset=0, captionIndex=0, srt='';const timeline=[];
for(const scene of scenes){
  const audio=resolve(work,'audio',scene.id+'.mp3');
  const voiceSeconds=duration(audio);
  const length=voiceSeconds+0.65+(scene.id==='02-capture'?2.5:0);
  timeline.push({id:scene.id,title:scene.title,start:offset,end:offset+length,duration:length,voiceSeconds});
  const local=await readFile(resolve(work,'audio',scene.id+'.srt'),'utf8');
  for(const block of local.trim().split(/\r?\n\r?\n/)){
    const lines=block.split(/\r?\n/);const timing=lines.findIndex(l=>l.includes(' --> '));if(timing<0)continue;
    const [a,b]=lines[timing].split(' --> ');const text=lines.slice(timing+1).join(' ');
    // Break long captions at a word boundary for a readable two-line maximum.
    const words=text.split(' '),wrapped=[];let line='';for(const word of words){if((line+' '+word).trim().length>65&&line){wrapped.push(line);line=word;}else line=(line+' '+word).trim();}if(line)wrapped.push(line);
    srt+=`${++captionIndex}\n${stamp(offset+seconds(a))} --> ${stamp(offset+seconds(b))}\n${wrapped.join('\n')}\n\n`;
  }
  offset+=length;
}
if(offset>175)throw Error(`Narration too long: ${offset}s; shorten script before rendering`);
await writeFile(resolve(out,'barrierrelay-demo.srt'),srt);
await writeFile(resolve(out,'timeline.json'),JSON.stringify(timeline,null,2));
// Concatenate the two genuine targets in the extension handoff scene.
await writeFile(resolve(work,'handoff.txt'),`file '${work}/02-capture.webm'\nfile '${work}/02-handoff.webm'\n`);
run('ffmpeg',['-y','-v','error','-f','concat','-safe','0','-i',resolve(work,'handoff.txt'),'-c','copy',resolve(work,'02-combined.webm')]);
await writeFile(resolve(work,'cloud.txt'),`file '${work}/05-cloud.webm'\nfile '${work}/05-sources.webm'\n`);
run('ffmpeg',['-y','-v','error','-f','concat','-safe','0','-i',resolve(work,'cloud.txt'),'-c','copy',resolve(work,'05-combined.webm')]);
const font=run('fc-match',['-f','%{file}','sans']).trim();
for(const scene of timeline){
  const raw=resolve(work,scene.id==='02-capture'?'02-combined.webm':scene.id==='05-cloud'?'05-combined.webm':scene.id+'.webm');const rawSeconds=duration(raw);
  const speed=Math.min(1,scene.duration/rawSeconds);
  // Whole-scene timing adjustments are explicitly labeled. Padding freezes only the last real frame.
  const label=scene.id==='07-closing'?'ARCHITECTURE CARD':'REAL APP CAPTURE  |  EDITED FOR TIME  |  CONTACT DETAILS BLURRED';
  const filter=`setpts=${speed}*(PTS-STARTPTS),fps=30,scale=1920:1080,setsar=1,tpad=stop_mode=clone:stop_duration=${scene.duration},trim=duration=${scene.duration},drawtext=fontfile=${font}:text='${label}':fontsize=15:fontcolor=white:box=1:boxcolor=0x102e34@0.9:boxborderw=8:x=28:y=1028`;
  run('ffmpeg',['-y','-v','error','-i',raw,'-i',resolve(work,'audio',scene.id+'.mp3'),'-vf',filter,'-af','apad','-t',String(scene.duration),'-r','30','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','48000','-ac','2',resolve(work,scene.id+'.mp4')]);
  console.log(scene.id+' rendered');
}
await writeFile(resolve(work,'concat.txt'),timeline.map(s=>`file '${work}/${s.id}.mp4'`).join('\n'));
run('ffmpeg',['-y','-v','error','-f','concat','-safe','0','-i',resolve(work,'concat.txt'),'-vf',`subtitles=${out}/barrierrelay-demo.srt:force_style='FontName=Liberation Sans,FontSize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00182020,BorderStyle=3,Outline=2,Shadow=0,MarginV=12'`,'-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','160k','-movflags','+faststart',resolve(out,'barrierrelay-demo.mp4')]);
run('ffmpeg',['-y','-v','error','-ss',String(timeline[2].end-5),'-i',resolve(out,'barrierrelay-demo.mp4'),'-frames:v','1','-vf','scale=1280:720',resolve(out,'thumbnail.png')]);
const proof=JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',resolve(out,'barrierrelay-demo.mp4')]));
const video=proof.streams.find(s=>s.codec_type==='video'),audio=proof.streams.find(s=>s.codec_type==='audio');
if(Number(proof.format.duration)>178||video.width!==1920||video.height!==1080||video.codec_name!=='h264'||video.r_frame_rate!=='30/1'||audio?.codec_name!=='aac')throw Error('Final video fails delivery contract');
await writeFile(resolve(out,'ffprobe.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify({duration:proof.format.duration,bytes:(await stat(resolve(out,'barrierrelay-demo.mp4'))).size,timeline},null,2));
