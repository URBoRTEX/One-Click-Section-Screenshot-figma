(()=>{
  'use strict';
  const D=window.KAZAN;
  if(!D)return;

  const LEGACY_KEY='kazan-trip-progress-v1';
  const STATUS_KEY='kazan-trip-status-v2';
  const DB_NAME='kazan-trip-journal-v1';
  const DB_STORE='items';
  const order=['all','d27','d28','d29','d30','d31','backup','yosh'];
  const tabs=document.getElementById('tabs');
  const list=document.getElementById('list');
  const sheet=document.getElementById('sheet');
  if(!tabs||!list||!sheet)return;

  let statuses=loadStatuses();
  let scheduled=false;
  let decorating=false;
  let activeJournalId=null;
  let activeJournalItem=null;
  let activeJournalRecord=null;
  let noteCache=new Map();
  let objectUrls=[];

  const style=document.createElement('style');
  style.textContent=`
    .top button{display:flex!important;align-items:center;gap:5px}
    .top button.day-done:not(.on){background:#dcfce7!important;color:#166534!important}
    .top button.day-near:not(.on):not(.day-done){background:#fef3c7!important;color:#92400e!important}
    .progress-tab-check,.progress-tab-near{display:grid;place-items:center;width:16px;height:16px;border-radius:5px;color:#fff;font-size:10px;font-weight:900}
    .progress-tab-check{background:#16a34a}.progress-tab-near{background:#f59e0b}
    .summary-left{display:flex;align-items:center;gap:11px;min-width:0;flex:1}
    .summary-copy{min-width:0}
    .progress-day-text{display:block;font-size:11px;color:#475467;margin-top:4px;font-weight:700}
    .progress-day-text.complete{color:#15803d}.progress-day-text.has-near{color:#92400e}
    .progress-day-check,.progress-event-check{position:relative;flex:0 0 auto}
    .progress-day-check{width:34px;height:34px}.progress-event-check{width:28px;height:28px;margin-top:2px}
    .progress-day-check input,.progress-event-check input{position:absolute;opacity:0;pointer-events:none}
    .progress-day-check span,.progress-event-check span{display:grid;place-items:center;border:2px solid #cbd5e1;background:#fff;transition:.16s}
    .progress-day-check span{width:34px;height:34px;border-radius:11px}.progress-event-check span{width:28px;height:28px;border-radius:9px}
    .progress-day-check input:checked+span,.progress-event-check input:checked+span{background:#16a34a;border-color:#16a34a}
    .progress-day-check input:checked+span:after,.progress-event-check input:checked+span:after{content:'✓';color:#fff;font-weight:900}
    .progress-day-check input:indeterminate+span{background:#f59e0b;border-color:#f59e0b}
    .progress-day-check input:indeterminate+span:after{content:'−';color:#fff;font-weight:900;font-size:18px}
    .stop.progress-row{grid-template-columns:30px 34px minmax(0,1fr)!important;gap:9px!important;align-items:start}
    .stop.progress-done{background:#f0fdf4}.stop.progress-near{background:#fffbeb}
    .stop.progress-done>div:last-child>b{text-decoration:line-through;text-decoration-thickness:1px;color:#667085}
    .progress-near-btn,.progress-journal-btn{border:0;border-radius:8px;padding:7px 9px;font-size:11px;font-weight:800;white-space:nowrap}
    .progress-near-btn{background:#fff7ed;color:#9a3412;box-shadow:inset 0 0 0 1px #fed7aa}
    .progress-near-btn.active{background:#f59e0b;color:#fff;box-shadow:none}
    .progress-journal-btn{background:#eef2f6;color:#111827}
    .progress-journal-btn.has-data{background:#e0e7ff;color:#3730a3}
    .journal-overlay{position:fixed;z-index:3000;inset:0;background:rgba(15,23,42,.42);display:none;align-items:flex-end}
    .journal-overlay.open{display:flex}
    .journal-sheet{width:100%;max-height:min(82dvh,760px);display:flex;flex-direction:column;background:#fff;border-radius:24px 24px 0 0;box-shadow:0 -16px 50px rgba(15,23,42,.28);padding-bottom:env(safe-area-inset-bottom,0)}
    .journal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 16px 12px;border-bottom:1px solid #e5e7eb}
    .journal-head h2{margin:0;font-size:19px;line-height:1.2}.journal-head p{margin:4px 0 0;color:#667085;font-size:12px}
    .journal-close{width:38px;height:38px;border:0;border-radius:12px;background:#eef2f6;font-size:22px;color:#111827}
    .journal-body{overflow:auto;-webkit-overflow-scrolling:touch;padding:14px 16px 26px}
    .journal-statuses{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:15px}
    .journal-status{border:0;border-radius:11px;padding:10px 8px;background:#eef2f6;color:#344054;font-size:11px;font-weight:800}
    .journal-status[data-status="done"].active{background:#16a34a;color:#fff}.journal-status[data-status="near"].active{background:#f59e0b;color:#fff}.journal-status[data-status=""].active{background:#111827;color:#fff}
    .journal-label{display:block;margin:0 0 7px;font-size:12px;font-weight:800;color:#344054}
    .journal-comment{width:100%;min-height:112px;resize:vertical;border:1px solid #d0d5dd;border-radius:14px;padding:12px;font:inherit;font-size:14px;outline:none}
    .journal-comment:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
    .journal-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
    .journal-add,.journal-save{border:0;border-radius:11px;padding:11px 13px;font-size:12px;font-weight:800}
    .journal-add{background:#eef2f6;color:#111827}.journal-save{background:#2563eb;color:#fff}
    .journal-storage-note{margin:9px 0 0;color:#667085;font-size:10px;line-height:1.35}
    .journal-photos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px}
    .journal-photo{position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;background:#eef2f6}
    .journal-photo img{width:100%;height:100%;object-fit:cover;display:block}
    .journal-photo button{position:absolute;right:5px;top:5px;width:28px;height:28px;border:0;border-radius:9px;background:rgba(17,24,39,.78);color:#fff;font-size:17px}
    .journal-empty{grid-column:1/-1;padding:18px 10px;border:1px dashed #d0d5dd;border-radius:12px;text-align:center;color:#667085;font-size:12px}
    .journal-busy{opacity:.62;pointer-events:none}
    @media(min-width:800px){.journal-overlay{align-items:center;justify-content:center}.journal-sheet{max-width:520px;border-radius:22px;max-height:84vh;padding-bottom:0}}
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
      const value=dayInput.checked?'done':'';
      scoped(activeKey()).forEach(x=>setStatus(x,value,false));
      saveStatuses();
      decorate();
    });
  }else{
    dayInput=document.getElementById('progressDayInput');
    dayText=summary?.querySelector('.progress-day-text')||null;
  }

  const journal=createJournal();

  function loadStatuses(){
    const result={};
    try{
      const saved=JSON.parse(localStorage.getItem(STATUS_KEY)||'{}');
      if(saved&&typeof saved==='object'&&!Array.isArray(saved))Object.assign(result,saved);
    }catch(_){}
    try{
      const legacy=JSON.parse(localStorage.getItem(LEGACY_KEY)||'[]');
      if(Array.isArray(legacy))legacy.forEach(id=>{if(!result[id])result[id]='done';});
    }catch(_){}
    return result;
  }
  function saveStatuses(){
    try{localStorage.setItem(STATUS_KEY,JSON.stringify(statuses));}catch(_){}
  }
  function itemId(x){return `${x[1]}|${x[0]}|${x[2]}|${x[4]}`;}
  function trackable(x){return x&&x[1]!=='stay';}
  function getStatus(x){return trackable(x)?(statuses[itemId(x)]||''):'';}
  function setStatus(x,value,persist=true){
    if(!trackable(x))return;
    const id=itemId(x);
    if(value)statuses[id]=value;else delete statuses[id];
    if(persist)saveStatuses();
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
    let done=0,near=0;
    items.forEach(x=>{const s=getStatus(x);if(s==='done')done++;if(s==='near')near++;});
    return {total:items.length,done,near,complete:items.length>0&&done===items.length};
  }

  function decorateList(){
    const items=visible();
    const rows=[...list.querySelectorAll(':scope > .stop')];
    rows.forEach((row,index)=>{
      const item=items[index];
      if(!item)return;
      const state=getStatus(item);
      const done=state==='done';
      const near=state==='near';
      row.classList.toggle('progress-row',trackable(item));
      row.classList.toggle('progress-done',done);
      row.classList.toggle('progress-near',near);

      let check=row.querySelector(':scope > .progress-event-check');
      if(!check&&trackable(item)){
        check=document.createElement('label');
        check.className='progress-event-check';
        check.innerHTML='<input type="checkbox"><span></span>';
        row.insertBefore(check,row.firstElementChild);
        check.addEventListener('click',e=>e.stopPropagation());
        const input=check.querySelector('input');
        input.addEventListener('change',()=>{
          setStatus(item,input.checked?'done':'');
          decorate();
        });
      }
      if(check)check.querySelector('input').checked=done;

      const actions=row.querySelector('.row-actions');
      if(actions&&trackable(item)){
        let nearBtn=actions.querySelector('.progress-near-btn');
        if(!nearBtn){
          nearBtn=document.createElement('button');
          nearBtn.type='button';
          nearBtn.className='progress-near-btn';
          nearBtn.textContent='◉ Рядом';
          actions.prepend(nearBtn);
          nearBtn.addEventListener('click',e=>{
            e.stopPropagation();
            setStatus(item,getStatus(item)==='near'?'':'near');
            decorate();
          });
        }
        nearBtn.classList.toggle('active',near);
        nearBtn.setAttribute('aria-pressed',String(near));

        let journalBtn=actions.querySelector('.progress-journal-btn');
        if(!journalBtn){
          journalBtn=document.createElement('button');
          journalBtn.type='button';
          journalBtn.className='progress-journal-btn';
          journalBtn.textContent='Фото / заметка';
          const miniRoute=actions.querySelector('.mini-route');
          if(miniRoute)actions.insertBefore(journalBtn,miniRoute);else actions.appendChild(journalBtn);
          journalBtn.addEventListener('click',e=>{
            e.stopPropagation();
            openJournal(item);
          });
        }
        refreshJournalButton(journalBtn,itemId(item));
      }

      const badge=row.querySelector('.n');
      if(badge){
        if(!badge.dataset.progressOriginalText)badge.dataset.progressOriginalText=badge.textContent;
        if(!badge.dataset.progressOriginalBackground)badge.dataset.progressOriginalBackground=badge.style.background||'';
        badge.textContent=done?'✓':near?'◉':badge.dataset.progressOriginalText;
        badge.style.background=done?'#16a34a':near?'#f59e0b':badge.dataset.progressOriginalBackground;
      }
    });
  }

  function decorateTabs(){
    [...tabs.querySelectorAll('button')].forEach((button,index)=>{
      const day=order[index];
      if(!day)return;
      const state=stats(day);
      button.classList.toggle('day-done',state.complete);
      button.classList.toggle('day-near',state.near>0&&!state.complete);
      let icon=button.querySelector('.progress-tab-check,.progress-tab-near');
      if(state.complete){
        if(!icon){icon=document.createElement('span');button.prepend(icon);}
        icon.className='progress-tab-check';
        icon.textContent='✓';
      }else if(state.near>0){
        if(!icon){icon=document.createElement('span');button.prepend(icon);}
        icon.className='progress-tab-near';
        icon.textContent='◉';
      }else if(icon)icon.remove();
    });
  }

  function decorateDay(){
    if(!dayInput||!dayText)return;
    const state=stats();
    dayInput.checked=state.complete;
    dayInput.indeterminate=(state.done+state.near)>0&&!state.complete;
    if(!state.total)dayText.textContent='Нет событий';
    else if(state.complete)dayText.textContent=`День выполнен · ${state.done} из ${state.total}`;
    else dayText.textContent=`Выполнено ${state.done} из ${state.total}${state.near?` · рядом ${state.near}`:''}`;
    dayText.classList.toggle('complete',state.complete);
    dayText.classList.toggle('has-near',state.near>0&&!state.complete);
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
    requestAnimationFrame(()=>{scheduled=false;decorate();});
  }
  const listObserver=new MutationObserver(schedule);
  const tabsObserver=new MutationObserver(schedule);

  function createJournal(){
    const overlay=document.createElement('div');
    overlay.className='journal-overlay';
    overlay.innerHTML=`
      <section class="journal-sheet" role="dialog" aria-modal="true" aria-labelledby="journalTitle">
        <header class="journal-head">
          <div><h2 id="journalTitle">Пункт маршрута</h2><p id="journalSubtitle"></p></div>
          <button class="journal-close" type="button" aria-label="Закрыть">×</button>
        </header>
        <div class="journal-body">
          <div class="journal-statuses">
            <button class="journal-status" type="button" data-status="">Не отмечено</button>
            <button class="journal-status" type="button" data-status="near">◉ Были рядом</button>
            <button class="journal-status" type="button" data-status="done">✓ Выполнено</button>
          </div>
          <label class="journal-label" for="journalComment">Комментарий</label>
          <textarea class="journal-comment" id="journalComment" placeholder="Что понравилось, почему не зашли, что посмотреть в следующий раз"></textarea>
          <div class="journal-actions">
            <label class="journal-add">Добавить фото<input id="journalPhotoInput" type="file" accept="image/*" capture="environment" multiple hidden></label>
            <button class="journal-save" id="journalSave" type="button">Сохранить</button>
          </div>
          <p class="journal-storage-note">Фотографии и комментарии сохраняются только в этом браузере на текущем устройстве.</p>
          <div class="journal-photos" id="journalPhotos"></div>
        </div>
      </section>`;
    document.body.appendChild(overlay);
    const close=()=>closeJournal(true);
    overlay.querySelector('.journal-close').addEventListener('click',close);
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    overlay.querySelectorAll('.journal-status').forEach(button=>button.addEventListener('click',()=>{
      if(!activeJournalItem)return;
      setStatus(activeJournalItem,button.dataset.status||'');
      renderJournalStatus();
      decorate();
    }));
    overlay.querySelector('#journalSave').addEventListener('click',async()=>{
      await saveCurrentJournal();
      showSavedState();
    });
    overlay.querySelector('#journalPhotoInput').addEventListener('change',handlePhotos);
    return {
      overlay,
      title:overlay.querySelector('#journalTitle'),
      subtitle:overlay.querySelector('#journalSubtitle'),
      comment:overlay.querySelector('#journalComment'),
      photos:overlay.querySelector('#journalPhotos'),
      save:overlay.querySelector('#journalSave'),
      body:overlay.querySelector('.journal-body'),
      input:overlay.querySelector('#journalPhotoInput')
    };
  }

  async function openJournal(item){
    activeJournalItem=item;
    activeJournalId=itemId(item);
    journal.title.textContent=item[4];
    journal.subtitle.textContent=`${item[3]} · ${item[5]||'Открытая территория'}`;
    journal.comment.value='';
    journal.photos.innerHTML='<div class="journal-empty">Загрузка…</div>';
    journal.overlay.classList.add('open');
    document.body.style.overflow='hidden';
    renderJournalStatus();
    activeJournalRecord=await getJournal(activeJournalId);
    journal.comment.value=activeJournalRecord.comment||'';
    renderPhotos();
  }
  async function closeJournal(save=true){
    if(save&&activeJournalId)await saveCurrentJournal();
    journal.overlay.classList.remove('open');
    document.body.style.overflow='';
    cleanupObjectUrls();
    activeJournalId=null;
    activeJournalItem=null;
    activeJournalRecord=null;
    decorate();
  }
  function renderJournalStatus(){
    if(!activeJournalItem)return;
    const state=getStatus(activeJournalItem);
    journal.overlay.querySelectorAll('.journal-status').forEach(button=>button.classList.toggle('active',(button.dataset.status||'')===state));
  }
  async function saveCurrentJournal(){
    if(!activeJournalId||!activeJournalRecord)return;
    activeJournalRecord.comment=journal.comment.value.trim();
    activeJournalRecord.updatedAt=Date.now();
    await putJournal(activeJournalRecord);
    noteCache.set(activeJournalId,activeJournalRecord);
    decorate();
  }
  function showSavedState(){
    const original=journal.save.textContent;
    journal.save.textContent='Сохранено';
    setTimeout(()=>journal.save.textContent=original,1200);
  }
  async function handlePhotos(event){
    const files=[...event.target.files];
    event.target.value='';
    if(!files.length||!activeJournalRecord)return;
    journal.body.classList.add('journal-busy');
    try{
      for(const file of files){
        const blob=await compressImage(file);
        activeJournalRecord.photos.push({id:`${Date.now()}-${Math.random().toString(16).slice(2)}`,blob,name:file.name||'photo.jpg',createdAt:Date.now()});
      }
      await saveCurrentJournal();
      renderPhotos();
    }catch(_){
      alert('Не удалось добавить фотографию. Попробуйте выбрать другое изображение.');
    }finally{
      journal.body.classList.remove('journal-busy');
    }
  }
  function renderPhotos(){
    cleanupObjectUrls();
    const photos=activeJournalRecord?.photos||[];
    if(!photos.length){journal.photos.innerHTML='<div class="journal-empty">Фотографий пока нет</div>';return;}
    journal.photos.innerHTML='';
    photos.forEach(photo=>{
      const url=URL.createObjectURL(photo.blob);
      objectUrls.push(url);
      const card=document.createElement('div');
      card.className='journal-photo';
      card.innerHTML=`<img alt="Фото к пункту маршрута"><button type="button" aria-label="Удалить фото">×</button>`;
      card.querySelector('img').src=url;
      card.querySelector('button').addEventListener('click',async()=>{
        activeJournalRecord.photos=activeJournalRecord.photos.filter(x=>x.id!==photo.id);
        await saveCurrentJournal();
        renderPhotos();
      });
      journal.photos.appendChild(card);
    });
  }
  function cleanupObjectUrls(){objectUrls.forEach(URL.revokeObjectURL);objectUrls=[];}
  async function refreshJournalButton(button,id){
    const record=await getJournal(id);
    if(!button.isConnected)return;
    const photos=record.photos?.length||0;
    const hasComment=Boolean((record.comment||'').trim());
    button.classList.toggle('has-data',photos>0||hasComment);
    button.textContent=photos||hasComment?`${photos?`Фото ${photos}`:''}${photos&&hasComment?' · ':''}${hasComment?'Заметка':''}`:'Фото / заметка';
  }

  let dbPromise=null;
  function openDb(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE,{keyPath:'id'});};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    return dbPromise;
  }
  async function getJournal(id){
    if(noteCache.has(id))return cloneRecord(noteCache.get(id));
    try{
      const db=await openDb();
      const record=await new Promise((resolve,reject)=>{
        const request=db.transaction(DB_STORE,'readonly').objectStore(DB_STORE).get(id);
        request.onsuccess=()=>resolve(request.result||{id,comment:'',photos:[],updatedAt:0});
        request.onerror=()=>reject(request.error);
      });
      if(!Array.isArray(record.photos))record.photos=[];
      noteCache.set(id,record);
      return cloneRecord(record);
    }catch(_){return {id,comment:'',photos:[],updatedAt:0};}
  }
  async function putJournal(record){
    try{
      const db=await openDb();
      await new Promise((resolve,reject)=>{
        const request=db.transaction(DB_STORE,'readwrite').objectStore(DB_STORE).put(record);
        request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);
      });
    }catch(_){}
  }
  function cloneRecord(record){return {...record,photos:[...(record.photos||[])]};}
  function compressImage(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file);
      const image=new Image();
      image.onload=()=>{
        URL.revokeObjectURL(url);
        const max=1600;
        const scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
        const width=Math.max(1,Math.round(image.naturalWidth*scale));
        const height=Math.max(1,Math.round(image.naturalHeight*scale));
        const canvas=document.createElement('canvas');
        canvas.width=width;canvas.height=height;
        const context=canvas.getContext('2d');
        context.drawImage(image,0,0,width,height);
        canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('image')),'image/jpeg',.78);
      };
      image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('image'));};
      image.src=url;
    });
  }

  observe();
  setTimeout(decorate,0);
})();
