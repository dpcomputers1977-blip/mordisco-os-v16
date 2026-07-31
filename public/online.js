const SUPABASE_URL="https://nmmjthqflxwucpmmmrks.supabase.co";
const SUPABASE_KEY="sb_publishable_izCztp4wZ0MzKOHjT2KGYA_ot_3pgb0";
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s);
const money=n=>new Intl.NumberFormat("es-EC",{style:"currency",currency:"USD"}).format(Number(n||0));
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
let products=[],categories=[],methods=[],cart=[];

async function load(){
  const [p,c,m]=await Promise.all([
    db.from("v16_products").select("*,v16_categories(name)").eq("active",true).order("name"),
    db.from("v16_categories").select("*").eq("active",true).order("sort_order"),
    db.from("v16_payment_methods").select("*").eq("active",true).order("sort_order")
  ]);
  products=p.data||[];categories=c.data||[];methods=m.data||[];
  $("#onlineCategories").innerHTML='<button class="active" data-cat="all">Todos</button>'+categories.map(x=>`<button data-cat="${x.id}">${esc(x.name)}</button>`).join("");
  $("#onlineCategories").querySelectorAll("button").forEach(b=>b.onclick=()=>{
    $("#onlineCategories").querySelectorAll("button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");renderProducts(b.dataset.cat);
  });
  $("#requestedPayment").innerHTML=methods.map(x=>`<option value="${x.code}">${esc(x.name)}</option>`).join("");
  renderProducts("all");renderCart();
}

function activeCategory(){
  return $("#onlineCategories .active")?.dataset.cat||"all";
}

function renderProducts(cat){
  const q=$("#onlineSearch").value.trim().toLowerCase();
  const rows=products.filter(p=>(cat==="all"||String(p.category_id)===cat)&&(`${p.name} ${p.description||""}`).toLowerCase().includes(q));
  $("#onlineProducts").innerHTML=rows.map(p=>`<button class="product" data-id="${p.id}"><img src="${esc(p.image_url||"/media/hamburguesa.png")}" alt="${esc(p.name)}"><div><b>${esc(p.name)}</b><small>${esc(p.v16_categories?.name||"Mordisco")}</small><strong>${money(p.price)}</strong></div></button>`).join("")||"<p>No encontramos productos con esa búsqueda.</p>";
  $("#onlineProducts").querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>{
    const r=cart.find(x=>x.id===b.dataset.id);
    if(r)r.qty++;else cart.push({id:b.dataset.id,qty:1});
    renderCart();
  });
}

function renderCart(){
  let total=0,count=0;
  $("#onlineCart").innerHTML=cart.length?cart.map(r=>{
    const p=products.find(x=>String(x.id)===String(r.id));
    const subtotal=Number(p.price)*r.qty;total+=subtotal;count+=r.qty;
    return `<div class="cart-line"><div><b>${esc(p.name)}</b><small>${money(subtotal)}</small></div><div class="qty-controls"><button data-minus="${r.id}">−</button><span>${r.qty}</span><button data-plus="${r.id}">+</button></div></div>`;
  }).join(""):'<div class="empty-cart">Tu carrito está vacío.<br>Agrega algo delicioso.</div>';
  $("#onlineSubtotal").textContent=money(total);
  $("#onlineTotal").textContent=money(total);
  $("#cartCount").textContent=count;
  document.querySelectorAll("[data-minus]").forEach(b=>b.onclick=()=>{
    const r=cart.find(x=>x.id===b.dataset.minus);r.qty--;
    cart=cart.filter(x=>x.qty>0);renderCart();
  });
  document.querySelectorAll("[data-plus]").forEach(b=>b.onclick=()=>{
    cart.find(x=>x.id===b.dataset.plus).qty++;renderCart();
  });
}

async function submit(){
  const name=$("#customerName").value.trim();
  const phone=$("#customerPhone").value.trim();
  const delivery=$("#deliveryType").value;
  const address=$("#customerAddress").value.trim();

  if(!cart.length)return alert("Agrega productos a tu pedido.");
  if(!name||!phone)return alert("Ingresa tu nombre y teléfono.");
  if(delivery==="delivery"&&!address)return alert("Ingresa la dirección de entrega.");

  const button=$("#submitOnlineOrder");
  button.disabled=true;
  button.querySelector("span").textContent="Enviando pedido...";

  const total=cart.reduce((s,r)=>s+Number(products.find(p=>String(p.id)===String(r.id)).price)*r.qty,0);
  const {data,error}=await db.from("v16_orders").insert({
    source:"online",order_type:delivery,total,subtotal:total,status:"awaiting_confirmation",
    payment_status:"unpaid",customer_name:name,customer_phone:phone,
    customer_address:delivery==="delivery"?address:null,
    requested_payment_method:$("#requestedPayment").value,
    notes:$("#onlineNotes").value.trim()
  }).select().single();

  if(error){
    button.disabled=false;button.querySelector("span").textContent="Enviar pedido";
    return alert(error.message);
  }

  const items=cart.map(r=>{
    const p=products.find(x=>String(x.id)===String(r.id));
    return {order_id:data.id,product_id:p.id,product_name:p.name,quantity:r.qty,unit_price:p.price,subtotal:Number(p.price)*r.qty};
  });

  const {error:itemError}=await db.from("v16_order_items").insert(items);
  if(itemError){
    button.disabled=false;button.querySelector("span").textContent="Enviar pedido";
    return alert(itemError.message);
  }

  cart=[];renderCart();
  button.disabled=false;button.querySelector("span").textContent="Enviar pedido";
  $("#onlineMessage").innerHTML=`<div><span class="eyebrow">PEDIDO RECIBIDO</span><h2>¡Gracias!</h2><p>Tu pedido <b>#${data.order_number}</b> fue enviado correctamente.</p><p>Caja lo revisará antes de enviarlo a Cocina.</p><a href="/">Volver al inicio</a></div>`;
  $("#onlineMessage").classList.add("show");
}

$("#onlineSearch").oninput=()=>renderProducts(activeCategory());
$("#deliveryType").onchange=()=>$("#addressWrap").classList.toggle("hidden",$("#deliveryType").value!=="delivery");
$("#submitOnlineOrder").onclick=submit;
load();