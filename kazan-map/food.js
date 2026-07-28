(()=>{
  'use strict';

  const FILTER_KEY='kazan-food-filters-v2';
  const endpoints=[
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter'
  ];

  const cuisineNames={
    russian:'Русская',regional:'Местная',tatar:'Татарская',italian:'Итальянская',pizza:'Пицца',
    japanese:'Японская',sushi:'Суши',chinese:'Китайская',asian:'Азиатская',korean:'Корейская',
    georgian:'Грузинская',caucasian:'Кавказская',uzbek:'Узбекская',middle_eastern:'Восточная',
    turkish:'Турецкая',indian:'Индийская',mexican:'Мексиканская',burger:'Бургеры',
    coffee_shop:'Кофейня',coffee:'Кофе',bakery:'Выпечка',dessert:'Десерты',ice_cream:'Мороженое',
    vegetarian:'Вегетарианская',vegan:'Веганская',seafood:'Морепродукты',steak_house:'Стейки',
    kebab:'Кебаб',international:'Международная'
  };

  const categories=[
    ['all','Все кухни'],
    ['tatar','Татарская'],
    ['coffee','Кофейни'],
    ['italian','Итальянская / пицца'],
    ['asian','Азиатская / японская'],
    ['georgian','Грузинская / кавказская'],
    ['uzbek','Узбекская / восточная'],
    ['dessert','Десерты / выпечка'],
    ['vegetarian','Вегетарианская'],
    ['fast','Быстро поесть'],
    ['other','Другие кухни']
  ];

  const fallback=[
    {name:'Дом татарской кулинарии',lat:55.7910,lng:49.1195,amenity:'restaurant',cuisines:['Татарская'],cuisineKeys:['tatar'],category:'tatar'},
    {name:'Татарская усадьба',lat:55.7780,lng:49.1160,amenity:'restaurant',cuisines:['Татарская'],cuisineKeys:['tatar'],category:'tatar'},
    {name:'Тюбетей',lat:55.7891,lng:49.1186,amenity:'fast_food',cuisines:['Татарская'],cuisineKeys:['tatar'],category:'tatar'},
    {name:'Чирэм',lat:55.8003,lng:49.1156,amenity:'restaurant',cuisines:['Татарская'],cuisineKeys:['tatar'],category:'tatar'},
    {name:'Пашмир',lat:55.7862,lng:49.1010,amenity:'restaurant',cuisines:['Узбекская'],cuisineKeys:['uzbek'],category:'uzbek'},
    {name:'Skuratov Coffee',lat:55.7906,lng:49.1207,amenity:'cafe',cuisines:['Кофе'],cuisineKeys:['coffee'],category:'coffee'},
    {name:'Surf Coffee',lat:55.7920,lng:49.1189,amenity:'cafe',cuisines:['Кофе'],cuisineKeys:['coffee'],category:'coffee'},
    {name:'Сказка',lat:55.7902,lng:49.1167,amenity:'cafe',cuisines:['Десерты'],cuisineKeys:['dessert'],category:'dessert'},
    {name:'Додо Пицца',lat:55.7886,lng:49.1219,amenity:'fast_food',cuisines:['Пицца'],cuisineKeys:['pizza'],category:'italian'},
    {name:'Хинкальная',lat:55.7884,lng:49.1240,amenity:'restaurant',cuisines:['Грузинская'],cuisineKeys:['georgian'],category:'georgian'},
    {name:'OmNomNom',lat:55.7944,lng:49.1262,amenity:'cafe',cuisines:['Вегетарианская'],cuisineKeys:['vegetarian'],category:'vegetarian'},
    {name:'Приют холостяка',lat:55.7954,lng:49.1114,amenity:'restaurant',cuisines:[],cuisineKeys:[],category:'other'}
  ];

  let app=null;
  let map=null;
  let layer=null;
  let toolButton=null;
  let panel=null;
  let places=[];
  let loadedBounds=null;
  let source='';
  let loading=false;
  let pinsVisible=false;
  let appliedCategories=loadSelection();
  let draftCategories=new Set(appliedCategories);
  let loadPromise=null;

  const style=document.createElement('style');
  style.textContent=`
    .food-panel{position:fixed;z-index:1800;left:10px;right:68px;top:126px;display:none;padding:14px;border-radius:18px;background:rgba(255,255,255,.985);box-shadow:0 12px 34px rgba(15,23,42,.22);backdrop-filter:blur(14px);max-height:62vh;overflow:auto}
    .food-panel.open{display:block}
    .food-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
    .food-head h3{margin:0;font-size:18px;line-height:1.2}.food-head p{margin:4px 0 0;color:#667085;font-size:11px;line-height:1.35}
    .food-close{width:36px;height:36px;flex:0 0 auto;border:0;border-radius:11px;background:#eef2f6;color:#111827;font-size:21px}
    .food-label{margin:13px 0 7px;color:#344054;font-size:11px;font-weight:800}
    .food-segments{display:flex;gap:7px;overflow-x:auto;padding:1px 0 5px;scrollbar-width:none}.food-segments::-webkit-scrollbar{display:none}
    .food-segment{position:relative;flex:0 0 auto;border:0;border-radius:999px;padding:9px 11px;background:#eef2f6;color:#344054;font-size:10px;font-weight:800;box-shadow:inset 0 0 0 1px transparent}
    .food-segment.selected{background:#fff7ed;color:#c2410c;box-shadow:inset 0 0 0 1px #fdba74}
    .food-segment.selected:before{content:'✓';margin-right:5px}
    .food-apply{width:100%;margin-top:11px;border:0;border-radius:12px;background:#f97316;color:#fff;padding:12px 14px;font-size:13px;font-weight:900}
    .food-apply:disabled{opacity:.55}
    .food-secondary{display:flex;gap:7px;margin-top:8px}
    .food-secondary button{flex:1;border:0;border-radius:10px;background:#eef2f6;color:#344054;padding:9px 10px;font-size:10px;font-weight:800}
    .food-summary{margin:9px 0 0;padding:8px 10px;border-radius:10px;background:#f8fafc;color:#475467;font-size:10px;line-height:1.4}
    .food-note{margin:8px 0 0;color:#667085;font-size:9px;line-height:1.35}
    .food-marker{background:none;border:0}.food-marker i{display:grid;place-items:center;width:31px;height:31px;border-radius:50%;background:#f97316;border:3px solid #fff;box-shadow:0 5px 12px rgba(15,23,42,.3);font-style:normal;font-size:14px}
    .food-popup{min-width:230px}.food-popup h3{margin:0 0 5px;font-size:15px}.food-popup p{margin:4px 0;color:#475467;font-size:11px;line-height:1.35}.food-popup strong{color:#111827}.food-links{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.food-links a{padding:6px 8px;border-radius:8px;background:#eef2f6;color:#111827;text-decoration:none;font-size:10px;font-weight:800}
    @media(min-width:800px){.food-panel{left:414px;right:auto;width:410px;top:130px}}
  `;
  document.head.appendChild(style);

  function loadSelection(){
    try{
      const saved=JSON.parse(localStorage.getItem(FILTER_KEY)||'[]');
      const valid=new Set(categories.map(item=>item[0]));
      const values=Array.isArray(saved)?saved.filter(value=>valid.has(value)):[];
      if(!values.length)return new Set(['all']);
      if(values.includes('all'))return new Set(['all']);
      return new Set(values);
    }catch(_){
      return new Set(['all']);
    }
  }

  function saveSelection(){
    try{localStorage.setItem(FILTER_KEY,JSON.stringify([...appliedCategories]));}catch(_){}
  }

  function createUi(){
    const tools=document.querySelector('.map-tools');
    if(tools&&!document.getElementById('foodToolBtn')){
      toolButton=document.createElement('button');
      toolButton.id='foodToolBtn';
      toolButton.className='map-tool';
      toolButton.type='button';
      toolButton.textContent='🍽';
      toolButton.title='Выбрать кухни';
      toolButton.setAttribute('aria-label','Выбрать кухни и показать заведения');
      tools.appendChild(toolButton);
      toolButton.onclick=openPanel;
    }

    panel=document.createElement('section');
    panel.className='food-panel';
    panel.innerHTML=`
      <div class="food-head">
        <div><h3>Выберите кухни</h3><p id="foodSubtitle">Можно выбрать несколько вариантов</p></div>
        <button class="food-close" type="button" aria-label="Закрыть">×</button>
      </div>
      <div class="food-label">Что показать на карте</div>
      <div class="food-segments" id="foodSegments"></div>
      <button class="food-apply" id="foodApply" type="button">Показать на карте</button>
      <div class="food-secondary">
        <button id="foodSelectAll" type="button">Выбрать все</button>
        <button id="foodHide" type="button">Скрыть пины</button>
        <button id="foodReload" type="button">Обновить места</button>
      </div>
      <div class="food-summary" id="foodSummary">Фильтры ещё не применены</div>
      <p class="food-note">После нажатия «Показать на карте» окно закроется. Повторное нажатие на 🍽 откроет настройки с сохранённым выбором.</p>`;
    document.body.appendChild(panel);

    panel.querySelector('.food-close').onclick=closePanel;
    panel.querySelector('#foodApply').onclick=applyFilters;
    panel.querySelector('#foodSelectAll').onclick=()=>{
      draftCategories=new Set(['all']);
      renderSegments();
      updatePanelSummary();
    };
    panel.querySelector('#foodHide').onclick=hidePins;
    panel.querySelector('#foodReload').onclick=async()=>{
      await loadPlaces(true);
      renderSegments();
      updatePanelSummary();
    };
    renderSegments();
    updatePanelSummary();
  }

  async function openPanel(){
    draftCategories=new Set(appliedCategories);
    panel.classList.add('open');
    renderSegments();
    updatePanelSummary();
    if(!places.length||needsReload()){
      loadPlaces(false).then(()=>{
        renderSegments();
        updatePanelSummary();
      });
    }
  }

  function closePanel(){
    panel.classList.remove('open');
  }

  function toggleCategory(key){
    if(key==='all'){
      draftCategories=new Set(['all']);
    }else{
      draftCategories.delete('all');
      if(draftCategories.has(key))draftCategories.delete(key);else draftCategories.add(key);
      if(!draftCategories.size)draftCategories.add('all');
    }
    renderSegments();
    updatePanelSummary();
  }

  function renderSegments(){
    if(!panel)return;
    const root=panel.querySelector('#foodSegments');
    root.innerHTML='';
    categories.forEach(([key,label])=>{
      const count=places.filter(place=>key==='all'||place.category===key).length;
      const button=document.createElement('button');
      button.type='button';
      button.className=`food-segment${draftCategories.has(key)?' selected':''}`;
      button.textContent=count?`${label} · ${count}`:label;
      button.setAttribute('aria-pressed',String(draftCategories.has(key)));
      button.onclick=()=>toggleCategory(key);
      root.appendChild(button);
    });
  }

  function updatePanelSummary(){
    if(!panel)return;
    const summary=panel.querySelector('#foodSummary');
    const apply=panel.querySelector('#foodApply');
    const selectedLabels=draftCategories.has('all')
      ? ['Все кухни']
      : categories.filter(([key])=>draftCategories.has(key)).map(([,label])=>label);
    const count=filteredPlaces(draftCategories).length;

    if(loading){
      summary.textContent='Загружаю заведения для текущей области карты…';
      apply.textContent='Загрузка заведений…';
      apply.disabled=true;
      return;
    }

    summary.textContent=`Выбрано: ${selectedLabels.join(', ')}${places.length?` · найдено ${count}`:''}${source?` · ${source}`:''}`;
    apply.textContent=places.length?`Показать на карте · ${count}`:'Показать на карте';
    apply.disabled=false;
  }

  async function applyFilters(){
    if(!places.length||needsReload())await loadPlaces(false);
    appliedCategories=new Set(draftCategories);
    if(!appliedCategories.size)appliedCategories.add('all');
    saveSelection();
    pinsVisible=true;
    renderPins();
    toolButton.classList.add('active');
    closePanel();
  }

  function hidePins(){
    pinsVisible=false;
    if(layer&&map.hasLayer(layer))map.removeLayer(layer);
    toolButton.classList.remove('active');
    closePanel();
  }

  function needsReload(){
    if(!loadedBounds)return true;
    return !loadedBounds.pad(-.25).contains(map.getCenter());
  }

  function queryBounds(){
    const current=map.getBounds();
    const latSpan=Math.min(.20,Math.max(.045,current.getNorth()-current.getSouth()));
    const lngSpan=Math.min(.30,Math.max(.065,current.getEast()-current.getWest()));
    const center=map.getCenter();
    return L.latLngBounds(
      [center.lat-latSpan/2,center.lng-lngSpan/2],
      [center.lat+latSpan/2,center.lng+lngSpan/2]
    );
  }

  async function fetchWithTimeout(url,timeout=14000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(url,{method:'GET',mode:'cors',cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return await response.json();
    }finally{
      clearTimeout(timer);
    }
  }

  async function loadPlaces(force=false){
    if(loading&&loadPromise)return loadPromise;
    if(!force&&!needsReload()&&places.length)return places;

    loading=true;
    updatePanelSummary();
    const reload=panel?.querySelector('#foodReload');
    if(reload){reload.disabled=true;reload.textContent='Загрузка…';}

    loadPromise=(async()=>{
      const bounds=queryBounds();
      try{
        const south=bounds.getSouth().toFixed(6);
        const west=bounds.getWest().toFixed(6);
        const north=bounds.getNorth().toFixed(6);
        const east=bounds.getEast().toFixed(6);
        const query=`[out:json][timeout:20];(nwr["amenity"~"^(restaurant|cafe|fast_food|food_court|ice_cream)$"](${south},${west},${north},${east}););out center tags 300;`;
        let json=null;
        for(const endpoint of endpoints){
          try{
            json=await fetchWithTimeout(`${endpoint}?data=${encodeURIComponent(query)}`);
            if(json)break;
          }catch(_){}
        }
        const live=(json?.elements||[])
          .map(normalize)
          .filter(place=>place.name&&Number.isFinite(place.lat)&&Number.isFinite(place.lng));

        if(live.length){
          places=dedupe(live);
          source='OpenStreetMap';
        }else{
          places=fallbackPlaces();
          source='резервный список';
        }
        loadedBounds=bounds;
      }catch(_){
        places=fallbackPlaces();
        source='резервный список';
        loadedBounds=bounds;
      }finally{
        loading=false;
        loadPromise=null;
        if(reload){reload.disabled=false;reload.textContent='Обновить места';}
        renderSegments();
        updatePanelSummary();
        if(pinsVisible)renderPins();
      }
      return places;
    })();

    return loadPromise;
  }

  function fallbackPlaces(){
    return fallback.map((place,index)=>({
      ...place,
      id:`fallback-${index}`,
      address:'',opening:'',rating:'',averageCheck:'',website:'',phone:'',fallback:true
    }));
  }

  function normalize(element){
    const tags=element.tags||{};
    const lat=element.lat??element.center?.lat;
    const lng=element.lon??element.center?.lon;
    const rawCuisine=String(tags.cuisine||'')
      .split(/[;,]/)
      .map(value=>value.trim().toLowerCase())
      .filter(Boolean);
    const cuisines=rawCuisine.map(value=>cuisineNames[value]||capitalize(value.replaceAll('_',' ')));
    const address=[tags['addr:street'],tags['addr:housenumber']].filter(Boolean).join(', ');
    const place={
      id:`${element.type}-${element.id}`,
      lat:Number(lat),lng:Number(lng),
      name:tags['name:ru']||tags.name||'',
      amenity:tags.amenity||'',
      cuisines,cuisineKeys:rawCuisine,address,
      opening:tags.opening_hours||'',
      rating:tags.rating||tags['contact:rating']||'',
      averageCheck:tags.average_check||tags.avg_check||tags.price||tags.charge||'',
      website:tags.website||tags['contact:website']||'',
      phone:tags.phone||tags['contact:phone']||''
    };
    place.category=classify(place);
    return place;
  }

  function classify(place){
    const keys=place.cuisineKeys.join(' ');
    const name=place.name.toLowerCase();
    const text=`${keys} ${name}`;
    if(/tatar|татар|кыстыб|тюбетей|эчпоч|чак.?чак/.test(text))return'tatar';
    if(/coffee|coffee_shop|кофе|кофейн|surf|skuratov/.test(text))return'coffee';
    if(/pizza|italian|италь|пицц/.test(text))return'italian';
    if(/japanese|sushi|asian|chinese|korean|япон|суши|азиат|китай|корей|wok/.test(text))return'asian';
    if(/georgian|caucasian|грузин|кавказ|хинкал|хачапур/.test(text))return'georgian';
    if(/uzbek|middle_eastern|turkish|узбек|восточ|плов|чайхана/.test(text))return'uzbek';
    if(/dessert|bakery|ice_cream|pastry|десерт|выпеч|кондитер|морож/.test(text)||place.amenity==='ice_cream')return'dessert';
    if(/vegetarian|vegan|веган|вегетариан/.test(text))return'vegetarian';
    if(place.amenity==='fast_food'||/burger|kebab|shawarma|бургер|шаурм|донер|фаст/.test(text))return'fast';
    return'other';
  }

  function filteredPlaces(selection=appliedCategories){
    if(selection.has('all'))return places;
    return places.filter(place=>selection.has(place.category));
  }

  function renderPins(){
    if(layer&&map.hasLayer(layer))map.removeLayer(layer);
    layer=L.layerGroup();
    const filtered=filteredPlaces();
    filtered.forEach(place=>{
      const icon=L.divIcon({
        className:'food-marker',html:'<i>🍴</i>',
        iconSize:[31,31],iconAnchor:[15,15],popupAnchor:[0,-13]
      });
      L.marker([place.lat,place.lng],{icon,riseOnHover:true})
        .bindPopup(popup(place))
        .addTo(layer);
    });
    if(pinsVisible)layer.addTo(map);
  }

  function popup(place){
    const query=encodeURIComponent(`${place.name} Казань`);
    const yandex=`https://yandex.ru/maps/?text=${query}`;
    const google=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name+' '+place.lat+','+place.lng)}`;
    const gis=`https://2gis.ru/kazan/search/${query}`;
    const cuisine=place.cuisines.length?place.cuisines.join(', '):categoryLabel(place.category);
    const rating=place.rating||'смотреть в карточке карты';
    const check=place.averageCheck||'смотреть в карточке карты';
    return `<div class="food-popup"><h3>${escapeHtml(place.name)}</h3><p><strong>${typeName(place.amenity)}</strong> · ${escapeHtml(cuisine)}</p>${place.address?`<p>${escapeHtml(place.address)}</p>`:''}<p>Рейтинг: <strong>${escapeHtml(String(rating))}</strong><br>Средний чек: <strong>${escapeHtml(String(check))}</strong></p>${place.opening?`<p>Режим: ${escapeHtml(place.opening)}</p>`:''}${place.fallback?'<p>Резервная точка: уточните адрес в выбранной карте.</p>':''}<div class="food-links"><a target="_blank" rel="noopener" href="${yandex}">Яндекс</a><a target="_blank" rel="noopener" href="${google}">Google</a><a target="_blank" rel="noopener" href="${gis}">2ГИС</a></div></div>`;
  }

  function dedupe(list){
    const seen=new Set();
    return list.filter(place=>{
      const key=`${place.name.toLowerCase()}|${place.lat.toFixed(4)}|${place.lng.toFixed(4)}`;
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    }).slice(0,300);
  }

  const capitalize=value=>value?value[0].toUpperCase()+value.slice(1):value;
  const typeName=amenity=>({restaurant:'Ресторан',cafe:'Кафе',fast_food:'Быстрое питание',food_court:'Фуд-корт',ice_cream:'Мороженое'})[amenity]||'Заведение';
  const categoryLabel=key=>categories.find(item=>item[0]===key)?.[1]||'Кухня не указана';
  const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

  function init(application){
    if(app)return;
    app=application;
    map=app.map;
    createUi();
    map.on('moveend',()=>{
      if(pinsVisible&&needsReload()){
        panel.querySelector('#foodSubtitle').textContent='Область карты изменилась. Откройте 🍽 и нажмите «Показать на карте», чтобы обновить места.';
      }
    });
  }

  window.addEventListener('kazan:app-ready',event=>init(event.detail));
  if(window.KAZAN_APP)init(window.KAZAN_APP);
})();
