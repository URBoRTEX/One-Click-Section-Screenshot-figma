(()=>{
  'use strict';

  const SUPABASE_URL='https://xhmoitdndlbkbuyadqok.supabase.co';
  const SUPABASE_KEY='sb_publishable_qmSgZZ2BLTpiQw4la-sA4Q_NpXyF8K0';
  const OWNER_EMAIL='opextheskill@gmail.com';

  if(!window.supabase?.createClient)return;

  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
    auth:{
      persistSession:true,
      autoRefreshToken:true,
      detectSessionInUrl:true
    }
  });

  const style=document.createElement('style');
  style.textContent=`
    .owner-login-overlay{position:fixed;z-index:6000;inset:0;display:none;align-items:flex-end;background:rgba(15,23,42,.46);padding:0}
    .owner-login-overlay.open{display:flex}
    .owner-login-sheet{width:100%;padding:18px 16px max(20px,env(safe-area-inset-bottom));border-radius:24px 24px 0 0;background:#fff;box-shadow:0 -16px 48px rgba(15,23,42,.28)}
    .owner-login-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
    .owner-login-head h2{margin:0;font-size:20px;line-height:1.2}.owner-login-head p{margin:5px 0 0;color:#667085;font-size:12px;line-height:1.4}
    .owner-login-close{width:38px;height:38px;border:0;border-radius:12px;background:#eef2f6;color:#111827;font-size:22px}
    .owner-login-field{display:block;margin-top:14px}.owner-login-field span{display:block;margin-bottom:6px;font-size:12px;font-weight:800;color:#344054}
    .owner-login-field input{width:100%;border:1px solid #d0d5dd;border-radius:13px;padding:12px 13px;font:inherit;font-size:15px;outline:none}
    .owner-login-field input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
    .owner-login-actions{display:flex;gap:8px;margin-top:14px}.owner-login-submit{flex:1;border:0;border-radius:12px;background:#2563eb;color:#fff;padding:12px 14px;font-size:13px;font-weight:800}.owner-login-submit:disabled{opacity:.55}
    .owner-login-note{margin:10px 0 0;color:#667085;font-size:10px;line-height:1.4}.owner-login-error{display:none;margin-top:10px;padding:9px 10px;border-radius:10px;background:#fff1f2;color:#b42318;font-size:11px;line-height:1.35}.owner-login-error.show{display:block}
    @media(min-width:800px){.owner-login-overlay{align-items:center;justify-content:center;padding:20px}.owner-login-sheet{max-width:420px;border-radius:22px;padding-bottom:18px}}
  `;
  document.head.appendChild(style);

  const overlay=document.createElement('div');
  overlay.className='owner-login-overlay';
  overlay.innerHTML=`
    <section class="owner-login-sheet" role="dialog" aria-modal="true" aria-labelledby="ownerLoginTitle">
      <div class="owner-login-head">
        <div><h2 id="ownerLoginTitle">Вход владельца</h2><p>Один вход на этом телефоне. Сессия сохранится и будет обновляться автоматически.</p></div>
        <button class="owner-login-close" type="button" aria-label="Закрыть">×</button>
      </div>
      <label class="owner-login-field"><span>Email</span><input id="ownerLoginEmail" type="email" autocomplete="username" readonly></label>
      <label class="owner-login-field"><span>Пароль</span><input id="ownerLoginPassword" type="password" autocomplete="current-password" placeholder="Введите пароль владельца"></label>
      <div class="owner-login-actions"><button class="owner-login-submit" id="ownerLoginSubmit" type="button">Войти и сохранить сессию</button></div>
      <div class="owner-login-error" id="ownerLoginError"></div>
      <p class="owner-login-note">Пароль не хранится в коде карты. Он проверяется Supabase. Публичным посетителям вход не нужен — комментарии, фото и видео остаются доступны для просмотра.</p>
    </section>`;
  document.body.appendChild(overlay);

  const emailInput=overlay.querySelector('#ownerLoginEmail');
  const passwordInput=overlay.querySelector('#ownerLoginPassword');
  const submit=overlay.querySelector('#ownerLoginSubmit');
  const errorBox=overlay.querySelector('#ownerLoginError');
  emailInput.value=OWNER_EMAIL;

  function close(){
    overlay.classList.remove('open');
    passwordInput.value='';
    errorBox.classList.remove('show');
    errorBox.textContent='';
  }

  function open(){
    overlay.classList.add('open');
    setTimeout(()=>passwordInput.focus(),120);
  }

  async function signIn(){
    const password=passwordInput.value;
    if(!password){
      errorBox.textContent='Введите пароль.';
      errorBox.classList.add('show');
      return;
    }

    submit.disabled=true;
    submit.textContent='Вхожу…';
    errorBox.classList.remove('show');

    const {error}=await client.auth.signInWithPassword({
      email:OWNER_EMAIL,
      password
    });

    if(error){
      errorBox.textContent='Неверный пароль или пароль ещё не задан в Supabase.';
      errorBox.classList.add('show');
      submit.disabled=false;
      submit.textContent='Войти и сохранить сессию';
      return;
    }

    submit.textContent='Готово';
    setTimeout(()=>location.reload(),250);
  }

  overlay.querySelector('.owner-login-close').onclick=close;
  overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
  submit.onclick=signIn;
  passwordInput.addEventListener('keydown',event=>{if(event.key==='Enter')signIn();});

  document.addEventListener('click',event=>{
    const button=event.target.closest('#cloudAuthBtn');
    if(!button)return;
    const cloud=window.KAZAN_CLOUD;
    if(cloud?.getUser?.())return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    open();
  },true);
})();
