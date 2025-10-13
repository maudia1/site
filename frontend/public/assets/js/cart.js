(()=>{
  const CART_KEY = 'iw.cart.v1';
  const CART_ADD_EVENT = 'iw-cart-add';
  const CART_OPEN_EVENT = 'iw-cart-open';
  const CART_UPDATED_EVENT = 'iw-cart-updated';
  const CASHBACK_RESULT_KEY = 'iw.cb.result.v1';
  const CASHBACK_EVENT = 'iw-cashback-update';
  const PLACEHOLDER_IMAGE = '/assets/img/product-placeholder.svg';
  const CHECKOUT_WHATSAPP = '5561998348060';

  let cart = [];
  let cashbackInfo = null;
  let drawer;
  let itemsEl;
  let emptyEl;
  let totalEl;
  let checkoutBtn;
  let clearBtn;
  let cashbackBox;
  let cashbackValueEl;
  let cashbackSavedEl;
  let toastEl;
  let countBadge;
  let closeButtonsBound = false;
  let toastTimer = null;

  document.addEventListener('DOMContentLoaded', init);

  function init(){
    cashbackInfo = readCashbackFromStorage();
    cart = loadCartFromStorage();
    countBadge = document.querySelector('[data-cart-count]');
    createDrawer();
    bindGlobalEvents();
    render();
  }

  function createDrawer(){
    if(drawer) return;
    drawer = document.createElement('div');
    drawer.className = 'cart-drawer';
    drawer.setAttribute('data-cart-container','');
    drawer.setAttribute('aria-hidden','true');
    drawer.innerHTML = `
      <div class="cart-backdrop" data-cart-dismiss></div>
      <aside class="cart-panel" role="dialog" aria-labelledby="cart-title">
        <header class="cart-header">
          <h2 id="cart-title">Seu carrinho</h2>
          <button class="cart-close" type="button" data-cart-dismiss aria-label="Fechar carrinho">&times;</button>
        </header>
        <div class="cart-body">
          <p class="cart-empty muted" data-cart-empty>Seu carrinho está vazio.</p>
          <ul class="cart-items" data-cart-items></ul>
        </div>
        <footer class="cart-footer">
          <div class="cart-summary-line">
            <span>Total</span>
            <span data-cart-total>R$ 0,00</span>
          </div>
          <div class="cart-summary-line cart-summary-line--cashback" data-cart-cashback hidden>
            <div class="cart-summary-text">
              <span class="label">Com cashback</span>
              <span class="savings">Você economiza <strong data-cart-cashback-saved></strong></span>
            </div>
            <span class="value" data-cart-total-cashback>R$ 0,00</span>
          </div>
          <div class="cart-footer-actions">
            <button class="btn btn-primary cart-checkout" type="button" data-cart-checkout disabled>Finalizar compra</button>
            <button class="btn btn-ghost cart-clear" type="button" data-cart-clear hidden>Esvaziar carrinho</button>
          </div>
        </footer>
      </aside>
    `;
    document.body.appendChild(drawer);

    toastEl = document.createElement('div');
    toastEl.className = 'cart-toast';
    document.body.appendChild(toastEl);

    itemsEl = drawer.querySelector('[data-cart-items]');
    emptyEl = drawer.querySelector('[data-cart-empty]');
    totalEl = drawer.querySelector('[data-cart-total]');
    checkoutBtn = drawer.querySelector('[data-cart-checkout]');
    clearBtn = drawer.querySelector('[data-cart-clear]');
    cashbackBox = drawer.querySelector('[data-cart-cashback]');
    cashbackValueEl = drawer.querySelector('[data-cart-total-cashback]');
    cashbackSavedEl = drawer.querySelector('[data-cart-cashback-saved]');

    drawer.addEventListener('click', (event)=>{
      const trigger = event.target.closest('[data-cart-dismiss]');
      if(trigger){
        event.preventDefault();
        closeCart();
      }
    });

    itemsEl.addEventListener('click', onItemAction);
    checkoutBtn.addEventListener('click', checkoutCart);
    clearBtn.addEventListener('click', clearCart);
  }

  function bindGlobalEvents(){
    if(closeButtonsBound) return;
    closeButtonsBound = true;

    const openers = document.querySelectorAll('[data-cart-open]');
    openers.forEach(btn=>{
      btn.addEventListener('click', (event)=>{
        event.preventDefault();
        toggleCart(true);
      });
    });

    window.addEventListener('keydown', (event)=>{
      if(event.key === 'Escape'){
        closeCart();
      }
    });

    window.addEventListener(CART_ADD_EVENT, (event)=>{
      const item = normalizePayload(event?.detail);
      if(!item) return;
      addItem(item);
      toggleCart(true);
      showToast(`${item.name} adicionado ao carrinho.`);
    });

    window.addEventListener(CART_OPEN_EVENT, ()=>toggleCart(true));

    window.addEventListener('storage', (event)=>{
      if(event.key === CART_KEY){
        cart = loadCartFromStorage();
        render();
      }
      if(event.key === CASHBACK_RESULT_KEY){
        cashbackInfo = readCashbackFromStorage();
        renderSummary();
      }
    });

    window.addEventListener(CASHBACK_EVENT, (event)=>{
      const next = extractCashbackInfo(event?.detail);
      cashbackInfo = next ?? readCashbackFromStorage();
      renderSummary();
    });
  }

  function toggleCart(forceOpen){
    const shouldOpen = forceOpen === true ? true : !drawer.classList.contains('is-open');
    if(shouldOpen){
      openCart();
    }else{
      closeCart();
    }
  }

  function openCart(){
    if(!drawer) return;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden','false');
    document.body.classList.add('cart-open');
  }

  function closeCart(){
    if(!drawer) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden','true');
    document.body.classList.remove('cart-open');
  }

  function addItem(item){
    const existing = cart.find(entry=>entry.id===item.id);
    if(existing){
      existing.quantity = clampQuantity(existing.quantity + item.quantity);
    }else{
      cart.push(item);
    }
    persistCart();
    render();
  }

  function onItemAction(event){
    const actionBtn = event.target.closest('[data-action]');
    if(!actionBtn) return;
    event.preventDefault();
    const li = actionBtn.closest('[data-id]');
    if(!li) return;
    const id = li.getAttribute('data-id');
    if(!id) return;
    const action = actionBtn.getAttribute('data-action');
    if(action === 'increase'){
      updateQuantity(id, 1);
    }else if(action === 'decrease'){
      updateQuantity(id, -1);
    }else if(action === 'remove'){
      removeItem(id);
    }
  }

  function updateQuantity(id, delta){
    const entry = cart.find(item=>item.id===id);
    if(!entry) return;
    const nextQty = clampQuantity((entry.quantity||1) + delta);
    if(nextQty <= 0){
      cart = cart.filter(item=>item.id!==id);
    }else{
      entry.quantity = nextQty;
    }
    persistCart();
    render();
  }

  function clampQuantity(qty){
    const n = Number.isFinite(Number(qty)) ? Number(qty) : 1;
    return Math.max(0, Math.min(99, Math.round(n)));
  }

  function removeItem(id){
    cart = cart.filter(item=>item.id!==id);
    persistCart();
    render();
  }

  function clearCart(){
    cart = [];
    persistCart();
    render();
  }

  function checkoutCart(){
    if(!cart.length) return;
    const total = cart.reduce((sum,item)=>sum + item.price*item.quantity, 0);
    const cashback = computeCashback(total);
    const lines = cart.map(item=>`- ${item.name} (x${item.quantity}) — ${formatBRL(item.price*item.quantity)}`);
    const parts = [
      'Olá! Gostaria de finalizar a compra dos itens:',
      ...lines,
      '',
      `Total: ${formatBRL(total)}`
    ];
    if(cashback){
      parts.push(`Com cashback: ${formatBRL(cashback.finalPrice)} (economia de ${formatBRL(cashback.applied)})`);
    }
    const message = encodeURIComponent(parts.join('\n'));
    const url = `https://wa.me/${CHECKOUT_WHATSAPP}?text=${message}`;
    window.open(url, '_blank', 'noopener');
  }

  function render(){
    if(!itemsEl) return;
    if(cart.length){
      emptyEl.hidden = true;
      itemsEl.innerHTML = cart.map(renderItem).join('');
      checkoutBtn.disabled = false;
      clearBtn.hidden = false;
    }else{
      emptyEl.hidden = false;
      itemsEl.innerHTML = '';
      checkoutBtn.disabled = true;
      clearBtn.hidden = true;
    }
    renderSummary();
    updateBadge();
  }

  function renderSummary(){
    if(!totalEl) return;
    const total = cart.reduce((sum,item)=>sum + item.price*item.quantity, 0);
    totalEl.textContent = formatBRL(total);
    if(cart.length){
      const cashback = computeCashback(total);
      if(cashback){
        cashbackBox.hidden = false;
        cashbackValueEl.textContent = formatBRL(cashback.finalPrice);
        cashbackSavedEl.textContent = formatBRL(cashback.applied);
      }else{
        cashbackBox.hidden = true;
      }
    }else{
      cashbackBox.hidden = true;
    }
  }

  function renderItem(item){
    const lineTotal = item.price * item.quantity;
    const safeId = escapeAttr(item.id);
    const name = escapeHtml(item.name);
    const img = escapeAttr(item.image || PLACEHOLDER_IMAGE);
    const url = item.url ? escapeAttr(item.url) : '';
    const qty = clampQuantity(item.quantity || 1) || 1;
    const linkStart = url ? `<a href="${url}">` : '<span>';
    const linkEnd = url ? '</a>' : '</span>';
    return `
      <li class="cart-item" data-id="${safeId}">
        <div class="cart-item-media"><img src="${img}" alt="${name}"></div>
        <div class="cart-item-info">
          <div class="cart-item-title">${linkStart}${name}${linkEnd}</div>
          <div class="cart-item-meta">
            <span class="cart-item-price">${formatBRL(item.price)}</span>
            <span class="cart-item-total">${formatBRL(lineTotal)}</span>
          </div>
          <div class="cart-item-qty" aria-label="Quantidade">
            <button type="button" data-action="decrease" aria-label="Diminuir quantidade">−</button>
            <span>${qty}</span>
            <button type="button" data-action="increase" aria-label="Aumentar quantidade">+</button>
          </div>
        </div>
        <button class="cart-item-remove" type="button" data-action="remove" aria-label="Remover item">&times;</button>
      </li>`;
  }

  function updateBadge(){
    if(!countBadge) return;
    const totalQty = cart.reduce((sum,item)=>sum + (item.quantity||1), 0);
    countBadge.textContent = totalQty;
    countBadge.hidden = totalQty === 0;
  }

  function persistCart(){
    try{
      const serialized = JSON.stringify(cart.map(sanitizeForStorage));
      localStorage.setItem(CART_KEY, serialized);
    }catch(err){
      console.warn('[cart] não foi possível salvar o carrinho', err);
    }
    window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT,{detail:{items:cart.map(cloneItem)}}));
  }

  function sanitizeForStorage(item){
    return {
      id: item.id,
      name: item.name,
      price: item.price,
      image: item.image,
      url: item.url,
      quantity: clampQuantity(item.quantity || 1)
    };
  }

  function cloneItem(item){
    return { id:item.id, name:item.name, price:item.price, image:item.image, url:item.url, quantity:item.quantity };
  }

  function loadCartFromStorage(){
    if(typeof window === 'undefined' || !window.localStorage) return [];
    try{
      const raw = localStorage.getItem(CART_KEY);
      if(!raw) return [];
      const parsed = JSON.parse(raw);
      if(!Array.isArray(parsed)) return [];
      return parsed.map(normalizeStoredItem).filter(Boolean);
    }catch(err){
      console.warn('[cart] carrinho inválido no storage', err);
      return [];
    }
  }

  function normalizeStoredItem(entry){
    if(!entry) return null;
    const id = String(entry.id||'').trim();
    const name = String(entry.name||'').trim();
    const price = Number(entry.price);
    const quantity = clampQuantity(entry.quantity||1) || 1;
    if(!id || !name || !Number.isFinite(price)) return null;
    return {
      id,
      name,
      price,
      image: entry.image ? String(entry.image) : '',
      url: entry.url ? String(entry.url) : '',
      quantity
    };
  }

  function normalizePayload(detail){
    if(!detail) return null;
    const id = String(detail.id||'').trim();
    const name = String(detail.name||'').trim();
    const price = Number(detail.price);
    if(!id || !name || !Number.isFinite(price)) return null;
    const quantity = clampQuantity(detail.quantity||1) || 1;
    return {
      id,
      name,
      price,
      image: detail.image ? String(detail.image) : '',
      url: detail.url ? String(detail.url) : '',
      quantity
    };
  }

  function readCashbackFromStorage(){
    if(typeof window === 'undefined' || !window.localStorage) return null;
    try{
      const raw = localStorage.getItem(CASHBACK_RESULT_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      return extractCashbackInfo(parsed?.data ?? parsed);
    }catch{
      return null;
    }
  }

  function extractCashbackInfo(payload){
    if(!payload) return null;
    const data = payload.data ?? payload;
    if(!data || data.found === false) return null;
    const amount = [data.cashback, data.valor, data.saldo, data.balance]
      .map(Number)
      .find(v=>Number.isFinite(v) && v>0);
    if(!Number.isFinite(amount) || amount<=0) return null;
    return { amount: amount };
  }

  function computeCashback(price){
    if(!cashbackInfo) return null;
    const amount = Math.max(Number(cashbackInfo.amount)||0, 0);
    if(!Number.isFinite(amount) || amount<=0) return null;
    const applied = Math.min(amount, Math.max(price,0));
    if(!Number.isFinite(applied) || applied<=0) return null;
    const finalPrice = Math.max(price - applied, 0);
    return { applied, finalPrice };
  }

  function formatBRL(value){
    return Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  }

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function escapeAttr(str){
    return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  }

  function showToast(message){
    if(!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>toastEl.classList.remove('is-show'), 2600);
  }
})();
