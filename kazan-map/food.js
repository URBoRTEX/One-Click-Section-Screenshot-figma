(()=>{
  'use strict';

  let app=null,map=null,layer=null,toolButton=null,panel=null,enabled=false,loading=false,places=[],loadedBounds=null,cuisineFilter='all';
  const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
  const cuisineNames={russian:'Русская',regional:'Местная',tatar:'Татарская',italian:'Итальянская',pizza:'Пицца',japanese:'Японская',sushi:'Суши',chinese:'Китайская',asian:'Азиатская',korean:'Корейская',georgian:'Грузинская',caucasian:'Кавказская',uzbek:'Узбекская',turkish:'Турецкая',indian:'Индийская',mexican:'Мексиканская',burger:'Бургеры',coffee_shop:'Кофейня',coffee:'Кофе',bakery:'Выпечка',dessert:'Десерты',ice_cream:'Мороженое',vegetarian:'Вегетарианская',vegan:'Веганская',seafood:'Морепродукты',steak_house:'Стейки',kebab:'Кебаб',international:'Международная'};

  const style=document.createElement('style');
  style.textContent=`
    .food-panel{position:fixed;z-index:1800;left:10px;right:68px;top:126px;display:none;padding:13px;border-radius:17px;background:rgba(255,255,255,.98);box-shadow:0 12px 34px rgba(15,23,42,.22);backdrop-filter:blur(14px)}
    .food-panel.open{display:block}.food-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.food-head h3{margin:0;font-size:16px}.food-head p{margin:3px 0 0;color:#667085;font-size:11px}.food-close{width:34px;height:34px;border:0;border-radius:10px;background:#eef2f6;font-size:20px}
    .food-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;margin-top:10px}.food-controls select{min-width:0;border:1px solid #d0d5dd;border-radius:10px;padding:9px 10px;background:#fff;font-size:12px}.food-controls button{border:0;border-radius:10px;background:#f97316;color:#fff;padding:9px 11px;font-size:11px;font-weight:800}
    .food-note{margin:8px 0 0;color:#667085;font-size:9px;line-height:1.35}.food-marker{background:none;border:0}.food-marker i{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#f97316;border:3px solid #fff;box-shadow:0 5px 12px rgba(15,23,42,.3);font-style:normal;font-size:14px}
    .food-popup{min-width:230px}.food-popup h3{margin:0 0 5px;font-size:15px}.food-popup p{margin:4px 0;color:#475467;font-size:11px;line-height:1.35}.food-popup strong{color:#111827}.food-links{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.food-links a{padding:6px 8px;border-radius:8px;background:#eef2f6;color:#111827;text-decoration:none;font-size:10px;font-weight:800}
    @media(min-width:800px){.food-panel{left:414px;right:auto;width:360px;top:130px}}
  `;
  document.head.appendChild(style);

  function createUi(){
    const tools=document.querySelector('.map-tools');
    if(tools&&!document.getElementById('foodToolBtn')){
      toolButton=document.createElement('button');toolButton.id='foodToolBtn';toolButton.className='map-tool';toolButton.type='button';toolButton.textContent='🍽';toolButton.title='Где поесть';toolButton.setAttribute('aria-label','Показать места, где можно поесть');tools.appendChild(toolButton);toolButton.onclick=toggle;
    }
    panel=document.createElement('section');panel.className='food-panel';panel.innerHTML=`
      <div class="food-head"><div><h3>Где поесть</h3><p id="foodSubtitle">Места в видимой области карты</p></div><button class="food-close" type="button" aria-label="Закрыть">×</button></div>
      <div class="food-controls"><select id="foodCuisine"><option value="all">Все кухни</option></select><button id="foodReload" type="button">Обновить</button></div>
      <p class="food-note">Название, тип кухни и режим берутся из OpenStreetMap. Рейтинг и средний чек показываются, когда они указаны владельцами данных; для полного рейтинга коммерческих карт потребуется отдельный Places API-ключ.</p>`;
    document.body.appendChild(panel);
    panel.querySelector('.food-close').onclick=()=>panel.classList.remove('open');
    panel.querySelector('#foodReload').onclick=()=>loadPlaces(true);
    panel.querySelector('#foodCuisine').onchange=event=>{cuisineFilter=event.target.value;render();};
  }

  async function toggle(){enabled=!enabled;toolButton.classList.toggle('active',enabled);panel.classList.toggle('open',enabled);if(enabled){if(!places.length||needsReload())await loadPlaces();else render();}else if(layer)map.removeLayer(layer);}
  function needsReload(){if(!loadedBounds)return true;return !loadedBounds.pad(-.25).contains(map.getCenter());}
  function queryBounds(){const current=map.getBounds(),latSpan=Math.min(.18,Math.max(.035,current.getNorth()-current.getSouth())),lngSpan=Math.min(.28,Math.max(.055,current.getEast()-current.getWest())),center=map.getCenter();return L.latLngBounds([center.lat-latSpan/2,center.lng-lngSpan/2],[center.lat+latSpan/2,center.lng+lngSpan/2]);}

  async function loadPlaces(force=false){
    if(loading)return;if(!force&&!needsReload()&&places.length){render();return;}
    loading=true;const button=panel.querySelector('#foodReload');button.disabled=true;button.textContent='Загрузка…';panel.querySelector('#foodSubtitle').textContent='Ищу кафе и рестораны…';
    try{
      const bounds=queryBounds(),south=bounds.getSouth().toFixed(6),west=bounds.getWest().toFixed(6),north=bounds.getNorth().toFixed(6),east=bounds.getEast().toFixed(6),query=`[out:json][timeout:25];(nwr["amenity"~"^(restaurant|cafe|fast_food|food_court)$"](${south},${west},${north},${east}););out center tags 350;`;
      let json=null,lastError=null;
      for(const endpoint of endpoints){try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:`data=${encodeURIComponent(query)}`});if(!response.ok)throw new Error(`HTTP ${response.status}`);json=await response.json();break;}catch(error){lastError=error;}}
      if(!json)throw lastError||new Error('Не удалось получить данные.');
      places=(json.elements||[]).map(normalize).filter(place=>place.name&&Number.isFinite(place.lat)&&Number.isFinite(place.lng)).slice(0,300);loadedBounds=bounds;fillCuisineOptions();render();
    }catch(error){panel.querySelector('#foodSubtitle').textContent='Не удалось загрузить места';alert('Список заведений временно не загрузился. Попробуйте ещё раз.');}
    finally{loading=false;button.disabled=false;button.textContent='Обновить';}
  }

  function normalize(element){
    const tags=element.tags||{},lat=element.lat??element.center?.lat,lng=element.lon??element.center?.lon,rawCuisine=String(tags.cuisine||'').split(/[;,]/).map(value=>value.trim()).filter(Boolean),cuisines=rawCuisine.map(value=>cuisineNames[value]||capitalize(value.replaceAll('_',' '))),address=[tags['addr:street'],tags['addr:housenumber']].filter(Boolean).join(', ');
    return{id:`${element.type}-${element.id}`,lat:Number(lat),lng:Number(lng),name:tags.name||tags['name:ru']||'',amenity:tags.amenity||'',cuisines,cuisineKeys:rawCuisine,address,opening:tags.opening_hours||'',rating:tags.rating||tags['contact:rating']||'',averageCheck:tags.average_check||tags.avg_check||tags.price||tags.charge||'',website:tags.website||tags['contact:website']||'',phone:tags.phone||tags['contact:phone']||''};
  }

  function capitalize(value){return value?value[0].toUpperCase()+value.slice(1):value;}
  function typeName(amenity){return({restaurant:'Ресторан',cafe:'Кафе',fast_food:'Быстрое питание',food_court:'Фуд-корт'})[amenity]||'Заведение';}

  function fillCuisineOptions(){
    const select=panel.querySelector('#foodCuisine'),selected=select.value,cuisines=[...new Set(places.flatMap(place=>place.cuisineKeys))].filter(Boolean).sort((a,b)=>(cuisineNames[a]||a).localeCompare(cuisineNames[b]||b,'ru'));
    select.innerHTML='<option value="all">Все кухни</option>';cuisines.forEach(key=>{const option=document.createElement('option');option.value=key;option.textContent=cuisineNames[key]||capitalize(key.replaceAll('_',' '));select.appendChild(option);});select.value=cuisines.includes(selected)?selected:'all';cuisineFilter=select.value;
  }

  function render(){
    if(layer)map.removeLayer(layer);layer=L.layerGroup();const filtered=places.filter(place=>cuisineFilter==='all'||place.cuisineKeys.includes(cuisineFilter));
    filtered.forEach(place=>{const icon=L.divIcon({className:'food-marker',html:'<i>🍴</i>',iconSize:[30,30],iconAnchor:[15,15],popupAnchor:[0,-13]});L.marker([place.lat,place.lng],{icon,riseOnHover:true}).bindPopup(popup(place)).addTo(layer);});
    if(enabled)layer.addTo(map);panel.querySelector('#foodSubtitle').textContent=`${filtered.length} мест в видимой области`;
  }

  function popup(place){
    const query=encodeURIComponent(`${place.name} Казань`),yandex=`https://yandex.ru/maps/?text=${query}`,google=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name+' '+place.lat+','+place.lng)}`,gis=`https://2gis.ru/kazan/search/${query}`,cuisine=place.cuisines.length?place.cuisines.join(', '):'не указана',rating=place.rating||'нет данных',check=place.averageCheck||'нет данных';
    return `<div class="food-popup"><h3>${escapeHtml(place.name)}</h3><p><strong>${typeName(place.amenity)}</strong> · кухня: ${escapeHtml(cuisine)}</p>${place.address?`<p>${escapeHtml(place.address)}</p>`:''}<p>Рейтинг: <strong>${escapeHtml(String(rating))}</strong><br>Средний чек: <strong>${escapeHtml(String(check))}</strong></p>${place.opening?`<p>Режим: ${escapeHtml(place.opening)}</p>`:''}<div class="food-links"><a target="_blank" rel="noopener" href="${yandex}">Яндекс</a><a target="_blank" rel="noopener" href="${google}">Google</a><a target="_blank" rel="noopener" href="${gis}">2ГИС</a></div></div>`;
  }

  function escapeHtml(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}

  function init(application){if(app)return;app=application;map=app.map;createUi();map.on('moveend',()=>{if(enabled&&needsReload())panel.querySelector('#foodSubtitle').textContent='Переместили карту — нажмите «Обновить»';});}
  window.addEventListener('kazan:app-ready',event=>init(event.detail));
  if(window.KAZAN_APP)init(window.KAZAN_APP);
})();
