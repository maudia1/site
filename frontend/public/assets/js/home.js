// Scroll reveal
const observer = new IntersectionObserver((entries)=>{
  entries.forEach(e=>{
    if(e.isIntersecting){ e.target.classList.add('reveal-in'); observer.unobserve(e.target); }
  });
},{threshold:0.14});
document.querySelectorAll('.reveal, .section-title, .pill').forEach(el=>observer.observe(el));

// Categoria chips sticky highlight
const catSections = Array.from(document.querySelectorAll('.cat-section'));
const catChips = Array.from(document.querySelectorAll('.cat-chip'));
if(catSections.length && catChips.length){
  const toggleActive = (id)=>{
    catChips.forEach(link=>link.classList.toggle('is-active', link.getAttribute('href')?.replace('#','')===id));
  };
  const sectionObs = new IntersectionObserver((entries)=>{
    const visible = entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio);
    if(visible[0]){
      toggleActive(visible[0].target.id);
    }
  },{rootMargin:'-40% 0px -45% 0px',threshold:[0.2,0.45]});
  catSections.forEach(section=>sectionObs.observe(section));
  catChips.forEach(link=>link.addEventListener('click',()=>{
    const id = link.getAttribute('href')?.replace('#','');
    if(id) toggleActive(id);
  }));
  toggleActive(catSections[0].id);
}

// Destaques + catálogo compacto (pega da API se existir)
(async function(){
  const featuredGrid = document.getElementById('featured-grid');
  const catalogGrid = document.getElementById('catalog-grid');
  if(!featuredGrid && !catalogGrid) return;

  const fallbackProducts = [
    {
      id:'capa-iphone-14-pro-max-clear',
      name:'Capa Transparente MagSafe iPhone 14 Pro Max',
      subtitle:'Original Apple com ímãs alinhados',
      price:369,
      oldPrice:429,
      image:'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MQKK3?wid=572&hei=572&fmt=jpeg&qlt=95&.v=1661027782391'
    },
    {
      id:'airpods-pro-2',
      name:'AirPods Pro (2ª geração) com Estojo USB-C',
      subtitle:'Cancelamento ativo de ruído e áudio espacial',
      price:2049,
      oldPrice:2299,
      image:'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airpods-pro-2nd-gen-usbc-202309?wid=572&hei=572&fmt=jpeg&qlt=95&.v=1694029134848'
    },
    {
      id:'carregador-35w-duplo',
      name:'Carregador Duplo Apple USB-C 35W',
      subtitle:'Energia para iPhone e Apple Watch juntos',
      price:589,
      oldPrice:null,
      image:'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MMX62?wid=572&hei=572&fmt=jpeg&qlt=95&.v=1653331020915'
    },
    {
      id:'apple-watch-ultra-cinta-ocean',
      name:'Apple Watch Ultra 2 com pulseira Ocean Azul',
      subtitle:'GPS + Celular, caixa titânio 49 mm',
      price:9499,
      oldPrice:9999,
      image:'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MY203ref_VW_34FR+watch-case-49-titanium-ultra2-cell-ocean-blue-nc-s9_GEO_BR?wid=572&hei=572&fmt=jpeg&qlt=95&.v=1693184157828'
    }
  ];

  const featuredFromApi = await loadFeaturedFromApi();
  const featuredToShow = featuredFromApi.length ? featuredFromApi.slice(0,3) : fallbackProducts.slice(0,3);

  if(featuredGrid){
    featuredGrid.innerHTML = featuredToShow.map(renderCard).join('');
  }

  if(catalogGrid){
    const featuredIds = new Set(featuredToShow.map(p=>p.id));
    const curated = await loadHomeCurated();
    const baseList = Array.isArray(curated) && curated.length ? curated : await loadCatalogFromApi();
    let catalogToShow = baseList.filter(p=>!featuredIds.has(p.id));

    if(!catalogToShow.length){
      catalogToShow = fallbackProducts.filter(p=>!featuredIds.has(p.id));
    }else{
      const fillers = fallbackProducts.filter(p=>!featuredIds.has(p.id) && !catalogToShow.some(item=>item.id===p.id));
      catalogToShow = catalogToShow.concat(fillers);
    }

    catalogToShow = catalogToShow.slice(0,6);

    catalogGrid.innerHTML = catalogToShow.length
      ? catalogToShow.map(renderCard).join('')
      : '<p class="muted">Cadastre produtos no painel para vê-los aqui.</p>';
  }

  function renderCard(p){
    const hasOld = Number.isFinite(Number(p.oldPrice)) && p.oldPrice>p.price;
    const pct = hasOld ? Math.round((1-p.price/p.oldPrice)*100) : 0;
    return `
    <article class="product-card">
      <a class="product-media" href="/produto/${encodeURIComponent(p.id)}">
        <img src="${p.image}" alt="${escapeHtml(p.name)}">
        <span class="badge" ${hasOld?'':'hidden'}>- ${pct}%</span>
      </a>
      <div class="product-body">
        <h3 class="product-title">${escapeHtml(p.name)}</h3>
        ${p.subtitle?`<p class="product-subtitle">${escapeHtml(p.subtitle)}</p>`:''}
        <div class="product-price">
          <span class="price-now">${formatBRL(p.price)}</span>
          <span class="price-old" ${hasOld?'':'hidden'}>${hasOld?formatBRL(p.oldPrice):''}</span>
        </div>
        <div class="product-actions">
          <a class="btn btn-primary" href="/produto/${encodeURIComponent(p.id)}">Comprar</a>
          <a class="btn btn-ghost" href="/catalogo">Ver mais</a>
        </div>
      </div>
    </article>`;
  }

  async function loadFeaturedFromApi(){
    try{
      const res = await fetch('/api/featured-products');
      if(res.ok){
        return normalizeProducts(await res.json());
      }
    }catch{}
    return [];
  }

  async function loadCatalogFromApi(){
    try{
      const res = await fetch('/api/products');
      if(res.ok){
        return normalizeProducts(await res.json());
      }
    }catch{}
    return [];
  }
  async function loadHomeCurated(){
    try{
      const res = await fetch('/api/home-products');
      if(res.ok){
        return normalizeProducts(await res.json());
      }
    }catch{}
    return [];
  }

  function normalizeProducts(arr){
    if(!Array.isArray(arr)) return [];
    return arr.map(item=>({
      id:item.id,
      name:item.name,
      subtitle:item.subtitle,
      price:Number(item.price),
      oldPrice:item.oldPrice!=null?Number(item.oldPrice):null,
      image:item.image || (Array.isArray(item.images)&&item.images[0]) || ''
    })).filter(p=>p.id && p.name && Number.isFinite(Number(p.price)) && p.image);
  }

  function formatBRL(n){
    return Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
})();
