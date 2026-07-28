(()=>{
  'use strict';
  if(!window.L?.map)return;

  const days=['all','d27','d28','d29','d30','d31','backup','yosh'];
  let capturedMap=null;
  let exposed=false;
  const originalMap=window.L.map;

  window.L.map=function(...args){
    const map=originalMap.apply(this,args);
    capturedMap=map;
    setTimeout(expose,0);
    return map;
  };
  Object.assign(window.L.map,originalMap);

  function activeDay(){
    const buttons=[...document.querySelectorAll('#tabs button')];
    const index=buttons.findIndex(button=>button.classList.contains('on'));
    return days[index>=0?index:1]||'d27';
  }

  function expose(){
    if(!capturedMap||exposed)return;
    exposed=true;
    const api={
      map:capturedMap,
      startLocation:()=>document.getElementById('locateBtn')?.click(),
      getPosition:()=>null,
      getActiveDay:activeDay,
      selectDay:day=>{
        const index=days.indexOf(day);
        document.querySelectorAll('#tabs button')[index]?.click();
      }
    };
    window.KAZAN_APP=api;
    window.dispatchEvent(new CustomEvent('kazan:app-ready',{detail:api}));

    const tabs=document.getElementById('tabs');
    if(tabs){
      let last=activeDay();
      new MutationObserver(()=>{
        const next=activeDay();
        if(next!==last){
          last=next;
          window.dispatchEvent(new CustomEvent('kazan:day-change',{detail:{day:next}}));
        }
      }).observe(tabs,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});
    }
  }
})();
