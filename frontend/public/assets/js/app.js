const CART_ADD_EVENT = 'iw-cart-add';
const $ = (s, c=document)=>c.querySelector(s);
const grid = $("#product-grid"), countEl=$("#count");
const inputSearch=$("#search"), selectCategory=$("#category"), selectSort=$("#sort");

const fmt = (n)=> Number(n).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const PLACEHOLDER_IMAGE = "/assets/img/product-placeholder.svg";
const CASHBACK_RESULT_KEY = 'iw.cb.result.v1';
const CASHBACK_EVENT = 'iw-cashback-update';
let cashbackInfo = readCashbackFromStorage();
let PRODUCTS = [];

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
  applyInitialQuery();
  bind();
  render();
}

/* === 1) Tenta API; se falhar/vazio, usa localStorage === */
async function loadProductsWithFallback(){
  try{
    const api = await fetchFromApi();
    if(Array.isArray(api) && api.length){
      PRODUCTS = api;
      return;
    }
  }catch(e){
    console.warn("Falha API, tentando localStorage…", e);
  }
  const ls = loadFromLocalStorage();
  if(ls.length){
    PRODUCTS = ls;
    return;
  }
  PRODUCTS = []; // nada encontrado
}

async function fetchFromApi(){
  const q = new URL(location.href).searchParams.get("q") || "";
  const url = new URL("/api/products", location.origin);
  if (q) url.searchParams.set("q", q);
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

  // gera um id estável se vier sem
  const id = (p.id || slugify(name)+"-"+Math.random().toString(36).slice(2,7));

  return {
    id, name, category, price, oldPrice,
    image: cover,
    images: normalizedImages,
    subtitle: p.subtitle || p.subtitulo || "",
    description: p.description || p.descricao || "",
    tags
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
function slugify(s){ return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }

/* === 3) UI === */
function populateCategories(){
  selectCategory.innerHTML = `<option value="__all">Todas</option>`;
  const cats = [...new Set(PRODUCTS.map(p=>p.category))].filter(Boolean).sort((a,b)=>a.localeCompare(b));
  cats.forEach(c=>{
    const o=document.createElement("option"); o.value=c; o.textContent=c; selectCategory.appendChild(o);
  });
}

function applyInitialQuery(){
  const q = new URL(location.href).searchParams.get("q") || "";
  if(q){ inputSearch.value = q.replace(/-/g," "); }
  const match = [...selectCategory.options].find(o=>o.value.toLowerCase()===q?.toLowerCase());
  if(match) selectCategory.value = match.value;
}

function bind(){
  inputSearch.addEventListener("input", debounce(render,200));
  selectCategory.addEventListener("change", render);
  selectSort.addEventListener("change", render);
}

function getFiltered(){
  const term = inputSearch.value.trim().toLowerCase();
  const cat = selectCategory.value;
  let list = PRODUCTS.filter(p=>{
    const inCat = (cat==="__all") || (p.category===cat);
    const inTxt = !term
      || p.name.toLowerCase().includes(term)
      || (p.subtitle||"").toLowerCase().includes(term)
      || (p.tags||"").toLowerCase().includes(term);
    return inCat && inTxt;
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
}

function cardHTML(p){
  const hasOld = p.oldPrice && Number(p.oldPrice) > Number(p.price);
  const priceNow = Number(p.price) || 0;
  const gallery = normalizeGallery(p.image, Array.isArray(p.images)?p.images:[]).slice(0,3);
  const coverRaw = gallery[0] || p.image || PLACEHOLDER_IMAGE;
  const cover = escapeHtml(coverRaw);
  const cb = computeCashback(priceNow);
  const payload = encodeCartPayload({
    id:p.id,
    name:p.name,
    price:priceNow,
    image:coverRaw,
    url:`/produto/${encodeURIComponent(p.id)}`
  });
  return `
  <article class="product-card">
    <a class="product-media" href="/produto/${encodeURIComponent(p.id)}" aria-label="${escapeHtml(p.name)}">
      <img src="${cover}" alt="${escapeHtml(p.name)}">
      <span class="badge" ${hasOld?"":"hidden"}>- ${hasOld ? Math.round((1 - p.price/p.oldPrice)*100) : 0}%</span>
    </a>
    <div class="product-body">
      <h3 class="product-title">${escapeHtml(p.name)}</h3>
      ${p.subtitle ? `<p class="product-subtitle">${escapeHtml(p.subtitle)}</p>` : ""}
      <div class="product-pricing">
        <div class="product-price-line">
          <span class="product-price-label">Preço:</span>
          <span class="price-now">${fmt(priceNow)}</span>
        </div>
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
        <a class="btn btn-primary" href="/produto/${encodeURIComponent(p.id)}">Comprar</a>
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
