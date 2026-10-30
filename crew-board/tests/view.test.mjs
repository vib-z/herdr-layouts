import { sceneFixture } from './scene-fixture.mjs';
// Runs JavaScript render branches against a recording builder. This is not GPUI validation.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const modelText = await readFile(new URL('../mods/crew-board/model.js',import.meta.url),'utf8');
const model = await import(`data:text/javascript,${encodeURIComponent(modelText)}`);
const geometryText = await readFile(new URL('../mods/crew-board/geometry.js',import.meta.url),'utf8');
const geometry = await import(`data:text/javascript,${encodeURIComponent(geometryText)}`);
const text = await readFile(new URL('../mods/crew-board/main.js',import.meta.url),'utf8');
const themeFile = JSON.parse(await readFile(new URL('../themes/crew-board.json',import.meta.url),'utf8'));
const palette = {...themeFile,...themeFile.colors};
let currentProps = {}, active = true, state = {}, nodes = [], calls = [], stored = new Map(), sharedValues = new Map();
const methods = new Set('id px pl pr py p pb pt h w size size_full w_full h_full min_w min_h max_w flex_1 flex_none flex items_center justify_center gap rounded text_size font_semibold line_height bg text_color cursor_pointer hover on_mouse_down on_click on_size_change on_scroll_wheel tooltip relative absolute left right top bottom border border_b border_t border_color opacity transition spring frames loop truncate overflow_y_scrollbar overflow_hidden'.split(' '));
function element(kind='div') {
  const n = {kind,children:[],attrs:{},events:{},consumed:false};
  nodes.push(n);
  let proxy;
  const add = child => {
    if (child?._node) { assert.equal(child._node.consumed,false,'Element consumed twice'); child._node.consumed=true; n.children.push(child._node); }
    else { assert.notEqual(child,undefined,'undefined child'); n.children.push(child); }
  };
  proxy = new Proxy(n,{get(target,key) {
    if (key === '_node') return n;
    if (key === 'child') return c => {add(c);return proxy;};
    if (key === 'children') return list => {for(const c of list)add(c);return proxy;};
    if (key === 'when') return (condition,fn) => condition ? fn(proxy) : proxy;
    assert(methods.has(key),`Unexpected builder method: ${String(key)}`);
    return (...args) => {n.attrs[key]=args;if(key.startsWith('on_'))n.events[key]=args.at(-1);return proxy;};
  }});
  return proxy;
}
const context = {
  ...model,...geometry,View:class {},div:()=>element(),h_flex:()=>element('row'),v_flex:()=>element('column'),
  svg:path=>element(`svg:${path}`),image:path=>element(`image:${path}`),
  PathBuilder:{stroke:()=>({move_to(){return this;},line_to(){return this;},build(){return {};}})},
  window:{paint_path:()=>element('path')},theme:()=>palette,
  agents:()=>state.agents,terminals:()=>state.terminals,spaces:()=>state.spaces,panes:()=>state.panes,
  props:()=>currentProps,appWindow:()=>({active,platform:'macos',buttons:false}),
  shared:key=>sharedValues.get(key),setShared:(key,value)=>sharedValues.set(key,value),
  run:(command,args)=>calls.push([command,args]),setAgentOrder:list=>calls.push(['order',list]),
  hc:()=>{throw new Error('No external program may run in static tests');},
  openOverlay:spec=>calls.push(['overlay',spec]),closeOverlay:id=>calls.push(['closeOverlay',id]),
  localStorage:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)},
};
const source = text.replace(/^import[\s\S]*?;\n/gm,'').replace('export default class CrewBoard','class CrewBoard')+'\nCrewBoard;';
const CrewBoard = new vm.Script(source).runInNewContext(context);
const cx = {notify(){},stop_propagation(){},timer:{every(){}},spawn(){throw new Error('No spawned work in static render test');}};
const program = {name:'Agent',icon:null};
const spaces = Array.from({length:4},(_,i)=>({id:`s${i}`,name:['api','web','ops','docs'][i],branch:'feature/auth',active:i===0,tabs:[{id:`tab${i}`,name:'auth',active:true,settled:i===2}]}));
const agents = Array.from({length:10},(_,i)=>({address:i===6?'edge/t7':`t${i+1}`,pane:`p${i}`,space:`s${i%4}`,space_name:spaces[i%4].name,tab:`tab${i%4}`,tab_name:'auth',status:['working','done','blocked','idle','working','blocked','blocked','idle','working','idle'][i],program,title:`task ${i+1}`}));
const terminals = agents.map(a=>({address:a.address,state:'live',status:a.status,report:{kind:'permission',msg:'Review this change'},status_ms:Date.now()-120000}));
terminals.push({address:'tchild',parent:'t1',state:'live',status:'error',program,report:{title:'child auth request',kind:'auth'}});
terminals.push({address:'shell',state:'live',program:{shell:true}});
state = {agents,terminals,spaces,panes:[{pane:'p0',terminal:'t1',program,status:'working'}]};
function build(role,width=960,height=842,extraProps={}) {
  currentProps = {role,...extraProps}; nodes=[];calls=[];
  const view = new CrewBoard();view.init(currentProps,cx);view.size={width,height};view.render(cx);
  assert(nodes.every(n=>!n.attrs.text_size || n.attrs.text_size[0]>=10),'Readable text is at least 10px');
  return view;
}
function ids(){return nodes.filter(n=>n.attrs.id).map(n=>n.attrs.id[0]);}
function byId(id){return nodes.find(n=>n.attrs.id?.[0]===id);}
function allText(){return nodes.flatMap(n=>n.children.filter(c=>typeof c==='string')).join('\n');}
const wide = build('wall');
assert.equal(ids().filter(id=>id.startsWith('request-')).length,4,'All blockers, including settled, remote and child');
assert(ids().includes('boss-desk'));
assert(byId('age-t3'),'Reported timestamp has an age');
assert(!byId('age-tchild'),'Missing timestamp draws no age element');
for (const n of nodes.filter(n=>n.attrs.id?.[0].startsWith('blueprint-sheet-'))) {
  assert.equal(n.attrs.bg[0],'#243e49');assert.equal(n.attrs.border[0],1);assert.equal(n.attrs.border_color[0],'#7a999d');
}
assert(nodes.some(n=>n.kind==='path'),'Visible blocker strings');
assert(nodes.some(n=>n.attrs.spring),'Spring movement');
assert.equal(ids().length,new Set(ids()).size,'Unique UI IDs');
byId('request-tchild').events.on_click({},cx);
assert.equal(calls.at(-1)[0],'terminal.peek');
byId('request-edge/t7').events.on_click({},cx);
assert.equal(calls.at(-1)[0],'agent.focus');
assert.equal(calls.at(-1)[1].terminal,'edge/t7');
wide.folded=true;nodes=[];wide.render(cx);
assert.equal(ids().filter(id=>id.startsWith('request-')).length,4,'Folding cannot hide calls');
const narrow = build('wall',340,642);
assert.equal(ids().filter(id=>id.startsWith('request-')).length,4);
assert(allText().includes('LAYING LOW'),'Compact wall retains state labels');
assert.equal(byId('boss-desk').attrs.w[0],340);
sharedValues.set('crew-board.still',true);build('wall');
assert(!nodes.some(n=>n.attrs.loop||n.attrs.spring||n.attrs.transition||n.attrs.frames),'Still mode');
sharedValues.set('crew-board.still',false);active=false;build('wall');
assert(!nodes.some(n=>n.attrs.loop||n.attrs.spring||n.attrs.transition||n.attrs.frames),'Inactive window stops motion');
active=true;build('topbar',1000,58);
byId('crew-topbar').events.on_size_change({width:1000,height:58},cx);
assert.equal(calls.at(-1)[0],'layout.resize');assert.equal(calls.at(-1)[1].px,340);
currentProps={role:'header',pane:'p0'};nodes=[];new CrewBoard().render(cx);
assert(allText().includes('t1  .  '+model.crewRole('t1')));
currentProps={role:'header'};nodes=[];new CrewBoard().render(cx);assert(allText().includes('THE VAN'));
const dead = {address:'gone',space:'s0',space_name:'api',tab:'tab0',tab_name:'auth',title:'finished job',program,lastSeen:1,exit:{state:'finished',reason:'exited',code:0}};
stored.set('crew-history',JSON.stringify([dead,{...dead,address:'unknown',exit:null}]));
const remembered = build('wall');
assert(allText().includes('BUSTED'));assert(allText().includes('UNAVAILABLE'));
let deadPhoto;
const mountedPhotos = new Set();
for (let page=0;page<20;page++) {
  remembered.page=page;nodes=[];remembered.render(cx);
  for (const id of ids().filter(id=>id.startsWith('travel-'))) mountedPhotos.add(id.slice(7));
  deadPhoto ||= byId('travel-gone');
  if (remembered.page!==page) break;
}
assert(deadPhoto);deadPhoto.events.on_mouse_down({},cx);assert.equal(calls.at(-1)[0],'overlay');
for (const a of [...agents.filter(a=>a.status!=='blocked'),dead,{address:'unknown'}]) assert(mountedPhotos.has(a.address),`Photo must be reachable: ${a.address}`);
const longState = structuredClone(state);longState.agents[2].title='A very long task title '.repeat(12);longState.agents[2].space_name='workspace '.repeat(12);state=longState;
build('wall',340,642);assert.equal(ids().filter(id=>id.startsWith('request-')).length,4);
assert(byId('request-t3').attrs.tooltip[0].includes(longState.agents[2].title));
state={agents:[],terminals:[],spaces:[],panes:[]};stored=new Map();build('wall');assert(allText().includes('The line is quiet.'));
for (const role of ['wall','topbar','header','burn']) {
  build(role);assert(nodes.length>0,`Empty ${role} must render`);
  assert(!allText().includes('undefined'),`Empty ${role} must have meaningful copy`);
}
build('burn');assert(!byId('burn-card'),'No removal action without an address');
build('header',600,31,{pane:'absent'});assert(allText().includes('THE VAN'));
const title60='Review the cache refresh and repair the failed login workflow'.slice(0,60);
assert.equal(title60.length,60);
const oneAgent={...agents[0],title:title60};
state={agents:[oneAgent],terminals:[{...terminals[0],report:{title:title60}}],spaces:[spaces[0]],panes:[{pane:'p0',terminal:'t1',program,status:'working',title:title60}]};
for (const role of ['wall','topbar','header','burn']) {
  build(role,960,842,role==='burn'?{address:'t1',title:title60}:{});
  assert(nodes.length>0,`One long title: ${role}`);
}
build('header',600,31,{pane:'p0'});assert.equal(byId('tape-p0').attrs.tooltip[0],title60);
state={agents:[],terminals:[],spaces:[],panes:[]};stored=new Map();
const exitView=build('wall');assert.equal(exitView.checkLabel,'Exit check pending');exitView.history=[{...dead,exit:null}];
let requested;
context.hc=async args=>{requested=Array.from(args);return {code:0,stdout:JSON.stringify({terminals:[{address:'gone',state:'finished',exit_code:0,reason:'exited'}]})};};
let task;
exitView.checkExits({...cx,spawn:fn=>{task=fn(cx);}});await task;
assert.deepEqual(requested,['ls','--all','--json'],'Use app core helper without a session override');
assert.equal(exitView.history[0].exit.state,'finished');
assert.equal(exitView.pending,false);
const fixture=sceneFixture();state=fixture;stored=new Map([['crew-history',JSON.stringify([fixture.dead])]]);
for(const [width,height] of [[960,842],[907.2,824]]) {
  build('wall',width,height);
  assert(!byId('page-down'),'Complete scene must fit one page');
  assert(!ids().some(id=>id.startsWith('age-')),'No timestamp means no age elements');
  for (const a of [...model.collectCrew(fixture.agents,fixture.terminals,fixture.spaces),fixture.dead]) assert(byId(`travel-${a.address}`),`Visible photo: ${a.address}`);
}
nodes=[];wide.blueprint({id:'branchless',name:'api',branch:null},0,0,300,600,[],[]);
assert(!allText().includes('No branch reported'));
assert(!nodes.some(n=>n.children.includes('null')));
console.log('PASS: all roles empty and 60-character title, core helper exit confirmation, wide/compact paging, attention, focus routing and motion');
