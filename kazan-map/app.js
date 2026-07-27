(()=>{
  const D=window.KAZAN;
  const Q=id=>document.getElementById(id);
  const status=Q('status');
  if(!D||!window.L){
    status.textContent='Не удалось загрузить карту. Обновите страницу.';
    return;
  }

  const tabs=Q('tabs');
  const sheet=Q('sheet');
  const list=Q('list');
  const title=Q('title');
  const subtitle=Q('subtitle');
  const locateBtn=Q('locateBtn');
  const routeCard=Q('routeCard');
  const routeTitle=Q('routeTitle');
  const routeMeta=Q('routeMeta');
  const routeBtn=Q('routeBtn');
  const clearRouteBtn=Q('clearRouteBtn');
  const followBtn=Q('followBtn');

  const labels={
    all:['Все','Все точки и варианты'],
    d27:['27 июля','Баумана и развлечения'],
    d28:['28 июля','Кабан и Старо-Татарская слобода'],
    d29:['29 июля','Голубые озёра и Казанка'],
    d30:['30 июля','Кремль и набережная'],
    d31:['31 июля','Парки и арт-пространства'],
    backup:['Дождь','Океанариум'],
    yosh:['Йошкар-Ола','Отдельный день']
  };
  const order=['all','d27','d28','d29','d30','d31','backup','yosh'];
  let active='d27';
  let selectedItem=null;
  let selectedMarker=null;
  let userLatLng=null;
  let userMarker=null;
  let accuracyCircle=null;
  let watchId=null;
  let followLocation=true;
  let routeLine=null;
  let routeFallbackLine=null;
  let routeRequestId=0;
  let lastRouteOrigin=null;
  let lastRouteAt=0;
  let pendingRouteItem=null;

  const map=L.map('map',{zoomControl:true,preferCanvas:true}).setView([55.797,49.122],12);
  const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,
    attribution:'© OpenStreetMap'
  }).addTo(map);
  tiles.on('load',()=>status.textContent='Карта готова');
  tiles.on('tileerror',()=>status.textContent='Проверьте интернет и обновите страницу');

  const layers={};
  const markers=[];
  order.slice(1).concat('stay').forEach(d=>layers[d]=L.layerGroup());
  const color=d=>D.days[d]?.[2]||'#111827';

  function markerHtml(x,selected=false){
    const fill=selected?'#EF4444':color(x[1]);
    const label=x[1]==='stay'?'♥':x[2];
    return `<i class="${selected?'selected':''}" style="background:${fill}">${label}</i>`;
  }
  function icon(x,selected=false){
    return L.divIcon({
      className:'marker',
      html:markerHtml(x,selected),
      iconSize:selected?[40,40]:[32,32],
      iconAnchor:selected?[20,20]:[16,16],
      popupAnchor:[0,selected?-18:-13]
    });
  }
  function externalNav(x){
    const yandex=`https://yandex.ru/maps/?rtext=${userLatLng?`${userLatLng.lat},${userLatLng.lng}`:''}~${x[6]},${x[7]}&rtt=auto`;
    const google=`https://www.google.com/maps/dir/?api=1&destination=${x[6]},${x[7]}${userLatLng?`&origin=${userLatLng.lat},${userLatLng.lng}`:''}`;
    const gis=`https://2gis.ru/kazan/routeSearch/rsType/car/to/${x[7]},${x[6]}`;
    return `<div class="links"><a target="_blank" rel="noopener" href="${yandex}">Яндекс</a><a target="_blank" rel="noopener" href="${google}">Google</a><a target="_blank" rel="noopener" href="${gis}">2ГИС</a></div>`;
  }
  function popupHtml(x){
    return `<b>${x[2]}. ${x[4]}</b><br><small>${x[3]} · ${x[5]||''}</small>${x[8]?`<div class="warn">${x[8]}</div>`:''}<button class="popup-route" data-key="${x[0]}">Маршрут сюда</button>${externalNav(x)}`;
  }

  D.items.forEach(x=>{
    const m=L.marker([x[6],x[7]],{icon:icon(x),riseOnHover:true});
    m.bindPopup(popupHtml(x));
    m.bindTooltip(`${x[2]}. ${x[4]}`,{permanent:true,direction:'top',offset:[0,-17],className:'lab'});
    m.on('click',()=>selectPin(x,m,true));
    m.on('popupopen',e=>{
      const btn=e.popup.getElement()?.querySelector('.popup-route');
      if(btn)btn.onclick=()=>buildRouteTo(x);
    });
    m.addTo(layers[x[1]]);
    markers.push([x,m]);
  });

  const byKey=Object.fromEntries(D.items.map(x=>[x[0],x]));
  Object.entries(D.routes).forEach(([d,keys])=>{
    L.polyline(keys.map(k=>[byKey[k][6],byKey[k][7]]),{
      color:color(d),weight:4,opacity:.58,dashArray:'7 8'
    }).addTo(layers[d]);
  });
  D.areas.forEach(a=>{
    L.circle(a.center,{
      radius:a.radius,color:color(a.day),weight:2,
      fillColor:color(a.day),fillOpacity:.07,opacity:.38,interactive:false
    }).addTo(layers[a.day]);
  });

  function items(){
    return D.items.filter(x=>active==='all'?x[1]!=='yosh':x[1]===active);
  }
  function renderTabs(){
    tabs.innerHTML='';
    order.forEach(d=>{
      const b=document.createElement('button');
      b.textContent=labels[d][0];
      b.className=d===active?'on':'';
      b.onclick=()=>select(d);
      tabs.appendChild(b);
    });
  }
  function renderList(){
    list.innerHTML='';
    items().forEach(x=>{
      const el=document.createElement('div');
      const isSelected=selectedItem===x;
      el.className=`stop${isSelected?' selected-stop':''}`;
      el.dataset.key=x[0];
      el.innerHTML=`<div class="n" style="background:${isSelected?'#EF4444':color(x[1])}">${x[2]}</div><div><b>${x[4]}</b><span>${x[3]} · ${x[5]||'Открытая территория'}</span><div class="row-actions"><button class="mini-route">Маршрут</button>${externalNav(x)}</div></div>`;
      el.onclick=e=>{
        if(e.target.tagName==='A')return;
        if(e.target.classList.contains('mini-route')){
          selectPin(x,markers.find(z=>z[0]===x)?.[1],false);
          buildRouteTo(x);
          return;
        }
        const p=markers.find(z=>z[0]===x);
        selectPin(x,p?.[1],true);
        map.setView([x[6],x[7]],16);
        p?.[1].openPopup();
        sheet.classList.remove('open');
      };
      list.appendChild(el);
    });
  }
  function updateLayers(){
    Object.entries(layers).forEach(([d,l])=>{
      const on=d==='stay'||(active==='all'?d!=='yosh':d===active);
      if(on&&!map.hasLayer(l))l.addTo(map);
      if(!on&&map.hasLayer(l))map.removeLayer(l);
    });
  }
  function fit(){
    const a=items().concat(D.items.filter(x=>x[1]==='stay'));
    if(!a.length)return;
    map.fitBounds(L.latLngBounds(a.map(x=>[x[6],x[7]])).pad(.12),{
      maxZoom:active==='all'?11:14,
      paddingTopLeft:[20,80],
      paddingBottomRight:[20,150]
    });
  }
  function select(d){
    active=d;
    title.textContent=labels[d][0];
    subtitle.textContent=labels[d][1];
    renderTabs();
    renderList();
    updateLayers();
    setTimeout(fit,80);
  }

  function selectPin(x,m,openCard=true){
    if(selectedMarker&&selectedItem)selectedMarker.setIcon(icon(selectedItem,false));
    selectedItem=x;
    selectedMarker=m||markers.find(z=>z[0]===x)?.[1]||null;
    if(selectedMarker)selectedMarker.setIcon(icon(x,true));
    routeTitle.textContent=x[4];
    routeMeta.textContent=userLatLng?'Точка выбрана. Можно построить маршрут.':'Точка выбрана. Включите GPS для маршрута.';
    routeCard.classList.add('show');
    renderList();
    if(openCard&&window.innerWidth>760)sheet.classList.add('open');
  }

  function createUserMarker(latlng,accuracy){
    const userIcon=L.divIcon({
      className:'user-location',
      html:'<span><i></i></span>',
      iconSize:[28,28],
      iconAnchor:[14,14]
    });
    if(!userMarker){
      userMarker=L.marker(latlng,{icon:userIcon,zIndexOffset:2000}).addTo(map).bindPopup('Вы находитесь здесь');
      accuracyCircle=L.circle(latlng,{radius:accuracy||0,color:'#2563EB',weight:1,fillColor:'#3B82F6',fillOpacity:.10,opacity:.35,interactive:false}).addTo(map);
    }else{
      userMarker.setLatLng(latlng);
      accuracyCircle.setLatLng(latlng).setRadius(accuracy||0);
    }
  }

  function startLocation(){
    if(!navigator.geolocation){
      status.textContent='GPS недоступен в этом браузере';
      return;
    }
    if(watchId!==null){
      followLocation=true;
      followBtn.classList.add('on');
      if(userLatLng)map.setView(userLatLng,16);
      return;
    }
    status.textContent='Запрашиваю доступ к GPS…';
    locateBtn.classList.add('loading');
    watchId=navigator.geolocation.watchPosition(pos=>{
      const next=L.latLng(pos.coords.latitude,pos.coords.longitude);
      userLatLng=next;
      createUserMarker(next,pos.coords.accuracy);
      locateBtn.classList.remove('loading');
      locateBtn.classList.add('active');
      status.textContent=`GPS: точность ±${Math.round(pos.coords.accuracy)} м`;
      if(followLocation)map.setView(next,Math.max(map.getZoom(),16));
      if(pendingRouteItem){
        const pending=pendingRouteItem;
        pendingRouteItem=null;
        buildRouteTo(pending);
      }else{
        if(selectedItem&&shouldRefreshRoute(next))buildRouteTo(selectedItem,true);
        if(selectedItem&&!routeLine&&!routeFallbackLine)routeMeta.textContent='GPS включён. Нажмите «Маршрут», чтобы построить путь.';
      }
    },err=>{
      locateBtn.classList.remove('loading');
      const messages={1:'Доступ к геолокации запрещён',2:'Не удалось определить местоположение',3:'GPS отвечает слишком долго'};
      status.textContent=messages[err.code]||'Ошибка GPS';
      watchId=null;
    },{
      enableHighAccuracy:true,
      maximumAge:5000,
      timeout:15000
    });
  }

  function shouldRefreshRoute(next){
    if(!lastRouteOrigin)return false;
    const moved=next.distanceTo(lastRouteOrigin);
    return moved>100&&Date.now()-lastRouteAt>15000;
  }

  function clearRoute(){
    routeRequestId++;
    if(routeLine){map.removeLayer(routeLine);routeLine=null;}
    if(routeFallbackLine){map.removeLayer(routeFallbackLine);routeFallbackLine=null;}
    lastRouteOrigin=null;
    lastRouteAt=0;
    routeMeta.textContent=selectedItem?(userLatLng?'Маршрут очищен.':'Включите GPS для маршрута.'):'Выберите точку на карте.';
  }

  function formatDistance(m){
    return m<1000?`${Math.round(m)} м`:`${(m/1000).toFixed(m<10000?1:0)} км`;
  }
  function formatDuration(sec){
    const min=Math.max(1,Math.round(sec/60));
    if(min<60)return `${min} мин`;
    const h=Math.floor(min/60),rest=min%60;
    return rest?`${h} ч ${rest} мин`:`${h} ч`;
  }

  async function buildRouteTo(x,silent=false){
    selectPin(x,markers.find(z=>z[0]===x)?.[1],false);
    if(!userLatLng){
      pendingRouteItem=x;
      startLocation();
      routeMeta.textContent='Разрешите доступ к GPS. Маршрут построится после определения позиции.';
      return;
    }
    const requestId=++routeRequestId;
    routeBtn.disabled=true;
    routeBtn.textContent='Строю…';
    if(!silent)status.textContent='Строю маршрут…';
    const destination=L.latLng(x[6],x[7]);
    const url=`https://router.project-osrm.org/route/v1/driving/${userLatLng.lng},${userLatLng.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&steps=false`;
    try{
      const res=await fetch(url,{mode:'cors'});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const json=await res.json();
      if(requestId!==routeRequestId)return;
      const route=json.routes?.[0];
      if(!route)throw new Error('Маршрут не найден');
      if(routeLine)map.removeLayer(routeLine);
      if(routeFallbackLine){map.removeLayer(routeFallbackLine);routeFallbackLine=null;}
      routeLine=L.geoJSON(route.geometry,{style:{color:'#2563EB',weight:7,opacity:.9,lineCap:'round',lineJoin:'round'}}).addTo(map);
      routeMeta.textContent=`На машине: ${formatDistance(route.distance)} · ${formatDuration(route.duration)}`;
      map.fitBounds(routeLine.getBounds().pad(.12),{paddingTopLeft:[20,90],paddingBottomRight:[20,190],maxZoom:16});
      lastRouteOrigin=L.latLng(userLatLng.lat,userLatLng.lng);
      lastRouteAt=Date.now();
      status.textContent='Маршрут построен';
    }catch(err){
      if(requestId!==routeRequestId)return;
      if(routeLine){map.removeLayer(routeLine);routeLine=null;}
      if(routeFallbackLine)map.removeLayer(routeFallbackLine);
      routeFallbackLine=L.polyline([userLatLng,destination],{color:'#2563EB',weight:5,opacity:.8,dashArray:'8 8'}).addTo(map);
      routeMeta.textContent=`Не удалось получить дорожный маршрут. Показано направление: ${formatDistance(userLatLng.distanceTo(destination))}.`;
      map.fitBounds(routeFallbackLine.getBounds().pad(.2),{paddingTopLeft:[20,90],paddingBottomRight:[20,190],maxZoom:16});
      status.textContent='Дорожный маршрут недоступен — показано направление';
    }finally{
      if(requestId===routeRequestId){
        routeBtn.disabled=false;
        routeBtn.textContent='Маршрут';
      }
    }
  }

  locateBtn.onclick=startLocation;
  followBtn.onclick=()=>{
    followLocation=!followLocation;
    followBtn.classList.toggle('on',followLocation);
    if(followLocation&&userLatLng)map.setView(userLatLng,16);
  };
  routeBtn.onclick=()=>selectedItem&&buildRouteTo(selectedItem);
  clearRouteBtn.onclick=clearRoute;
  map.on('dragstart',()=>{followLocation=false;followBtn.classList.remove('on');});
  Q('handle').onclick=()=>sheet.classList.toggle('open');
  Q('toggle').onclick=()=>sheet.classList.toggle('open');

  select('d27');
  setTimeout(()=>map.invalidateSize(),250);
})();
