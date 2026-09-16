const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
class FakeElement extends EventTarget {
 constructor(){ super();this.attrs={};this.shadowRoot=null; }
 attachShadow(){this.shadowRoot=new EventTarget();this.shadowRoot.innerHTML='';this.shadowRoot.querySelector=()=>null;return this.shadowRoot;}
 getAttribute(k){return this.attrs[k]??null;}
 setAttribute(k,v){this.attrs[k]=v;this.attributeChangedCallback();}
}
const registry=new Map();
const ctx={HTMLElement:FakeElement,CustomEvent,Date,matchMedia:()=>({matches:true}),customElements:{get:k=>registry.get(k),define:(k,v)=>registry.set(k,v)}};
const dir=__dirname+'/';
const code=fs.readFileSync(dir+'checkin-model.mjs','utf8').replaceAll('export ','')+'\n'+fs.readFileSync(dir+'checkin-widget.js','utf8').split('\n').slice(1).join('\n').replace('export class','class');
vm.runInNewContext(code,ctx);
const Widget=registry.get('kk-checkin');const w=new Widget();w.connectedCallback();assert.match(w.shadowRoot.innerHTML,/No check-ins/);
const data=Array.from({length:14},(_,i)=>({id:String(i),name:'Pablo',property:'López Silva',checkInDate:'2026-09-15',visits:[],accessGranted:false,entered:false}));
w.guests=data;assert.equal(w.selectedId,'0');
let changes=[];w.addEventListener('guest-change',e=>changes.push(e.detail));
function click(dataset){const event=new Event('click');Object.defineProperty(event,'target',{value:{closest:()=>({dataset,disabled:false})}});w.shadowRoot.dispatchEvent(event);}
click({move:'1'});assert.equal(w.selectedId,'1');assert.equal(changes.length,1);
w.busy=true;click({move:'1'});assert.equal(w.selectedId,'1');
w.busy=false;w.selectedId='0';
for(let i=0;i<7;i++){const e=new Event('wheel',{cancelable:true});Object.assign(e,{deltaY:5,deltaX:0,deltaMode:0,ctrlKey:false});w.dispatchEvent(e);}
assert.equal(w.selectedId,'1');
w.selectedId='13';click({move:'1'});assert.equal(w.selectedId,'13');
w.guests=[...data].reverse();assert.equal(w.selectedId,'13');
let intent;w.addEventListener('checkin-action',e=>intent=e.detail);
click({action:'grant-access'});assert.equal(intent.id,'13');assert.equal(intent.action,'grant-access');assert.equal(w.guests[0].accessGranted,false);
w.setAttribute('variant','threshold');assert.match(w.shadowRoot.innerHTML,/class="doors"/);
w.guests=[{...data[0],name:'<script>alert(1)</script>'}];assert.ok(!w.shadowRoot.innerHTML.includes('<script>alert'));
w.guests=[];assert.match(w.shadowRoot.innerHTML,/No check-ins/);
w.setAttribute('lang','es');w.guests=[];assert.match(w.shadowRoot.innerHTML,/Sin check-ins/);
console.log('PASS: empty state, 14 guests, navigation bounds, busy lock, accumulated wheel input, stable selected ID, controlled action event, threshold rendering and escaped names. Isolated runtime test; no browser layout tested.');

// Compact Trayecto: progress nodes are the only state-changing controls.
w.setAttribute('variant', 'journey');
const actions = [];
w.addEventListener('checkin-action', e => actions.push(e.detail.action));
const states = [
 {...data[0],visits:[{id:'v',type:'cleaning',date:'2026-09-15',closed:false}]},
 data[0],
 {...data[0],accessGranted:true},
 {...data[0],accessGranted:true,entered:true}
];
const allowed = [[],['grant-access'],['mark-entered'],[]];
states.forEach((g, stage) => {
 w.guests=[g];
 const markup=w.shadowRoot.innerHTML.split('</style>')[1];
 assert.ok(!markup.includes('class="top"'));
 assert.ok(!markup.includes('class="foot"'));
 assert.ok(!markup.includes('data-action="undo-entry"'));
 assert.ok(!markup.includes('data-action="revoke-access"'));
 assert.match(markup,/class="step-control" data-action="grant-access"/);
 assert.match(markup,/class="step-control" data-action="mark-entered"/);
 for(const action of ['grant-access','mark-entered','undo-entry','revoke-access']){
   const count=actions.length; click({action});
   assert.equal(actions.length-count,allowed[stage].includes(action)?1:0,`stage ${stage}: ${action}`);
 }
 w.busy=true;const count=actions.length;
 for(const action of ['grant-access','mark-entered'])click({action});
 assert.equal(actions.length,count);w.busy=false;
});
console.log('PASS: compact markup, accessible step buttons, prerequisites in all four states, forward-only actions and save lock.');
