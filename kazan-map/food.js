(()=>{
  'use strict';

  let app=null,map=null,layer=null,toolButton=null,panel=null,enabled=false,loading=false,places=[],loadedBounds=null,activeCategory='all',source='';
  const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.nchc.org.tw/api/interpreter'];
  const cuisineNames={russian:'Русская',regional:'Местная',tatar:'Татарская',italian:'Итальянская',pizza:'Пицца',japanese:'Японская',sushi:'Суши',chinese:'Китайская',asian:'Азиатская',korean:'Корейская',georgian:'Грузинская',caucasian:'Кавказская',uzbek:'Узбекская',turkish:'Турецкая',indian:'Индийская',mexican:'Мексиканская',burger:'Бургеры',coffee_shop:'Кофейня',coffee:'Кофе',bakery:'Выпечка',dessert:'Десерты',ice_cream:'Мороженое',vegetarian:'Вегетарианская',vegan:'Веганская',seafood:'Морепродукты',steak_house:'Стейки',kebab:'Кебаб',international:'Международная'};
  const categories=[
    ['all','Все'],['tatar','Татарская'],['coffee','Кофейни'],['restaurant','Рестораны'],['fast','Быстро поесть'],['italian','Итальянская / пицца'],['asian','Азиатская / японская'],['georgian','Грузинская / кавказская'],['dessert','Десерты / выпечка'],['vegetarian','Вегетарианская'],['other','Другое']
  ];

  const fallback=[
    {name:'Дом татарской кулинарии',lat:55.7910,lng:49.1195,amenity:'restaurant',cuisines:['Татарская'],cuisineKeys:['tatar'],category:'tatar'},
    {name:'Татарская усадьба',lat:55.7780,lng:49.1160,amenity:'restaurant',cuisines:['Татарская'],cuisineKeys:['tatar'],category:'tatar'},
    {name:'Тюбетей',lat:55.7891,lng:49.1186,amenity:'fast_food',cuisines:['Татарская'],cuisineKeys:['tatar'],category:'tatar'},
    {name:'Чирэм',lat:55.8003,lng:49.1156,amenity:'restaurant',cuisines:['Татарская'],cuisineKeys:['tatar'],category:'tatar'},
    {name:'Приют холостяка',lat:55.7954,lng:49.1114,amenity:'restaurant',cuisines:[],cuisineKeys:[],category:'restaurant'},
    {name:'Пашмир',lat:55.7862,lng:49.1010,amenity:'restaurant',cuisines:['Узбекская'],cuisineKeys:['uzbek'],category:'restaurant'},
    {name:'Skuratov Coffee',lat:55.7906,lng:49.1207,amenity:'cafe',cuisines:['Кофе'],cuisineKeys:['coffee'],category:'coffee'},
    {name:'Surf Coffee',lat:55.7920,lng:49.1189,amenity:'cafe',cuisines:['Кофе'],cuisineKeys:['coffee'],category:'coffee'},
    {name:'Сказка',lat:55.7902,lng:49.1167,amenity:'cafe',cuisines:['Десерты'],cuisineKeys:['dessert'],category:'dessert'},
    {name:'Додо Пицца',lat:55.7886,lng:49.1219,amenity:'fast_food',cuisines:['Пицца'],cuisineKeys:['pizza'],category:'italian'},
    {name:'Хинкальная',lat:55.7884,lng:49.1240,amenity:'restaurant',cuisines:['Грузинская'],cuisineKeys:['georgian'],category:'georgian'},
    {name:'OmNomNom',lat:55.7944,lng:49.1262,amenity:'cafe',cuisines:['Вегетарианская'],cuisineKeys:['vegetarian'],category:'vegetarian'}
  ];

  const style=document.createElement('style');
  style.textContent=`
    .food-panel{position:fixed;z-index:1800;left:10px;right:68px;top:126px;display:none;padding:13px;border-radius:17px;background:rgba(255,255,255,.98);box-shadow:0 12px 34px rgba(15,23,42,.22);backdrop-filter:blur(14px);max-height:58vh;overflow:auto}
    .food-panel.open{display:block}.food-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.food-head h3{margin:0;font-size:16px}.food-head p{margin:3px 0 0;color:#667085;font-size:11px}.food-close{width:34px;height:34px;border:0;border-radius:10px;background:#eef2f6;font-size:20px}
    .food-segments{display:flex;gap:6px;overflow-x:auto;padding:10px 0 3px;scrollbar-width:none}.food-segments::-webkit-scrollbar{display:none}.food-segment{flex:0 0 auto;border:0;border-radius:999px;padding:8px 10px;background:#eef2f6;color:#344054;font-size:10px;font-weight:800}.food-segment.active{background:#f97316;color:#fff}
    .food-actions{display:flex;gap:7px;margin-top:8px}.food-actions button{border:0;border-radius:10px;background:#f97316;color:#fff;padding:9px 11px;font-size:11px;font-weight:800}.food-actions .food-hide{background:#eef2f6;color:#344054}
    .food-note{margin:8px 0 0;color:#667085;font-size:9px;line-height:1.35}.food-marker{background:none;border:0}.food-marker i{display:grid;place-items:center;width:31px;height:31px;border-radius:50%;background:#f97316;border:3px solid #fff;box-shadow:0 5px 12px rgba(15,23,42,.3);font-style:normal;font-size:14px}
    .food-popup{min-width:230px}.food-popup h3{margin:0 0 5px;font-size:15px}.food-popup p{margin:4px 0;color:#475467;font-size:11px;line-height:1.35}.food-popup strong{color:#111827}.food-links{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.food-links a{padding:6px 8px;border-radius:8px;background:#eef2f6;color:#111827;text-decoration:none;font-size:10px;font-weight:800}
    @media(min-width:800px){.food-panel{left:414px;right:auto;width:390px;top:130px}}
  `;
  document.head.appendChild(style);

  function createUi(){
    const tools=document.querySelector('.map-tools');
    if(tools&&!document.getElementById('foodToolBtn')){toolButton=document.createElement('button');toolButton.id='foodToolBtn';toolButton.className='map-tool';toolButton.type='button';toolButton.textContent='🍽';toolButton.title='Где поесть';toolButton.setAttribute('aria-label','Показать места, где можно поесть');tools.appendChild(toolButton);toolButton.onclick=toggle;}
    panel=document.createElement('section');panel.className='food-panel';panel.innerHTML=`
      <div class="food-head"><div><h3>Где поесть</h3><p id="foodSubtitle">Нажмите категорию</p></div><button class="food-close" type="button" aria-label="Закрыть">×</button></div>
      <div class="food-segments" id="foodSegments"></div>
      <div class="food-actions"><button id="foodReload" type="button">Обновить места</button><button class="food-hide" id="foodHide" type="button">Скрыть пины</button></div>
      <p class="food-note">Категории формируются по типу заведения, cuisine и названию. Рейтинг и средний чек показываются только когда они есть в открытых данных; ссылки на карточки карт всегда доступны.</p>`;
    document.body.appendChild(panel);
    panel.querySelector('.food-close').onclick=()=>panel.classList.remove('open');
    panel.querySelector('#foodReload').onclick=()=>loadPlaces(true);
    panel.querySelector('#foodHide').onclick=()=>{enabled=false;toolButton.classList.remove('active');if(layer)map.removeLayer(layer);panel.classList.remove('open');};
    renderSegments();
  }

  function renderSegments(){
    const root=panel.querySelector('#foodSegments');root.innerHTML='';
    categories.forEach(([key,label])=>{const count=places.filter(place=>key==='all'||place.category===key).length,button=document.createElement('button');button.type='button';button.className=`food-segment${activeCategory===key?' active':''}`;button.textContent=count?`${label} · ${count}`:label;button.onclick=()=>{activeCategory=key;renderSegments();render();};root.appendChild(button);});
  }

  async function toggle(){enabled=!enabled;toolButton.classList.toggle('active',enabled);panel.classList.toggle('open',enabled);if(enabled){if(!places.length||needsReload())await loadPlaces();else render();}else if(layer)map.removeLayer(layer);}
  function needsReload(){if(!loadedBounds)return true;return !loadedBounds.pad(-.25).contains(map.getCenter());}
  function queryBounds(){const current=map.getBounds(),latSpan=Math.min(.20,Math.max(.045,current.getNorth()-current.getSouth())),lngSpan=Math.min(.30,Math.max(.065,current.getEast()-current.getWest())),center=map.getCenter();return L.latLngBounds([center.lat-latSpan/2,center.lng-lngSpan/2],[center.lat+latSpan/2,center.lng+lngSpan/2]);}

  async function fetchWithTimeout(url,timeout=14000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{const response=await fetch(url,{method:'GET',mode:'cors',cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);return await response.json();}finally{clearTimeout(timer);}}

  async function loadPlaces(force=false){
    if(loading)return;if(!force&&!needsReload()&&places.length){render();return;}
    loading=true;const button=panel.querySelector('#foodReload');button.disabled=true;button.textContent='Загрузка…';panel.querySelector('#foodSubtitle').textContent='Ищу кафе и рестораны…';
    try{
      const bounds=queryBounds(),south=bounds.getSouth().toFixed(6),west=bounds.getWest().toFixed(6),north=bounds.getNorth().toFixed(6),east=bounds.getEast().toFixed(6),query=`[out:json][timeout:20];(nwr["amenity"~"^(restaurant|cafe|fast_food|food_court|ice_cream)$"](${south},${west},${north},${east}););out center tags 300;`;
      let json=null;
      for(const endpoint of endpoints){try{json=await fetchWithTimeout(`${endpoint}?data=${encodeURIComponent(query)}`);if(json)break;}catch(_){}}
      const live=(json?.elements||[]).map(normalize).filter(place=>place.name&&Number.isFinite(place.lat)&&Number.isFinite(place.lng));
      if(live.length){places=dedupe(live);source='OpenStreetMap';loadedBounds=bounds;}else{places=fallback.map((place,index)=>({...place,id:`fallback-${index}`,address:'',opening:'',rating:'',averageCheck:'',website:'',phone:'',fallback:true}));source='резервный список';loadedBounds=bounds;}
      activeCategory='all';renderSegments();render();
    }catch(_){places=fallback.map((place,index)=>({...place,id:`fallback-${index}`,address:'',opening:'',rating:'',averageCheck:'',website:'',phone:'',fallback:true}));source='резервный список';activeCategory='all';renderSegments();render();}
    finally{loading=false;button.disabled=false;button.textContent='Обновить места';}
  }

  function normalize(element){
    const tags=element.tags||{},lat=element.lat??element.center?.lat,lng=element.lon??element.center?.lon,rawCuisine=String(tags.cuisine||'').split(/[;,]/).map(value=>value.trim().toLowerCase()).filter(Boolean),cuisines=rawCuisine.map(value=>cuisineNames[value]||capitalize(value.replaceAll('_',' '))),address=[tags['addr:street'],tags['addr:housenumber']].filter(Boolean).join(', '),place={id:`${element.type}-${element.id}`,lat:Number(lat),lng:Number(lng),name:tags['name:ru']||tags.name||'',amenity:tags.amenity||'',cuisines,cuisineKeys:rawCuisine,address,opening:tags.opening_hours||'',rating:tags.rating||tags['contact:rating']||'',averageCheck:tags.average_check||tags.avg_check||tags.price||tags.charge||'',website:tags.website||tags['contact:website']||'',phone:tags.phone||tags['contact:phone']||''};place.category=classify(place);return place;
  }

  function classify(place){
    const keys=place.cuisineKeys.join(' '),name=place.name.toLowerCase();
    if(/tatar|татар|кыстыб|тюбетей|эчпоч|чак.?чак/.test(`${keys} ${name}`))return'tatar';
    if(/coffee|coffee_shop|кофе|кофейн|surf|skuratov/.test(`${keys} ${name}`))return'coffee';
    if(/pizza|italian|италь|пицц/.test(`${keys} ${name}`))return'italian';
    if(/japanese|sushi|asian|chinese|korean|япон|суши|азиат|китай|корей|wok/.test(`${keys} ${name}`))return'asian';
    if(/georgian|caucasian|грузин|кавказ|хинкал|хачапур/.test(`${keys} ${name}`))return'georgian';
    if(/dessert|bakery|ice_cream|pastry|десерт|выпеч|кондитер|морож/.test(`${keys} ${name}`)||place.amenity==='ice_cream')return'dessert';
    if(/vegetarian|vegan|веган|вегетариан/.test(`${keys} ${name}`))return'vegetarian';
    if(place.amenity==='fast_food'||/burger|kebab|shawarma|бургер|шаурм|донер|фаст/.test(`${keys} ${name}`))return'fast';
    if(place.amenity==='restaurant')return'restaurant';
    return'other';
  }

  function dedupe(list){const seen=new Set();return list.filter(place=>{const key=`${place.name.toLowerCase()}|${place.lat.toFixed(4)}|${place.lng.toFixed(4)}`;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,300);}
  const capitalize=value=>value?value[0].toUpperCase()+value.slice(1):value;
  const typeName=amenity=>({restaurant:'Ресторан',cafe:'Кафе',fast_food:'Быстрое питание',food_court:'Фуд-корт',ice_cream:'Мороженое'})[amenity]||'Заведение';

  function render(){
    if(layer)map.removeLayer(layer);layer=L.layerGroup();const filtered=places.filter(place=>activeCategory==='all'||place.category===activeCategory);
    filtered.forEach(place=>{const icon=L.divIcon({className:'food-marker',html:'<i>🍴</i>',iconSize:[31,31],iconAnchor:[15,15],popupAnchor:[0,-13]});L.marker([place.lat,place.lng],{icon,riseOnHover:true}).bindPopup(popup(place)).addTo(layer);});
    if(enabled)layer.addTo(map);panel.querySelector('#foodSubtitle').textContent=`${filtered.length} мест · ${source||'открытые данные'}`;renderSegments();
  }

  function popup(place){
    const query=encodeURIComponent(`${place.name} Казань`),yandex=`https://yandex.ru/maps/?text=${query}`,google=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name+' '+place.lat+','+place.lng)}`,gis=`https://2gis.ru/kazan/search/${query}`,cuisine=place.cuisines.length?place.cuisines.join(', '):categoryLabel(place.category),rating=place.rating||'смотреть в карточке карты',check=place.averageCheck||'смотреть в карточке карты';
    return `<div class="food-popup"><h3>${escapeHtml(place.name)}</h3><p><strong>${typeName(place.amenity)}</strong> · ${escapeHtml(cuisine)}</p>${place.address?`<p>${escapeHtml(place.address)}</p>`:''}<p>Рейтинг: <strong>${escapeHtml(String(rating))}</strong><br>Средний чек: <strong>${escapeHtml(String(check))}</strong></p>${place.opening?`<p>Режим: ${escapeHtml(place.opening)}</p>`:''}${place.fallback?'<p>Резервная точка: уточните адрес в выбранной карте.</p>':''}<div class="food-links"><a target="_blank" rel="noopener" href="${yandex}">Яндекс</a><a target="_blank" rel="noopener" href="${google}">Google</a><a target="_blank" rel="noopener" href="${gis}">2ГИС</a></div></div>`;
  }
  function categoryLabel(key){return categories.find(item=>item[0]===key)?.[1]||'Кухня не указана';}
  function escapeHtml(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}

  function init(application){if(app)return;app=application;map=app.map;createUi();map.on('moveend',()=>{if(enabled&&needsReload())panel.querySelector('#foodSubtitle').textContent='Область изменилась — нажмите «Обновить места»';});}
  window.addEventListener('kazan:app-ready',event=>init(event.detail));
  if(window.KAZAN_APP)init(window.KAZAN_APP);
})();
