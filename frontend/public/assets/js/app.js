const $ = (s, c=document)=>c.querySelector(s);
const grid = $("#product-grid"), countEl=$("#count");
const inputSearch=$("#search"), selectCategory=$("#category"), selectSort=$("#sort");

const fmt = (n)=> Number(n).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
let PRODUCTS = [];

init().catch(err=>{
  console.error(err);
  countEl.textContent = "Erro ao carregar produtos.";
  grid.innerHTML = `<div class="muted">API indisponível.</div>`;
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
  const tags = (p.tags && Array.isArray(p.tags)) ? p.tags.join(",")
              : (typeof p.tags === "string" ? p.tags : "");

  const price = toNumber(priceRaw);
  const oldPrice = oldPriceRaw!=null ? toNumber(oldPriceRaw) : null;

  // gera um id estável se vier sem
  const id = (p.id || slugify(name)+"-"+Math.random().toString(36).slice(2,7));

  return {
    id, name, category, price, oldPrice,
    image, images: p.images || [],
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
  return `
  <article class="product-card">
    <a class="product-media" href="/produto/${encodeURIComponent(p.id)}" aria-label="${escapeHtml(p.name)}">
      <img src="${p.image}" alt="${escapeHtml(p.name)}">
      <span class="badge" ${hasOld?"":"hidden"}>- ${hasOld ? Math.round((1 - p.price/p.oldPrice)*100) : 0}%</span>
    </a>
    <div class="product-body">
      <h3 class="product-title">${escapeHtml(p.name)}</h3>
      ${p.subtitle ? `<p class="product-subtitle">${escapeHtml(p.subtitle)}</p>` : ""}
      <div class="product-price">
        <span class="price-now">${fmt(Number(p.price))}</span>
        <span class="price-old" ${hasOld ? "" : "hidden"}>${hasOld ? fmt(Number(p.oldPrice)) : ""}</span>
      </div>
      <div class="product-actions">
        <a class="btn btn-primary" href="/produto/${encodeURIComponent(p.id)}">Comprar</a>
        <a class="btn btn-ghost" href="/produto/${encodeURIComponent(p.id)}">Detalhes</a>
      </div>
    </div>
  </article>`;
}

function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function debounce(fn,wait=200){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),wait)};}
