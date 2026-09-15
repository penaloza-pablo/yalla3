import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previousDay, openVisits, getStage, transition } from './checkin-model.mjs';
const guest = { id:'1', name:'Pablo', property:'López Silva', checkInDate:'2026-09-15', accessGranted:false, entered:false, visits:[] };
test('calendar boundaries and invalid dates', () => {
  assert.equal(previousDay('2026-01-01'), '2025-12-31');
  assert.equal(previousDay('2024-03-01'), '2024-02-29');
  assert.equal(previousDay('2026-03-01'), '2026-02-28');
  for (const date of ['2026-02-30', 'not-date']) assert.throws(() => previousDay(date));
});
test('only relevant open visits block readiness', () => {
  const visits = [
    {type:'cleaning',date:'2026-09-15',closed:false},
    {type:'maintenance',date:'2026-09-14',closed:false},
    {type:'cleaning',date:'2026-09-13',closed:false},
    {type:'cleaning',date:'2026-09-16',closed:false},
    {type:'other',date:'2026-09-15',closed:false},
    {type:'cleaning',date:'2026-09-15',closed:true},
  ];
  assert.equal(openVisits({...guest,visits}).length,2);
  assert.equal(getStage({...guest,visits}),0);
  assert.equal(getStage({...guest,visits:visits.slice(2)}),1);
});
test('complete lifecycle and reversible steps preserve original values', () => {
  let g = guest;
  for (const [action,stage] of [['grant-access',2],['mark-entered',3],['undo-entry',2],['revoke-access',1]]) {
    g = transition(g,action); assert.equal(getStage(g),stage);
  }
  assert.equal(guest.accessGranted,false);
});
test('all invalid transitions are rejected, including revocation after entry', () => {
  const states = [ {...guest,visits:[{type:'cleaning',date:guest.checkInDate,closed:false}]}, guest, {...guest,accessGranted:true}, {...guest,accessGranted:true,entered:true} ];
  const allowed = [[],['grant-access'],['mark-entered','revoke-access'],['undo-entry']];
  states.forEach((g,s) => ['grant-access','mark-entered','revoke-access','undo-entry'].forEach(action => {
    if (!allowed[s].includes(action)) assert.throws(() => transition(g,action));
  }));
});
test('reopened visit overrides confirmations without deleting history', () => {
  const g = {...guest,accessGranted:true,entered:true,visits:[{type:'maintenance',date:'2026-09-14',closed:false}]};
  assert.equal(getStage(g),0); assert.equal(g.entered,true);
  assert.equal(getStage({...g,visits:[]}),3);
});
test('invalid entered without access never presents a completed state', () => {
  assert.equal(getStage({...guest, entered:true}),1);
});
