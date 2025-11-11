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
    const prevBtn = gallery.querySelector('[data-gallery-prev]');
    const nextBtn = gallery.querySelector('[data-gallery-next]');

    track.setAttribute(READY_FLAG, '1');

    if(slides.length <= 1 && !dots.length){
      return;
    }

    const ctx = { track, gallery, slides, dots, prevBtn, nextBtn, preventClick:false, dragState:null, activeIndex:0 };
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
      ctx.dragState = {
        startScroll,
        startIndex: getCurrentIndex(ctx)
      };
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
        snapAfterDrag(ctx);
        setTimeout(()=>{ ctx.preventClick = false; }, 260);
      }else{
        snapAfterDrag(ctx);
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

    if(prevBtn){
      prevBtn.addEventListener('click', event=>{
        event.preventDefault();
        event.stopPropagation();
        ctx.preventClick = true;
        showPrevious(ctx);
        setTimeout(()=>{ ctx.preventClick = false; }, 220);
      });
    }

    if(nextBtn){
      nextBtn.addEventListener('click', event=>{
        event.preventDefault();
        event.stopPropagation();
        ctx.preventClick = true;
        showNext(ctx);
        setTimeout(()=>{ ctx.preventClick = false; }, 220);
      });
    }

    dots.forEach(dot=>{
      dot.addEventListener('click', (event)=>{
        event.preventDefault();
        event.stopPropagation();
        const index = Number(dot.getAttribute('data-gallery-dot'));
        const target = ctx.slides[index];
        if(target){
          ctx.preventClick = true;
          scrollToIndex(ctx, index);
          setTimeout(()=>{ ctx.preventClick = false; }, 200);
        }
      });
    });

    updateDots(ctx);
  }

  function snapAfterDrag(ctx){
    const { track, slides, dragState } = ctx;
    if(!slides.length) return;
    const width = track.clientWidth || 1;
    const maxIndex = slides.length - 1;
    const currentScroll = track.scrollLeft;
    const currentIndex = Math.max(0, Math.min(maxIndex, Math.round(currentScroll / width)));
    let targetIndex = currentIndex;

    if(dragState){
      const delta = currentScroll - dragState.startScroll;
      const threshold = width * 0.2;
      if(Math.abs(delta) > threshold){
        targetIndex = clampIndex(dragState.startIndex + (delta > 0 ? 1 : -1), maxIndex);
      }else{
        targetIndex = clampIndex(dragState.startIndex, maxIndex);
      }
    }

    ctx.dragState = null;

    scrollToIndex(ctx, targetIndex);
  }

  function getCurrentIndex(ctx){
    const { track, slides } = ctx;
    if(!slides.length) return 0;
    const width = track.clientWidth || 1;
    return Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / width)));
  }

  function clampIndex(index, max){
    return Math.max(0, Math.min(max, index));
  }

  function updateDots(ctx){
    const { track, dots } = ctx;
    if(!dots.length) return;
    const width = track.clientWidth || 1;
    const index = Math.max(0, Math.min(dots.length - 1, Math.round(track.scrollLeft / width)));
    dots.forEach((dot, i)=>{
      dot.classList.toggle(DOT_ACTIVE_CLASS, i === index);
    });
    ctx.activeIndex = index;
    updateControls(ctx);
  }

  function scrollToIndex(ctx, index){
    const { slides, track } = ctx;
    if(!slides.length) return;
    const max = slides.length - 1;
    const targetIndex = clampIndex(index, max);
    const target = slides[targetIndex];
    if(!target) return;
    track.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
  }

  function showNext(ctx){
    if(!ctx.slides.length) return;
    const nextIndex = clampIndex(getCurrentIndex(ctx) + 1, ctx.slides.length - 1);
    scrollToIndex(ctx, nextIndex);
  }

  function showPrevious(ctx){
    if(!ctx.slides.length) return;
    const prevIndex = clampIndex(getCurrentIndex(ctx) - 1, ctx.slides.length - 1);
    scrollToIndex(ctx, prevIndex);
  }

  function updateControls(ctx){
    const { prevBtn, nextBtn, slides, activeIndex } = ctx;
    if(prevBtn){
      prevBtn.disabled = !slides.length || activeIndex <= 0;
    }
    if(nextBtn){
      nextBtn.disabled = !slides.length || activeIndex >= slides.length - 1;
    }
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
