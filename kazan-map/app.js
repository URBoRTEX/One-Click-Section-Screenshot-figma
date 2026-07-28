(()=>{
  const D=window.KAZAN,Q=id=>document.getElementById(id),status=Q('status');
  if(!D||!window.L){status.textContent='Не удалось загрузить карту. Обновите страницу.';return}
  const tabs=Q('tabs'),sheet=Q('sheet'),list=Q('list'),title=Q('title'),subtitle=Q('subtitle'),locateBtn=Q('locateBtn'),followBtn=Q('followBtn'),toggleBtn=Q('toggle');
  const labels={all:['Все','Все точки и варианты'],d27:['27 июля','Баумана и развлечения'],d28:['28 июля','Кабан и Старо-Татарская слобода'],d29:['29 июля','Голубые озёра и Казанка'],d30:['30 июля','Кремль и набережная'],d31:['31 июля','Парки и арт-пространства'],backup:['Дождь','Океанариум'],yosh:['Йошкар-Ола','Отдельный день']},order=['all','d27','d28','d29','d30','d31','backup','yosh'];
  const mobile=matchMedia('(max-width:799px)').matches;
  const uiStyle=document.createElement('style');
  uiStyle.textContent='.route-card{display:none!important}.sheet.has-selection{--peek:126px!important}.inline-route-info{margin-top:8px;padding:8px 10px;border-radius:10px;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:700;line-height:1.3}.active-route-stop{box-shadow:inset 0 0 0 1px #bfdbfe}.mini-clear{border:0;border-radius:8px;background:#e8edf3;color:#111827;padding:7px 10px;font-size:11px;font-weight:800}.mini-route:disabled{opacity:.55}';
  document.head.appendChild(uiStyle);
  let active='d27',selectedItem=null,selectedMarker=null,userLatLng=null,userMarker=null,accuracyCircle=null,watchId=null,followLocation=true,routeLine=null,routeFallbackLine=null,routeRequestId=0,lastRouteOrigin=null,lastRouteAt=0,pendingRouteItem=null,statusTimer=null,activeRouteItem=null,routeSummary='',routeBusy=false;
  function setStatus(text,sticky=false){status.textContent=text;status.classList.remove('hide');clearTimeout(statusTimer);if(!sticky)statusTimer=setTimeout(()=>status.classList.add('hide'),2600)}
  function setSheetOpen(open){sheet.classList.toggle('open',open);toggleBtn.textContent=open?'Свернуть':'Открыть';toggleBtn.setAttribute('aria-expanded',String(open));if(open)setTimeout(()=>map.invalidateSize(),80)}
  const map=L.map('map',{zoomControl:true,preferCanvas:true,fadeAnimation:false,markerZoomAnimation:false,zoomAnimation:!mobile}).setView([55.797,49.122],12);
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap',updateWhenIdle:mobile,keepBuffer:1}).addTo(map);
  tiles.once('load',()=>setStatus('Карта готова'));
  tiles.on('tileerror',()=>setStatus('Часть карты не загрузилась. Проверьте интернет.',true));
  const layers={},markers=[];order.slice(1).concat('stay').forEach(d=>layers[d]=L.layerGroup());
  const color=d=>D.days[d]?.[2]||'#111827';
  function icon(x,selected=false){const fill=selected?'#ef4444':color(x[1]),label=x[1]==='stay'?'♥':x[2];return L.divIcon({className:'marker',html:`<i class="${selected?'selected':''}" style="background:${fill}">${label}</i>`,iconSize:selected?[40,40]:[32,32],iconAnchor:selected?[20,20]:[16,16],popupAnchor:[0,selected?-18:-13]})}
  function externalNav(x){const yandex=`https://yandex.ru/maps/?rtext=${userLatLng?`${userLatLng.lat},${userLatLng.lng}`:''}~${x[6]},${x[7]}&rtt=auto`,google=`https://www.google.com/maps/dir/?api=1&destination=${x[6]},${x[7]}${userLatLng?`&origin=${userLatLng.lat},${userLatLng.lng}`:''}`,gis=`https://2gis.ru/kazan/routeSearch/rsType/car/to/${x[7]},${x[6]}`;return `<div class="links"><a target="_blank" rel="noopener" href="${yandex}">Яндекс</a><a target="_blank" rel="noopener" href="${google}">Google</a><a target="_blank" rel="noopener" href="${gis}">2ГИС</a></div>`}
  function popupHtml(x){return `<b>${x[2]}. ${x[4]}</b><br><small>${x[3]} · ${x[5]||''}</small>${x[8]?`<div class="warn">${x[8]}</div>`:''}<button class="popup-route">Маршрут сюда</button>${externalNav(x)}`}
  D.items.forEach(x=>{const m=L.marker([x[6],x[7]],{icon:icon(x),riseOnHover:true}).bindPopup(popupHtml(x));if(!mobile)m.bindTooltip(`${x[2]}. ${x[4]}`,{permanent:true,direction:'top',offset:[0,-17],className:'lab'});m.on('click',()=>selectPin(x,m));m.on('popupopen',e=>{const b=e.popup.getElement()?.querySelector('.popup-route');if(b)b.onclick=()=>buildRouteTo(x)});m.addTo(layers[x[1]]);markers.push([x,m])});
  const byKey=Object.fromEntries(D.items.map(x=>[x[0],x]));
  Object.entries(D.routes).forEach(([d,keys])=>L.polyline(keys.map(k=>[byKey[k][6],byKey[k][7]]),{color:color(d),weight:4,opacity:.5,dashArray:'7 8',interactive:false}).addTo(layers[d]));
  D.areas.forEach(a=>L.circle(a.center,{radius:a.radius,color:color(a.day),weight:2,fillColor:color(a.day),fillOpacity:.06,opacity:.32,interactive:false}).addTo(layers[a.day]));
  const visibleItems=()=>D.items.filter(x=>active==='all'?x[1]!=='yosh':x[1]===active);
  function renderTabs(){tabs.innerHTML='';order.forEach(d=>{const b=document.createElement('button');b.textContent=labels[d][0];b.className=d===active?'on':'';b.onclick=()=>selectDay(d);tabs.appendChild(b)})}
  function renderList(){
    const frag=document.createDocumentFragment();
    list.innerHTML='';
    visibleItems().forEach(x=>{
      const el=document.createElement('div'),chosen=selectedItem===x,isRoute=activeRouteItem===x,hasBuiltRoute=isRoute&&Boolean(routeLine||routeFallbackLine);
      el.className=`stop${chosen?' selected-stop':''}${isRoute?' active-route-stop':''}`;
      const routeInfo=isRoute&&routeSummary?`<div class="inline-route-info">${routeSummary}</div>`:'';
      const clearButton=hasBuiltRoute?'<button class="mini-clear" type="button">Сбросить</button>':'';
      el.innerHTML=`<div class="n" style="background:${chosen?'#ef4444':color(x[1])}">${x[2]}</div><div><b>${x[4]}</b><span>${x[3]} · ${x[5]||'Открытая территория'}</span>${routeInfo}<div class="row-actions"><button class="mini-route" type="button" ${routeBusy&&isRoute?'disabled':''}>${routeBusy&&isRoute?'Строю…':hasBuiltRoute?'Перестроить':'Маршрут'}</button>${clearButton}</div></div>`;
      el.onclick=e=>{
        if(e.target.closest('a'))return;
        if(e.target.classList.contains('mini-clear')){e.stopPropagation();clearRoute();return}
        const m=markers.find(z=>z[0]===x)?.[1];
        selectPin(x,m);
        if(e.target.classList.contains('mini-route')){e.stopPropagation();buildRouteTo(x);return}
        map.setView([x[6],x[7]],16);m?.openPopup();setSheetOpen(false)
      };
      frag.appendChild(el)
    });
    list.appendChild(frag)
  }
  function updateLayers(){Object.entries(layers).forEach(([d,l])=>{const on=d==='stay'||(active==='all'?d!=='yosh':d===active);if(on&&!map.hasLayer(l))l.addTo(map);if(!on&&map.hasLayer(l))map.removeLayer(l)})}
  function fit(){const a=visibleItems().concat(D.items.filter(x=>x[1]==='stay'));if(!a.length)return;map.fitBounds(L.latLngBounds(a.map(x=>[x[6],x[7]])).pad(.12),{maxZoom:active==='all'?11:14,paddingTopLeft:[20,80],paddingBottomRight:[20,145]})}
  function selectDay(d){active=d;title.textContent=labels[d][0];subtitle.textContent=labels[d][1];renderTabs();renderList();updateLayers();requestAnimationFrame(()=>setTimeout(fit,30))}
  function selectPin(x,m){if(selectedMarker&&selectedItem){selectedMarker.setIcon(icon(selectedItem,false));if(mobile)selectedMarker.closeTooltip()}selectedItem=x;selectedMarker=m||markers.find(z=>z[0]===x)?.[1]||null;if(selectedMarker){selectedMarker.setIcon(icon(x,true));if(mobile){selectedMarker.unbindTooltip().bindTooltip(x[4],{permanent:true,direction:'top',offset:[0,-21],className:'lab'}).openTooltip()}}renderList()}
  function createUserMarker(latlng,accuracy){const userIcon=L.divIcon({className:'user-location',html:'<span><i></i></span>',iconSize:[28,28],iconAnchor:[14,14]});if(!userMarker){userMarker=L.marker(latlng,{icon:userIcon,zIndexOffset:2000}).addTo(map).bindPopup('Вы находитесь здесь');accuracyCircle=L.circle(latlng,{radius:accuracy||0,color:'#2563eb',weight:1,fillColor:'#3b82f6',fillOpacity:.1,opacity:.35,interactive:false}).addTo(map)}else{userMarker.setLatLng(latlng);accuracyCircle.setLatLng(latlng).setRadius(accuracy||0)}}
  function startLocation(){if(!navigator.geolocation){setStatus('GPS недоступен в этом браузере',true);return}if(watchId!==null){followLocation=true;followBtn.classList.add('on');if(userLatLng)map.setView(userLatLng,16);return}setStatus('Запрашиваю доступ к GPS…',true);locateBtn.classList.add('loading');watchId=navigator.geolocation.watchPosition(pos=>{const next=L.latLng(pos.coords.latitude,pos.coords.longitude);userLatLng=next;createUserMarker(next,pos.coords.accuracy);locateBtn.classList.remove('loading');locateBtn.classList.add('active');setStatus(`GPS: точность ±${Math.round(pos.coords.accuracy)} м`);if(followLocation)map.setView(next,Math.max(map.getZoom(),16));if(pendingRouteItem){const p=pendingRouteItem;pendingRouteItem=null;buildRouteTo(p)}else if(activeRouteItem&&shouldRefreshRoute(next))buildRouteTo(activeRouteItem,true)},err=>{locateBtn.classList.remove('loading');watchId=null;setStatus(({1:'Доступ к геолокации запрещён',2:'Не удалось определить местоположение',3:'GPS отвечает слишком долго'})[err.code]||'Ошибка GPS',true)},{enableHighAccuracy:true,maximumAge:5000,timeout:15000})}
  function shouldRefreshRoute(next){return lastRouteOrigin&&next.distanceTo(lastRouteOrigin)>100&&Date.now()-lastRouteAt>15000}
  function clearRoute(){routeRequestId++;if(routeLine){map.removeLayer(routeLine);routeLine=null}if(routeFallbackLine){map.removeLayer(routeFallbackLine);routeFallbackLine=null}lastRouteOrigin=null;lastRouteAt=0;pendingRouteItem=null;activeRouteItem=null;routeSummary='';routeBusy=false;renderList();setStatus('Маршрут сброшен')}
  const formatDistance=m=>m<1000?`${Math.round(m)} м`:`${(m/1000).toFixed(m<10000?1:0)} км`;
  function formatDuration(sec){const min=Math.max(1,Math.round(sec/60));return min<60?`${min} мин`:`${Math.floor(min/60)} ч${min%60?` ${min%60} мин`:''}`}
  async function buildRouteTo(x,silent=false){
    selectPin(x,markers.find(z=>z[0]===x)?.[1]);
    activeRouteItem=x;
    routeBusy=true;
    routeSummary='Подготовка маршрута…';
    renderList();
    if(!userLatLng){pendingRouteItem=x;startLocation();routeSummary='Разрешите доступ к GPS — маршрут построится автоматически';routeBusy=false;renderList();return}
    const id=++routeRequestId,destination=L.latLng(x[6],x[7]);
    routeSummary='Строю маршрут…';renderList();
    if(!silent)setStatus('Строю маршрут…',true);
    try{
      const url=`https://router.project-osrm.org/route/v1/driving/${userLatLng.lng},${userLatLng.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&steps=false`,res=await fetch(url,{mode:'cors'});
      if(!res.ok)throw new Error();
      const json=await res.json();if(id!==routeRequestId)return;
      const route=json.routes?.[0];if(!route)throw new Error();
      if(routeLine)map.removeLayer(routeLine);if(routeFallbackLine){map.removeLayer(routeFallbackLine);routeFallbackLine=null}
      routeLine=L.geoJSON(route.geometry,{style:{color:'#2563eb',weight:7,opacity:.9,lineCap:'round',lineJoin:'round'}}).addTo(map);
      routeSummary=`По дорогам: ${formatDistance(route.distance)} · ${formatDuration(route.duration)}`;
      map.fitBounds(routeLine.getBounds().pad(.12),{paddingTopLeft:[20,90],paddingBottomRight:[20,155],maxZoom:16});
      lastRouteOrigin=L.latLng(userLatLng.lat,userLatLng.lng);lastRouteAt=Date.now();setStatus('Маршрут построен')
    }catch{
      if(id!==routeRequestId)return;
      if(routeLine){map.removeLayer(routeLine);routeLine=null}if(routeFallbackLine)map.removeLayer(routeFallbackLine);
      routeFallbackLine=L.polyline([userLatLng,destination],{color:'#2563eb',weight:5,opacity:.8,dashArray:'8 8'}).addTo(map);
      routeSummary=`Направление: ${formatDistance(userLatLng.distanceTo(destination))}`;
      map.fitBounds(routeFallbackLine.getBounds().pad(.2),{paddingTopLeft:[20,90],paddingBottomRight:[20,155],maxZoom:16});
      setStatus('Дорожный маршрут недоступен — показано направление')
    }finally{
      if(id===routeRequestId){routeBusy=false;renderList()}
    }
  }
  locateBtn.onclick=startLocation;
  followBtn.onclick=()=>{followLocation=!followLocation;followBtn.classList.toggle('on',followLocation);if(followLocation&&userLatLng)map.setView(userLatLng,16)};
  map.on('dragstart',()=>{followLocation=false;followBtn.classList.remove('on')});
  Q('handle').onclick=()=>setSheetOpen(!sheet.classList.contains('open'));
  toggleBtn.onclick=()=>setSheetOpen(!sheet.classList.contains('open'));
  selectDay('d27');setTimeout(()=>map.invalidateSize(),120);
})();
