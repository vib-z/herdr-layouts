import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sceneFixture } from './scene-fixture.mjs';
const readModule = async name => import(`data:text/javascript,${encodeURIComponent(await readFile(new URL(`../mods/crew-board/${name}.js`,import.meta.url),'utf8'))}`);
const { planSheets, CARD_HEIGHT, deskCardBounds, deskStringRoute } = await readModule('geometry');
const { groupJobs, collectCrew } = await readModule('model');
const scene = sceneFixture();
const crew = [...collectCrew(scene.agents,scene.terminals,scene.spaces),scene.dead];
assert.equal(crew.length,11);
const jobs=groupJobs(scene.spaces,crew);
for (const [width,pageHeight] of [[960,437],[907.2,419]]) {
  const plan=planSheets(jobs,width,pageHeight);
  assert.equal(plan.compact,true);
  assert.equal(plan.sheets.length,3);
  assert(plan.totalHeight<=pageHeight,`${plan.totalHeight} must fit ${pageHeight}`);
  assert.equal(plan.sheets.flatMap(s=>s.entries).length,11);
  const first=plan.sheets[0].entries.filter(e=>e.a.tab==='api-0');
  assert.equal(first.length,3);assert(first.every(e=>e.width===64 && e.y===first[0].y),'Three photos in one row');
  for (const sheet of plan.sheets) for (const entry of sheet.entries) {
    assert(entry.x+entry.captionWidth<=sheet.width-14);
    assert(entry.y+(entry.compactPin?22:CARD_HEIGHT(entry.width))<=sheet.height-4,'Full caption fits on paper');
  }
}
const empty=planSheets([{id:'empty',name:'empty',tabs:Array.from({length:3},(_,i)=>({id:`empty-${i}`,crew:[]}))}],960,437);
assert.equal(empty.sheets[0].entries.length,0);assert.equal(empty.totalHeight,147,'Empty tabs allocate headers only');
const crowd={...jobs[0],tabs:[{id:'crowd',crew:Array.from({length:60},(_,i)=>({...crew[0],address:`crowd-${i}`}))}]};
assert(planSheets([crowd],960,437,{crowd:true}).totalHeight>437,'Large expanded crew may page after compacting');
assert.equal(planSheets([],960,437).totalHeight,0);
for (const [width,columns,count] of [[960,2,4],[907.2,2,3],[620,1,3]]) {
  const deskY=500;
  const cards=Array.from({length:count},(_,i)=>deskCardBounds(i,columns,width,deskY));
  for (let target=0;target<count;target++) {
    const route=deskStringRoute(100+target*90,150,target,columns,width,deskY);
    assert.equal(route.at(-1)[1],cards[target].top);
    for (let segment=1;segment<route.length;segment++) {
      const [x1,y1]=route[segment-1], [x2,y2]=route[segment];
      for (const card of cards) {
        let crosses=false;
        if(x1===x2) crosses=x1>card.left && x1<card.left+card.width && Math.max(y1,y2)>card.top && Math.min(y1,y2)<card.top+card.height;
        else if(y1===y2) crosses=y1>card.top && y1<card.top+card.height && Math.max(x1,x2)>card.left && Math.min(x1,x2)<card.left+card.width;
        else assert(Math.max(y1,y2)<card.top,'Diagonal legs stay above cards');
        assert(!crosses,`String ${target} must not enter a request card`);
      }
    }
  }
}
console.log('PASS: full three-job scene fits one page at 1600x900 and 1512x882; empty tabs reserve no photo rows; large fleets compact before paging; desk strings avoid every request interior');
