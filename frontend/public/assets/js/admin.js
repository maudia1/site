// Admin iWanted — simples: sem ID, sem importar/exportar, sem imagens JSON
const DATA_URL = "assets/data/products.json";
const LS_KEY = "iw_admin_products_draft";

const state = {
  products: [],
  editingIndex: null,
  imageDataURL: "",
};

const els = {};
document.addEventListener("DOMContentLoaded", init);

async function init(){
  cacheEls();
  bindEvents();
  await loadBaseProducts();
  hydrateFormCats();
  renderTable();
  info("Pronto. Salva no seu navegador. Abra o Catálogo para ver.");
}

function cacheEls(){
  els.form = document.getElementById("product-form");
  els.name = document.getElementById("name");
  els.description = document.getElementById("description");
  els.category = document.getElementById("category");
  els.price = document.getElementById("price");
  els.oldPrice = document.getElementById("oldPrice");
  els.tags = document.getElementById("tags");
  els.imageUrl = document.getElementById("image-url");
  els.imageFile = document.getElementById("image-file");
  els.imagePreview = document.getElementById("image-preview");
  els.formTitle = document.getElementById("form-title");
  els.clear = document.getElementById("clear");
  els.search = document.getElementById("search");
  els.tbody = document.getElementById("tbody");
  els.catsDatalist = document.getElementById("cats");
  els.status = document.getElementById("status");
}

function bindEvents(){
  els.form.addEventListener("submit", (e) => { e.preventDefault(); saveProduct(); });
  els.clear.addEventListener("click", (e) => { e.preventDefault(); clearForm(); });
  els.search?.addEventListener("input", renderTable);

  document.querySelectorAll('input[name="imgtype"]').forEach(r =>
    r.addEventListener("change", onImageTypeChange)
  );

  els.imageUrl.addEventListener("input", () => {
    state.imageDataURL = "";
    previewImage(els.imageUrl.value || "");
  });

  els.imageFile.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataURL(file);
    state.imageDataURL = dataUrl;
    previewImage(dataUrl);
  });
}

async function loadBaseProducts(){
  // tenta rascunho do navegador primeiro
  const draft = localStorage.getItem(LS_KEY);
  if (draft){
    try { state.products = JSON.parse(draft); return; } catch {}
  }
  // senão, carrega o arquivo base (somente leitura)
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Erro ao carregar products.json");
    state.products = await res.json();
    saveDraft();
  } catch (e) {
    console.error(e);
    state.products = [];
  }
}

function saveDraft(){
  try { localStorage.setItem(LS_KEY, JSON.stringify(state.products)); } catch {}
}

function hydrateFormCats(){
  const cats = Array.from(new Set(state.products.map(p => p.category).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"pt-BR"));
  els.catsDatalist.innerHTML = cats.map(c => `<option value="${escapeAttr(c)}" />`).join("");
}

function renderTable(){
  const q = (els.search?.value || "").trim().toLowerCase();
  const rows = state.products
    .filter(p => {
      if (!q) return true;
      const hay = (p.name+" "+p.category+" "+(p.tags||[]).join(" ")).toLowerCase();
      return hay.includes(q);
    })
    .map((p, idx) => `
      <tr>
        <td>${escapeHTML(p.name)}</td>
        <td>${escapeHTML(p.category || "")}</td>
        <td>${formatPriceBR(p.price)}</td>
        <td>
          <div class="row-actions">
            <button class="btn ghost" onclick="editProduct(${idx})">Editar</button>
            <button class="btn ghost" onclick="dupProduct(${idx})">Duplicar</button>
            <button class="btn ghost" onclick="deleteProduct(${idx})">Excluir</button>
          </div>
        </td>
      </tr>
    `).join("");

  els.tbody.innerHTML = rows || `<tr><td colspan="4" class="muted">Sem produtos. Use o formulário ao lado.</td></tr>`;
}

function saveProduct(){
  clearErrors();

  const price = parseMoneyBR(els.price.value);
  const oldPrice = els.oldPrice.value ? parseMoneyBR(els.oldPrice.value) : null;

  const problems = [];
  if (!els.category.value.trim()) { markError(els.category); problems.push("Categoria é obrigatória."); }
  if (!els.name.value.trim())     { markError(els.name);     problems.push("Nome é obrigatório."); }
  if (!isFinite(price) || price <= 0) { markError(els.price); problems.push("Preço inválido. Use 299,00."); }

  const mainImage = (state.imageDataURL || els.imageUrl.value.trim() || "");

  if (problems.length){
    error("Corrija: " + problems.join(" "));
    return;
  }

  const prod = {
    name: els.name.value.trim(),
    description: els.description.value.trim(),
    category: els.category.value.trim(),
    price,
    old_price: isFinite(oldPrice) ? oldPrice : undefined,
    tags: (els.tags.value || "").split(",").map(s => s.trim()).filter(Boolean),
    image: mainImage,
    buy_url: "#",
    more_url: "#",
  };

  if (state.editingIndex === null){
    state.products.push(prod);
  } else {
    state.products[state.editingIndex] = prod;
  }

  saveDraft();
  hydrateFormCats();
  renderTable();
  clearForm();
  ok("Produto salvo.");
}

function editProduct(idx){
  const p = state.products[idx];
  state.editingIndex = idx;
  els.formTitle.textContent = `Editando produto`;
  els.name.value = p.name || "";
  els.description.value = p.description || "";
  els.category.value = p.category || "";
  els.price.value = formatBRInput(p.price);
  els.oldPrice.value = p.old_price != null ? formatBRInput(p.old_price) : "";
  els.tags.value = (p.tags || []).join(", ");

  state.imageDataURL = "";
  if (p.image && String(p.image).startsWith("data:")){
    document.querySelector('input[name="imgtype"][value="upload"]').checked = true;
    els.imageUrl.value = "";
    previewImage(p.image);
    state.imageDataURL = p.image;
  } else {
    document.querySelector('input[name="imgtype"][value="url"]').checked = true;
    els.imageUrl.value = p.image || "";
    previewImage(p.image || "");
  }
  onImageTypeChange();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function dupProduct(idx){
  const p = state.products[idx];
  const copy = { ...p }; // sem ID, apenas duplica
  state.products.splice(idx+1, 0, copy);
  saveDraft();
  renderTable();
  ok("Produto duplicado.");
}

function deleteProduct(idx){
  if (!confirm("Excluir este produto?")) return;
  state.products.splice(idx, 1);
  saveDraft();
  renderTable();
  info("Produto removido.");
}

function clearForm(){
  state.editingIndex = null;
  els.formTitle.textContent = "Novo produto";
  els.form.reset();
  state.imageDataURL = "";
  previewImage("");
  clearErrors();
  info("Formulário limpo.");
}

function onImageTypeChange(){
  const isURL = document.querySelector('input[name="imgtype"]:checked').value === "url";
  els.imageUrl.style.display = isURL ? "block" : "none";
  els.imageFile.parentElement.style.display = isURL ? "none" : "inline-flex";
}

function previewImage(src){
  if (src){
    els.imagePreview.innerHTML = `<img src="${escapeAttr(src)}" alt="Prévia">`;
    els.imagePreview.classList.remove("muted");
  } else {
    els.imagePreview.textContent = "Prévia da imagem...";
    els.imagePreview.classList.add("muted");
  }
}

/* ---------- helpers UI ---------- */
function markError(input){ input.classList.add("error"); }
function clearErrors(){ document.querySelectorAll(".error").forEach(el=>el.classList.remove("error")); }
function setStatus(text, kind="info"){
  if (!els.status) return;
  els.status.textContent = text || "";
  els.status.className = "status " + (kind==="error" ? "muted" : "");
}
function info(t){ setStatus(t,"info"); }
function ok(t){ setStatus(t,"ok"); }
function error(t){ setStatus(t,"error"); }

/* ---------- utils ---------- */
function escapeHTML(str=""){ return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escapeAttr(str=""){ return escapeHTML(String(str)).replace(/"/g,"&quot;"); }
function fileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

/* Números: aceita "1.299,50" ou "1299.50" → 1299.5 */
function parseMoneyBR(v){
  if (v == null) return NaN;
  let s = String(v).trim();
  s = s.replace(/\s/g,"").replace(/[R$\u00A0]/g,"");
  if (s.includes(",")){ s = s.replace(/\./g,"").replace(",","."); }
  return Number(s);
}
function formatPriceBR(v){
  try { return Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
  catch { return `R$ ${Number(v||0).toFixed(2)}`; }
}
function formatBRInput(v){
  const n = Number(v||0);
  return n.toLocaleString("pt-BR",{minimumFractionDigits:2, maximumFractionDigits:2});
}
