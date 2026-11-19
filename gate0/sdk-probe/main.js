import {initializeApp} from 'firebase/app';
import {getAI, GoogleAIBackend, getGenerativeModel, InferenceMode, InferenceSource, Schema} from 'firebase/ai';
const app=initializeApp({projectId:'barrierrelay-probe',apiKey:'fake-api-key',appId:'1:000000000:web:probe'});
const ai=getAI(app,{backend:new GoogleAIBackend()});
export const hybridExports={InferenceMode,InferenceSource};
window.hybridExports=hybridExports;
const png=()=>{const c=document.createElement('canvas');c.width=64;c.height=64;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,64,64);return c.toDataURL('image/png').split(',')[1];};
const jsonSchema={type:'object',properties:{answer:{type:'string'}},required:['answer'],additionalProperties:false};
const responseSchema=Schema.object({properties:{answer:Schema.string()}});
function makeModel(structured=false,mode=InferenceMode.ONLY_ON_DEVICE){return getGenerativeModel(ai,{mode,onDeviceParams:{createOptions:{expectedInputs:[{type:'text',languages:['en']},{type:'image'}],expectedOutputs:[{type:'text',languages:['en']}]},...(structured?{promptOptions:{responseConstraint:jsonSchema}}:{})},inCloudParams:{model:'gemini-2.5-flash',...(structured?{generationConfig:{responseMimeType:'application/json',responseSchema}}:{})}});}
window.runProbe=async function(){const rows=[];for(const kind of ['text','image','structured']){const start=performance.now();try{const model=makeModel(kind==='structured');await model.initializeDeviceModel(p=>{document.querySelector('#results').textContent=`Downloading: ${Math.round(p*100)}%`;});const result=await model.generateContent(kind==='image'?[{text:'Describe this image in five words.'},{inlineData:{mimeType:'image/png',data:png()}}]:kind==='structured'?'Return JSON with answer set to OK.':'Reply with the word OK');const text=result.response.text();rows.push({kind,ok:true,text,inferenceSource:result.response.inferenceSource,ms:performance.now()-start,...(kind==='structured'?{json:JSON.parse(text)}:{})});}catch(e){rows.push({kind,ok:false,error:e.message,code:e.code,ms:performance.now()-start});}document.querySelector('#results').textContent=JSON.stringify(rows,null,2);}window.probeResults=rows;return rows;};
// For automated fallback verification, intercept fetch externally: never send data
// to a cloud project when testing PREFER_ON_DEVICE with these fake credentials.
window.probeFallback=()=>makeModel(false,InferenceMode.PREFER_ON_DEVICE).generateContent('Reply OK');
document.querySelector('#run').onclick=window.runProbe;
