(()=>{
  'use strict';
  const D=window.KAZAN;
  if(!D)return;

  const LEGACY_KEY='kazan-trip-progress-v1';
  const STATUS_KEY='kazan-trip-status-v2';
  const DB_NAME='kazan-trip-journal-v1';
  const DB_STORE='items';
  const MAX_VIDEO_BYTES=120*1024*1024;
  const MAX_ITEM_MEDIA_BYTES=350*1024*1024;
  const order=['all','d27','d28','d29','d30','d31','backup','yosh'];
  const tabs=document.getElementById('tabs');
  const list=document.getElementById('list');
  const sheet=document.getElementById('sheet');
  if(!tabs||!list||!sheet)return;

  let statuses=loadStatuses();
  let decorating=false;
  let scheduled=false;
  let activeItem=null;
  let activeId=null;
  let activeRecord=null;
  let noteCache=new Map();
  let objectUrls=[];

  const style=document.createElement('style');
  style.textContent=`
    .top button{display:flex!important;align-items:center;gap:5px}
    .top button.day-done:not(.on){background:#dcfce7!important;color:#166534!important}
    .top button.day-near:not(.on):not(.day-done){background:#fef3c7!important;color:#92400e!important}
    .progress-tab-check,.progress-tab-near{display:grid;place-items:center;width:16px;height:16px;border-radius:5px;color:#fff;font-size:10px;font-weight:900}
    .progress-tab-check{background:#16a34a}.progress-tab-near{background:#f59e0b}
    .summary-left{display:flex;align-items:center;gap:11px;min-width:0;flex:1}.summary-copy{min-width:0}
    .progress-day-text{display:block;font-size:11px;color:#475467;margin-top:4px;font-weight:700}.progress-day-text.complete{color:#15803d}.progress-day-text.has-near{color:#92400e}
    .progress-day-check,.progress-event-check{position:relative;flex:0 0 auto}.progress-day-check{width:34px;height:34px}.progress-event-check{width:28px;height:28px;margin-top:2px}
    .progress-day-check input,.progress-event-check input{position:absolute;opacity:0;pointer-events:none}
    .progress-day-check span,.progress-event-check span{display:grid;place-items:center;border:2px solid #cbd5e1;background:#fff;transition:.16s}
    .progress-day-check span{width:34px;height:34px;border-radius:11px}.progress-event-check span{width:28px;height:28px;border-radius:9px}
    .progress-day-check input:checked+span,.progress-event-check input:checked+span{background:#16a34a;border-color:#16a34a}
    .progress-day-check input:checked+span:after,.progress-event-check input:checked+span:after{content:'✓';color:#fff;font-weight:900}
    .progress-day-check input:indeterminate+span{background:#f59e0b;border-color:#f59e0b}.progress-day-check input:indeterminate+span:after{content:'−';color:#fff;font-weight:900;font-size:18px}
    .stop.progress-row{grid-template-columns:30px 34px minmax(0,1fr)!important;gap:9px!important;align-items:start}.stop.progress-done{background:#f0fdf4}.stop.progress-near{background:#fffbeb}
    .stop.progress-done>div:last-child>b{text-decoration:line-through;text-decoration-thickness:1px;color:#667085}
    .progress-near-btn,.progress-journal-btn{border:0;border-radius:8px;padding:7px 9px;font-size:11px;font-weight:800;white-space:nowrap}
    .progress-near-btn{background:#fff7ed;color:#9a3412;box-shadow:inset 0 0 0 1px #fed7aa}.progress-near-btn.active{background:#f59e0b;color:#fff;box-shadow:none}
    .progress-journal-btn{background:#eef2f6;color:#111827}.progress-journal-btn.has-data{background:#e0e7ff;color:#3730a3}
    .journal-overlay{position:fixed;z-index:3000;inset:0;background:rgba(15,23,42,.42);display:none;align-items:flex-end}.journal-overlay.open{display:flex}
    .journal-sheet{width:100%;max-height:min(86dvh,800px);display:flex;flex-direction:column;background:#fff;border-radius:24px 24px 0 0;box-shadow:0 -16px 50px rgba(15,23,42,.28);padding-bottom:env(safe-area-inset-bottom,0)}
    .journal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 16px 12px;border-bottom:1px solid #e5e7eb}.journal-head h2{margin:0;font-size:19px;line-height:1.2}.journal-head p{margin:4px 0 0;color:#667085;font-size:12px}
    .journal-close{width:38px;height:38px;border:0;border-radius:12px;background:#eef2f6;font-size:22px;color:#111827}.journal-body{overflow:auto;-webkit-overflow-scrolling:touch;padding:14px 16px 26px}
    .journal-statuses{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:15px}.journal-status{border:0;border-radius:11px;padding:10px 8px;background:#eef2f6;color:#344054;font-size:11px;font-weight:800}
    .journal-status[data-status="done"].active{background:#16a34a;color:#fff}.journal-status[data-status="near"].active{background:#f59e0b;color:#fff}.journal-status[data-status=""].active{background:#111827;color:#fff}
    .journal-label{display:block;margin:0 0 7px;font-size:12px;font-weight:800;color:#344054}.journal-comment{width:100%;min-height:104px;resize:vertical;border:1px solid #d0d5dd;border-radius:14px;padding:12px;font:inherit;font-size:14px;outline:none}.journal-comment:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
    .journal-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.journal-add,.journal-save{border:0;border-radius:11px;padding:11px 13px;font-size:12px;font-weight:800}.journal-add{background:#eef2f6;color:#111827}.journal-save{background:#2563eb;color:#fff}
    .journal-storage-note{margin:9px 0 0;color:#667085;font-size:10px;line-height:1.35}.journal-media{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:14px}
    .journal-media-card{position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;background:#111827}.journal-media-card img,.journal-media-card video{width:100%;height:100%;object-fit:cover;display:block}.journal-media-card video{background:#000}
    .journal-media-kind{position:absolute;left:6px;bottom:6px;padding:4px 6px;border-radius:7px;background:rgba(17,24,39,.76);color:#fff;font-size:9px;font-weight:800;pointer-events:none}
    .journal-media-delete{position:absolute;right:5px;top:5px;width:30px;height:30px;border:0;border-radius:9px;background:rgba(17,24,39,.82);color:#fff;font-size:18px}
    .journal-empty{grid-column:1/-1;padding:18px 10px;border:1px dashed #d0d5dd;border-radius:12px;text-align:center;color:#667085;font-size:12px}.journal-busy{opacity:.62;pointer-events:none}
    @media(min-width:800px){.journal-overlay{align-items:center;justify-content:center}.journal-sheet{max-width:560px;border-radius:22px;max-height:88vh;padding-bottom:0}.journal-media{grid-template-columns:repeat(3,minmax(0,1fr))}}
  `;
  document.head.appendChild(style);

  const summary=sheet.querySelector('.summary');
  const originalCopy=summary?.firstElementChild;
  let dayInput=null,dayText=null;
  if(summary&&originalCopy&&!document.getElementById('progressDayInput')){
    originalCopy.classList.add('summary-copy');
    const left=document.createElement('div');left.className='summary-left';summary.insertBefore(left,originalCopy);
    const check=document.createElement('label');check.className='progress-day-check';check.innerHTML='<input id="progressDayInput" type="checkbox"><span></span>';dayInput=check.querySelector('input');left.append(check,originalCopy);
    dayText=document.createElement('small');dayText.className='progress-day-text';originalCopy.appendChild(dayText);
    check.addEventListener('click',e=>e.stopPropagation());
    dayInput.addEventListener('change',()=>{const value=dayInput.checked?'done':'';scoped().forEach(x=>setStatus(x,value,false));saveStatuses();decorate();});
  }else{dayInput=document.getElementById('progressDayInput');dayText=summary?.querySelector('.progress-day-text')||null;}

  const journal=createJournal();

  function loadStatuses(){
    const result={};
    try{const saved=JSON.parse(localStorage.getItem(STATUS_KEY)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))Object.assign(result,saved);}catch(_){}
    try{const legacy=JSON.parse(localStorage.getItem(LEGACY_KEY)||'[]');if(Array.isArray(legacy))legacy.forEach(id=>{if(!result[id])result[id]='done';});}catch(_){}
    return result;
  }
  function saveStatuses(){try{localStorage.setItem(STATUS_KEY,JSON.stringify(statuses));}catch(_){}}
  function itemId(x){return `${x[1]}|${x[0]}|${x[2]}|${x[4]}`;}
  function trackable(x){return x&&x[1]!=='stay';}
  function getStatus(x){return trackable(x)?(statuses[itemId(x)]||''):'';}
  function setStatus(x,value,persist=true){if(!trackable(x))return;const id=itemId(x);if(value)statuses[id]=value;else delete statuses[id];if(persist)saveStatuses();}
  function activeKey(){const buttons=[...tabs.querySelectorAll('button')],index=buttons.findIndex(b=>b.classList.contains('on'));return order[index>=0?index:1]||'d27';}
  function visible(day=activeKey()){return D.items.filter(x=>day==='all'?x[1]!=='yosh':x[1]===day);}
  function scoped(day=activeKey()){return visible(day).filter(trackable);}
  function stats(day=activeKey()){const items=scoped(day);let done=0,near=0;items.forEach(x=>{const s=getStatus(x);if(s==='done')done++;else if(s==='near')near++;});return{total:items.length,done,near,complete:items.length>0&&done===items.length};}

  function decorateList(){
    const items=visible(),rows=[...list.querySelectorAll(':scope > .stop')];
    rows.forEach((row,index)=>{
      const item=items[index];if(!item)return;
      const state=getStatus(item),done=state==='done',near=state==='near';
      row.classList.toggle('progress-row',trackable(item));row.classList.toggle('progress-done',done);row.classList.toggle('progress-near',near);
      let check=row.querySelector(':scope > .progress-event-check');
      if(!check&&trackable(item)){
        check=document.createElement('label');check.className='progress-event-check';check.innerHTML='<input type="checkbox"><span></span>';row.insertBefore(check,row.firstElementChild);check.addEventListener('click',e=>e.stopPropagation());
        const input=check.querySelector('input');input.addEventListener('change',()=>{setStatus(item,input.checked?'done':'');decorate();});
      }
      if(check)check.querySelector('input').checked=done;
      const actions=row.querySelector('.row-actions');
      if(actions&&trackable(item)){
        let nearBtn=actions.querySelector('.progress-near-btn');
        if(!nearBtn){nearBtn=document.createElement('button');nearBtn.type='button';nearBtn.className='progress-near-btn';nearBtn.textContent='◉ Рядом';actions.prepend(nearBtn);nearBtn.addEventListener('click',e=>{e.stopPropagation();setStatus(item,getStatus(item)==='near'?'':'near');decorate();});}
        nearBtn.classList.toggle('active',near);nearBtn.setAttribute('aria-pressed',String(near));
        let journalBtn=actions.querySelector('.progress-journal-btn');
        if(!journalBtn){journalBtn=document.createElement('button');journalBtn.type='button';journalBtn.className='progress-journal-btn';journalBtn.textContent='Фото / видео / заметка';const route=actions.querySelector('.mini-route');if(route)actions.insertBefore(journalBtn,route);else actions.appendChild(journalBtn);journalBtn.addEventListener('click',e=>{e.stopPropagation();openJournal(item);});}
        refreshJournalButton(journalBtn,itemId(item));
      }
      const badge=row.querySelector('.n');
      if(badge){if(!badge.dataset.progressOriginalText)badge.dataset.progressOriginalText=badge.textContent;if(!badge.dataset.progressOriginalBackground)badge.dataset.progressOriginalBackground=badge.style.background||'';badge.textContent=done?'✓':near?'◉':badge.dataset.progressOriginalText;badge.style.background=done?'#16a34a':near?'#f59e0b':badge.dataset.progressOriginalBackground;}
    });
  }
  function decorateTabs(){
    [...tabs.querySelectorAll('button')].forEach((button,index)=>{
      const day=order[index];if(!day)return;const state=stats(day);button.classList.toggle('day-done',state.complete);button.classList.toggle('day-near',state.near>0&&!state.complete);
      let icon=button.querySelector('.progress-tab-check,.progress-tab-near');
      if(state.complete){if(!icon){icon=document.createElement('span');button.prepend(icon);}icon.className='progress-tab-check';icon.textContent='✓';}
      else if(state.near>0){if(!icon){icon=document.createElement('span');button.prepend(icon);}icon.className='progress-tab-near';icon.textContent='◉';}
      else if(icon)icon.remove();
    });
  }
  function decorateDay(){if(!dayInput||!dayText)return;const state=stats();dayInput.checked=state.complete;dayInput.indeterminate=(state.done+state.near)>0&&!state.complete;dayText.textContent=!state.total?'Нет событий':state.complete?`День выполнен · ${state.done} из ${state.total}`:`Выполнено ${state.done} из ${state.total}${state.near?` · рядом ${state.near}`:''}`;dayText.classList.toggle('complete',state.complete);dayText.classList.toggle('has-near',state.near>0&&!state.complete);}
  function observe(){listObserver.observe(list,{childList:true});tabsObserver.observe(tabs,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});}
  function decorate(){if(decorating)return;decorating=true;listObserver.disconnect();tabsObserver.disconnect();decorateList();decorateTabs();decorateDay();decorating=false;observe();}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;decorate();});}
  const listObserver=new MutationObserver(schedule),tabsObserver=new MutationObserver(schedule);

  function createJournal(){
    const overlay=document.createElement('div');overlay.className='journal-overlay';overlay.innerHTML=`
      <section class="journal-sheet" role="dialog" aria-modal="true" aria-labelledby="journalTitle">
        <header class="journal-head"><div><h2 id="journalTitle">Пункт маршрута</h2><p id="journalSubtitle"></p></div><button class="journal-close" type="button" aria-label="Закрыть">×</button></header>
        <div class="journal-body">
          <div class="journal-statuses"><button class="journal-status" type="button" data-status="">Не отмечено</button><button class="journal-status" type="button" data-status="near">◉ Были рядом</button><button class="journal-status" type="button" data-status="done">✓ Выполнено</button></div>
          <label class="journal-label" for="journalComment">Комментарий</label><textarea class="journal-comment" id="journalComment" placeholder="Что понравилось, почему не зашли, что посмотреть в следующий раз"></textarea>
          <div class="journal-actions"><label class="journal-add">Добавить фото или видео<input id="journalMediaInput" type="file" accept="image/*,video/*" multiple hidden></label><button class="journal-save" id="journalSave" type="button">Сохранить</button></div>
          <p class="journal-storage-note">Файлы сохраняются локально на этом телефоне. Фото уменьшаются автоматически. Видео до 120 МБ каждое.</p>
          <div class="journal-media" id="journalMedia"></div>
        </div>
      </section>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.journal-close').addEventListener('click',()=>closeJournal(true));overlay.addEventListener('click',e=>{if(e.target===overlay)closeJournal(true);});
    overlay.querySelectorAll('.journal-status').forEach(button=>button.addEventListener('click',()=>{if(!activeItem)return;setStatus(activeItem,button.dataset.status||'');renderJournalStatus();decorate();}));
    overlay.querySelector('#journalSave').addEventListener('click',async()=>{await saveCurrentJournal();const b=overlay.querySelector('#journalSave'),old=b.textContent;b.textContent='Сохранено';setTimeout(()=>b.textContent=old,1200);});
    overlay.querySelector('#journalMediaInput').addEventListener('change',handleMedia);
    return{overlay,title:overlay.querySelector('#journalTitle'),subtitle:overlay.querySelector('#journalSubtitle'),comment:overlay.querySelector('#journalComment'),media:overlay.querySelector('#journalMedia'),save:overlay.querySelector('#journalSave'),body:overlay.querySelector('.journal-body'),input:overlay.querySelector('#journalMediaInput')};
  }
  async function openJournal(item){activeItem=item;activeId=itemId(item);journal.title.textContent=item[4];journal.subtitle.textContent=`${item[3]} · ${item[5]||'Открытая территория'}`;journal.comment.value='';journal.media.innerHTML='<div class="journal-empty">Загрузка…</div>';journal.overlay.classList.add('open');document.body.style.overflow='hidden';renderJournalStatus();activeRecord=await getJournal(activeId);journal.comment.value=activeRecord.comment||'';renderMedia();}
  async function closeJournal(save=true){if(save&&activeId)await saveCurrentJournal();journal.overlay.classList.remove('open');document.body.style.overflow='';cleanupObjectUrls();activeId=null;activeItem=null;activeRecord=null;decorate();}
  function renderJournalStatus(){if(!activeItem)return;const state=getStatus(activeItem);journal.overlay.querySelectorAll('.journal-status').forEach(b=>b.classList.toggle('active',(b.dataset.status||'')===state));}
  async function saveCurrentJournal(){if(!activeId||!activeRecord)return;activeRecord.comment=journal.comment.value.trim();activeRecord.updatedAt=Date.now();await putJournal(activeRecord);noteCache.set(activeId,cloneRecord(activeRecord));decorate();}

  async function handleMedia(event){
    const files=[...event.target.files];event.target.value='';if(!files.length||!activeRecord)return;
    journal.body.classList.add('journal-busy');
    try{
      const currentBytes=(activeRecord.media||[]).reduce((n,m)=>n+(m.blob?.size||0),0);let addedBytes=0;
      for(const file of files){
        const isVideo=file.type.startsWith('video/'),isImage=file.type.startsWith('image/');
        if(!isVideo&&!isImage)continue;
        if(isVideo&&file.size>MAX_VIDEO_BYTES)throw new Error(`Видео «${file.name}» больше 120 МБ`);
        const blob=isImage?await compressImage(file):file;
        if(currentBytes+addedBytes+blob.size>MAX_ITEM_MEDIA_BYTES)throw new Error('Для одного пункта превышен лимит 350 МБ');
        addedBytes+=blob.size;
        activeRecord.media.push({id:`${Date.now()}-${Math.random().toString(16).slice(2)}`,kind:isVideo?'video':'image',blob,name:file.name||(isVideo?'video.mp4':'photo.jpg'),type:blob.type||file.type,createdAt:Date.now()});
      }
      await saveCurrentJournal();renderMedia();
    }catch(error){alert(error?.message||'Не удалось добавить файл. Попробуйте другое фото или видео.');}
    finally{journal.body.classList.remove('journal-busy');}
  }
  function renderMedia(){
    cleanupObjectUrls();const media=activeRecord?.media||[];
    if(!media.length){journal.media.innerHTML='<div class="journal-empty">Фото и видео пока не добавлены</div>';return;}
    journal.media.innerHTML='';
    media.forEach(item=>{
      const url=URL.createObjectURL(item.blob);objectUrls.push(url);
      const card=document.createElement('div');card.className='journal-media-card';
      const isVideo=item.kind==='video'||String(item.type||'').startsWith('video/');
      card.innerHTML=isVideo?'<video controls playsinline preload="metadata"></video><span class="journal-media-kind">Видео</span><button class="journal-media-delete" type="button" aria-label="Удалить видео">×</button>':'<img alt="Фото к пункту маршрута"><span class="journal-media-kind">Фото</span><button class="journal-media-delete" type="button" aria-label="Удалить фото">×</button>';
      const viewer=card.querySelector(isVideo?'video':'img');viewer.src=url;
      card.querySelector('.journal-media-delete').addEventListener('click',async()=>{activeRecord.media=activeRecord.media.filter(x=>x.id!==item.id);await saveCurrentJournal();renderMedia();});
      journal.media.appendChild(card);
    });
  }
  function cleanupObjectUrls(){objectUrls.forEach(URL.revokeObjectURL);objectUrls=[];}
  async function refreshJournalButton(button,id){const record=await getJournal(id);if(!button.isConnected)return;const media=record.media||[],photos=media.filter(x=>x.kind!=='video'&&!String(x.type||'').startsWith('video/')).length,videos=media.length-photos,hasComment=Boolean((record.comment||'').trim());button.classList.toggle('has-data',media.length>0||hasComment);const parts=[];if(photos)parts.push(`Фото ${photos}`);if(videos)parts.push(`Видео ${videos}`);if(hasComment)parts.push('Заметка');button.textContent=parts.length?parts.join(' · '):'Фото / видео / заметка';}

  let dbPromise=null;
  function openDb(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE,{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return dbPromise;}
  async function getJournal(id){
    if(noteCache.has(id))return cloneRecord(noteCache.get(id));
    try{
      const db=await openDb();const record=await new Promise((resolve,reject)=>{const req=db.transaction(DB_STORE,'readonly').objectStore(DB_STORE).get(id);req.onsuccess=()=>resolve(req.result||{id,comment:'',photos:[],media:[],updatedAt:0});req.onerror=()=>reject(req.error);});
      if(!Array.isArray(record.media)){record.media=(record.photos||[]).map(p=>({...p,kind:'image',type:p.blob?.type||'image/jpeg'}));}
      if(!Array.isArray(record.photos))record.photos=[];noteCache.set(id,cloneRecord(record));return cloneRecord(record);
    }catch(_){return{id,comment:'',photos:[],media:[],updatedAt:0};}
  }
  async function putJournal(record){const db=await openDb();await new Promise((resolve,reject)=>{const req=db.transaction(DB_STORE,'readwrite').objectStore(DB_STORE).put(record);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);});}
  function cloneRecord(record){return{...record,photos:[...(record.photos||[])],media:[...(record.media||[])]};}
  function compressImage(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),image=new Image();image.onload=()=>{URL.revokeObjectURL(url);const max=1600,scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight)),width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale)),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,width,height);canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Не удалось обработать фото')),'image/jpeg',.78);};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Не удалось открыть фото'));};image.src=url;});}

  observe();setTimeout(decorate,0);
})();
