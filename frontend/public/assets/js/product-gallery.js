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

    let dragType = null;
    let dragId = null;
    let startX = 0;
    let startY = 0;
    let startScroll = 0;
    let moved = false;

    function beginDrag(type, id, clientX, clientY){
      dragType = type;
      dragId = id;
      startX = clientX;
      startY = clientY;
      startScroll = track.scrollLeft;
      moved = false;
      ctx.preventClick = false;
    }

    function moveDrag(type, id, clientX, clientY, originalEvent, inputType){
      if(dragType !== type || dragId !== id) return false;

      const dx = clientX - startX;
      const dy = clientY - startY;
      if(!moved && Math.abs(dy) > Math.abs(dx) + 6){
        cancelDrag();
        return true;
      }

      track.scrollLeft = startScroll - dx;
      if(Math.abs(dx) > 4){
        moved = true;
        ctx.preventClick = true;
      }

      if(moved && originalEvent && inputType === 'touch' && originalEvent.cancelable){
        originalEvent.preventDefault();
      }

      return false;
    }

    function endDrag(type, id){
      if(dragType !== type || dragId !== id) return;
      dragType = null;
      dragId = null;
      if(moved){
        snapToNearest(ctx);
        setTimeout(()=>{ ctx.preventClick = false; }, 220);
      }else{
        ctx.preventClick = false;
      }
      requestAnimationFrame(()=>updateDots(ctx));
    }

    function cancelDrag(){
      dragType = null;
      dragId = null;
      moved = false;
      ctx.preventClick = false;
    }

    const supportsPointer = typeof window !== 'undefined' && 'PointerEvent' in window;

    if(supportsPointer){
      const onPointerDown = (event)=>{
        if(event.isPrimary === false) return;
        if(event.pointerType === 'mouse' && event.button !== 0) return;
        beginDrag('pointer', event.pointerId, event.clientX, event.clientY);
        try{
          track.setPointerCapture(event.pointerId);
        }catch{}
      };

      const onPointerMove = (event)=>{
        if(dragType !== 'pointer' || dragId !== event.pointerId) return;
        const canceled = moveDrag('pointer', event.pointerId, event.clientX, event.clientY, event, event.pointerType);
        if(canceled){
          try{
            track.releasePointerCapture(event.pointerId);
          }catch{}
        }
      };

      const onPointerUp = (event)=>{
        if(dragType !== 'pointer' || dragId !== event.pointerId) return;
        try{
          track.releasePointerCapture(event.pointerId);
        }catch{}
        endDrag('pointer', event.pointerId);
      };

      const onPointerCancel = (event)=>{
        if(dragType !== 'pointer' || dragId !== event.pointerId) return;
        try{
          track.releasePointerCapture(event.pointerId);
        }catch{}
        cancelDrag();
      };

      track.addEventListener('pointerdown', onPointerDown);
      track.addEventListener('pointermove', onPointerMove, { passive:false });
      track.addEventListener('pointerup', onPointerUp);
      track.addEventListener('pointercancel', onPointerCancel);
    }else{
      const onTouchStart = (event)=>{
        if(!event.touches || !event.touches.length) return;
        const touch = event.touches[0];
        beginDrag('touch', touch.identifier, touch.clientX, touch.clientY);
      };

      const onTouchMove = (event)=>{
        if(dragType !== 'touch') return;
        const touch = Array.from(event.touches || []).find(t=>t.identifier === dragId);
        if(!touch) return;
        moveDrag('touch', touch.identifier, touch.clientX, touch.clientY, event, 'touch');
      };

      const onTouchEnd = (event)=>{
        if(dragType !== 'touch') return;
        const touch = Array.from(event.changedTouches || []).find(t=>t.identifier === dragId);
        if(!touch) return;
        endDrag('touch', touch.identifier);
      };

      const onTouchCancel = ()=>{
        if(dragType !== 'touch') return;
        cancelDrag();
      };

      track.addEventListener('touchstart', onTouchStart, { passive:false });
      track.addEventListener('touchmove', onTouchMove, { passive:false });
      track.addEventListener('touchend', onTouchEnd);
      track.addEventListener('touchcancel', onTouchCancel);
    }

    const onClick = (event)=>{
      if(ctx.preventClick){
        event.preventDefault();
        event.stopPropagation();
      }
    };

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
