import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityRows, frequencySegments, orbitCaption } from './activity-model.mjs';
const base={checkins:{total:9,completed:5,early:2},cleaning:{total:12,completed:8},maintenance:{total:3,completed:1}};
test('totals and Early are independent of progress',()=>{const rows=activityRows(base,'en');assert.equal(rows[0].total,9);assert.equal(rows[0].ratio,5/9);assert.equal(rows[1].caption,'8 of 12 completed');assert.equal(base.checkins.early,2);});
test('zero is an empty day, never 100 percent',()=>{const d={checkins:{total:0,completed:0,early:0},cleaning:{total:0,completed:0},maintenance:{total:0,completed:0}};for(const r of activityRows(d,'en')){assert.equal(r.percent,0);assert.equal(r.complete,false);assert.ok(!r.caption.includes('NaN'));}});
test('complete day fills every segment',()=>{const d=structuredClone(base);Object.values(d).forEach(v=>v.completed=v.total);for(const r of activityRows(d,'en')){assert.equal(r.complete,true);assert.equal(r.percent,100);assert.ok(frequencySegments(r.ratio).every(x=>x===1));}});
test('partial segments preserve exact progress',()=>{for(const ratio of [0,.001,1/3,5/9,.99,1]){const bars=frequencySegments(ratio);assert.equal(bars.length,28);assert.ok(Math.abs(bars.reduce((a,b)=>a+b,0)/28-ratio)<1e-12);}});
test('invalid totals and invalid Early counts are rejected',()=>{for(const value of [-1,NaN,Infinity,2.3,10]){const d=structuredClone(base);d.checkins.completed=value;assert.throws(()=>activityRows(d,'en'));}for(const value of [-1,10,1.5]){const d=structuredClone(base);d.checkins.early=value;assert.throws(()=>activityRows(d,'en'));}assert.throws(()=>activityRows(null,'en'));});
test('Spanish captions stay available when the locale is es',()=>{
  const rows=activityRows(base,'es');
  assert.equal(rows[1].caption,'8 de 12 completados');
  assert.equal(orbitCaption(rows[0],'es'),'5 de 9 Check-ins');
});
