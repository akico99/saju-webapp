'use strict';
(async function(){
  const target=document.getElementById('demoReader');
  let cleanup;
  try {
    const res=await fetch('/love-assets/reading-example.json');
    if(!res.ok)throw new Error('예시를 불러오지 못했습니다.');
    const data=await res.json();
    function show(mode) {
      if(cleanup)cleanup();
      document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
      const model=mode==='paid'?LoveReadingModel.buildPaid(data.paid,{title:'수달님의 인연의 시기'}):LoveReadingModel.buildFree(data.free,data.person);
      cleanup=LoveReadingView.render(target,model,{reportId:mode==='paid'?'demo-v1':undefined,onUnlock:()=>{location.href='/love.html';}});
    }
    document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{show(b.dataset.mode);document.querySelector('.demo-switch').scrollIntoView({block:'start'});}));
    show(location.hash==='#paid'?'paid':'free');
  }catch(e){target.textContent=e.message;target.className='demo-error';}
})();
