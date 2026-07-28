(()=>{
  'use strict';

  const style=document.createElement('style');
  style.textContent=`
    .journal-media-card{cursor:zoom-in}
    .journal-media-expand{position:absolute;left:6px;top:6px;width:30px;height:30px;border:0;border-radius:9px;background:rgba(17,24,39,.82);color:#fff;font-size:15px;display:grid;place-items:center;z-index:3}
    .trip-media-viewer{position:fixed;z-index:5000;inset:0;display:none;align-items:center;justify-content:center;background:rgba(3,7,18,.96);padding:max(18px,env(safe-area-inset-top)) 14px max(18px,env(safe-area-inset-bottom))}
    .trip-media-viewer.open{display:flex}
    .trip-media-viewer-content{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center}
    .trip-media-viewer img,.trip-media-viewer video{display:block;max-width:100%;max-height:100%;object-fit:contain;border-radius:12px;background:#000}
    .trip-media-viewer video{width:min(100%,980px)}
    .trip-media-viewer-close{position:absolute;z-index:2;right:10px;top:10px;width:44px;height:44px;border:0;border-radius:14px;background:rgba(255,255,255,.92);color:#111827;font-size:28px;line-height:1}
    .trip-media-viewer-name{position:absolute;left:12px;right:66px;bottom:10px;padding:8px 10px;border-radius:10px;background:rgba(17,24,39,.72);color:#fff;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  `;
  document.head.appendChild(style);

  const overlay=document.createElement('div');
  overlay.className='trip-media-viewer';
  overlay.innerHTML='<div class="trip-media-viewer-content"><button class="trip-media-viewer-close" type="button" aria-label="Закрыть">×</button><div class="trip-media-viewer-name"></div></div>';
  document.body.appendChild(overlay);
  const content=overlay.querySelector('.trip-media-viewer-content');
  const name=overlay.querySelector('.trip-media-viewer-name');

  function close(){
    overlay.classList.remove('open');
    overlay.querySelector('video')?.pause();
    overlay.querySelector('img,video')?.remove();
    document.body.style.overflow='';
  }

  function openCard(card){
    const source=card.querySelector('img,video');
    if(!source?.src)return;
    overlay.querySelector('img,video')?.remove();
    const isVideo=source.tagName==='VIDEO';
    const viewer=document.createElement(isVideo?'video':'img');
    viewer.src=source.currentSrc||source.src;
    if(isVideo){viewer.controls=true;viewer.playsInline=true;viewer.preload='metadata';viewer.autoplay=true;}
    viewer.alt=source.alt||'Вложение к месту';
    content.insertBefore(viewer,name);
    name.textContent=card.dataset.mediaName||source.alt|| (isVideo?'Видео':'Фото');
    overlay.classList.add('open');
    document.body.style.overflow='hidden';
  }

  overlay.querySelector('.trip-media-viewer-close').onclick=close;
  overlay.addEventListener('click',event=>{if(event.target===overlay||event.target===content)close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});

  function decorate(){
    document.querySelectorAll('.journal-media-card').forEach(card=>{
      if(card.dataset.viewerReady)return;
      card.dataset.viewerReady='1';
      const source=card.querySelector('img,video');
      card.dataset.mediaName=source?.alt|| (source?.tagName==='VIDEO'?'Видео':'Фото');
      const expand=document.createElement('button');
      expand.type='button';expand.className='journal-media-expand';expand.textContent='⛶';expand.setAttribute('aria-label','Открыть на весь экран');
      expand.onclick=event=>{event.preventDefault();event.stopPropagation();openCard(card);};
      card.appendChild(expand);
      if(source?.tagName==='IMG')source.onclick=event=>{event.preventDefault();event.stopPropagation();openCard(card);};
    });
  }

  const observer=new MutationObserver(()=>requestAnimationFrame(decorate));
  observer.observe(document.body,{childList:true,subtree:true});
  decorate();
})();
