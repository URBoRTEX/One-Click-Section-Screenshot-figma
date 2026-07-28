(()=>{
  'use strict';

  const LOCAL_TRACKS_KEY='kazan-local-walk-tracks-v1';
  const LOCAL_HEALTH_KEY='kazan-local-health-v1';
  const CURRENT_KEY='kazan-current-walk-v1';
  const DAY_DATES={d27:'2026-07-27',d28:'2026-07-28',d29:'2026-07-29',d30:'2026-07-30',d31:'2026-07-31'};

  let app=null,map=null,ownWatchId=null,latestPosition=null,panel=null,toolButton=null,savedLayer=null,currentLine=null,showTracks=true,tracking=false,current=null,cloudSnapshot=null,timer=null;
  const localTracks=loadJson(LOCAL_TRACKS_KEY,[]);
  const localHealth=loadJson(LOCAL_HEALTH_KEY,{});

  const style=document.createElement('style');
  style.textContent=`
    .tracker-panel{position:fixed;z-index:1800;left:10px;right:68px;top:126px;display:none;padding:13px;border-radius:17px;background:rgba(255,255,255,.98);box-shadow:0 12px 34px rgba(15,23,42,.22);backdrop-filter:blur(14px)}
    .tracker-panel.open{display:block}.tracker-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.tracker-head h3{margin:0;font-size:16px}.tracker-head p{margin:3px 0 0;color:#667085;font-size:11px}.tracker-close{width:34px;height:34px;border:0;border-radius:10px;background:#eef2f6;font-size:20px}
    .tracker-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:11px}.tracker-stat{padding:9px;border-radius:11px;background:#f8fafc}.tracker-stat b{display:block;font-size:18px}.tracker-stat span{display:block;margin-top:2px;color:#667085;font-size:9px}
    .tracker-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.tracker-actions button{border:0;border-radius:10px;padding:9px 11px;font-size:11px;font-weight:800}.tracker-start{background:#16a34a;color:#fff}.tracker-start.stop{background:#dc2626}.tracker-filter{background:#e0e7ff;color:#3730a3}.tracker-filter.off{background:#eef2f6;color:#667085}
    .tracker-health{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;margin-top:10px}.tracker-health input{min-width:0;border:1px solid #d0d5dd;border-radius:10px;padding:9px 10px;font-size:12px}.tracker-health button{border:0;border-radius:10px;background:#111827;color:#fff;padding:9px 11px;font-size:11px;font-weight:800}
    .tracker-note{margin:8px 0 0;color:#667085;font-size:9px;line-height:1.35}.track-live-badge{position:fixed;z-index:1700;left:10px;top:72px;padding:8px 10px;border-radius:10px;background:#ec4899;color:#fff;font-size:10px;font-weight:800;box-shadow:0 6px 18px rgba(15,23,42,.16)}
    @media(min-width:800px){.tracker-panel{left:414px;right:auto;width:360px;top:130px}}
  `;
  document.head.appendChild(style);

  function loadJson(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback;}catch(_){return fallback;}}
  function saveJson(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch(_){}}
  function dayKey(){const active=app?.getActiveDay?.();if(DAY_DATES[active])return DAY_DATES[active];return new Date().toISOString().slice(0,10);}
  function dayLabel(key){const entry=Object.entries(DAY_DATES).find(([,date])=>date===key);if(entry)return `${entry[0].slice(1)} июля`;return new Date(`${key}T12:00:00`).toLocaleDateString('ru-RU',{day:'numeric',month:'long'});}
  function canEdit(){const cloud=window.KAZAN_CLOUD;if(!cloud)return true;if(cloudSnapshot?.schemaReady===false)return true;return cloud.isEditor();}

  function createUi(){
    const tools=document.querySelector('.map-tools');
    if(tools&&!document.getElementById('trackToolBtn')){
      toolButton=document.createElement('button');toolButton.id='trackToolBtn';toolButton.className='map-tool';toolButton.type='button';toolButton.textContent='👣';toolButton.title='Пройденный маршрут и статистика';toolButton.setAttribute('aria-label','Пройденный маршрут и статистика');tools.appendChild(toolButton);toolButton.onclick=()=>togglePanel();
    }
    panel=document.createElement('section');panel.className='tracker-panel';panel.innerHTML=`
      <div class="tracker-head"><div><h3 id="trackerTitle">Прогулка</h3><p id="trackerSubtitle">Пройденный маршрут за день</p></div><button class="tracker-close" type="button" aria-label="Закрыть">×</button></div>
      <div class="tracker-stats"><div class="tracker-stat"><b id="trackerKm">0</b><span>километров</span></div><div class="tracker-stat"><b id="trackerTime">0</b><span>в движении</span></div><div class="tracker-stat"><b id="trackerSteps">0</b><span id="trackerStepsLabel">шагов, оценка</span></div></div>
      <div class="tracker-actions"><button class="tracker-start" id="trackerStart" type="button">Начать запись</button><button class="tracker-filter" id="trackerFilter" type="button">Путь на карте</button></div>
      <div class="tracker-health"><input id="trackerHealthInput" type="number" min="0" step="1" inputmode="numeric" placeholder="Шаги из «Здоровья»"><button id="trackerHealthSave" type="button">Сохранить</button></div>
      <p class="tracker-note">Safari не читает Apple Health напрямую. Введите число шагов из приложения «Здоровье» или с часов; без него показывается приблизительная оценка по расстоянию.</p>`;
    document.body.appendChild(panel);
    panel.querySelector('.tracker-close').onclick=()=>togglePanel(false);
    panel.querySelector('#trackerStart').onclick=()=>tracking?stopTracking():startTracking();
    panel.querySelector('#trackerFilter').onclick=()=>{showTracks=!showTracks;renderTracks();updateUi();};
    panel.querySelector('#trackerHealthSave').onclick=saveHealth;
  }

  function togglePanel(force){const open=force??!panel.classList.contains('open');panel.classList.toggle('open',open);toolButton?.classList.toggle('active',open);if(open)updateUi();}
  function createLiveBadge(){let badge=document.querySelector('.track-live-badge');if(!badge){badge=document.createElement('div');badge.className='track-live-badge';document.body.appendChild(badge);}return badge;}
  function removeLiveBadge(){document.querySelector('.track-live-badge')?.remove();}

  function startOwnWatch(){
    if(!navigator.geolocation||ownWatchId!==null)return;
    ownWatchId=navigator.geolocation.watchPosition(position=>{
      latestPosition={lat:position.coords.latitude,lng:position.coords.longitude,accuracy:position.coords.accuracy,timestamp:position.timestamp||Date.now()};
      addPoint(latestPosition);
    },()=>{},{enableHighAccuracy:true,maximumAge:3000,timeout:15000});
  }

  function startTracking(){
    if(!canEdit()){alert('Запись общего трека доступна только URBoRTEX после входа через GitHub.');return;}
    const restored=loadJson(CURRENT_KEY,null);
    current=restored&&restored.day_key===dayKey()?restored:{id:crypto.randomUUID(),day_key:dayKey(),started_at:new Date().toISOString(),points:[],distance_m:0};
    tracking=true;app.startLocation();startOwnWatch();if(latestPosition)addPoint(latestPosition);timer=setInterval(updateUi,1000);updateUi();createLiveBadge().textContent='● Запись прогулки';
  }

  async function stopTracking(){
    if(!tracking||!current)return;tracking=false;clearInterval(timer);if(ownWatchId!==null&&navigator.geolocation){navigator.geolocation.clearWatch(ownWatchId);ownWatchId=null;}timer=null;current.ended_at=new Date().toISOString();current.duration_s=Math.max(1,Math.round((new Date(current.ended_at)-new Date(current.started_at))/1000));
    if(current.points.length>1){
      const record={...current,synced:false};localTracks.push(record);saveJson(LOCAL_TRACKS_KEY,localTracks);
      if(window.KAZAN_CLOUD?.isEditor()&&cloudSnapshot?.schemaReady!==false){try{const saved=await window.KAZAN_CLOUD.saveTrack(record);record.synced=true;record.cloud_id=saved.id;saveJson(LOCAL_TRACKS_KEY,localTracks);await window.KAZAN_CLOUD.refresh();}catch(error){alert(error?.message||'Трек сохранён на телефоне, но не загружен в облако.');}}
    }
    localStorage.removeItem(CURRENT_KEY);current=null;removeLiveBadge();renderTracks();updateUi();
  }

  function addPoint(point){
    if(!tracking||!current)return;if(!Number.isFinite(point.lat)||!Number.isFinite(point.lng))return;if(Number(point.accuracy)>100)return;
    const normalized={lat:Number(point.lat),lng:Number(point.lng),accuracy:Number(point.accuracy)||0,timestamp:Number(point.timestamp)||Date.now()},previous=current.points.at(-1);
    if(previous){const distance=distanceMeters(previous,normalized),elapsed=Math.max(1,(normalized.timestamp-previous.timestamp)/1000),speed=distance/elapsed;if(distance<3&&elapsed<12)return;if(distance>500||speed>25)return;current.distance_m=(current.distance_m||0)+distance;}
    current.points.push(normalized);saveJson(CURRENT_KEY,current);drawCurrent();updateUi();
  }

  function distanceMeters(a,b){const radius=6371000,toRad=value=>value*Math.PI/180,dLat=toRad(b.lat-a.lat),dLon=toRad(b.lng-a.lng),lat1=toRad(a.lat),lat2=toRad(b.lat),h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;return 2*radius*Math.asin(Math.sqrt(h));}
  function drawCurrent(){if(currentLine){map.removeLayer(currentLine);currentLine=null;}if(!showTracks||!current?.points?.length)return;currentLine=L.polyline(current.points.map(point=>[point.lat,point.lng]),{color:'#ec4899',weight:6,opacity:.95,lineCap:'round'}).addTo(map);}
  function cloudTracksForDay(key){return cloudSnapshot?.tracks?.filter(track=>track.day_key===key)||[];}
  function localTracksForDay(key){return localTracks.filter(track=>track.day_key===key&&!track.synced);}
  function allTracksForDay(key){return [...cloudTracksForDay(key),...localTracksForDay(key)];}

  function renderTracks(){if(!map)return;if(savedLayer)map.removeLayer(savedLayer);savedLayer=L.layerGroup();if(showTracks){allTracksForDay(dayKey()).forEach(track=>{const points=Array.isArray(track.points)?track.points:[];if(points.length<2)return;L.polyline(points.map(point=>[point.lat,point.lng]),{color:'#7c3aed',weight:5,opacity:.82,lineCap:'round'}).bindTooltip(`${formatDistance(track.distance_m||0)} · ${formatDuration(track.duration_s||0)}`).addTo(savedLayer);});savedLayer.addTo(map);}drawCurrent();}

  function aggregate(){const key=dayKey(),tracks=allTracksForDay(key);let distance=tracks.reduce((sum,track)=>sum+Number(track.distance_m||0),0),duration=tracks.reduce((sum,track)=>sum+Number(track.duration_s||0),0);if(tracking&&current?.day_key===key){distance+=Number(current.distance_m||0);duration+=Math.max(0,Math.round((Date.now()-new Date(current.started_at))/1000));}const cloudHealth=cloudSnapshot?.health?.get(key),localSteps=localHealth[key]?.steps,actualSteps=cloudHealth?.steps??localSteps??null;return{key,distance,duration,steps:actualSteps??Math.round(distance/.75),estimated:actualSteps===null};}

  function updateUi(){
    if(!panel)return;const data=aggregate();panel.querySelector('#trackerTitle').textContent=`Прогулка · ${dayLabel(data.key)}`;panel.querySelector('#trackerKm').textContent=(data.distance/1000).toFixed(data.distance<10000?2:1);panel.querySelector('#trackerTime').textContent=formatDuration(data.duration);panel.querySelector('#trackerSteps').textContent=data.estimated?`≈${data.steps}`:String(data.steps);panel.querySelector('#trackerStepsLabel').textContent=data.estimated?'шагов, оценка':'шагов из «Здоровья»';
    const start=panel.querySelector('#trackerStart');start.textContent=tracking?'Остановить и сохранить':'Начать запись';start.classList.toggle('stop',tracking);start.disabled=!canEdit();
    const filter=panel.querySelector('#trackerFilter');filter.textContent=showTracks?'Скрыть путь':'Показать путь';filter.classList.toggle('off',!showTracks);
    const input=panel.querySelector('#trackerHealthInput');input.value=data.estimated?'':data.steps;input.disabled=!canEdit();panel.querySelector('#trackerHealthSave').disabled=!canEdit();if(tracking)createLiveBadge().textContent=`● ${formatDistance(current?.distance_m||0)}`;
  }

  async function saveHealth(){if(!canEdit()){alert('Сохранение доступно только URBoRTEX.');return;}const input=panel.querySelector('#trackerHealthInput'),steps=Math.max(0,Math.round(Number(input.value)||0)),key=dayKey();localHealth[key]={steps,source:'manual',updated_at:new Date().toISOString()};saveJson(LOCAL_HEALTH_KEY,localHealth);if(window.KAZAN_CLOUD?.isEditor()&&cloudSnapshot?.schemaReady!==false){try{await window.KAZAN_CLOUD.saveHealth(key,steps,'apple_health_manual');await window.KAZAN_CLOUD.refresh();}catch(error){alert(error?.message||'Шаги сохранены на телефоне, но не в облаке.');}}updateUi();}
  function formatDistance(meters){return meters<1000?`${Math.round(meters)} м`:`${(meters/1000).toFixed(meters<10000?1:0)} км`;}
  function formatDuration(seconds){const minutes=Math.round(seconds/60);if(minutes<1)return '0 мин';if(minutes<60)return `${minutes} мин`;return `${Math.floor(minutes/60)} ч${minutes%60?` ${minutes%60} мин`:''}`;}

  function init(application){if(app)return;app=application;map=app.map;createUi();renderTracks();updateUi();const restored=loadJson(CURRENT_KEY,null);if(restored?.points?.length){current=restored;tracking=true;app.startLocation();startOwnWatch();timer=setInterval(updateUi,1000);createLiveBadge();drawCurrent();}}
  window.addEventListener('kazan:app-ready',event=>init(event.detail));
  window.addEventListener('kazan:day-change',()=>{renderTracks();updateUi();});
  window.addEventListener('kazan:cloud-ready',event=>{cloudSnapshot=event.detail;renderTracks();updateUi();});
  window.addEventListener('kazan:auth-change',updateUi);
  if(window.KAZAN_APP)init(window.KAZAN_APP);
  if(window.KAZAN_CLOUD?.ready)window.KAZAN_CLOUD.ready.then(snapshot=>{cloudSnapshot=snapshot;renderTracks();updateUi();});
})();
