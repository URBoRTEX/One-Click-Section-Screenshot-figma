(()=>{
  'use strict';
  const D=window.KAZAN;
  if(!D)return;

  const STORAGE_KEY='kazan-trip-progress-v1';
  const order=['all','d27','d28','d29','d30','d31','backup','yosh'];
  const tabs=document.getElementById('tabs');
  const list=document.getElementById('list');
  const sheet=document.getElementById('sheet');
  if(!tabs||!list||!sheet)return;

  let completed=load();
  let scheduled=false;
  let decorating=false;

  const style=document.createElement('style');
  style.textContent=`
    .top button{display:flex!important;align-items:center;gap:5px}
    .top button.day-done:not(.on){background:#dcfce7!important;color:#166534!important}
    .progress-tab-check{display:grid;place-items:center;width:16px;height:16px;border-radius:5px;background:#16a34a;color:#fff;font-size:10px}
    .summary-left{display:flex;align-items:center;gap:11px;min-width:0;flex:1}
    .summary-copy{min-width:0}
    .progress-day-text{display:block;font-size:11px;color:#475467;margin-top:4px;font-weight:700}
    .progress-day-text.complete{color:#15803d}
    .progress-day-check,.progress-event-check{position:relative;flex:0 0 auto}
    .progress-day-check{width:34px;height:34px}
    .progress-event-check{width:28px;height:28px;margin-top:2px}
    .progress-day-check input,.progress-event-check input{position:absolute;opacity:0;pointer-events:none}
    .progress-day-check span,.progress-event-check span{display:grid;place-items:center;border:2px solid #cbd5e1;background:#fff;transition:.16s}
    .progress-day-check span{width:34px;height:34px;border-radius:11px}
    .progress-event-check span{width:28px;height:28px;border-radius:9px}
    .progress-day-check input:checked+span,.progress-event-check input:checked+span{background:#16a34a;border-color:#16a34a}
    .progress-day-check input:checked+span:after,.progress-event-check input:checked+span:after{content:'✓';color:#fff;font-weight:900}
    .progress-day-check input:indeterminate+span{background:#f59e0b;border-color:#f59e0b}
    .progress-day-check input:indeterminate+span:after{content:'−';color:#fff;font-weight:900;font-size:18px}
    .stop.progress-row{grid-template-columns:30px 34px minmax(0,1fr)!important;gap:9px!important;align-items:start}
    .stop.progress-done{background:#f0fdf4}
    .stop.progress-done>div:last-child>b{text-decoration:line-through;text-decoration-thickness:1px;color:#667085}
  `;
  document.head.appendChild(style);

  const summary=sheet.querySelector('.summary');
  const originalCopy=summary?.firstElementChild;
  let dayInput=null;
  let dayText=null;
  if(summary&&originalCopy&&!document.getElementById('progressDayInput')){
    originalCopy.classList.add('summary-copy');
    const left=document.createElement('div');
    left.className='summary-left';
    summary.insertBefore(left,originalCopy);

    const check=document.createElement('label');
    check.className='progress-day-check';
    check.innerHTML='<input id="progressDayInput" type="checkbox"><span></span>';
    dayInput=check.querySelector('input');
    left.append(check,originalCopy);

    dayText=document.createElement('small');
    dayText.className='progress-day-text';
    originalCopy.appendChild(dayText);

    check.addEventListener('click',e=>e.stopPropagation());
    dayInput.addEventListener('change',()=>{
      const value=dayInput.checked;
      scoped(activeKey()).forEach(x=>setDone(x,value,false));
      save();
      decorate();
    });
  }else{
    dayInput=document.getElementById('progressDayInput');
    dayText=summary?.querySelector('.progress-day-text')||null;
  }

  function load(){
    try{
      const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
      return new Set(Array.isArray(value)?value:[]);
    }catch(_){return new Set();}
  }
  function save(){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify([...completed]));}catch(_){}
  }
  function itemId(x){return `${x[1]}|${x[0]}|${x[2]}|${x[4]}`;}
  function trackable(x){return x&&x[1]!=='stay';}
  function isDone(x){return trackable(x)&&completed.has(itemId(x));}
  function setDone(x,value,persist=true){
    if(!trackable(x))return;
    if(value)completed.add(itemId(x));else completed.delete(itemId(x));
    if(persist)save();
  }
  function activeKey(){
    const buttons=[...tabs.querySelectorAll('button')];
    const index=buttons.findIndex(button=>button.classList.contains('on'));
    return order[index>=0?index:1]||'d27';
  }
  function visible(day=activeKey()){
    return D.items.filter(x=>day==='all'?x[1]!=='yosh':x[1]===day);
  }
  function scoped(day=activeKey()){
    return visible(day).filter(trackable);
  }
  function stats(day=activeKey()){
    const items=scoped(day);
    const done=items.reduce((sum,x)=>sum+(isDone(x)?1:0),0);
    return {total:items.length,done,complete:items.length>0&&done===items.length};
  }

  function decorateList(){
    const items=visible();
    const rows=[...list.querySelectorAll(':scope > .stop')];
    rows.forEach((row,index)=>{
      const item=items[index];
      if(!item)return;
      const done=isDone(item);
      row.classList.add('progress-row');
      row.classList.toggle('progress-done',done);

      let check=row.querySelector(':scope > .progress-event-check');
      if(!check&&trackable(item)){
        check=document.createElement('label');
        check.className='progress-event-check';
        check.innerHTML='<input type="checkbox"><span></span>';
        row.insertBefore(check,row.firstElementChild);
        check.addEventListener('click',e=>e.stopPropagation());
        const input=check.querySelector('input');
        input.addEventListener('change',()=>{
          setDone(item,input.checked);
          decorate();
        });
      }
      if(check){
        const input=check.querySelector('input');
        input.checked=done;
      }

      const badge=row.querySelector('.n');
      if(badge){
        if(!badge.dataset.progressOriginalText)badge.dataset.progressOriginalText=badge.textContent;
        if(!badge.dataset.progressOriginalBackground)badge.dataset.progressOriginalBackground=badge.style.background||'';
        badge.textContent=done?'✓':badge.dataset.progressOriginalText;
        badge.style.background=done?'#16a34a':badge.dataset.progressOriginalBackground;
      }
    });
  }

  function decorateTabs(){
    [...tabs.querySelectorAll('button')].forEach((button,index)=>{
      const day=order[index];
      if(!day)return;
      const complete=stats(day).complete;
      button.classList.toggle('day-done',complete);
      let icon=button.querySelector('.progress-tab-check');
      if(complete&&!icon){
        icon=document.createElement('span');
        icon.className='progress-tab-check';
        icon.textContent='✓';
        button.prepend(icon);
      }
      if(!complete&&icon)icon.remove();
    });
  }

  function decorateDay(){
    if(!dayInput||!dayText)return;
    const state=stats();
    dayInput.checked=state.complete;
    dayInput.indeterminate=state.done>0&&!state.complete;
    dayText.textContent=state.total?`${state.complete?'День выполнен':'Выполнено'} · ${state.done} из ${state.total}`:'Нет событий';
    dayText.classList.toggle('complete',state.complete);
  }

  function observe(){
    listObserver.observe(list,{childList:true});
    tabsObserver.observe(tabs,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  }
  function decorate(){
    if(decorating)return;
    decorating=true;
    listObserver.disconnect();
    tabsObserver.disconnect();
    decorateList();
    decorateTabs();
    decorateDay();
    decorating=false;
    observe();
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      decorate();
    });
  }

  const listObserver=new MutationObserver(schedule);
  const tabsObserver=new MutationObserver(schedule);
  observe();
  setTimeout(decorate,0);
})();
