// SPDX-License-Identifier: AGPL-3.0-or-later
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import {glassDistance,glassMeshAxis} from '../src/core/GlassOptics.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
function option(name,fallback){const i=args.indexOf(name);return i<0?fallback:args[i+1];}
const out=resolve(option('--out',resolve(root,'.local/glass-fusion-experiments',new Date().toISOString().replaceAll(':','-'))));
const source=readFileSync(resolve(root,'src/core/GlassFusion.ts'),'utf8');
const code=source.replace(/^import[^;]+;\s*/gm,'').replace(/^export /gm,'');
const {GlassFusionTessellator}=new Function('glassDistance','glassMeshAxis',stripTypeScriptTypes(code,{mode:'transform'})+';return {GlassFusionTessellator};')(glassDistance,glassMeshAxis);
const scenes=[
 {id:'menu-left',width:240,height:420,source:{x:12,y:12,width:44,height:44,radius:16},target:{x:12,y:68,width:168,height:320,radius:16}},
 {id:'menu-right',width:290,height:300,source:{x:222,y:12,width:44,height:44,radius:16},target:{x:46,y:68,width:220,height:176,radius:16}},
 {id:'wide-dialog',width:720,height:560,source:{x:620,y:12,width:44,height:44,radius:16},target:{x:60,y:100,width:600,height:400,radius:24}},
 {id:'upward',width:290,height:420,source:{x:222,y:350,width:44,height:44,radius:16},target:{x:46,y:40,width:220,height:290,radius:16}}
];
mkdirSync(out,{recursive:true});
const report={schema:1,createdAt:new Date().toISOString(),sourceSha256:createHash('sha256').update(source).digest('hex'),
 scope:'Host geometry and shape playback. Does not measure device GPU, frame pacing, backdrop sampling or input.',results:[]};
const pages=[];
for(const cells of [128,256,512])for(const scene of scenes){
 const mesh=new GlassFusionTessellator(scene.width,scene.height,1,cells),times=[],frames=[];
 let folds=0,peakVertices=0;const errors=[];
 for(let iteration=0;iteration<3;iteration++)for(let n=0;n<=60;n++){
  const p=n/60,start=performance.now(),m=mesh.update(scene,p);times.push(performance.now()-start);
  peakVertices=Math.max(peakVertices,m.positions.length);
  if(iteration!==2)continue;
  for(let i=0;i<m.indices.length;i+=3){const [a,b,c]=m.indices.slice(i,i+3).map(k=>m.texture[k]);if((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)<-1e-7)folds++;}
  let path='';for(let i=0;i<m.indices.length;i+=3){const [a,b,c]=m.indices.slice(i,i+3).map(k=>m.positions[k]);path+=`M${a.x.toFixed(2)},${a.y.toFixed(2)}L${b.x.toFixed(2)},${b.y.toFixed(2)}L${c.x.toFixed(2)},${c.y.toFixed(2)}Z`;}
  frames.push(path);
  if(n===0||n===60){const r=n===0?scene.source:scene.target;for(let i=0;i<m.edge.length;i+=2){const a=m.edge[i],b=m.edge[i+1];
   for(const q of [a,{x:(a.x+b.x)/2,y:(a.y+b.y)/2}])errors.push(Math.abs(glassDistance(q.x-r.x,q.y-r.y,r.width,r.height,r.radius)));}}
 }
 times.sort((a,b)=>a-b);errors.sort((a,b)=>a-b);
 const row={scene:scene.id,cells,medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],
 peakVertices,folds,endpointEdgeMaxErrorVp:errors.at(-1)??null};report.results.push(row);
 const id=scene.id+'-'+cells;
 pages.push({id,width:scene.width,height:scene.height,frames});
}
writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));
writeFileSync(resolve(out,'preview.html'),`<!doctype html><meta charset="utf-8"><title>玻璃融合几何实验</title>
<style>body{font:15px system-ui;background:#eef1f7;color:#18202b;margin:24px}svg{background:repeating-linear-gradient(0deg,#fff 0 23px,#dae2ee 24px 25px);max-width:90vw;max-height:65vh;border-radius:16px}button,select,input{margin:8px;padding:8px}p{max-width:850px}</style>
<h1>共享玻璃融合：几何实验</h1><p>用于比较轮廓、运动方向与网格精度。这里没有实际玻璃采样、折射图像或设备帧率；不能替代真机验收。每段280ms，可暂停逐帧检查。</p>
<select id="scene"></select><button id="play">播放／暂停</button><button id="reverse">反向</button><input id="scrub" type="range" min="0" max="60" value="0"><span id="label"></span><br><svg id="view"><path id="shape" fill="#b5c8e0" fill-opacity=".8"/></svg>
<script>const scenes=${JSON.stringify(pages)};const picker=document.querySelector('#scene'),view=document.querySelector('#view'),path=document.querySelector('#shape'),slider=document.querySelector('#scrub');let playing=false,direction=1,time=0,progress=0;for(const s of scenes){const o=document.createElement('option');o.textContent=s.id;picker.append(o)}function render(){const s=scenes[picker.selectedIndex];view.setAttribute('viewBox','0 0 '+s.width+' '+s.height);view.setAttribute('width',s.width);view.setAttribute('height',s.height);path.setAttribute('d',s.frames[Math.round(progress)]);slider.value=progress;document.querySelector('#label').textContent=Math.round(progress)+'/60'}picker.onchange=()=>{progress=0;render()};slider.oninput=()=>{playing=false;progress=+slider.value;render()};document.querySelector('#play').onclick=()=>{playing=!playing;time=performance.now();if(progress>=60)progress=0};document.querySelector('#reverse').onclick=()=>{direction*=-1;playing=true;time=performance.now()};function tick(t){if(playing){progress+=direction*(t-time)/280*60;if(progress>=60||progress<=0){progress=Math.max(0,Math.min(60,progress));playing=false}render()}time=t;requestAnimationFrame(tick)}render();requestAnimationFrame(tick);</script>`);
console.log(JSON.stringify({out,report:report.results},null,2));
if(report.results.some(r=>r.folds>0))process.exitCode=1;
