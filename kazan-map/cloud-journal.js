(()=>{
  'use strict';

  const D=window.KAZAN;
  if(!D)return;

  const STATUS_KEY='kazan-trip-status-v2';
  const DB_NAME='kazan-trip-journal-v1';
  const STORE='items';
  const SYNC_VERSION_KEY='kazan-cloud-sync-version-v1';
  const MIGRATED_KEY='kazan-cloud-migrated-v1';
  const order=['all','d27','d28','d29','d30','d31','backup','yosh'];

  let cloudSnapshot=null;
  let activePlaceId=null;
  let bypassButton=null;
  let migrationBusy=false;
  let dbPromise=null;

  const style=document.createElement('style');
  style.textContent=`
    body.cloud-readonly .progress-event-check,
    body.cloud-readonly .progress-near-btn,
    body.cloud-readonly .journal-add,
    body.cloud-readonly .journal-save,
    body.cloud-readonly .journal-media-delete{pointer-events:none!important;opacity:.62!important}
    body.cloud-readonly .journal-comment{background:#f8fafc!important}
    .cloud-sync-banner{position:fixed;z-index:2600;left:10px;right:10px;bottom:140px;display:flex;align-items:center;gap:10px;padding:12px;border-radius:15px;background:#fff;box-shadow:0 12px 34px rgba(15,23,42,.23)}
    .cloud-sync-banner span{min-width:0;flex:1;font-size:12px;line-height:1.35}.cloud-sync-banner button,.cloud-sync-banner a{border:0;border-radius:10px;padding:9px 10px;background:#2563eb;color:#fff;text-decoration:none;font-size:11px;font-weight:800}
    @media(min-width:800px){.cloud-sync-banner{left:414px;right:12px;bottom:12px;max-width:620px}}
  `;
  document.head.appendChild(style);

  function cloud(){return window.KAZAN_CLOUD||null;}
  function editor(){return Boolean(cloud()?.isEditor());}
  function schemaReady(){return cloudSnapshot?.schemaReady!==false;}
  function itemId(item){return `${item[1]}|${item[0]}|${item[2]}|${item[4]}`;}

  function activeDay(){
    const buttons=[...document.querySelectorAll('#tabs button')];
    const index=buttons.findIndex(button=>button.classList.contains('on'));
    return order[index>=0?index:1]||'d27';
  }

  function visibleItems(){
    const day=activeDay();
    return D.items.filter(item=>day==='all'?item[1]!=='yosh':item[1]===day);
  }

  function itemForRow(row){
    const rows=[...document.querySelectorAll('#list > .stop')];
    const index=rows.indexOf(row);
    return visibleItems()[index]||null;
  }

  function localStatuses(){
    try{
      const value=JSON.parse(localStorage.getItem(STATUS_KEY)||'{}');
      return value&&typeof value==='object'?value:{};
    }catch(_){return{};}
  }

  function saveStatuses(value){
    try{localStorage.setItem(STATUS_KEY,JSON.stringify(value));}catch(_){}
  }

  function openDb(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    return dbPromise;
  }

  async function getRecord(id){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const request=db.transaction(STORE,'readonly').objectStore(STORE).get(id);
      request.onsuccess=()=>resolve(request.result||{id,comment:'',photos:[],media:[],updatedAt:0});
      request.onerror=()=>reject(request.error);
    });
  }

  async function putRecord(record){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const request=db.transaction(STORE,'readwrite').objectStore(STORE).put(record);
      request.onsuccess=()=>resolve();
      request.onerror=()=>reject(request.error);
    });
  }

  async function allRecords(){
    try{
      const db=await openDb();
      return await new Promise((resolve,reject)=>{
        const request=db.transaction(STORE,'readonly').objectStore(STORE).getAll();
        request.onsuccess=()=>resolve(request.result||[]);
        request.onerror=()=>reject(request.error);
      });
    }catch(_){return[];}
  }

  function normalizeLocalMedia(record){
    if(Array.isArray(record.media))return record.media;
    return (record.photos||[]).map(photo=>({...photo,kind:'image',type:photo.blob?.type||'image/jpeg'}));
  }

  function cloudVersion(snapshot){
    const journals=[...snapshot.journals.values()].map(row=>`${row.place_id}:${row.updated_at}`).sort().join('|');
    const media=[...snapshot.media.values()].flat().map(row=>`${row.id}:${row.created_at}`).sort().join('|');
    return `${journals}::${media}`;
  }

  async function syncSmallCloudData(snapshot){
    if(snapshot.schemaReady===false)return false;
    const statuses={};
    snapshot.journals.forEach((row,id)=>{if(row.status)statuses[id]=row.status;});
    saveStatuses(statuses);

    for(const [id,row] of snapshot.journals){
      const record=await getRecord(id);
      record.comment=row.comment||'';
      record.updatedAt=Date.parse(row.updated_at)||Date.now();
      if(!Array.isArray(record.media))record.media=normalizeLocalMedia(record);
      await putRecord(record);
    }

    const version=cloudVersion(snapshot);
    const changed=sessionStorage.getItem(SYNC_VERSION_KEY)!==version;
    sessionStorage.setItem(SYNC_VERSION_KEY,version);
    return changed;
  }

  async function syncMediaForPlace(id){
    if(!cloudSnapshot||cloudSnapshot.schemaReady===false)return;
    const rows=cloud()?.getMedia(id)||[];
    const record=await getRecord(id);
    const media=[];

    for(const row of rows){
      try{
        const response=await fetch(row.publicUrl,{cache:'force-cache'});
        if(!response.ok)throw new Error();
        const blob=await response.blob();
        media.push({id:row.id,kind:row.kind||row.media_type,blob,name:row.name||row.original_name||'file',type:row.type||row.mime_type||blob.type,storage_path:row.storage_path,cloud:true,createdAt:Date.parse(row.created_at)||Date.now()});
      }catch(_){}
    }

    record.comment=cloud()?.getJournal(id)?.comment||record.comment||'';
    record.media=media;
    record.photos=[];
    await putRecord(record);
  }

  function showBanner(message,action,href,onClick){
    document.querySelector('.cloud-sync-banner')?.remove();
    const banner=document.createElement('div');banner.className='cloud-sync-banner';
    const text=document.createElement('span');text.textContent=message;banner.appendChild(text);
    if(href){const link=document.createElement('a');link.href=href;link.target='_blank';link.rel='noopener';link.textContent=action;banner.appendChild(link);}else{const button=document.createElement('button');button.type='button';button.textContent=action;button.onclick=onClick;banner.appendChild(button);}
    document.body.appendChild(banner);
  }

  function updateReadonly(){document.body.classList.toggle('cloud-readonly',schemaReady()&&!editor());}

  async function migrateLocal(){
    if(!editor()||migrationBusy)return;
    migrationBusy=true;
    const button=document.querySelector('.cloud-sync-banner button');
    if(button){button.disabled=true;button.textContent='Публикую…';}
    try{
      const statuses=localStatuses(),records=await allRecords(),byId=new Map(records.map(record=>[record.id,record])),ids=new Set([...Object.keys(statuses),...records.map(record=>record.id)]);
      let done=0;
      for(const id of ids){
        const record=byId.get(id)||{comment:'',media:[],photos:[]};
        await cloud().saveJournal(id,{status:statuses[id]||'',comment:record.comment||''});
        for(const media of normalizeLocalMedia(record)){
          if(!media.blob||media.cloud)continue;
          const name=media.name||(media.kind==='video'?'video.mp4':'photo.jpg');
          const file=new File([media.blob],name,{type:media.type||media.blob.type});
          await cloud().uploadMedia(id,file,media.kind==='video'?'video':'image');
        }
        done++;if(button)button.textContent=`${done} из ${ids.size}`;
      }
      localStorage.setItem(MIGRATED_KEY,'1');
      await cloud().refresh();
      document.querySelector('.cloud-sync-banner')?.remove();
      alert('Статусы, комментарии, фото и видео опубликованы для всех.');
    }catch(error){if(button){button.disabled=false;button.textContent='Повторить';}alert(error?.message||'Не удалось опубликовать данные.');}
    finally{migrationBusy=false;}
  }

  async function hasLocalData(){
    if(Object.keys(localStatuses()).length)return true;
    return (await allRecords()).some(record=>Boolean((record.comment||'').trim())||normalizeLocalMedia(record).length);
  }

  async function handleCloud(snapshot){
    cloudSnapshot=snapshot;updateReadonly();
    if(snapshot.schemaReady===false){showBanner('Supabase подключён, но таблицы и хранилище ещё не созданы.','Открыть SQL',cloud()?.setupSql);return;}
    document.querySelector('.cloud-sync-banner')?.remove();
    if(snapshot.editor&&localStorage.getItem(MIGRATED_KEY)!=='1'&&await hasLocalData()){
      showBanner('На телефоне есть локальные статусы, комментарии или вложения. Опубликовать их для всех?','Опубликовать',null,migrateLocal);return;
    }
    const changed=await syncSmallCloudData(snapshot);
    if(changed&&!snapshot.editor)location.reload();
  }

  async function pushStatusForRow(row){
    if(!editor()||!schemaReady())return;
    const item=itemForRow(row);if(!item)return;
    const id=itemId(item),status=localStatuses()[id]||'';
    try{await cloud().saveJournal(id,{status});await cloud().refresh();}catch(error){alert(error?.message||'Не удалось сохранить статус.');}
  }

  async function pushComment(){
    if(!editor()||!schemaReady()||!activePlaceId)return;
    const comment=document.getElementById('journalComment')?.value?.trim()||'',status=localStatuses()[activePlaceId]||'';
    try{await cloud().saveJournal(activePlaceId,{comment,status});await cloud().refresh();}catch(error){alert(error?.message||'Не удалось опубликовать комментарий.');}
  }

  async function uploadSelectedFiles(files){
    if(!editor()||!schemaReady()||!activePlaceId)return;
    for(const file of files){const kind=file.type.startsWith('video/')?'video':'image';try{await cloud().uploadMedia(activePlaceId,file,kind);}catch(error){alert(error?.message||`Не удалось загрузить «${file.name}».`);}}
    await cloud().refresh();
  }

  document.addEventListener('click',async event=>{
    const journalButton=event.target.closest('.progress-journal-btn');
    if(journalButton){
      const row=journalButton.closest('.stop'),item=itemForRow(row);if(!item)return;activePlaceId=itemId(item);
      if(journalButton===bypassButton){bypassButton=null;return;}
      if(schemaReady()){
        event.preventDefault();event.stopImmediatePropagation();journalButton.disabled=true;
        try{await syncMediaForPlace(activePlaceId);}finally{journalButton.disabled=false;}
        bypassButton=journalButton;journalButton.click();
      }
      return;
    }

    if(event.target.closest('.progress-near-btn')){const row=event.target.closest('.stop');setTimeout(()=>pushStatusForRow(row),80);}
    if(event.target.closest('.journal-save'))setTimeout(pushComment,100);

    const deleteButton=event.target.closest('.journal-media-delete');
    if(deleteButton&&editor()&&schemaReady()&&activePlaceId){
      const cards=[...document.querySelectorAll('.journal-media-card')],index=cards.indexOf(deleteButton.closest('.journal-media-card')),media=cloud()?.getMedia(activePlaceId)?.[index];
      if(media){try{await cloud().deleteMedia(media);await cloud().refresh();}catch(error){alert(error?.message||'Не удалось удалить файл из облака.');}}
    }
  },true);

  document.addEventListener('change',event=>{
    if(event.target.matches('.progress-event-check input')){const row=event.target.closest('.stop');setTimeout(()=>pushStatusForRow(row),80);}
    if(event.target.id==='journalMediaInput'){const files=[...event.target.files];if(files.length)setTimeout(()=>uploadSelectedFiles(files),0);}
  },true);

  window.addEventListener('kazan:cloud-ready',event=>handleCloud(event.detail));
  window.addEventListener('kazan:auth-change',()=>{updateReadonly();setTimeout(()=>cloud()?.refresh(),0);});
  window.addEventListener('focus',()=>cloud()?.refresh());
  if(cloud()?.ready)cloud().ready.then(handleCloud);
})();
