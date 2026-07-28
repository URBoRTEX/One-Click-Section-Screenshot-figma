(()=>{
  'use strict';

  const LOCAL_TRACKS_KEY='kazan-local-walk-tracks-v2';
  const LEGACY_TRACKS_KEY='kazan-local-walk-tracks-v1';
  const LOCAL_HEALTH_KEY='kazan-local-health-v1';
  const CURRENT_KEY='kazan-current-walk-v2';
  const LEGACY_CURRENT_KEY='kazan-current-walk-v1';
  const DAY_DATES={d27:'2026-07-27',d28:'2026-07-28',d29:'2026-07-29',d30:'2026-07-30',d31:'2026-07-31'};

  let app=null;
  let map=null;
  let panel=null;
  let toolButton=null;
  let savedLayer=null;
  let currentLine=null;
  let watchId=null;
  let latestPosition=null;
  let tracking=false;
  let requesting=false;
  let current=null;
  let cloudSnapshot=null;
  let timer=null;
  let showTracks=true;
  let wakeLock=null;

  const localTracks=loadTracks();
  const localHealth=loadJson(LOCAL_HEALTH_KEY,{});

  const style=document.createElement('style');
  style.textContent=`
    .tracker-panel{position:fixed;z-index:1800;left:10px;right:68px;top:126px;display:none;padding:14px;border-radius:18px;background:rgba(255,255,255,.985);box-shadow:0 12px 34px rgba(15,23,42,.22);backdrop-filter:blur(14px);max-height:62vh;overflow:auto}
    .tracker-panel.open{display:block}
    .tracker-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.tracker-head h3{margin:0;font-size:17px;line-height:1.2}.tracker-head p{margin:4px 0 0;color:#667085;font-size:11px;line-height:1.35}.tracker-close{width:36px;height:36px;flex:0 0 auto;border:0;border-radius:11px;background:#eef2f6;color:#111827;font-size:21px}
    .tracker-state{display:none;margin-top:10px;padding:9px 10px;border-radius:11px;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:700;line-height:1.35}.tracker-state.show{display:block}.tracker-state.error{background:#fff1f2;color:#b42318}.tracker-state.recording{background:#fdf2f8;color:#be185d}
    .tracker-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:11px}.tracker-stat{padding:9px;border-radius:11px;background:#f8fafc}.tracker-stat b{display:block;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tracker-stat span{display:block;margin-top:2px;color:#667085;font-size:9px}
    .tracker-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.tracker-actions button{border:0;border-radius:11px;padding:10px 12px;font-size:11px;font-weight:900}.tracker-start{flex:1;min-width:150px;background:#16a34a;color:#fff}.tracker-start.stop{background:#dc2626}.tracker-start:disabled{opacity:.58}.tracker-filter{background:#e0e7ff;color:#3730a3}.tracker-filter.off{background:#eef2f6;color:#667085}
    .tracker-health{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;margin-top:10px}.tracker-health input{min-width:0;border:1px solid #d0d5dd;border-radius:10px;padding:10px;font-size:12px}.tracker-health button{border:0;border-radius:10px;background:#111827;color:#fff;padding:9px 11px;font-size:11px;font-weight:800}
    .tracker-note{margin:8px 0 0;color:#667085;font-size:9px;line-height:1.4}.track-live-badge{position:fixed;z-index:1700;left:10px;top:72px;padding:8px 10px;border-radius:10px;background:#ec4899;color:#fff;font-size:10px;font-weight:800;box-shadow:0 6px 18px rgba(15,23,42,.16)}
    @media(min-width:800px){.tracker-panel{left:414px;right:auto;width:380px;top:130px}}
  `;
  document.head.appendChild(style);

  function loadJson(key,fallback){
    try{
      const value=JSON.parse(localStorage.getItem(key)||'null');
      return value??fallback;
    }catch(_){return fallback;}
  }

  function saveJson(key,value){
    try{localStorage.setItem(key,JSON.stringify(value));}catch(_){}
  }

  function loadTracks(){
    const current=loadJson(LOCAL_TRACKS_KEY,null);
    if(Array.isArray(current))return current;
    const legacy=loadJson(LEGACY_TRACKS_KEY,[]);
    if(Array.isArray(legacy)){
      saveJson(LOCAL_TRACKS_KEY,legacy);
      return legacy;
    }
    return [];
  }

  function dayKey(){
    const active=app?.getActiveDay?.();
    if(DAY_DATES[active])return DAY_DATES[active];
    return new Date().toISOString().slice(0,10);
  }

  function dayLabel(key){
    const entry=Object.entries(DAY_DATES).find(([,date])=>date===key);
    if(entry)return `${entry[0].slice(1)} июля`;
    return new Date(`${key}T12:00:00`).toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
  }

  function canSync(){
    return Boolean(window.KAZAN_CLOUD?.isEditor?.()&&cloudSnapshot?.schemaReady!==false);
  }

  function createUi(){
    const tools=document.querySelector('.map-tools');
    if(tools&&!document.getElementById('trackToolBtn')){
      toolButton=document.createElement('button');
      toolButton.id='trackToolBtn';
      toolButton.className='map-tool';
      toolButton.type='button';
      toolButton.textContent='👣';
      toolButton.title='Запись прогулки и пройденный путь';
      toolButton.setAttribute('aria-label','Запись прогулки и пройденный путь');
      tools.appendChild(toolButton);
      toolButton.addEventListener('click',()=>togglePanel());
    }

    panel=document.createElement('section');
    panel.className='tracker-panel';
    panel.innerHTML=`
      <div class="tracker-head">
        <div><h3 id="trackerTitle">Прогулка</h3><p id="trackerSubtitle">GPS-трек за выбранный день</p></div>
        <button class="tracker-close" type="button" aria-label="Закрыть">×</button>
      </div>
      <div class="tracker-state" id="trackerState"></div>
      <div class="tracker-stats">
        <div class="tracker-stat"><b id="trackerKm">0</b><span>километров</span></div>
        <div class="tracker-stat"><b id="trackerTime">0</b><span>времени</span></div>
        <div class="tracker-stat"><b id="trackerSteps">0</b><span id="trackerStepsLabel">шагов, оценка</span></div>
      </div>
      <div class="tracker-actions">
        <button class="tracker-start" id="trackerStart" type="button">Начать запись</button>
        <button class="tracker-filter" id="trackerFilter" type="button">Скрыть путь</button>
      </div>
      <div class="tracker-health">
        <input id="trackerHealthInput" type="number" min="0" step="1" inputmode="numeric" placeholder="Шаги из «Здоровья»">
        <button id="trackerHealthSave" type="button">Сохранить</button>
      </div>
      <p class="tracker-note">Запись всегда сохраняется локально на телефоне. После входа владельца завершённый трек дополнительно публикуется в облако. Во время прогулки держите страницу открытой; iOS может останавливать GPS у страницы в фоне.</p>`;
    document.body.appendChild(panel);

    panel.querySelector('.tracker-close').addEventListener('click',()=>togglePanel(false));
    panel.querySelector('#trackerStart').addEventListener('click',()=>tracking?stopTracking():startTracking());
    panel.querySelector('#trackerFilter').addEventListener('click',()=>{
      showTracks=!showTracks;
      renderTracks();
      updateUi();
    });
    panel.querySelector('#trackerHealthSave').addEventListener('click',saveHealth);
  }

  function togglePanel(force){
    if(!panel)return;
    const open=force??!panel.classList.contains('open');
    panel.classList.toggle('open',open);
    toolButton?.classList.toggle('active',open||tracking);
    if(open)updateUi();
  }

  function setState(message,type='info'){
    const element=panel?.querySelector('#trackerState');
    if(!element)return;
    element.textContent=message||'';
    element.className=`tracker-state${message?' show':''}${type==='error'?' error':''}${type==='recording'?' recording':''}`;
  }

  function createLiveBadge(){
    let badge=document.querySelector('.track-live-badge');
    if(!badge){
      badge=document.createElement('div');
      badge.className='track-live-badge';
      document.body.appendChild(badge);
    }
    return badge;
  }

  function removeLiveBadge(){
    document.querySelector('.track-live-badge')?.remove();
  }

  async function requestWakeLock(){
    try{
      if('wakeLock' in navigator)wakeLock=await navigator.wakeLock.request('screen');
    }catch(_){}
  }

  async function releaseWakeLock(){
    try{await wakeLock?.release?.();}catch(_){}
    wakeLock=null;
  }

  function beginWatch(){
    if(!navigator.geolocation)throw new Error('Геолокация недоступна в этом браузере.');
    if(watchId!==null)return;

    watchId=navigator.geolocation.watchPosition(position=>{
      latestPosition={
        lat:position.coords.latitude,
        lng:position.coords.longitude,
        accuracy:position.coords.accuracy,
        timestamp:position.timestamp||Date.now()
      };
      requesting=false;
      addPoint(latestPosition);
      setState(`Идёт запись · точность GPS ±${Math.round(position.coords.accuracy)} м`,'recording');
      updateUi();
    },error=>{
      requesting=false;
      if(watchId!==null){
        navigator.geolocation.clearWatch(watchId);
        watchId=null;
      }
      if(current?.points?.length){
        setState('GPS временно недоступен. Уже записанные точки сохранены.','error');
      }else{
        tracking=false;
        current=null;
        localStorage.removeItem(CURRENT_KEY);
        removeLiveBadge();
        toolButton?.classList.remove('active');
        const messages={
          1:'Доступ к геопозиции запрещён. Разрешите доступ в настройках браузера.',
          2:'Не удалось определить местоположение.',
          3:'GPS не ответил вовремя. Попробуйте ещё раз.'
        };
        setState(messages[error.code]||'Не удалось запустить GPS.','error');
      }
      updateUi();
    },{
      enableHighAccuracy:true,
      maximumAge:2000,
      timeout:20000
    });
  }

  async function startTracking(){
    if(tracking||requesting)return;
    if(!navigator.geolocation){
      setState('Геолокация недоступна в этом браузере.','error');
      return;
    }

    const restored=loadJson(CURRENT_KEY,null)||loadJson(LEGACY_CURRENT_KEY,null);
    current=restored&&restored.day_key===dayKey()
      ? restored
      : {
          id:crypto.randomUUID(),
          day_key:dayKey(),
          started_at:new Date().toISOString(),
          points:[],
          distance_m:0
        };

    tracking=true;
    requesting=true;
    saveJson(CURRENT_KEY,current);
    localStorage.removeItem(LEGACY_CURRENT_KEY);
    toolButton?.classList.add('active');
    setState('Запрашиваю доступ к GPS…');
    createLiveBadge().textContent='● Запуск GPS…';
    updateUi();

    try{
      app?.startLocation?.();
      beginWatch();
      await requestWakeLock();
      if(timer)clearInterval(timer);
      timer=setInterval(updateUi,1000);
    }catch(error){
      tracking=false;
      requesting=false;
      current=null;
      localStorage.removeItem(CURRENT_KEY);
      removeLiveBadge();
      setState(error?.message||'Не удалось запустить запись.','error');
      updateUi();
    }
  }

  async function stopTracking(){
    if(!tracking&&!requesting)return;

    tracking=false;
    requesting=false;
    if(timer){clearInterval(timer);timer=null;}
    if(watchId!==null&&navigator.geolocation){
      navigator.geolocation.clearWatch(watchId);
      watchId=null;
    }
    await releaseWakeLock();

    if(!current){
      removeLiveBadge();
      updateUi();
      return;
    }

    current.ended_at=new Date().toISOString();
    current.duration_s=Math.max(1,Math.round((new Date(current.ended_at)-new Date(current.started_at))/1000));

    if(current.points.length>0){
      const record={...current,synced:false};
      localTracks.push(record);
      saveJson(LOCAL_TRACKS_KEY,localTracks);
      setState(current.points.length>1
        ? `Прогулка сохранена на телефоне · ${formatDistance(record.distance_m||0)}`
        : 'Сохранена одна GPS-точка. Для линии нужно пройти небольшое расстояние.');

      if(canSync()){
        try{
          const saved=await window.KAZAN_CLOUD.saveTrack(record);
          record.synced=true;
          record.cloud_id=saved.id;
          saveJson(LOCAL_TRACKS_KEY,localTracks);
          await window.KAZAN_CLOUD.refresh();
          setState(`Прогулка сохранена и опубликована · ${formatDistance(record.distance_m||0)}`);
        }catch(error){
          setState('Трек сохранён на телефоне, но не загрузился в облако.','error');
        }
      }
    }else{
      setState('Запись остановлена без GPS-точек. Проверьте разрешение геолокации.','error');
    }

    localStorage.removeItem(CURRENT_KEY);
    current=null;
    removeLiveBadge();
    toolButton?.classList.remove('active');
    renderTracks();
    updateUi();
  }

  function addPoint(point){
    if(!tracking||!current)return;
    if(!Number.isFinite(point.lat)||!Number.isFinite(point.lng))return;
    if(Number(point.accuracy)>120)return;

    const normalized={
      lat:Number(point.lat),
      lng:Number(point.lng),
      accuracy:Number(point.accuracy)||0,
      timestamp:Number(point.timestamp)||Date.now()
    };
    const previous=current.points.at(-1);

    if(previous){
      const distance=distanceMeters(previous,normalized);
      const elapsed=Math.max(1,(normalized.timestamp-previous.timestamp)/1000);
      const speed=distance/elapsed;
      if(distance<2&&elapsed<15)return;
      if(distance>500||speed>18)return;
      current.distance_m=(current.distance_m||0)+distance;
    }

    current.points.push(normalized);
    saveJson(CURRENT_KEY,current);
    drawCurrent();
    updateUi();
  }

  function distanceMeters(a,b){
    const radius=6371000;
    const toRad=value=>value*Math.PI/180;
    const dLat=toRad(b.lat-a.lat);
    const dLon=toRad(b.lng-a.lng);
    const lat1=toRad(a.lat);
    const lat2=toRad(b.lat);
    const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return 2*radius*Math.asin(Math.sqrt(h));
  }

  function drawCurrent(){
    if(currentLine){map.removeLayer(currentLine);currentLine=null;}
    if(!showTracks||!current?.points?.length)return;
    currentLine=L.polyline(current.points.map(point=>[point.lat,point.lng]),{
      color:'#ec4899',weight:6,opacity:.95,lineCap:'round'
    }).addTo(map);
  }

  function cloudTracksForDay(key){
    return cloudSnapshot?.tracks?.filter(track=>track.day_key===key)||[];
  }

  function localTracksForDay(key){
    return localTracks.filter(track=>track.day_key===key&&!track.synced);
  }

  function allTracksForDay(key){
    return [...cloudTracksForDay(key),...localTracksForDay(key)];
  }

  function renderTracks(){
    if(!map)return;
    if(savedLayer)map.removeLayer(savedLayer);
    savedLayer=L.layerGroup();

    if(showTracks){
      allTracksForDay(dayKey()).forEach(track=>{
        const points=Array.isArray(track.points)?track.points:[];
        if(points.length<2)return;
        L.polyline(points.map(point=>[point.lat,point.lng]),{
          color:'#7c3aed',weight:5,opacity:.82,lineCap:'round'
        }).bindTooltip(`${formatDistance(track.distance_m||0)} · ${formatDuration(track.duration_s||0)}`).addTo(savedLayer);
      });
      savedLayer.addTo(map);
    }
    drawCurrent();
  }

  function aggregate(){
    const key=dayKey();
    const tracks=allTracksForDay(key);
    let distance=tracks.reduce((sum,track)=>sum+Number(track.distance_m||0),0);
    let duration=tracks.reduce((sum,track)=>sum+Number(track.duration_s||0),0);

    if((tracking||requesting)&&current?.day_key===key){
      distance+=Number(current.distance_m||0);
      duration+=Math.max(0,Math.round((Date.now()-new Date(current.started_at))/1000));
    }

    const cloudHealth=cloudSnapshot?.health?.get?.(key);
    const localSteps=localHealth[key]?.steps;
    const actualSteps=cloudHealth?.steps??localSteps??null;
    return{
      key,distance,duration,
      steps:actualSteps??Math.round(distance/.75),
      estimated:actualSteps===null
    };
  }

  function updateUi(){
    if(!panel)return;
    const data=aggregate();
    panel.querySelector('#trackerTitle').textContent=`Прогулка · ${dayLabel(data.key)}`;
    panel.querySelector('#trackerKm').textContent=(data.distance/1000).toFixed(data.distance<10000?2:1);
    panel.querySelector('#trackerTime').textContent=formatDuration(data.duration);
    panel.querySelector('#trackerSteps').textContent=data.estimated?`≈${data.steps}`:String(data.steps);
    panel.querySelector('#trackerStepsLabel').textContent=data.estimated?'шагов, оценка':'шагов из «Здоровья»';

    const start=panel.querySelector('#trackerStart');
    start.textContent=requesting?'Запрашиваю GPS…':tracking?'Остановить и сохранить':'Начать запись';
    start.classList.toggle('stop',tracking||requesting);
    start.disabled=requesting;

    const filter=panel.querySelector('#trackerFilter');
    filter.textContent=showTracks?'Скрыть путь':'Показать путь';
    filter.classList.toggle('off',!showTracks);

    const input=panel.querySelector('#trackerHealthInput');
    if(document.activeElement!==input)input.value=data.estimated?'':data.steps;
    input.disabled=false;
    panel.querySelector('#trackerHealthSave').disabled=false;

    if(tracking){
      createLiveBadge().textContent=requesting
        ? '● Запуск GPS…'
        : `● ${formatDistance(current?.distance_m||0)}`;
    }
  }

  async function saveHealth(){
    const input=panel.querySelector('#trackerHealthInput');
    const steps=Math.max(0,Math.round(Number(input.value)||0));
    const key=dayKey();
    localHealth[key]={steps,source:'manual',updated_at:new Date().toISOString()};
    saveJson(LOCAL_HEALTH_KEY,localHealth);
    setState(`Шаги сохранены на телефоне: ${steps}`);

    if(canSync()){
      try{
        await window.KAZAN_CLOUD.saveHealth(key,steps,'apple_health_manual');
        await window.KAZAN_CLOUD.refresh();
        setState(`Шаги сохранены и опубликованы: ${steps}`);
      }catch(error){
        setState('Шаги сохранены на телефоне, но не загрузились в облако.','error');
      }
    }
    updateUi();
  }

  function formatDistance(meters){
    return meters<1000?`${Math.round(meters)} м`:`${(meters/1000).toFixed(meters<10000?1:0)} км`;
  }

  function formatDuration(seconds){
    const minutes=Math.round(seconds/60);
    if(minutes<1)return '0 мин';
    if(minutes<60)return `${minutes} мин`;
    return `${Math.floor(minutes/60)} ч${minutes%60?` ${minutes%60} мин`:''}`;
  }

  function restoreActiveTrack(){
    const restored=loadJson(CURRENT_KEY,null)||loadJson(LEGACY_CURRENT_KEY,null);
    if(!restored?.started_at)return;
    current=restored;
    saveJson(CURRENT_KEY,current);
    localStorage.removeItem(LEGACY_CURRENT_KEY);
    tracking=true;
    requesting=true;
    setState('Восстанавливаю незавершённую запись и GPS…');
    toolButton?.classList.add('active');
    createLiveBadge().textContent='● Восстановление GPS…';
    try{
      app?.startLocation?.();
      beginWatch();
      requestWakeLock();
      timer=setInterval(updateUi,1000);
      drawCurrent();
    }catch(error){
      requesting=false;
      setState('Не удалось автоматически восстановить GPS. Остановите запись и начните заново.','error');
    }
    updateUi();
  }

  function init(application){
    if(app)return;
    app=application;
    map=app.map;
    createUi();
    renderTracks();
    updateUi();
    restoreActiveTrack();
  }

  window.addEventListener('kazan:app-ready',event=>init(event.detail));
  window.addEventListener('kazan:day-change',()=>{renderTracks();updateUi();});
  window.addEventListener('kazan:cloud-ready',event=>{
    cloudSnapshot=event.detail;
    renderTracks();
    updateUi();
  });
  window.addEventListener('kazan:auth-change',updateUi);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'&&tracking)requestWakeLock();
  });

  if(window.KAZAN_APP)init(window.KAZAN_APP);
  if(window.KAZAN_CLOUD?.ready){
    window.KAZAN_CLOUD.ready.then(snapshot=>{
      cloudSnapshot=snapshot;
      renderTracks();
      updateUi();
    });
  }
})();