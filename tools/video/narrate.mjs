import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { scenes } from './scenes.mjs';
await mkdir('tools/video/.work/audio',{recursive:true});
for (const scene of scenes) {
  const child=spawn('uvx',['edge-tts','--voice','en-US-AriaNeural','--rate=+8%','--text',scene.text,'--write-media',`tools/video/.work/audio/${scene.id}.mp3`,'--write-subtitles',`tools/video/.work/audio/${scene.id}.srt`],{stdio:'inherit'});
  await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('TTS failed: '+scene.id)));});
  console.log(scene.id+' narrated');
}
