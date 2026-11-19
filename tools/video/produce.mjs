import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
let server;
async function run(args){const p=spawn(process.execPath,args,{cwd:root,stdio:'inherit'});await new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(args.join(' ')+' exited '+code)));});}
try {
  let online=false;try{online=(await fetch('http://127.0.0.1:5173')).ok;}catch{}
  if(!online){
    // Vite reads the ignored local App Check configuration; never print it or browser console output.
    server=spawn('npm',['run','dev','--','--strictPort'],{cwd:root+'/apps/web',stdio:'ignore',detached:true});
    for(let i=0;i<80&&!online;i++){await delay(250);try{online=(await fetch('http://127.0.0.1:5173')).ok;}catch{}}
    if(!online)throw Error('Vite did not start on port 5173');
  }
  await run(['tools/video/narrate.mjs']);
  await run(['tools/video/record.mjs']);
  await run(['tools/video/render.mjs']);
} finally { if(server?.pid){try{process.kill(-server.pid,'SIGTERM');}catch{}} }
