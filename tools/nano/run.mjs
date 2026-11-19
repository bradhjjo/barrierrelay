#!/usr/bin/env node
import puppeteer from 'puppeteer-core';
import {readFile, mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const profilePath = resolve(homedir(), '.cache/barrierrelay/chrome-nano');
export const features = 'OptimizationGuideOnDeviceModel:BypassPerfRequirement/true,OptimizationGuideManifestBroker,OptimizationGuideModelExecution,OptimizationGuideModelDownloading,OptimizationHints,AIPromptAPI,AIPromptAPIMultimodalInput,AIPromptAPIStructuredOutput,AIPromptAPILegacyParams,PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultimodalInput';
/** One browser, sequential prompts, a fresh single-turn model session per prompt. */
export async function createNanoSession({headless = process.env.NANO_HEADFUL !== '1', timeoutMs = 2400000} = {}) {
  await mkdir(profilePath, {recursive:true});
  const server = createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><button id="run">Run Nano</button>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try {
    // Drop ALL automation defaults: OptimizationHints and background networking are
    // disabled by Puppeteer defaults. Explicitly restore user-data-dir as well.
    browser = await puppeteer.launch({executablePath:'/opt/google/chrome/chrome',userDataDir:profilePath,headless,protocolTimeout:timeoutMs,ignoreDefaultArgs:true,args:[`--user-data-dir=${profilePath}`,`--enable-features=${features}`,'--no-first-run','--no-default-browser-check',...(headless?['--headless=new']:[])]});
    const page=await browser.newPage();page.setDefaultTimeout(timeoutMs);
    page.on('console',m=>{if(m.text().startsWith('NANO_DOWNLOAD'))process.stderr.write(m.text()+'\n');});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    let queue=Promise.resolve();
    async function runOne({system,prompt,imagePath,schema,temperature,topK}) {
      if(typeof prompt!=='string')throw new TypeError('prompt must be a string');
      const image=imagePath?{data:(await readFile(imagePath)).toString('base64'),mime:/\.jpe?g$/i.test(imagePath)?'image/jpeg':'image/png'}:null;
      await page.evaluate(input=>{
        window.nanoResult=null;window.nanoError=null;
        document.querySelector('#run').onclick=async()=>{
          let model;
          try {
            const options={expectedInputs:[{type:'text',languages:['en']},...(input.image?[{type:'image'}]:[])],expectedOutputs:[{type:'text',languages:['en']}]};
            if(input.system)options.initialPrompts=[{role:'system',content:input.system}];
            if(input.temperature!==undefined||input.topK!==undefined){
              // Legacy numeric sampling requires the legacy params feature on Chrome 158.
              const defaults=typeof LanguageModel.params==='function'?await LanguageModel.params():{defaultTemperature:1,defaultTopK:3};
              options.temperature=input.temperature??defaults.defaultTemperature;options.topK=input.topK??defaults.defaultTopK;
            }
            const availability=await LanguageModel.availability(options);
            if(availability==='unavailable')throw new Error('LanguageModel availability is unavailable; inspect chrome://on-device-internals');
            options.monitor=m=>m.addEventListener('downloadprogress',e=>console.log('NANO_DOWNLOAD '+Math.round(e.loaded*100)+'%'));
            const start=performance.now();model=await LanguageModel.create(options);
            let content=input.prompt;
            if(input.image){const blob=await(await fetch(`data:${input.image.mime};base64,${input.image.data}`)).blob();content=[{role:'user',content:[{type:'text',value:input.prompt},{type:'image',value:blob}]}];}
            const text=await model.prompt(content,input.schema?{responseConstraint:input.schema}:{});
            window.nanoResult={text,...(input.schema?{json:JSON.parse(text)}:{}),ms:performance.now()-start,availability:await LanguageModel.availability(options)};
          }catch(e){window.nanoError={name:e.name,message:e.message};}finally{model?.destroy();}
        };
      },{system,prompt,image,schema,temperature,topK});
      await page.click('#run'); // Trusted CDP mouse events provide user activation.
      await page.waitForFunction(()=>window.nanoResult||window.nanoError,{timeout:timeoutMs});
      const result=await page.evaluate(()=>({result:window.nanoResult,error:window.nanoError}));
      if(result.error)throw Object.assign(new Error(result.error.message),{name:result.error.name});
      return result.result;
    }
    return {browser,page,async run(input){const next=queue.then(()=>Array.isArray(input)?input.reduce(async(prev,item)=>[...await prev,await runOne(item)],Promise.resolve([])):runOne(input));queue=next.catch(()=>{});return next;},async close(){await queue;await browser.close();await new Promise(r=>server.close(r));}};
  }catch(e){await browser?.close();server.close();throw e;}
}
export async function runNano(input){const session=await createNanoSession();try{return await session.run(input);}finally{await session.close();}}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2);const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
  try{const batch=option('--batch');const schema=option('--schema');const result=await runNano(batch?JSON.parse(await readFile(batch,'utf8')):{prompt:option('--prompt'),system:option('--system'),imagePath:option('--image'),schema:schema?JSON.parse(await readFile(schema,'utf8')):undefined,temperature:option('--temperature')===undefined?undefined:Number(option('--temperature')),topK:option('--top-k')===undefined?undefined:Number(option('--top-k'))});for(const row of Array.isArray(result)?result:[result])console.log(JSON.stringify(row));}catch(e){console.error(JSON.stringify({error:e.message,name:e.name}));process.exitCode=1;}
}
