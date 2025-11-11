const CART_ADD_EVENT = 'iw-cart-add';
const CASHBACK_RESULT_KEY = 'iw.cb.result.v1';
const CASHBACK_EVENT = 'iw-cashback-update';
const PLACEHOLDER_IMAGE = '/assets/img/product-placeholder.svg';

const els = {
  grid: null,
  count: null,
  empty: null
};

let cashbackInfo = readCashbackFromStorage();
let products = [];
let fetchError = false;

document.addEventListener('DOMContentLoaded', init);

document.addEventListener('click', (event)=>{
  const btn = event.target.closest('[data-product-cart]');
  if(!btn) return;
  event.preventDefault();
  const payload = decodeCartPayload(btn.getAttribute('data-product-cart'));
  if(payload){
    window.dispatchEvent(new CustomEvent(CART_ADD_EVENT,{detail:payload}));
  }
});

window.addEventListener(CASHBACK_EVENT, (event)=>{
  const next = extractCashbackInfo(event?.detail);
  cashbackInfo = next ?? readCashbackFromStorage();
  render();
});

window.addEventListener('storage', (event)=>{
  if(event.key === CASHBACK_RESULT_KEY){
    cashbackInfo = readCashbackFromStorage();
    render();
  }
});

async function init(){
  els.grid = document.getElementById('black-grid');
  els.count = document.getElementById('black-count');
  els.empty = document.getElementById('black-empty');
  if(!els.grid || !els.count || !els.empty) return;

  try{
    const data = await loadBlackFridayProducts();
    products = data;
    fetchError = false;
  }catch(err){
    console.error('Falha ao carregar produtos Black Friday', err);
    products = [];
    fetchError = true;
  }
  render();
}

function render(){
  if(!els.grid || !els.count || !els.empty) return;
  if(products.length){
    els.grid.hidden = false;
    els.grid.innerHTML = products.map(renderCard).join('');
    els.empty.hidden = true;
    els.count.textContent = products.length === 1
      ? '1 oferta especial disponível agora.'
      : `${products.length} ofertas especiais preparadas para a Black Friday.`;
    if(window.initializeProductGalleries){
      window.initializeProductGalleries(els.grid);
    }
  }else{
    els.grid.hidden = true;
    els.grid.innerHTML = '';
    els.count.textContent = '';
    els.empty.textContent = fetchError
      ? 'Não foi possível carregar as ofertas de Black Friday. Tente novamente em instantes.'
      : 'Nenhum produto marcado como Black Friday ainda.';
    els.empty.hidden = false;
  }
}

async function loadBlackFridayProducts(){
  const url = new URL('/api/products', location.origin);
  url.searchParams.set('black','1');
  url.searchParams.set('_', Date.now());
  const res = await fetch(url.toString());
  if(!res.ok){
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  return normalizeProducts(data);
}

function normalizeProducts(arr){
  if(!Array.isArray(arr)) return [];
  return arr
    .map(item=>{
      const gallery = normalizeGallery(item.image, item.images, item.fotos, item.imagens).slice(0,3);
      return {
        id:item.id,
        name:item.name,
        subtitle:item.subtitle,
        price:Number(item.price),
        oldPrice:item.oldPrice!=null?Number(item.oldPrice):null,
        priceTwo: readComboPrice(item),
        image:gallery[0] || '',
        images:gallery,
        description:item.description || ''
      };
    })
    .filter(p=>p.id && p.name && Number.isFinite(p.price) && p.image);
}

function normalizeGallery(...sources){
  const collected = [];
  sources.forEach(src=>{
    if(Array.isArray(src)){
      collected.push(...src);
    }else if(src!=null){
      collected.push(src);
    }
  });
  const unique = [];
  collected.forEach(value=>{
    const str = String(value ?? '').trim();
    if(str && !unique.includes(str)){
      unique.push(str);
    }
  });
  return unique;
}

function renderCard(p){
  const priceNow = Number(p.price) || 0;
  const hasOld = Number.isFinite(Number(p.oldPrice)) && Number(p.oldPrice) > priceNow;
  const pct = hasOld ? Math.round((1 - priceNow / Number(p.oldPrice)) * 100) : 0;
  const installment = computeInstallments(priceNow);
  const isBlackFriday = Boolean(p.isBlackFriday ?? true);
  const cashback = isBlackFriday ? null : computeCashback(priceNow);
  const comboPrice = readComboPrice(p);
  const comboSavings = Number.isFinite(comboPrice) ? Math.max((priceNow*2) - comboPrice, 0) : 0;
  const hasCombo = Number.isFinite(comboPrice) && comboPrice>0;
  const gallery = normalizeGallery(p.image, Array.isArray(p.images)?p.images:[]).slice(0,3);
  const slidesSource = (gallery.length ? gallery : [p.image || PLACEHOLDER_IMAGE]).filter(Boolean);
  if(!slidesSource.length) slidesSource.push(PLACEHOLDER_IMAGE);
  const altBase = String(p.name || 'Produto');
  const slidesHtml = slidesSource.map((url,index)=>{
    const altText = slidesSource.length>1 ? `${altBase} - imagem ${index+1}` : altBase;
    return `
        <div class="product-media-slide" data-gallery-slide="${index}">
          <img src="${escapeHtml(url || PLACEHOLDER_IMAGE)}" alt="${escapeHtml(altText)}">
        </div>`;
  }).join('');
  const dotsHtml = slidesSource.length>1 ? `
        <div class="product-media-dots" role="tablist" aria-label="Galeria de imagens">
          ${slidesSource.map((_,index)=>`<button type="button" class="product-media-dot${index===0?' is-active':''}" data-gallery-dot="${index}" aria-label="Ver imagem ${index+1} de ${slidesSource.length} de ${escapeHtml(altBase)}"></button>`).join('')}
        </div>` : '';
  const controlsHtml = slidesSource.length>1 ? `
      <button class="product-media-control product-media-control--prev" type="button" data-gallery-prev aria-label="Ver imagem anterior de ${escapeHtml(altBase)}"><span aria-hidden="true">&#10094;</span></button>
      <button class="product-media-control product-media-control--next" type="button" data-gallery-next aria-label="Ver próxima imagem de ${escapeHtml(altBase)}"><span aria-hidden="true">&#10095;</span></button>` : '';
  const primaryImage = slidesSource[0] || PLACEHOLDER_IMAGE;
  const payload = encodeCartPayload({
    id:p.id,
    name:p.name,
    price:priceNow,
    image:primaryImage,
    url:`/produto/${encodeURIComponent(p.id)}`,
    priceTwo: Number.isFinite(comboPrice) && comboPrice>0 ? comboPrice : null
  });
  return `
  <article class="product-card">
    <div class="product-media" data-gallery>
      <a class="product-media-link" href="/produto/${encodeURIComponent(p.id)}" aria-label="${escapeHtml(p.name)}">
        <div class="product-media-track" data-gallery-track>
          ${slidesHtml}
        </div>
        ${dotsHtml}
        <span class="badge" ${pct?'':'hidden'}>- ${pct}%</span>
        <span class="badge badge-black" ${isBlackFriday?'':'hidden'}>Black Friday</span>
      </a>
      ${controlsHtml}
    </div>
    <div class="product-body">
      <h3 class="product-title">${escapeHtml(p.name)}</h3>
      ${p.subtitle?`<p class="product-subtitle">${escapeHtml(p.subtitle)}</p>`:''}
      <div class="product-pricing">
        ${hasOld ? `
        <div class="product-price-line">
          <span class="product-price-label">De:</span>
          <span class="price-old">${formatBRL(p.oldPrice)}</span>
        </div>`:''}
        <div class="product-price-line">
          <span class="product-price-label">Por:</span>
          <span class="price-now">${formatBRL(priceNow)}</span>
        </div>
        ${hasCombo ? `
        <div class="product-price-line product-price-line--combo">
          <span class="product-price-label">Leve 2:</span>
          <span class="price-combo">${formatBRL(comboPrice)}</span>
          ${comboSavings>0 ? `<span class="price-combo-saving">Economize ${formatBRL(comboSavings)}</span>` : ''}
        </div>`:''}
        ${installment ? `
        <div class="product-price-line product-price-line--installment">
          <span class="product-price-label">Parcelado:</span>
          <span class="price-installment">${installment.count}x de ${formatBRL(installment.value)}</span>
        </div>`:''}
        ${cashback ? `
        <div class="product-price-line product-price-line--cashback">
          <span class="product-price-label">Com cashback:</span>
          <span class="price-cashback">${formatBRL(cashback.finalPrice)}</span>
        </div>
        <div class="product-price-line product-price-line--savings">
          <span class="product-price-label">Você economiza:</span>
          <span class="price-saved">${formatBRL(cashback.applied)}</span>
        </div>`:''}
      </div>
      <div class="product-actions">
        <a class="btn btn-cta" href="/produto/${encodeURIComponent(p.id)}">Comprar agora</a>
        <button class="btn btn-ghost" type="button" data-product-cart="${payload}">Adicionar ao carrinho</button>
      </div>
    </div>
  </article>`;
}

function formatBRL(value){
  return Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function encodeCartPayload(data){
  try{
    return encodeURIComponent(JSON.stringify(data));
  }catch{
    return '';
  }
}

function decodeCartPayload(value){
  try{
    if(!value) return null;
    return JSON.parse(decodeURIComponent(value));
  }catch{
    return null;
  }
}

const COMBO_KEYS = ['priceTwo','price_for_two','priceForTwo','comboPrice','priceCombo','bundlePrice','priceBundle','leve2','leveDois','leve2Price'];
function parseComboValue(raw){
  if(typeof raw === 'number') return raw;
  if(typeof raw === 'string'){
    const normalized = raw.replace(/[^0-9,.-]/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',', '.');
    return Number(normalized);
  }
  return Number(raw);
}
function readComboPrice(source){
  if(!source || typeof source !== 'object') return null;
  for(const key of COMBO_KEYS){
    if(Object.prototype.hasOwnProperty.call(source, key)){
      const raw = source[key];
      if(raw === null || raw === undefined || raw === '') return null;
      const num = parseComboValue(raw);
      if(!Number.isFinite(num) || num <= 0) return null;
      return num;
    }
  }
  return null;
}

function computeInstallments(amount){
  const price = Number(amount);
  if(!Number.isFinite(price) || price < 200) return null;
  let count = 3;
  if(price >= 400) count = 5;
  else if(price >= 300) count = 4;
  const value = price / count;
  return { count, value };
}

function extractCashbackInfo(payload){
  if(!payload) return null;
  const data = payload.data ?? payload;
  if(!data || data.found === false) return null;
  const amount = [data.cashback, data.valor, data.saldo, data.balance]
    .map(Number)
    .find(v=>Number.isFinite(v) && v>0);
  if(!Number.isFinite(amount) || amount<=0) return null;
  const name = data.name ? String(data.name) : '';
  return { amount, name };
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

function computeCashback(price){
  if(!cashbackInfo) return null;
  const applied = Math.min(Math.max(Number(cashbackInfo.amount)||0,0), Math.max(price,0));
  if(!Number.isFinite(applied) || applied<=0) return null;
  const finalPrice = Math.max(price - applied, 0);
  return { applied, finalPrice };
}
