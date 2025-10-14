(function(){
  if(typeof window === 'undefined') return;

  const toggleSelector = '[data-nav-toggle]';
  const menuSelector = '[data-nav-menu]';
  const overlaySelector = '[data-nav-overlay]';

  const ready = () => {
    const toggle = document.querySelector(toggleSelector);
    const menu = document.querySelector(menuSelector);
    const overlay = document.querySelector(overlaySelector);
    if(!toggle || !menu) return;

    const body = document.body;

    const closeMenu = (opts={}) => {
      if(!menu.classList.contains('is-open') && !toggle.classList.contains('is-active')) return;
      menu.classList.remove('is-open');
      toggle.classList.remove('is-active');
      toggle.setAttribute('aria-expanded','false');
      body.classList.remove('nav-open');
      if(overlay){
        overlay.hidden = true;
      }
      if(opts.focusToggle){
        toggle.focus();
      }
    };

    const openMenu = () => {
      menu.classList.add('is-open');
      toggle.classList.add('is-active');
      toggle.setAttribute('aria-expanded','true');
      body.classList.add('nav-open');
      if(overlay){
        overlay.hidden = false;
      }
    };

    const handleToggle = () => {
      if(menu.classList.contains('is-open')){
        closeMenu();
      }else{
        openMenu();
      }
    };

    toggle.addEventListener('click', handleToggle);

    if(overlay){
      overlay.addEventListener('click', () => closeMenu());
    }

    document.querySelectorAll('[data-cart-open]').forEach(btn => {
      btn.addEventListener('click', () => closeMenu());
    });

    menu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => closeMenu());
    });

    window.addEventListener('resize', () => {
      if(window.matchMedia('(min-width: 821px)').matches){
        closeMenu();
        if(overlay){
          overlay.hidden = true;
        }
      }
    });

    window.addEventListener('keydown', (event) => {
      if(event.key === 'Escape'){
        closeMenu({focusToggle:true});
      }
    });
  };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ready);
  }else{
    ready();
  }
})();
