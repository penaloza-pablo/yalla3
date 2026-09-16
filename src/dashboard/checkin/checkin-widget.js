import { STAGES, getStage, openVisits } from './checkin-model.mjs';
/* eslint-disable */

const icons = {
  check: '<path d="m5 12 4 4L19 6"/>',
  door: '<path d="M5 21V3h14v18M3 21h18M14 12h1"/>',
  key: '<circle cx="8" cy="9" r="4"/><path d="m11 12 9 9m-3-3 3-3m-6 0 3-3"/>',
  tools: '<path d="m14 6 4 4M3 21l9-9M12 3l9 9-4 4-9-9z"/>',
  up: '<path d="m6 14 6-6 6 6"/>', down: '<path d="m6 10 6 6 6-6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  undo: '<path d="M4 10h10a6 6 0 0 1 0 12M4 10l5-5M4 10l5 5"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.door}</svg>`;
const escape = text => String(text).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
const EN = {
  stages: ['Jobs pending', 'Property ready', 'Access granted', 'Checked in'],
  guest: 'Guest',
  property: 'Property',
  emptyTitle: 'No check-ins',
  emptyBody: "Today's arrivals will appear here.",
  pendingOne: '1 pending visit · access blocked',
  pendingMany: (n) => `${n} pending visits · access blocked`,
  ready: 'Ready to receive the guest',
  waiting: 'Waiting for the guest to enter',
  done: 'Check-in complete',
  grant: 'Grant access',
  enter: 'Mark entry',
  undo: 'Undo entry',
  revoke: 'Revoke access',
  saving: 'Saving',
  savingEllipsis: 'Saving…',
  alreadyDone: 'Already completed',
  needsReady: 'Requires property ready',
  needsAccess: 'Requires access granted',
  process: 'Check-in process',
  ariaCheckin: (name) => `Check-in for ${name}`,
  prev: 'Previous guest',
  next: 'Next guest',
  swipe: 'Swipe to change guest',
  live: (name, property, stage, busy, number, total) => `${name}, ${property}. ${stage}.${busy ? ' Saving change.' : ''} Guest ${number} of ${total}.`,
};
const ES = {
  stages: STAGES,
  guest: 'Huésped',
  property: 'Propiedad',
  emptyTitle: 'Sin check-ins',
  emptyBody: 'Las llegadas de hoy aparecerán aquí.',
  pendingOne: '1 visita pendiente · acceso bloqueado',
  pendingMany: (n) => `${n} visitas pendientes · acceso bloqueado`,
  ready: 'Todo preparado para recibirle',
  waiting: 'Esperando la entrada del huésped',
  done: 'Check-in completado',
  grant: 'Conceder acceso',
  enter: 'Marcar entrada',
  undo: 'Deshacer entrada',
  revoke: 'Revocar acceso',
  saving: 'Guardando',
  savingEllipsis: 'Guardando…',
  alreadyDone: 'Ya completado',
  needsReady: 'Requiere propiedad lista',
  needsAccess: 'Requiere acceso concedido',
  process: 'Proceso de check-in',
  ariaCheckin: (name) => `Check-in de ${name}`,
  prev: 'Huésped anterior',
  next: 'Siguiente huésped',
  swipe: 'Desliza para cambiar de huésped',
  live: (name, property, stage, busy, number, total) => `${name}, ${property}. ${stage}.${busy ? ' Guardando cambio.' : ''} Huésped ${number} de ${total}.`,
};
const copyFor = (el) => {
  const lang = String(el.getAttribute('lang') || 'en').toLowerCase();
  return lang.startsWith('es') ? ES : EN;
};
const css = `
  :host{--kk-slate:#415364;--kk-green:#3D5B58;--kk-pink:#E3B9B3;--kk-blue:#A1B1C8;--kk-violet:#5E3653;--kk-paper:#F6F1E8;--kk-radius:28px;--kk-font:Gogh,'Avenir Next',system-ui,sans-serif;--kk-label-font:Mohave,'Avenir Next Condensed',system-ui,sans-serif;display:block;width:100%;height:100%;container-type:size;color:var(--kk-slate);font-family:var(--kk-font)}
  *{box-sizing:border-box}button{font:inherit;cursor:pointer}button:disabled{cursor:default;opacity:.38}button:focus-visible{outline:3px solid var(--kk-violet);outline-offset:4px}svg{width:19px;height:19px;flex-shrink:0} .shell{position:relative;height:100%;display:flex;flex-direction:column;border-radius:var(--kk-radius);overflow:hidden;background:var(--kk-paper);border:1px solid #41536418;box-shadow:0 12px 26px -24px #24363266}
  .content{padding:26px 30px 22px;min-height:268px}.top,.identity,.status,.foot,.pager,.btn,.eyebrow{display:flex;align-items:center}.top{justify-content:space-between;gap:18px}.eyebrow{font:500 11px var(--kk-label-font);letter-spacing:2.2px;text-transform:uppercase;gap:7px}.eyebrow span{width:5px;height:5px;border-radius:50%;background:currentColor}.status{font-size:12px;gap:7px;padding:8px 11px;border-radius:100px;background:#3d5b5810;color:var(--kk-green);white-space:nowrap}.status.pending{color:var(--kk-violet);background:#5e365310}.status svg{width:14px;height:14px}.identity{margin-top:23px;gap:22px}.person{display:flex;align-items:center;gap:12px;min-width:0;flex:1}.avatar{width:43px;height:43px;border-radius:50%;background:var(--kk-pink);display:grid;place-items:center;flex-shrink:0;font-size:17px}.name{font-weight:600;font-size:26px;letter-spacing:-1px;line-height:1.1;overflow-wrap:anywhere}.property{font-size:23px;font-weight:500;letter-spacing:-.7px;overflow-wrap:anywhere;max-width:47%}.identity>.route-arrow{color:#41536480;margin:0 2px}.person small,.property small{display:block;font:500 10px var(--kk-label-font);text-transform:uppercase;letter-spacing:1.7px;margin-bottom:5px;color:#526575}.steps{display:grid;grid-template-columns:repeat(4,1fr);list-style:none;padding:0;margin:25px 0 22px;gap:0}.step{position:relative;min-width:0}.step:not(:last-child):before{content:'';position:absolute;left:13px;right:-13px;top:12px;height:3px;background:#41536418}.step.past:before{background:var(--kk-green)}.dot{position:relative;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#E4E5E0;color:#60717C;border:4px solid var(--kk-paper);font-size:9px;z-index:1}.past .dot{background:var(--kk-green);color:var(--kk-paper)}.current .dot{background:var(--kk-green);color:var(--kk-paper);box-shadow:0 0 0 1px #3d5b5840}.pending-stage .current .dot{background:var(--kk-violet);box-shadow:0 0 0 1px #5e365340}.dot svg{width:11px;height:11px;stroke-width:2.5}.step-label{display:block;max-width:120px;margin-top:8px;font-size:11px;line-height:1.4;color:#60717C;padding-right:8px}.current .step-label{color:var(--kk-green);font-weight:650}.pending-stage .current .step-label{color:var(--kk-violet)}.foot{justify-content:space-between;border-top:1px solid #41536418;padding-top:16px;gap:10px}.hint{font-size:11px;color:#566975;display:flex;align-items:center;gap:6px;line-height:1.45}.actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end}.btn{gap:7px;border:0;padding:10px 14px;background:var(--kk-green);color:var(--kk-paper);border-radius:11px;font-size:11px;font-weight:600;min-height:38px}.btn svg{width:15px;height:15px}.undo{border:0;background:transparent;color:var(--kk-slate);padding:9px 0;font-size:11px;text-decoration:underline;text-underline-offset:3px}.nav{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 26px;background:#41536406;border-top:1px solid #41536412}.nav-note{font-size:10px;color:#566975;display:flex;align-items:center;gap:7px}.nav-note svg{width:13px;height:13px}.pager{gap:11px}.count{font-size:11px;font-variant-numeric:tabular-nums;letter-spacing:1px}.count b{font-weight:600}.count span{opacity:.6}.nav button{width:30px;height:28px;display:grid;place-items:center;border:1px solid #41536420;background:transparent;color:var(--kk-slate);border-radius:8px}.nav button:hover:not(:disabled){background:#4153640b}.overview{display:flex;gap:4px}.overview span{height:4px;width:13px;background:#41536425;border-radius:8px}.overview span.active{background:var(--kk-green);width:23px}.error{padding:12px 26px;color:var(--kk-violet);background:#e3b9b340;font-size:12px}.empty{padding:50px 25px;text-align:center}.empty strong{display:block;margin-bottom:8px}.empty p{font-size:13px}.shell.threshold{background:var(--kk-slate);color:var(--kk-paper);border-color:transparent}.threshold .content{padding-bottom:20px}.threshold .status{background:#f6f1e813;color:var(--kk-paper)}.threshold .status.pending{background:#e3b9b323;color:var(--kk-pink)}.threshold .identity{margin-top:19px}.threshold .avatar{display:none}.threshold .name{font-size:29px}.threshold .property{font-size:23px}.threshold .person small,.threshold .property small{color:#D3D9DF}.threshold .route-arrow{color:var(--kk-pink)}.threshold .foot{border-color:#f6f1e822}.threshold .hint,.threshold .nav-note{color:#D3D9DF}.threshold .btn{background:var(--kk-pink);color:#31424F}.threshold .undo{color:#F6F1E8}.threshold .nav{background:#0000000b;border-color:#f6f1e818}.threshold .nav button{color:var(--kk-paper);border-color:#f6f1e835}.threshold .nav button:hover:not(:disabled){background:#ffffff15}.threshold .overview span{background:#f6f1e82a}.threshold .overview .active{background:var(--kk-pink)}.threshold button:focus-visible{outline-color:var(--kk-pink)}
  .doors{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;list-style:none;margin:24px 0 19px;padding:0}.portal{position:relative;height:95px;background:#263C4B;border-radius:7px 7px 2px 2px;perspective:500px}.portal:before{content:'';position:absolute;inset:0;border:1px solid #f6f1e828;border-bottom:0;border-radius:7px 7px 0 0}.leaf{position:absolute;inset:5px 5px 0;background:#506273;border:1px solid #a1b1c833;transform-origin:left center;transition:transform .55s cubic-bezier(.2,.7,.2,1),background .3s;display:flex;flex-direction:column;justify-content:space-between;padding:9px 11px;border-radius:3px 3px 0 0}.leaf:after{content:'';position:absolute;right:9px;top:52%;height:3px;width:9px;border-radius:2px;background:#a1b1c8}.door-num{font:500 11px var(--kk-label-font);letter-spacing:1px;color:#D3D9DF}.door-icon{position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);color:var(--kk-pink);opacity:0}.door-icon svg{width:25px;height:25px}.door-step.past .leaf{transform:rotateY(-62deg);background:#6F858C}.door-step.past .door-icon{opacity:.9}.door-step.current .portal{background:var(--kk-pink);box-shadow:0 8px 28px -14px var(--kk-pink)}.door-step.current .leaf{background:var(--kk-pink);transform:rotateY(-28deg);border-color:#edcbc6}.door-step.current .leaf:after{background:var(--kk-slate)}.door-step.current .door-num{color:var(--kk-slate)}.door-step.current .door-icon{opacity:1;color:var(--kk-slate);left:77%}.door-step.current .door-icon svg{width:17px;height:17px}.door-step.current:last-child .leaf{transform:rotateY(-68deg)}.door-step .step-label{color:#D3D9DF;margin-top:10px;font-size:10px;max-width:none}.door-step.current .step-label{color:var(--kk-pink);font-weight:600}.threshold .content{min-height:333px}.threshold .error{color:var(--kk-paper)}.sr{position:absolute;clip:rect(0,0,0,0);width:1px;height:1px;overflow:hidden}
  .overview{flex:1;max-width:32%;min-width:0}.overview span{flex:1;min-width:0;width:auto}.overview span.active{flex:2;width:auto}.pager{flex-shrink:0}.nav-note{flex-shrink:0}
  @container(max-width:699px){.nav-note{display:none}.overview{max-width:45%}}
  @container(max-width:559px){.content{padding:21px 20px 18px}.top{gap:10px}.eyebrow{font-size:10px;letter-spacing:1.3px}.status{font-size:10px;padding:7px 9px}.identity{gap:12px}.name,.threshold .name{font-size:24px}.property,.threshold .property{font-size:20px}.avatar{width:35px;height:35px;font-size:14px}.person{gap:9px}.step-label{font-size:10px}.hint{font-size:10px}.foot{align-items:flex-start;flex-direction:column}.actions{width:100%;justify-content:flex-end}.nav{padding:10px 17px}.nav-note{display:none}.doors{gap:9px}.portal{height:90px}.leaf{padding:8px}.door-step .step-label{font-size:10px}.threshold .content{padding:21px 20px 18px}}
  @container(max-width:359px){.content,.threshold .content{padding:18px 15px}.eyebrow{letter-spacing:.8px}.status{font-size:9px}.avatar{display:none}.name,.threshold .name{font-size:23px}.property,.threshold .property{font-size:19px}.step-label{font-size:10px}.overview{gap:3px}.overview span{width:8px}.overview span.active{width:15px}.pager{gap:6px}}
  @media(pointer:coarse){.nav button{width:44px;height:44px}.btn,.undo{min-height:44px}.pager{gap:5px}}

  /* Trayecto: identity + interactive timeline + compact guest navigation. */
  .journey .content{padding:16px 20px 10px;min-height:0}
  .journey .identity{margin-top:0;gap:14px}
  .journey .name{font-size:22px;line-height:1.12;letter-spacing:-.7px}
  .journey .property{font-size:19px;line-height:1.2;letter-spacing:-.5px}
  .journey .person small,.journey .property small{font-size:8px;letter-spacing:1.5px;margin-bottom:3px}
  .journey .avatar{width:34px;height:34px;font-size:14px}
  .journey .steps{margin:12px 0 0}
  .journey .dot{width:24px;height:24px}
  .journey .step:not(:last-child):before{left:12px;right:-12px;top:11px}
  .journey .step-label{font-size:10px;line-height:14px;margin-top:5px;min-height:28px}
  .journey .step-control{display:block;width:100%;min-height:57px;padding:0;border:0;background:transparent;text-align:left;color:inherit;border-radius:6px;position:relative}
  .journey .step-control[aria-disabled="true"]{cursor:default}
  .journey .actionable .dot{color:var(--kk-green);background:var(--kk-paper);box-shadow:0 0 0 1px var(--kk-green)}
  .journey .actionable .step-label{color:var(--kk-green);text-decoration:underline;text-underline-offset:3px}
  .journey .actionable .step-control:hover .dot{background:var(--kk-green);color:var(--kk-paper)}
  .journey .nav{padding:5px 17px;gap:10px}
  .journey .nav-note{display:none}
  .journey .overview{max-width:45%}
  .journey .error{padding:8px 20px}
  @container(max-width:359px){.journey .content{padding:14px 15px 8px}.journey .identity{gap:9px}.journey .name{font-size:21px}.journey .property{font-size:18px}}
  @media(prefers-reduced-motion:reduce){.leaf{transition:none}}
  .journey .content{flex:1 1 auto}
  .journey .nav{margin-top:auto}
  @container(max-height:170px){.journey .content{padding:10px 14px 4px}.journey .identity{gap:8px}.journey .avatar{width:28px;height:28px;font-size:12px}.journey .name{font-size:18px}.journey .property{font-size:16px}.journey .steps{margin-top:8px}.journey .step-label{min-height:0;font-size:9px;line-height:12px}.journey .step-control{min-height:44px}.journey .nav{padding:2px 12px}}
`;

export class KnockKnockCheckin extends HTMLElement {
  static observedAttributes = ['variant', 'lang'];
  #guests = []; #index = 0; #busy = false; #error = ''; #wheel = 0; #last = 0; #lastWheel = 0; #touch = null;
  constructor() {
    super(); this.attachShadow({ mode: 'open' });
    this.shadowRoot.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.move) this.#move(Number(b.dataset.move));
      if (b.dataset.action && !this.#busy) {
        const guest = this.#guests[this.#index];
        if (!guest) return;
        const stage = getStage(guest);
        const allowed = b.dataset.action === 'grant-access' && stage === 1 ||
          b.dataset.action === 'mark-entered' && stage === 2 ||
          this.getAttribute('variant') === 'threshold' && (
            b.dataset.action === 'undo-entry' && stage === 3 ||
            b.dataset.action === 'revoke-access' && stage === 2);
        if (allowed) this.dispatchEvent(new CustomEvent('checkin-action', { bubbles: true, composed: true, detail: { id: this.selectedId, action: b.dataset.action } }));
      }
    });
    this.addEventListener('wheel', e => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 300 : 1);
      const direction = Math.sign(delta);
      if (!this.#canMove(direction)) return;
      e.preventDefault();
      const now = Date.now(); if (now - this.#last < 450) return;
      if (now - this.#lastWheel > 250 || Math.sign(this.#wheel) !== direction) this.#wheel = 0;
      this.#lastWheel = now;
      this.#wheel += delta;
      if (Math.abs(this.#wheel) >= 35) { this.#move(direction); this.#wheel = 0; this.#last = now; }
    }, { passive: false });
    this.addEventListener('touchstart', e => { this.#touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
    this.addEventListener('touchmove', e => {
      if (!this.#touch || e.touches.length !== 1) return;
      const dy = this.#touch.y - e.touches[0].clientY, dx = this.#touch.x - e.touches[0].clientX;
      if (Math.abs(dy) > Math.abs(dx) && this.#canMove(Math.sign(dy))) e.preventDefault();
    }, { passive: false });
    this.addEventListener('touchend', e => {
      if (!this.#touch) return;
      const dy = this.#touch.y - e.changedTouches[0].clientY, dx = this.#touch.x - e.changedTouches[0].clientX;
      if (Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx)) this.#move(Math.sign(dy)); this.#touch = null;
    });
    this.addEventListener('touchcancel', () => { this.#touch = null; });
  }
  connectedCallback() { this.#render(); }
  attributeChangedCallback() { this.#render(); }
  get guests() { return this.#guests; }
  set guests(value) {
    const id = this.selectedId;
    if (!Array.isArray(value)) throw new TypeError('guests debe ser un array');
    const ids = new Set();
    for (const g of value) {
      if (!g.id || ids.has(g.id) || !g.name || !g.property) throw new TypeError('Cada reserva necesita id único, name y property');
      ids.add(g.id); getStage(g);
    }
    this.#guests = value;
    const i = value.findIndex(g => g.id === id);
    this.#index = i >= 0 ? i : Math.max(0, Math.min(this.#index, value.length - 1)); this.#error = ''; this.#render();
  }
  get selectedId() { return this.#guests[this.#index]?.id; }
  set selectedId(id) { const i = this.#guests.findIndex(g => g.id === id); if (i >= 0) { this.#index = i; this.#render(); } }
  set busy(value) { this.#busy = Boolean(value); this.#render(); }
  get busy() { return this.#busy; }
  set error(value) { this.#error = String(value || ''); this.#render(); }
  #canMove(delta) { return !this.#busy && delta && this.#index + delta >= 0 && this.#index + delta < this.#guests.length; }
  #move(delta) {
    if (!this.#canMove(delta)) return;
    this.#index += delta; this.#error = ''; this.#render();
    this.dispatchEvent(new CustomEvent('guest-change', { bubbles: true, composed: true, detail: { id: this.selectedId, index: this.#index } }));
    const card = this.shadowRoot.querySelector('.identity');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) card?.animate([{ transform: `translateY(${delta * 10}px)`, opacity: .35 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 240, easing: 'ease-out' });
  }
  #render() {
    const active = this.shadowRoot.activeElement;
    const focus = active?.dataset.action ? `[data-action="${active.dataset.action}"]` : active?.dataset.move ? `[data-move="${active.dataset.move}"]` : null;
    const g = this.#guests[this.#index], threshold = this.getAttribute('variant') === 'threshold';
    if (!g) { this.shadowRoot.innerHTML = `<style>${css}</style><div class="shell empty"><strong>${copyFor(this).emptyTitle}</strong><p>${copyFor(this).emptyBody}</p></div>`; return; }
    const copy = copyFor(this);
    const stage = getStage(g), pending = openVisits(g).length, number = this.#index + 1;
    const names = ['tools', 'door', 'key', 'check'];
    const statusText = pending ? (pending === 1 ? copy.pendingOne : copy.pendingMany(pending)) : ['', copy.ready, copy.waiting, copy.done][stage];
    const action = stage === 1 ? 'grant-access' : stage === 2 ? 'mark-entered' : stage === 3 ? 'undo-entry' : '';
    const label = stage === 1 ? copy.grant : stage === 2 ? copy.enter : copy.undo;
    const steps = STAGES.map((s, i) => {
      const cls = i < stage ? 'past' : i === stage ? 'current' : 'future';
      const stageLabel = copy.stages[i] || s;
      if (threshold) return `<li class="door-step ${cls}" ${i === stage ? 'aria-current="step"' : ''}><div class="portal" aria-hidden="true"><span class="door-icon">${icon(i < stage ? 'check' : names[i])}</span><div class="leaf"><span class="door-num">0${i + 1}</span></div></div><span class="step-label">${stageLabel}</span></li>`;
      const stepAction = i === 2 ? 'grant-access' : i === 3 ? 'mark-entered' : '';
      const enabled = !this.#busy && (i === 2 && stage === 1 || i === 3 && stage === 2);
      const actionLabel = i === 2 ? copy.grant : copy.enter;
      const reason = this.#busy ? copy.saving : i <= stage ? copy.alreadyDone : i === 2 ? copy.needsReady : copy.needsAccess;
      const inner = `<span class="dot" aria-hidden="true">${i <= stage ? icon(i < stage ? 'check' : names[i]) : i + 1}</span><span class="step-label">${stageLabel}</span>`;
      return `<li class="step ${cls} ${enabled ? 'actionable' : ''}" ${i === stage ? 'aria-current="step"' : ''}>${stepAction ? `<button type="button" class="step-control" data-action="${stepAction}" aria-disabled="${!enabled}" aria-label="${actionLabel}${enabled ? '' : '. ' + reason}">${inner}</button>` : inner}</li>`;
    }).join('');
    this.shadowRoot.innerHTML = `<style>${css}</style><section class="shell ${threshold ? 'threshold' : 'journey'} ${stage === 0 ? 'pending-stage' : ''}" aria-label="${copy.ariaCheckin(escape(g.name))}" aria-busy="${this.#busy}">
      <div class="content">${threshold ? `<div class="top"><div class="eyebrow"><span></span>Who's there?</div><div class="status ${stage === 0 ? 'pending' : ''}">${icon(names[stage])}${copy.stages[stage]}</div></div>` : ''}
      <div class="identity"><div class="person"><span class="avatar" aria-hidden="true">${escape(Array.from(g.name)[0])}</span><div><small>${copy.guest}</small><div class="name">${escape(g.name)}</div></div></div><span class="route-arrow">${icon('arrow')}</span><div class="property"><small>${copy.property}</small>${escape(g.property)}</div></div>
      <ol class="${threshold ? 'doors' : 'steps'}" aria-label="${copy.process}">${steps}</ol>
      ${threshold ? `<div class="foot"><span class="hint">${icon(stage === 3 ? 'check' : stage === 0 ? 'tools' : 'door')}${statusText}</span><div class="actions">${stage === 2 ? `<button class="undo" data-action="revoke-access" ${this.#busy ? 'disabled' : ''}>${copy.revoke}</button>` : ''}${action ? `<button class="${stage === 3 ? 'undo' : 'btn'}" data-action="${action}" ${this.#busy ? 'disabled' : ''}>${this.#busy ? copy.savingEllipsis : label}${stage < 3 ? icon('arrow') : ''}</button>` : ''}</div></div>` : ''}</div>
      ${this.#error ? `<div class="error" role="alert">${escape(this.#error)}</div>` : ''}
      <div class="nav"><div class="overview" aria-hidden="true">${this.#guests.map((_, i) => `<span class="${i === this.#index ? 'active' : ''}"></span>`).join('')}</div><span class="nav-note">${icon('up')}${copy.swipe}</span><div class="pager"><span class="count"><b>${String(number).padStart(2, '0')}</b><span> / ${String(this.#guests.length).padStart(2, '0')}</span></span><button data-move="-1" aria-label="${copy.prev}" ${this.#canMove(-1) ? '' : 'disabled'}>${icon('up')}</button><button data-move="1" aria-label="${copy.next}" ${this.#canMove(1) ? '' : 'disabled'}>${icon('down')}</button></div></div>
      <span class="sr" role="status" aria-live="polite">${escape(copy.live(g.name, g.property, copy.stages[stage], this.#busy, number, this.#guests.length))}</span>
      </section>`;
    if (focus) (this.shadowRoot.querySelector(focus) || this.shadowRoot.querySelector('.step-control[aria-disabled="false"], .actions button'))?.focus({ preventScroll: true });
  }
}
if (!customElements.get('kk-checkin')) customElements.define('kk-checkin', KnockKnockCheckin);
