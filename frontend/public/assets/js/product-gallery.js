(function(){
  const contexts = new Set();
  const READY_FLAG = 'data-gallery-ready';
  const DOT_ACTIVE_CLASS = 'is-active';

  function cleanupContexts(){
    contexts.forEach(ctx=>{
      if(!ctx.track.isConnected){
        contexts.delete(ctx);
      }
    });
  }

  function bindGallery(track){
    if(!track || track.hasAttribute(READY_FLAG)) return;
    const gallery = track.closest('[data-gallery]');
    if(!gallery) return;

    const slides = Array.from(track.querySelectorAll('[data-gallery-slide]'));
    const dots = Array.from(gallery.querySelectorAll('[data-gallery-dot]'));

    track.setAttribute(READY_FLAG, '1');

    if(slides.length <= 1 && !dots.length){
      return;
    }

    const ctx = { track, gallery, slides, dots, preventClick:false };
    contexts.add(ctx);

    let pointerActive = false;
    let startX = 0;
    let startScroll = 0;
    let moved = false;

    const onPointerDown = (event)=>{
      if(event.isPrimary === false) return;
      if(event.pointerType === 'mouse' && event.button !== 0) return;
      pointerActive = true;
      startX = event.clientX;
      startScroll = track.scrollLeft;
      moved = false;
      ctx.preventClick = false;
      try{
        track.setPointerCapture(event.pointerId);
      }catch{}
    };

    const onPointerMove = (event)=>{
      if(!pointerActive) return;
      const dx = event.clientX - startX;
      if(Math.abs(dx) > 4){
        moved = true;
      }
      track.scrollLeft = startScroll - dx;
    };

    const onPointerUp = (event)=>{
      if(!pointerActive) return;
      pointerActive = false;
      try{
        track.releasePointerCapture(event.pointerId);
      }catch{}
      if(moved){
        ctx.preventClick = true;
        snapToNearest(ctx);
        setTimeout(()=>{ ctx.preventClick = false; }, 120);
      }
      requestAnimationFrame(()=>updateDots(ctx));
    };

    const onClick = (event)=>{
      if(ctx.preventClick){
        event.preventDefault();
        event.stopPropagation();
      }
    };

    track.addEventListener('pointerdown', onPointerDown);
    track.addEventListener('pointermove', onPointerMove);
    track.addEventListener('pointerup', onPointerUp);
    track.addEventListener('pointercancel', onPointerUp);
    gallery.addEventListener('click', onClick, true);

    track.addEventListener('scroll', ()=>{
      requestAnimationFrame(()=>updateDots(ctx));
    });

    dots.forEach(dot=>{
      dot.addEventListener('click', (event)=>{
        event.preventDefault();
        event.stopPropagation();
        const index = Number(dot.getAttribute('data-gallery-dot'));
        const target = ctx.slides[index];
        if(target){
          ctx.preventClick = true;
          track.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
          setTimeout(()=>{ ctx.preventClick = false; }, 200);
        }
      });
    });

    updateDots(ctx);
  }

  function snapToNearest(ctx){
    const { track, slides } = ctx;
    if(!slides.length) return;
    const width = track.clientWidth || 1;
    const index = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / width)));
    const target = slides[index];
    if(target){
      track.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
    }
  }

  function updateDots(ctx){
    const { track, dots } = ctx;
    if(!dots.length) return;
    const width = track.clientWidth || 1;
    const index = Math.max(0, Math.round(track.scrollLeft / width));
    dots.forEach((dot, i)=>{
      dot.classList.toggle(DOT_ACTIVE_CLASS, i === index);
    });
  }

  function initializeProductGalleries(scope){
    cleanupContexts();
    const root = scope && scope.querySelectorAll ? scope : document;
    const tracks = root.querySelectorAll('[data-gallery-track]');
    tracks.forEach(bindGallery);
  }

  window.initializeProductGalleries = function(scope){
    try{
      initializeProductGalleries(scope);
    }catch(err){
      console.error('Erro ao iniciar galerias de produtos', err);
    }
  };

  window.addEventListener('resize', ()=>{
    contexts.forEach(ctx=>updateDots(ctx));
  });

  if(document.readyState !== 'loading'){
    window.initializeProductGalleries();
  }else{
    document.addEventListener('DOMContentLoaded', ()=>window.initializeProductGalleries());
  }
})();
