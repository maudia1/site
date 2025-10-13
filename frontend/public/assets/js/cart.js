(()=>{
  const CART_KEY = 'iw.cart.v1';
  const CART_ADD_EVENT = 'iw-cart-add';
  const CART_UPDATED_EVENT = 'iw-cart-updated';
  const CASHBACK_RESULT_KEY = 'iw.cb.result.v1';
  const CASHBACK_EVENT = 'iw-cashback-update';
  const PLACEHOLDER_IMAGE = '/assets/img/product-placeholder.svg';
  const CHECKOUT_WHATSAPP = '5561998348060';

  let cart = [];
  let cashbackInfo = null;
  let pageRoot;
  let itemsEl;
  let emptyEl;
  let totalEl;
  let checkoutBtn;
  let clearBtn;
  let cashbackBox;
  let cashbackValueEl;
  let cashbackSavedEl;
  let toastEl;
  let toastTimer = null;
  let metaEl;
  let badges = [];

  document.addEventListener('DOMContentLoaded', init);

  function init(){
    cashbackInfo = readCashbackFromStorage();
    cart = loadCartFromStorage();
    badges = Array.from(document.querySelectorAll('[data-cart-count]'));
    setupPageElements();
    ensureToast();
    bindGlobalEvents();
    render();
  }

  function setupPageElements(){
    pageRoot = document.querySelector('[data-cart-page]');
    if(!pageRoot) return;

    itemsEl = pageRoot.querySelector('[data-cart-items]');
    emptyEl = pageRoot.querySelector('[data-cart-empty]');
    totalEl = pageRoot.querySelector('[data-cart-total]');
    checkoutBtn = pageRoot.querySelector('[data-cart-checkout]');
    clearBtn = pageRoot.querySelector('[data-cart-clear]');
    cashbackBox = pageRoot.querySelector('[data-cart-cashback]');
    cashbackValueEl = pageRoot.querySelector('[data-cart-total-cashback]');
    cashbackSavedEl = pageRoot.querySelector('[data-cart-cashback-saved]');
    metaEl = pageRoot.querySelector('[data-cart-meta]');

    if(itemsEl){
      itemsEl.addEventListener('click', onItemAction);
    }
    if(checkoutBtn){
      checkoutBtn.addEventListener('click', checkoutCart);
    }
    if(clearBtn){
      clearBtn.addEventListener('click', clearCart);
    }
  }

  function ensureToast(){
    toastEl = document.querySelector('[data-cart-toast]');
    if(!toastEl){
      toastEl = document.createElement('div');
      toastEl.className = 'cart-toast';
      toastEl.setAttribute('role','status');
      toastEl.setAttribute('aria-live','polite');
      toastEl.dataset.cartToast = '';
      document.body.appendChild(toastEl);
    }
  }

  function bindGlobalEvents(){
    window.addEventListener(CART_ADD_EVENT, (event)=>{
      const item = normalizeCartItem(event?.detail);
      if(!item) return;
      addItem(item);
      showToast(`${item.name} adicionado ao carrinho.`);
    });

    window.addEventListener('storage', (event)=>{
      if(event.key === CART_KEY){
        cart = loadCartFromStorage();
        render();
      }
      if(event.key === CASHBACK_RESULT_KEY){
        cashbackInfo = readCashbackFromStorage();
        renderSummary();
        updateMeta();
      }
    });

    window.addEventListener(CASHBACK_EVENT, (event)=>{
      const next = extractCashbackInfo(event?.detail);
      cashbackInfo = next ?? readCashbackFromStorage();
      renderSummary();
      updateMeta();
    });
  }

  function addItem(item){
    const normalized = normalizeCartItem(item);
    if(!normalized) return;
    const existingIndex = cart.findIndex(entry=>entry.id===normalized.id);
    if(existingIndex>=0){
      const existing = cart[existingIndex];
      const nextQty = clampQuantity((existing.quantity||1) + (normalized.quantity||1));
      cart[existingIndex] = {
        id: existing.id,
        name: normalized.name || existing.name,
        price: normalized.price,
        image: normalized.image || existing.image,
        url: normalized.url || existing.url,
        quantity: nextQty
      };
    }else{
      cart.push(normalized);
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
    renderItems();
    renderSummary();
    updateBadge();
    updateMeta();
  }

  function renderItems(){
    if(!itemsEl) return;
    if(cart.length){
      if(emptyEl) emptyEl.hidden = true;
      itemsEl.innerHTML = cart.map(renderItem).join('');
    }else{
      if(emptyEl) emptyEl.hidden = false;
      itemsEl.innerHTML = '';
    }
    if(checkoutBtn){
      checkoutBtn.disabled = cart.length === 0;
    }
    if(clearBtn){
      clearBtn.hidden = cart.length === 0;
    }
  }

  function renderSummary(){
    const total = cart.reduce((sum,item)=>sum + item.price*item.quantity, 0);
    if(totalEl){
      totalEl.textContent = formatBRL(total);
    }
    if(!cashbackBox) return;
    if(cart.length){
      const cashback = computeCashback(total);
      if(cashback){
        cashbackBox.hidden = false;
        if(cashbackValueEl){
          cashbackValueEl.textContent = formatBRL(cashback.finalPrice);
        }
        if(cashbackSavedEl){
          cashbackSavedEl.textContent = formatBRL(cashback.applied);
        }
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
    if(!badges.length) return;
    const totalQty = cart.reduce((sum,item)=>sum + (item.quantity||1), 0);
    badges.forEach(badge=>{
      badge.textContent = totalQty;
      badge.hidden = totalQty === 0;
    });
  }

  function updateMeta(){
    if(!metaEl) return;
    const totalQty = cart.reduce((sum,item)=>sum + (item.quantity||1), 0);
    if(!cart.length){
      if(cashbackInfo && Number.isFinite(Number(cashbackInfo.amount)) && Number(cashbackInfo.amount) > 0){
        metaEl.textContent = `Você tem cashback de ${formatBRL(cashbackInfo.amount)} disponível.`;
      }else{
        metaEl.textContent = 'Adicione produtos para começar sua compra.';
      }
      return;
    }
    let message = totalQty === 1 ? '1 item no carrinho' : `${totalQty} itens no carrinho`;
    if(cashbackInfo && Number.isFinite(Number(cashbackInfo.amount)) && Number(cashbackInfo.amount) > 0){
      message += ` · cashback disponível de ${formatBRL(cashbackInfo.amount)}`;
    }
    metaEl.textContent = message;
  }

  function persistCart(){
    try{
      cart = cart.map(normalizeCartItem).filter(Boolean);
      const serialized = JSON.stringify(cart);
      localStorage.setItem(CART_KEY, serialized);
    }catch(err){
      console.warn('[cart] não foi possível salvar o carrinho', err);
    }
    window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT,{detail:{items:cart.map(cloneItem)}}));
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
      return parsed.map(normalizeCartItem).filter(Boolean);
    }catch(err){
      console.warn('[cart] carrinho inválido no storage', err);
      return [];
    }
  }

  function normalizeCartItem(entry){
    if(!entry) return null;
    const id = String(entry.id ?? '').trim();
    const name = String(entry.name ?? '').trim();
    const price = parsePrice(entry.price);
    if(!id || !name || !Number.isFinite(price)) return null;
    const quantity = clampQuantity(entry.quantity ?? 1) || 1;
    return {
      id,
      name,
      price,
      image: entry.image ? String(entry.image) : '',
      url: entry.url ? String(entry.url) : '',
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

  function parsePrice(value){
    if(typeof value === 'number'){
      return Number.isFinite(value) ? value : NaN;
    }
    const str = String(value ?? '').trim();
    if(!str) return NaN;
    const isNeg = /^-/.test(str);
    const cleaned = str.replace(/[^0-9.,-]/g,'').replace(/^-/, '');
    if(!/[0-9]/.test(cleaned)) return NaN;
    const hasComma = cleaned.includes(',');
    const hasDot = cleaned.includes('.');
    let sep = null;
    if(hasComma && hasDot){
      sep = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.') ? ',' : '.';
    }else if(hasComma){
      sep = ',';
    }else if(hasDot){
      const last = cleaned.lastIndexOf('.');
      const fracLen = cleaned.length - last - 1;
      if(fracLen > 0 && fracLen <= 2){
        sep = '.';
      }
    }
    let intPart = cleaned;
    let fracPart = '';
    if(sep){
      const idx = cleaned.lastIndexOf(sep);
      intPart = cleaned.slice(0, idx);
      fracPart = cleaned.slice(idx + 1);
    }
    intPart = intPart.replace(/[.,]/g,'');
    fracPart = fracPart.replace(/[.,]/g,'');
    const normalized = `${isNeg ? '-' : ''}${intPart || '0'}${fracPart ? '.' + fracPart : ''}`;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : NaN;
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
