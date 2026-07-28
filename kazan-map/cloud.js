(()=>{
  'use strict';

  const SUPABASE_URL='https://xhmoitdndlbkbuyadqok.supabase.co';
  const SUPABASE_KEY='sb_publishable_qmSgZZ2BLTpiQw4la-sA4Q_NpXyF8K0';
  const BUCKET='kazan-trip-media';
  const EDITOR_LOGIN='urbortex';
  const REDIRECT_URL='https://raw.githack.com/URBoRTEX/One-Click-Section-Screenshot-figma/main/kazan-map/index.html';

  const state={
    session:null,
    user:null,
    editor:false,
    schemaReady:true,
    error:null,
    journals:new Map(),
    media:new Map(),
    tracks:[],
    health:new Map()
  };

  let resolveReady;
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  let initialized=false;

  function emit(name,detail={}){
    window.dispatchEvent(new CustomEvent(name,{detail}));
  }

  function loginFromUser(user){
    const metadata=user?.user_metadata||{};
    return String(
      metadata.user_name||
      metadata.preferred_username||
      metadata.user_login||
      metadata.login||
      ''
    ).toLowerCase();
  }

  function setSession(session){
    state.session=session||null;
    state.user=session?.user||null;
    state.editor=loginFromUser(state.user)===EDITOR_LOGIN;
    renderAuth();
    emit('kazan:auth-change',{
      user:state.user,
      editor:state.editor,
      schemaReady:state.schemaReady
    });
  }

  function publicUrl(path){
    if(!path||!client)return '';
    return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl||'';
  }

  function normalizeMedia(row){
    return {
      ...row,
      kind:row.media_type,
      type:row.mime_type||'',
      name:row.original_name||'',
      publicUrl:publicUrl(row.storage_path)
    };
  }

  function snapshot(){
    return {
      editor:state.editor,
      user:state.user,
      schemaReady:state.schemaReady,
      error:state.error,
      journals:new Map(state.journals),
      media:new Map([...state.media].map(([key,value])=>[key,[...value]])),
      tracks:[...state.tracks],
      health:new Map(state.health)
    };
  }

  let client=null;

  async function refresh(){
    if(!client)return snapshot();
    state.error=null;
    state.schemaReady=true;

    const results=await Promise.all([
      client.from('place_journal').select('*'),
      client.from('place_media').select('*').order('created_at',{ascending:true}),
      client.from('walk_tracks').select('*').order('started_at',{ascending:true}),
      client.from('daily_health').select('*')
    ]);

    const firstError=results.find(result=>result.error)?.error||null;
    if(firstError){
      state.schemaReady=false;
      state.error=firstError;
      state.journals.clear();
      state.media.clear();
      state.tracks=[];
      state.health.clear();
      renderAuth();
      emit('kazan:cloud-error',{error:firstError});
      emit('kazan:cloud-ready',snapshot());
      return snapshot();
    }

    const [journalsResult,mediaResult,tracksResult,healthResult]=results;
    state.journals=new Map((journalsResult.data||[]).map(row=>[row.place_id,row]));
    state.media=new Map();
    (mediaResult.data||[]).forEach(row=>{
      const normalized=normalizeMedia(row);
      const list=state.media.get(row.place_id)||[];
      list.push(normalized);
      state.media.set(row.place_id,list);
    });
    state.tracks=tracksResult.data||[];
    state.health=new Map((healthResult.data||[]).map(row=>[row.day_key,row]));

    renderAuth();
    const data=snapshot();
    emit('kazan:cloud-ready',data);
    return data;
  }

  function requireEditor(){
    if(!state.editor)throw new Error('Редактирование разрешено только GitHub-пользователю URBoRTEX.');
    if(!state.schemaReady)throw new Error('Сначала выполните supabase-setup.sql в SQL Editor.');
  }

  async function signIn(){
    if(!client)return;
    const {error}=await client.auth.signInWithOAuth({
      provider:'github',
      options:{redirectTo:REDIRECT_URL}
    });
    if(error)throw error;
  }

  async function signOut(){
    if(!client)return;
    await client.auth.signOut();
  }

  async function saveJournal(placeId,patch={}){
    requireEditor();
    const current=state.journals.get(placeId)||{
      place_id:placeId,
      status:'',
      comment:''
    };
    const row={
      place_id:placeId,
      status:patch.status??current.status??'',
      comment:patch.comment??current.comment??'',
      updated_at:new Date().toISOString(),
      updated_by:state.user.id
    };
    const {data,error}=await client
      .from('place_journal')
      .upsert(row,{onConflict:'place_id'})
      .select()
      .single();
    if(error)throw error;
    state.journals.set(placeId,data);
    emit('kazan:cloud-journal',{placeId,row:data});
    return data;
  }

  function safePart(value){
    return encodeURIComponent(String(value))
      .replaceAll('%','_')
      .replace(/[^A-Za-z0-9_.~-]/g,'_')
      .slice(0,150);
  }

  async function uploadMedia(placeId,file,kind){
    requireEditor();
    await saveJournal(placeId,{});
    const id=crypto.randomUUID();
    const extension=(file.name?.split('.').pop()||(
      kind==='video'?'mp4':'jpg'
    )).replace(/[^A-Za-z0-9]/g,'').slice(0,10)||'bin';
    const path=`${safePart(placeId)}/${id}.${extension}`;

    const {error:uploadError}=await client.storage
      .from(BUCKET)
      .upload(path,file,{
        cacheControl:'3600',
        upsert:false,
        contentType:file.type||undefined
      });
    if(uploadError)throw uploadError;

    const row={
      id,
      place_id:placeId,
      storage_path:path,
      media_type:kind,
      mime_type:file.type||null,
      original_name:file.name||null,
      size_bytes:file.size||null,
      created_by:state.user.id
    };

    const {data,error}=await client
      .from('place_media')
      .insert(row)
      .select()
      .single();

    if(error){
      await client.storage.from(BUCKET).remove([path]);
      throw error;
    }

    const normalized=normalizeMedia(data);
    const list=state.media.get(placeId)||[];
    list.push(normalized);
    state.media.set(placeId,list);
    emit('kazan:cloud-media',{placeId,media:[...list]});
    return normalized;
  }

  async function deleteMedia(media){
    requireEditor();
    if(media.storage_path){
      const {error:storageError}=await client.storage
        .from(BUCKET)
        .remove([media.storage_path]);
      if(storageError)throw storageError;
    }
    const {error}=await client.from('place_media').delete().eq('id',media.id);
    if(error)throw error;
    const list=(state.media.get(media.place_id)||[]).filter(item=>item.id!==media.id);
    state.media.set(media.place_id,list);
    emit('kazan:cloud-media',{placeId:media.place_id,media:[...list]});
  }

  async function saveTrack(track){
    requireEditor();
    const row={
      day_key:track.day_key,
      started_at:track.started_at,
      ended_at:track.ended_at,
      distance_m:track.distance_m||0,
      duration_s:track.duration_s||0,
      points:track.points||[],
      created_by:state.user.id
    };
    const {data,error}=await client.from('walk_tracks').insert(row).select().single();
    if(error)throw error;
    state.tracks.push(data);
    emit('kazan:cloud-tracks',{tracks:[...state.tracks]});
    return data;
  }

  async function saveHealth(dayKey,steps,source='manual'){
    requireEditor();
    const row={
      day_key:dayKey,
      steps:Number.isFinite(Number(steps))?Math.max(0,Math.round(Number(steps))):null,
      source,
      updated_at:new Date().toISOString(),
      updated_by:state.user.id
    };
    const {data,error}=await client
      .from('daily_health')
      .upsert(row,{onConflict:'day_key'})
      .select()
      .single();
    if(error)throw error;
    state.health.set(dayKey,data);
    emit('kazan:cloud-health',{dayKey,row:data});
    return data;
  }

  function renderAuth(){
    let button=document.getElementById('cloudAuthBtn');
    const tools=document.querySelector('.map-tools');
    if(!button&&tools){
      button=document.createElement('button');
      button.id='cloudAuthBtn';
      button.className='map-tool cloud-auth-btn';
      button.type='button';
      button.title='Облачная синхронизация';
      button.setAttribute('aria-label','Облачная синхронизация');
      tools.appendChild(button);
      button.addEventListener('click',async()=>{
        try{
          if(state.user){
            if(confirm('Выйти из режима редактирования?'))await signOut();
          }else{
            await signIn();
          }
        }catch(error){
          alert(error?.message||'Не удалось выполнить вход.');
        }
      });
    }
    if(!button)return;
    button.textContent=state.editor?'✓':state.user?'!':'☁';
    button.classList.toggle('active',state.editor);
    button.classList.toggle('cloud-warning',!state.schemaReady);
    button.title=!state.schemaReady
      ?'Нужно выполнить supabase-setup.sql'
      :state.editor
        ?'Облако подключено · URBoRTEX'
        :state.user
          ?'Этот GitHub-пользователь не может редактировать'
          :'Войти через GitHub для редактирования';
  }

  async function init(){
    if(initialized)return;
    initialized=true;
    if(!window.supabase?.createClient){
      state.schemaReady=false;
      state.error=new Error('Supabase SDK не загрузился.');
      resolveReady(snapshot());
      emit('kazan:cloud-ready',snapshot());
      return;
    }
    client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
      auth:{
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:true
      }
    });
    const {data}=await client.auth.getSession();
    setSession(data.session);
    client.auth.onAuthStateChange((_event,session)=>{
      setSession(session);
      setTimeout(refresh,0);
    });
    const dataSnapshot=await refresh();
    resolveReady(dataSnapshot);
  }

  window.KAZAN_CLOUD={
    ready,
    refresh,
    snapshot,
    signIn,
    signOut,
    isEditor:()=>state.editor,
    isSchemaReady:()=>state.schemaReady,
    getUser:()=>state.user,
    getJournal:placeId=>state.journals.get(placeId)||null,
    getMedia:placeId=>[...(state.media.get(placeId)||[])],
    getTracks:dayKey=>state.tracks.filter(row=>!dayKey||row.day_key===dayKey),
    getHealth:dayKey=>state.health.get(dayKey)||null,
    saveJournal,
    uploadMedia,
    deleteMedia,
    saveTrack,
    saveHealth,
    bucket:BUCKET,
    setupSql:'https://raw.githubusercontent.com/URBoRTEX/One-Click-Section-Screenshot-figma/main/kazan-map/supabase-setup.sql'
  };

  init();
})();
