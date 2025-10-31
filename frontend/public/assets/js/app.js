const CART_ADD_EVENT = 'iw-cart-add';
const $ = (s, c=document)=>c.querySelector(s);
const grid = $("#product-grid"), countEl=$("#count");
const inputSearch=$("#search"), selectCategory=$("#category"), selectSort=$("#sort");
const selectCaseDevice=$("#caseDeviceFilter");
const caseFilterControl=document.querySelector('[data-case-filter]');
const whatsappButtons=[...document.querySelectorAll('[data-whatsapp-category]')];
const whatsappCtaContainer=document.querySelector('[data-whatsapp-container]');

const fmt = (n)=> Number(n).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const PLACEHOLDER_IMAGE = "/assets/img/product-placeholder.svg";
const DEFAULT_BRAND_LABEL = 'Sem marca';
const CASHBACK_RESULT_KEY = 'iw.cb.result.v1';
const CASHBACK_EVENT = 'iw-cashback-update';
const WHATSAPP_CONTACT = '5561992074182';
const WHATSAPP_DEFAULT_MESSAGE = 'Olá! Quero ver mais opções.';
let cashbackInfo = readCashbackFromStorage();
let PRODUCTS = [];
const CAPAS_SLUG = categorySlug('Capas');

document.addEventListener('click', (event)=>{
  const btn = event.target.closest('[data-product-cart]');
  if(!btn) return;
  event.preventDefault();
  const payload = decodeCartPayload(btn.getAttribute('data-product-cart'));
  if(payload){
    window.dispatchEvent(new CustomEvent(CART_ADD_EVENT,{detail:payload}));
  }
});

function normalizeGallery(...sources){
  const collected=[];
  sources.forEach(src=>{
    if(Array.isArray(src)){
      collected.push(...src);
    }else if(src!=null){
      collected.push(src);
    }
  });
  const unique=[];
  collected.forEach(value=>{
    const str=String(value??'').trim();
    if(str && !unique.includes(str)){
      unique.push(str);
    }
  });
  return unique;
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

const COMBO_KEYS = ['priceTwo','price_for_two','priceForTwo','comboPrice','priceCombo','bundlePrice','priceBundle','leve2','leveDois','leve2Price'];
function readComboPrice(source){
  if(!source || typeof source !== 'object') return null;
  for(const key of COMBO_KEYS){
    if(Object.prototype.hasOwnProperty.call(source, key)){
      const raw = source[key];
      if(raw === null || raw === undefined || raw === '') return null;
      let num;
      if(typeof raw === 'number'){
        num = raw;
      }else{
        num = toNumber(raw);
      }
      if(!Number.isFinite(num) || num <= 0) return null;
      return num;
    }
  }
  return null;
}

init().catch(err=>{
  console.error(err);
  countEl.textContent = "Erro ao carregar produtos.";
  grid.innerHTML = `<div class="muted">API indisponível.</div>`;
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
  await loadProductsWithFallback();
  populateCategories();
  populateCaseDeviceOptions();
  applyInitialQuery();
  bind();
  render();
}

/* === 1) Tenta API; se falhar/vazio, usa localStorage === */
async function loadProductsWithFallback(){
  try{
    const api = await fetchFromApi();
    if(Array.isArray(api) && api.length){
      PRODUCTS = api.map(applyBrandFallback);
      return;
    }
  }catch(e){
    console.warn("Falha API, tentando localStorage…", e);
  }
  const ls = loadFromLocalStorage();
  if(ls.length){
    PRODUCTS = ls.map(applyBrandFallback);
    return;
  }
  PRODUCTS = []; // nada encontrado
}

async function fetchFromApi(){
  const url = new URL("/api/products", location.origin);
  url.searchParams.set("_", Date.now());
  const r = await fetch(url.toString());
  if(!r.ok) throw new Error("Falha ao buscar /api/products: "+r.status);
  return await r.json();
}

/* === 2) Heurística para achar produtos no localStorage === */
function loadFromLocalStorage(){
  const list = [];
  for (let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i);
    // evite lixos conhecidos
    if(!k) continue;
    try{
      const val = JSON.parse(localStorage.getItem(k));
      if (Array.isArray(val) && val.length && looksLikeProductsArray(val)){
        list.push(...val.map(normalizeLocalProduct));
      }
    }catch{ /* não é JSON */ }
  }
  console.info(`Produtos via localStorage: ${list.length}`);
  return list;
}

function looksLikeProductsArray(arr){
  // precisa ter pelo menos name e price (ou campos parecidos)
  return arr.some(p => p && (p.name || p.nome) && (p.price!=null || p.preco!=null || p["preço"]!=null));
}

function normalizeLocalProduct(p){
  // tenta mapear campos comuns
  const name = p.name ?? p.nome ?? "Produto";
  const category = p.category ?? p.categoria ?? "Outros";
  const brandRaw = p.brand ?? p.marca ?? "";
  const priceRaw = p.price ?? p.preco ?? p["preço"] ?? 0;
  const oldPriceRaw = p.oldPrice ?? p.precoAntigo ?? p["preçoAntigo"] ?? null;
  const image = p.image ?? p.img ?? p.foto ?? p.imagem ?? "";
  const gallery = normalizeGallery(image, p.images, p.fotos, p.imagens).slice(0,3);
  const cover = gallery[0] || image || "";
  const normalizedImages = gallery.length ? gallery : (cover ? [cover] : []);
  const tags = (p.tags && Array.isArray(p.tags)) ? p.tags.join(",")
              : (typeof p.tags === "string" ? p.tags : "");

  const price = toNumber(priceRaw);
  const oldPrice = oldPriceRaw!=null ? toNumber(oldPriceRaw) : null;
  const comboPrice = readComboPrice(p);

  // gera um id estável se vier sem
  const id = (p.id || slugify(name)+"-"+Math.random().toString(36).slice(2,7));

  return {
    id, name, category, brand: formatBrand(brandRaw), price, oldPrice,
    priceTwo: comboPrice,
    image: cover,
    images: normalizedImages,
    subtitle: p.subtitle || p.subtitulo || "",
    description: p.description || p.descricao || "",
    tags,
    specs: (p.specs && typeof p.specs === "object" && !Array.isArray(p.specs)) ? p.specs : {}
  };
}

function toNumber(v){
  if(typeof v === "number") return v;
  const str = String(v ?? "").trim();
  if(!str) return NaN;
  const isNeg = /^-/.test(str);
  const cleaned = str.replace(/[^0-9.,-]/g, "").replace(/^-/, "");
  if(!/[0-9]/.test(cleaned)) return NaN;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let sep = null;
  if(hasComma && hasDot){
    sep = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".") ? "," : ".";
  }else if(hasComma){
    sep = ",";
  }else if(hasDot){
    const last = cleaned.lastIndexOf(".");
    const fracLen = cleaned.length - last - 1;
    if(fracLen > 0 && fracLen <= 2){
      sep = ".";
    }
  }
  let intPart = cleaned;
  let fracPart = "";
  if(sep){
    const idx = cleaned.lastIndexOf(sep);
    intPart = cleaned.slice(0, idx);
    fracPart = cleaned.slice(idx + 1);
  }
  intPart = intPart.replace(/[.,]/g, "");
  fracPart = fracPart.replace(/[.,]/g, "");
  const normalized = `${isNeg ? "-" : ""}${intPart || "0"}${fracPart ? "." + fracPart : ""}`;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}
function formatBrand(value){
  if(value === null || value === undefined) return DEFAULT_BRAND_LABEL;
  const str = String(value).trim();
  return str || DEFAULT_BRAND_LABEL;
}
function applyBrandFallback(product){
  if(!product || typeof product !== 'object') return product;
  const current = product.brand;
  const normalized = formatBrand(product.brand ?? product.marca);
  if(current === normalized) return product;
  return { ...product, brand: normalized };
}
function normalizeText(value){
  return String(value ?? "").normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
function slugify(s){
  return normalizeText(s).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function categorySlug(value){
  return slugify(value || '');
}
function getSelectedCategoryLabel(){
  if(!selectCategory) return '';
  const index = selectCategory.selectedIndex;
  if(index == null || index < 0) return '';
  const option = selectCategory.options[index];
  if(!option || option.value === "__all") return '';
  return option.textContent.trim();
}
function isCapasCategory(value){
  return categorySlug(value) === CAPAS_SLUG;
}
function normalizeCaseDeviceList(value){
  const list=[];
  const visit=(input)=>{
    if(Array.isArray(input)){
      input.forEach(visit);
      return;
    }
    if(input===null || input===undefined) return;
    const str=String(input).trim();
    if(!str || list.includes(str)) return;
    list.push(str);
  };
  visit(value);
  return list;
}
function formatCaseDeviceLabel(value){
  const list=normalizeCaseDeviceList(value);
  if(!list.length) return "";
  if(list.length===1) return list[0];
  if(list.length===2) return `${list[0]} e ${list[1]}`;
  const head=list.slice(0,-1).join(', ');
  return `${head} e ${list[list.length-1]}`;
}
function includesNormalizedText(value, term){
  if(!term) return true;
  if(Array.isArray(value)){
    return value.some(item=>includesNormalizedText(item, term));
  }
  return normalizeText(value).includes(term);
}
function findCategoryMatch(param){
  if(!param) return "";
  const target = categorySlug(param);
  if(!target) return "";
  const option = [...selectCategory.options].find(o => o.value !== "__all" && categorySlug(o.value) === target);
  return option ? option.value : "";
}
function buildWhatsAppMessage(){
  const label = getSelectedCategoryLabel();
  if(label){
    return `Olá! Quero ver mais opções de ${label}.`;
  }
  return WHATSAPP_DEFAULT_MESSAGE;
}
function updateWhatsAppLink(){
  const label = getSelectedCategoryLabel();
  const message = buildWhatsAppMessage();
  if(whatsappButtons.length){
    const url = `https://wa.me/${WHATSAPP_CONTACT}?text=${encodeURIComponent(message)}`;
    const ariaLabel = label ? `Ver mais opções de ${label} no WhatsApp` : 'Ver mais opções no WhatsApp';
    whatsappButtons.forEach(btn=>{
      btn.href = url;
      btn.setAttribute('aria-label', ariaLabel);
    });
  }
  if(whatsappCtaContainer){
    const shouldShow = Boolean(label);
    whatsappCtaContainer.hidden = !shouldShow;
  }
}
function caseDeviceSlug(value){
  if(Array.isArray(value)){
    const list=normalizeCaseDeviceList(value);
    if(!list.length) return '';
    return slugify(list[0]);
  }
  return slugify(value || '');
}
function findCaseDeviceMatch(param){
  if(!param || !selectCaseDevice) return "";
  const target = caseDeviceSlug(param);
  if(!target) return "";
  const option = [...selectCaseDevice.options].find(o => o.value !== "__all" && caseDeviceSlug(o.value) === target);
  return option ? option.value : "";
}
function syncUrlCaseDevice(value){
  if(typeof history === 'undefined' || !history.replaceState) return;
  try{
    const url = new URL(location.href);
    const slug = caseDeviceSlug(value);
    if(slug && value !== "__all"){
      url.searchParams.set('caseDevice', slug);
    }else{
      url.searchParams.delete('caseDevice');
    }
    history.replaceState({}, '', url);
  }catch{}
}
function syncUrlCategory(categoryValue, replaceSearch){
  if(typeof history === 'undefined' || !history.replaceState) return;
  try{
    const url = new URL(location.href);
    const slug = categorySlug(categoryValue);
    if(slug && categoryValue !== "__all"){
      url.searchParams.set('category', slug);
    }else{
      url.searchParams.delete('category');
    }
    if(replaceSearch){
      url.searchParams.delete('q');
    }
    history.replaceState({}, '', url);
  }catch{}
}
function syncUrlSearch(term){
  if(typeof history === 'undefined' || !history.replaceState) return;
  try{
    const url = new URL(location.href);
    const value = term.trim();
    if(value){
      url.searchParams.set('q', value);
    }else{
      url.searchParams.delete('q');
    }
    history.replaceState({}, '', url);
  }catch{}
}

/* === 3) UI === */
function populateCategories(){
  selectCategory.innerHTML = `<option value="__all">Todas</option>`;
  const cats = [...new Set(PRODUCTS.map(p=>p.category))].filter(Boolean).sort((a,b)=>a.localeCompare(b));
  cats.forEach(c=>{
    const o=document.createElement("option"); o.value=c; o.textContent=c; selectCategory.appendChild(o);
  });
}
function collectCaseDeviceOptions(){
  const seen = new Set();
  const list = [];
  PRODUCTS.forEach(p=>{
    if(!p || !isCapasCategory(p.category)) return;
    const caseDevices = (p.specs && typeof p.specs === "object" && !Array.isArray(p.specs)) ? normalizeCaseDeviceList(p.specs.caseDevice) : [];
    caseDevices.forEach(label=>{
      const key = caseDeviceSlug(label);
      if(!key || seen.has(key)) return;
      seen.add(key);
      list.push(label);
    });
  });
  return list.sort((a,b)=>a.localeCompare(b, 'pt-BR'));
}
function populateCaseDeviceOptions(){
  if(!selectCaseDevice) return;
  const options = collectCaseDeviceOptions();
  const base = [`<option value="__all">Todas</option>`];
  options.forEach(opt=>{
    const safe = escapeHtml(opt);
    base.push(`<option value="${safe}">${safe}</option>`);
  });
  selectCaseDevice.innerHTML = base.join("");
  updateCaseDeviceFilterVisibility();
}
function updateCaseDeviceFilterVisibility(){
  if(!selectCaseDevice || !caseFilterControl) return;
  const hasOptions = selectCaseDevice.options.length > 1;
  const shouldShow = hasOptions && isCapasCategory(selectCategory.value);
  caseFilterControl.hidden = !shouldShow;
  selectCaseDevice.disabled = !shouldShow;
  if(!shouldShow && selectCaseDevice.value !== "__all"){
    selectCaseDevice.value = "__all";
    syncUrlCaseDevice("__all");
  }
}

function applyInitialQuery(){
  const params = new URL(location.href).searchParams;
  const rawSearch = (params.get("q") || "").trim();
  const rawCategory = (params.get("category") || "").trim();
  const rawCaseDevice = (params.get("caseDevice") || "").trim();
  const hasCategoryParam = Boolean(rawCategory);
  const hasCaseParam = Boolean(rawCaseDevice);

  let matchedCategory = findCategoryMatch(rawCategory);
  let matchedFromSearch = false;
  let matchedCaseDevice = hasCaseParam ? findCaseDeviceMatch(rawCaseDevice) : "";

  if (!matchedCategory && rawSearch) {
    const fallbackMatch = findCategoryMatch(rawSearch);
    if (fallbackMatch) {
      matchedCategory = fallbackMatch;
      matchedFromSearch = true;
    }
  }

  if (matchedCaseDevice && (!matchedCategory || !isCapasCategory(matchedCategory))) {
    const capasOption = findCategoryMatch('capas');
    if (capasOption) {
      matchedCategory = capasOption;
    }
  }

  if (rawSearch && (!matchedCategory || hasCategoryParam)) {
    inputSearch.value = rawSearch.replace(/-/g, " ");
  } else {
    inputSearch.value = "";
  }

  if (matchedCategory) {
    selectCategory.value = matchedCategory;
  } else {
    selectCategory.value = "__all";
    if(rawCategory){
      syncUrlCategory("__all", false);
    }
  }

  if (matchedCategory) {
    syncUrlCategory(matchedCategory, matchedFromSearch && !hasCategoryParam);
  }

  if(selectCaseDevice){
    if(matchedCaseDevice && isCapasCategory(selectCategory.value)){
      selectCaseDevice.value = matchedCaseDevice;
    }else{
      selectCaseDevice.value = "__all";
    }
  }
  updateCaseDeviceFilterVisibility();

  if(matchedCaseDevice && isCapasCategory(selectCategory.value)){
    syncUrlCaseDevice(matchedCaseDevice);
  }else if(hasCaseParam){
    syncUrlCaseDevice("__all");
  }
}

function bind(){
  inputSearch.addEventListener("input", debounce(()=>{
    syncUrlSearch(inputSearch.value.trim());
    render();
  },200));
  selectCategory.addEventListener("change", ()=>{
    syncUrlCategory(selectCategory.value, false);
    updateCaseDeviceFilterVisibility();
    if(selectCaseDevice && caseFilterControl && !caseFilterControl.hidden){
      syncUrlCaseDevice(selectCaseDevice.value);
    }else{
      syncUrlCaseDevice("__all");
    }
    render();
  });
  selectSort.addEventListener("change", render);
  if(selectCaseDevice){
    selectCaseDevice.addEventListener("change", ()=>{
      syncUrlCaseDevice(selectCaseDevice.value);
      render();
    });
  }
}

function getFiltered(){
  const termRaw = inputSearch.value.trim();
  const normalizedTerm = normalizeText(termRaw);
  const cat = selectCategory.value;
  const selectedCatSlug = cat === "__all" ? "" : categorySlug(cat);
  const isCapasSelected = isCapasCategory(cat);
  const shouldFilterCase = Boolean(selectCaseDevice) && !selectCaseDevice.disabled && isCapasSelected && selectCaseDevice.value !== "__all";
  const selectedCaseSlug = shouldFilterCase ? caseDeviceSlug(selectCaseDevice.value) : "";
  let list = PRODUCTS.filter(p=>{
    const productCatSlug = categorySlug(p.category);
    const inCat = !selectedCatSlug || (productCatSlug === selectedCatSlug);
    const caseDevices = (p.specs && typeof p.specs === "object" && !Array.isArray(p.specs)) ? normalizeCaseDeviceList(p.specs.caseDevice) : [];
    const matchesCase = !shouldFilterCase || caseDevices.some(value => caseDeviceSlug(value) === selectedCaseSlug);
    const inTxt = !normalizedTerm
      || includesNormalizedText(p.name, normalizedTerm)
      || includesNormalizedText(p.subtitle, normalizedTerm)
      || includesNormalizedText(p.brand, normalizedTerm)
      || includesNormalizedText(p.tags, normalizedTerm)
      || includesNormalizedText(p.category, normalizedTerm)
      || includesNormalizedText(caseDevices, normalizedTerm);
    return inCat && inTxt && matchesCase;
  });
  const s = selectSort.value;
  if(s==="price_asc") list.sort((a,b)=>a.price-b.price);
  else if(s==="price_desc") list.sort((a,b)=>b.price-a.price);
  else if(s==="name_asc") list.sort((a,b)=>a.name.localeCompare(b.name));
  else if(s==="name_desc") list.sort((a,b)=>b.name.localeCompare(a.name));
  return list;
}

function render(){
  const items = getFiltered();
  countEl.textContent = `${items.length} produto${items.length===1?"":"s"} encontrados.`;
  grid.innerHTML = items.length ? items.map(cardHTML).join("") : `<div class="muted">Nada encontrado.</div>`;
  updateWhatsAppLink();
}

function cardHTML(p){
  const hasOld = p.oldPrice && Number(p.oldPrice) > Number(p.price);
  const priceNow = Number(p.price) || 0;
  const comboPrice = readComboPrice(p);
  const comboSavings = Number.isFinite(comboPrice) ? Math.max((priceNow*2) - comboPrice, 0) : 0;
  const hasCombo = Number.isFinite(comboPrice) && comboPrice > 0;
  const gallery = normalizeGallery(p.image, Array.isArray(p.images)?p.images:[]).slice(0,3);
  const coverRaw = gallery[0] || p.image || PLACEHOLDER_IMAGE;
  const cover = escapeHtml(coverRaw);
  const isBlackFriday = Boolean(p.isBlackFriday);
  const cb = isBlackFriday ? null : computeCashback(priceNow);
  const installment = computeInstallments(priceNow);
  const caseDevices = (p.specs && typeof p.specs === "object" && !Array.isArray(p.specs)) ? normalizeCaseDeviceList(p.specs.caseDevice) : [];
  const caseDeviceLabel = formatCaseDeviceLabel(caseDevices);
  const showCompatibility = caseDeviceLabel && String(p.category || "").toLowerCase() === "capas";
  const brandLabel = escapeHtml(formatBrand(p.brand));
  const payload = encodeCartPayload({
    id:p.id,
    name:p.name,
    price:priceNow,
    image:coverRaw,
    url:`/produto/${encodeURIComponent(p.id)}`,
    priceTwo: Number.isFinite(comboPrice) && comboPrice>0 ? comboPrice : null
  });
  return `
  <article class="product-card">
    <a class="product-media" href="/produto/${encodeURIComponent(p.id)}" aria-label="${escapeHtml(p.name)}">
      <img src="${cover}" alt="${escapeHtml(p.name)}">
      <span class="badge" ${hasOld?"":"hidden"}>- ${hasOld ? Math.round((1 - p.price/p.oldPrice)*100) : 0}%</span>
      <span class="badge badge-black" ${isBlackFriday?"":"hidden"}>Black Friday</span>
    </a>
    <div class="product-body">
      <p class="product-brand">${brandLabel}</p>
      <h3 class="product-title">${escapeHtml(p.name)}</h3>
      ${p.subtitle ? `<p class="product-subtitle">${escapeHtml(p.subtitle)}</p>` : ""}
      ${showCompatibility ? `<p class="product-compatibility">Compatível com ${escapeHtml(caseDeviceLabel)}</p>` : ""}
      <div class="product-pricing">
        <div class="product-price-line">
          <span class="product-price-label">Preço:</span>
          <span class="price-now">${fmt(priceNow)}</span>
        </div>
        ${hasCombo ? `
        <div class="product-price-line product-price-line--combo">
          <span class="product-price-label">Leve 2:</span>
          <span class="price-combo">${fmt(comboPrice)}</span>
          ${comboSavings>0 ? `<span class="price-combo-saving">Economize ${fmt(comboSavings)}</span>` : ''}
        </div>` : ''}
        ${installment ? `
        <div class="product-price-line product-price-line--installment">
          <span class="product-price-label">Parcelado:</span>
          <span class="price-installment">${installment.count}x de ${fmt(installment.value)}</span>
        </div>` : ""}
        ${cb ? `
        <div class="product-price-line product-price-line--cashback">
          <span class="product-price-label">Com seu cashback:</span>
          <span class="price-cashback">${fmt(cb.finalPrice)}</span>
        </div>
        <div class="product-price-line product-price-line--savings">
          <span class="product-price-label">Você economiza:</span>
          <span class="price-saved">${fmt(cb.applied)}</span>
        </div>` : ""}
      </div>
      <div class="product-actions">
        <a class="btn btn-cta" href="/produto/${encodeURIComponent(p.id)}">Comprar</a>
        <button class="btn btn-ghost" type="button" data-product-cart="${payload}">Adicionar ao carrinho</button>
      </div>
    </div>
  </article>`;
}

function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function debounce(fn,wait=200){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),wait)};}

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
