const SUPABASE_URL="https://nmmjthqflxwucpmmmrks.supabase.co";
const SUPABASE_KEY="sb_publishable_izCztp4wZ0MzKOHjT2KGYA_ot_3pgb0";
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const money=n=>new Intl.NumberFormat("es-EC",{style:"currency",currency:"USD"}).format(Number(n||0));
let products=[],categories=[];

async function loadMenu(){
  try{
    const [p,c]=await Promise.all([
      db.from("v16_products").select("*").eq("active",true).order("name"),
      db.from("v16_categories").select("*").eq("active",true).order("sort_order")
    ]);

    if(p.error) throw p.error;
    if(c.error) throw c.error;

    categories=c.data||[];
    products=(p.data||[]).map(product=>({
      ...product,
      category_name:categories.find(category=>String(category.id)===String(product.category_id))?.name||"Mordisco"
    }));

    $("#webCategories").innerHTML=
      '<button class="active" data-cat="all">Todos</button>'+
      categories.map(x=>`<button data-cat="${x.id}">${esc(x.name)}</button>`).join("");

    $("#webCategories").querySelectorAll("button").forEach(b=>b.onclick=()=>{
      $("#webCategories").querySelectorAll("button").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      renderProducts(b.dataset.cat);
    });

    renderProducts("all");
  }catch(error){
    console.error("Error cargando productos:",error);
    $("#webProducts").innerHTML=`<p>No se pudo cargar el menú. Intenta actualizar la página.</p>`;
  }
}
function renderProducts(cat){
  const rows=products.filter(p=>cat==="all"||String(p.category_id)===cat).slice(0,8);
  $("#webProducts").innerHTML=rows.map(p=>`<article class="product-card"><img src="${esc(p.image_url||"/media/hamburguesa.png")}" alt="${esc(p.name)}"><div class="product-info"><small>${esc(p.category_name||"Mordisco")}</small><h3>${esc(p.name)}</h3><p>${esc(p.description||"Preparado al momento con todo el sabor Mordisco.")}</p><div class="product-bottom"><strong>${money(p.price)}</strong><a href="/online.html" aria-label="Pedir ${esc(p.name)}">+</a></div></div></article>`).join("")||"<p>Muy pronto verás aquí nuestro menú.</p>";
}
$("#menuToggle").onclick=()=>document.querySelector("nav").classList.toggle("open");
loadMenu();