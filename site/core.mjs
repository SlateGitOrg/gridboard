
const n=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,low,high)=>Math.min(high,Math.max(low,value));
const round=(value,digits=2)=>Number(value.toFixed(digits));
const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
const parseJSON=(value,fallback=[])=>{try{return JSON.parse(value)}catch{return fallback}};
const valuesFrom=value=>String(value).split(/[\s,]+/).map(Number).filter(Number.isFinite);
const result=(status,summary,metrics,rows,detail='')=>({status,summary,metrics,rows,detail});
const erf=x=>{const sign=x<0?-1:1,a=Math.abs(x),t=1/(1+0.3275911*a);const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-a*a);return sign*y};
const normalCdf=z=>0.5*(1+erf(z/Math.sqrt(2)));
const wilson=(successes,total)=>{if(!total)return[0,0];const z=1.96,p=successes/total,d=1+z*z/total,c=(p+z*z/(2*total))/d,h=z*Math.sqrt((p*(1-p)+z*z/(4*total))/total)/d;return[clamp(c-h,0,1),clamp(c+h,0,1)]};
const sha256=async value=>{const bytes=new TextEncoder().encode(String(value));const digest=await crypto.subtle.digest('SHA-256',bytes);return[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')};
const tag=(xml,name)=>xml.match(new RegExp('<'+name+'[^>]*>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]?.trim()??'';
const similarity=(a,b)=>{const x=String(a).toLowerCase(),y=String(b).toLowerCase();if(x===y)return 1;const A=new Set(x.split(/\W+/).filter(Boolean)),B=new Set(y.split(/\W+/).filter(Boolean));const inter=[...A].filter(v=>B.has(v)).length;return inter/Math.max(1,new Set([...A,...B]).size)};

export const meta={"slug":"gridboard","name":"Gridboard","eyebrow":"Backpressure simulator","description":"Compare a naive telemetry queue with newest-sample-preserving downsampling under load.","fields":[{"name":"incomingRate","label":"Incoming samples per second","type":"number","min":1,"max":100000,"step":100,"help":""},{"name":"renderRate","label":"Client render capacity per second","type":"number","min":1,"max":100000,"step":100,"help":""},{"name":"seconds","label":"Burst duration","type":"number","min":1,"max":300,"step":1,"help":""},{"name":"staleAfter","label":"Stale threshold (ms)","type":"number","min":100,"max":10000,"step":100,"help":""}]};
export const initialState={"incomingRate":20000,"renderRate":4000,"seconds":10,"staleAfter":2000};
export const alternateState={"incomingRate":3000,"renderRate":4000,"seconds":10,"staleAfter":2000};
export async function compute(i){const incoming=n(i.incomingRate),render=n(i.renderRate),seconds=n(i.seconds),threshold=n(i.staleAfter),backlog=Math.max(0,(incoming-render)*seconds),naiveAge=backlog/Math.max(1,incoming)*1000,kept=Math.min(incoming*seconds,render*seconds+1),dropped=Math.max(0,incoming*seconds-kept),status=naiveAge>threshold?'Backpressure required':'Capacity sufficient';return result(status,naiveAge>threshold?`Naive delivery becomes ${round(naiveAge)} ms stale; downsampling preserves the newest sample.`:'The client keeps up with the current stream.',[{label:'Naive data age',value:`${round(naiveAge)} ms`},{label:'Dropped interior points',value:Math.round(dropped).toLocaleString()},{label:'Newest sample retained',value:'Yes'},{label:'Panel state',value:naiveAge>threshold?'STALE without control':'LIVE'}],[{strategy:'Naive queue',queued:Math.round(backlog),ageMs:round(naiveAge),newestGuaranteed:'No'},{strategy:'Watermark downsampling',queued:Math.min(1,backlog),ageMs:round(1000/Math.max(1,render)),newestGuaranteed:'Yes'}], 'Interior points may be dropped; the newest point never is.')}
