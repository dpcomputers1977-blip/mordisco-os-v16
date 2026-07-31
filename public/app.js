const SUPABASE_URL="https://nmmjthqflxwucpmmmrks.supabase.co";
const SUPABASE_KEY="sb_publishable_izCztp4wZ0MzKOHjT2KGYA_ot_3pgb0";
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat("es-EC",{style:"currency",currency:"USD"}).format(Number(n||0));
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
let sessionStaff=null, sessionPin="", products=[],categories=[],customers=[],paymentMethods=[],posCart=[],commandCart=[],selectedTable=null,paymentOrder=null,cashCloseData=null,realtimeChannel=null,lastSyncAt=0;

function toast(message){const t=$("#toast");t.textContent=message;t.style.display="block";clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>t.style.display="none",2800)}
function setSyncStatus(text="Sincronizado",busy=false){
  const el=$("#syncStatus");
  if(el)el.textContent=text;
  document.body.classList.toggle("syncing",busy);
}
async function refreshActiveView(){
  const active=$$("#mainNav button").find(b=>b.classList.contains("active"))?.dataset.view;
  if(!active)return;
  setSyncStatus("Actualizando…",true);
  try{
    if(active==="dashboard") await loadDashboard();
    if(active==="pos"){await loadPendingPayments();await loadPosPaymentSummary()}
if(active==="online")await loadOnlineOrders()
    if(active==="commands") await loadCommands();
    if(active==="kitchen") await loadKitchen();
    if(active==="accounting") await loadAccounting();
    lastSyncAt=Date.now();
    setSyncStatus("Sincronizado",false);
  }catch(error){
    console.error(error);
    setSyncStatus("Reintentando…",false);
  }
}
function roleLabel(r){return({admin:"Administrador",cashier:"Cajero",waiter:"Mesero",kitchen:"Cocina"})[r]||r}

const ROLE_VIEWS={
  admin:["dashboard","pos","online","commands","kitchen","products","inventory","customers","staff","accounting"],
  cashier:["pos"],
  waiter:["commands"],
  kitchen:["kitchen"]
};
function canAccessView(view){
  return Boolean(sessionStaff && (ROLE_VIEWS[sessionStaff.role]||[]).includes(view));
}

function statusLabel(s){return({awaiting_confirmation:"Por confirmar",pending:"Pendiente",preparing:"Preparando",ready:"Lista",delivered:"Entregada",paid:"Pagada",unpaid:"Por cobrar"})[s]||s}
function todayISO(){return new Date().toISOString().slice(0,10)}
function updateClock(){ $("#clock").textContent=new Date().toLocaleString("es-EC",{dateStyle:"medium",timeStyle:"short"}); }
setInterval(updateClock,1000);updateClock();

async function loadLoginStaff(){
  const {data,error}=await db.from("v16_staff_public").select("*").eq("active",true).order("name");
  if(error){$("#loginStaff").innerHTML="<option>Error al cargar</option>";return toast("Ejecuta primero el SQL de V16 en Supabase");}
  $("#loginStaff").innerHTML=(data||[]).map(s=>`<option value="${s.id}">${esc(s.name)} — ${roleLabel(s.role)}</option>`).join("");
}
async function login(){
  const staffId=$("#loginStaff").value,pin=$("#loginPin").value.trim();
  if(!staffId||!/^\d{4,6}$/.test(pin))return toast("Selecciona empleado e ingresa un PIN válido");
  const {data,error}=await db.rpc("v16_verify_staff_pin",{p_staff_id:staffId,p_pin:pin});
  if(error||!data?.length)return toast(error?.message||"PIN incorrecto");
  sessionStaff=data[0];sessionPin=pin;
  sessionStorage.setItem("mordisco_staff",JSON.stringify(sessionStaff));
  sessionStorage.setItem("mordisco_pin",pin);
  enterApp();
}
function enterApp(){
  $("#loginView").classList.add("hidden");$("#appView").classList.remove("hidden");
  $("#currentUserName").textContent=sessionStaff.name;
  $("#currentUserRole").textContent=roleLabel(sessionStaff.role);
  $("#roleAccessInfo").textContent=({
    admin:"Acceso completo",
    cashier:"Solo Caja / POS",
    waiter:"Solo Comandas",
    kitchen:"Solo Cocina"
  })[sessionStaff.role]||"";
  $$("#mainNav button").forEach(button=>{
    button.classList.toggle("hidden",!canAccessView(button.dataset.view));
  });
  const defaultView=({cashier:"pos",waiter:"commands",kitchen:"kitchen",admin:"dashboard"})[sessionStaff.role];
  showView(defaultView);
  startRealtime();
}
function logout(){sessionStorage.clear();location.reload()}
function showView(name){
  if(!canAccessView(name)){
    const defaultView=({cashier:"pos",waiter:"commands",kitchen:"kitchen",admin:"dashboard"})[sessionStaff?.role]||"dashboard";
    toast("Tu cargo no tiene permiso para abrir esa sección");
    if(name!==defaultView)return showView(defaultView);
  }
  $$(".view").forEach(v=>v.classList.add("hidden"));$(`#view-${name}`)?.classList.remove("hidden");
  $$("#mainNav button").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  $("#pageTitle").textContent=({dashboard:"Dashboard",pos:"Caja / POS",online:"Pedidos web",commands:"Comandas",kitchen:"Cocina",products:"Productos",inventory:"Inventario",customers:"Clientes",staff:"Empleados",accounting:"Contabilidad"})[name];
  $(".sidebar").classList.remove("open");
  ({dashboard:loadDashboard,pos:loadPos,online:loadOnlineOrders,commands:loadCommands,kitchen:loadKitchen,products:loadProductsAdmin,inventory:loadInventory,customers:loadCustomers,staff:loadStaffAdmin,accounting:loadAccounting})[name]?.();
}

async function loadPaymentMethods(){
  const {data,error}=await db.from("v16_payment_methods").select("*").eq("active",true).order("sort_order");
  if(error){toast(error.message);paymentMethods=[];return}
  paymentMethods=data||[];
  const select=$("#paymentMethod");
  if(select){
    select.innerHTML=paymentMethods.map(m=>`<option value="${m.code}" data-cash="${m.requires_cash}">${esc(m.name)}</option>`).join("");
  }
  renderPaymentMethodButtons();
}
function paymentIcon(code){
  return ({cash:"💵",card:"💳",transfer:"🏦",de_una:"📲",ahorita:"📱"})[code]||"💰";
}
function renderPaymentMethodButtons(){
  const box=$("#paymentMethodButtons");
  if(!box)return;
  box.innerHTML=paymentMethods.map((m,index)=>`<button type="button" class="payment-method-button ${index===0?"active":""}" data-method="${m.code}"><span>${paymentIcon(m.code)}</span><b>${esc(m.name)}</b></button>`).join("");
  box.querySelectorAll("[data-method]").forEach(button=>{
    button.onclick=()=>{
      box.querySelectorAll(".payment-method-button").forEach(x=>x.classList.remove("active"));
      button.classList.add("active");
      $("#paymentMethod").value=button.dataset.method;
      updateChange();
    };
  });
  if(paymentMethods[0])$("#paymentMethod").value=paymentMethods[0].code;
}

async function loadCatalog(){
  const [p,c,u]=await Promise.all([
    db.from("v16_products").select("*,v16_categories(name)").eq("active",true).order("name"),
    db.from("v16_categories").select("*").eq("active",true).order("sort_order"),
    db.from("v16_customers").select("*").order("name")
  ]);
  if(p.error)return toast(p.error.message);
  products=p.data||[];categories=c.data||[];customers=u.data||[];
}
async function loadDashboard(){
  const start=todayISO()+"T00:00:00";
  const [orders,inventory]=await Promise.all([
    db.from("v16_orders").select("id,order_number,total,status,payment_status,payment_method,created_at,order_type").gte("created_at",start).order("created_at",{ascending:false}),
    db.from("v16_inventory").select("stock,minimum_stock")
  ]);
  const rows=orders.data||[];
  $("#metricSales").textContent=money(rows.filter(x=>x.payment_status==="paid").reduce((s,x)=>s+Number(x.total),0));
  $("#metricPaid").textContent=rows.filter(x=>x.payment_status==="paid").length;
  $("#metricKitchen").textContent=rows.filter(x=>["pending","preparing","ready"].includes(x.status)).length;
  $("#metricStock").textContent=(inventory.data||[]).filter(x=>Number(x.stock)<=Number(x.minimum_stock)).length;
  $("#recentOrders").innerHTML=rows.slice(0,8).map(o=>`<div class="list-row"><div><b>#${o.order_number}</b><small> ${new Date(o.created_at).toLocaleTimeString("es-EC",{hour:"2-digit",minute:"2-digit"})}</small></div><span>${money(o.total)}</span><span class="badge ${o.payment_status}">${statusLabel(o.payment_status)}</span></div>`).join("")||"Sin actividad hoy";
  $("#operationsSummary").innerHTML=[
    ["Pendientes de Cocina",rows.filter(x=>x.status==="pending").length],
    ["Preparando",rows.filter(x=>x.status==="preparing").length],
    ["Listas",rows.filter(x=>x.status==="ready").length],
    ["Pendientes de cobro",rows.filter(x=>x.payment_status==="unpaid").length]
  ].map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
  if(!paymentMethods.length) await loadPaymentMethods();
  $("#paymentSummary").innerHTML=paymentMethods.map(m=>{
    const amount=rows.filter(x=>x.payment_status==="paid"&&x.payment_method===m.code).reduce((s,x)=>s+Number(x.total),0);
    const count=rows.filter(x=>x.payment_status==="paid"&&x.payment_method===m.code).length;
    return `<div><span>${esc(m.name)} <small>(${count})</small></span><b>${money(amount)}</b></div>`;
  }).join("")||"Sin métodos configurados";
}
async function loadPos(){
  await Promise.all([loadCatalog(),loadPaymentMethods()]);
  $("#posCustomer").innerHTML='<option value="">Consumidor final</option>'+customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
  renderCategoryChips("#posCategories",renderPosProducts);
  renderPosProducts();renderPosCart();loadPendingPayments();loadPosPaymentSummary();
}
function renderCategoryChips(target,callback){
  const el=$(target);el.innerHTML=`<button class="active" data-cat="all">Todas</button>`+categories.map(c=>`<button data-cat="${c.id}">${esc(c.name)}</button>`).join("");
  el.querySelectorAll("button").forEach(b=>b.onclick=()=>{el.querySelectorAll("button").forEach(x=>x.classList.remove("active"));b.classList.add("active");callback(b.dataset.cat)});
}
function productCards(list,handler){
  return list.map(p=>`<button class="product-card" data-id="${p.id}">${p.image_url?`<img src="${esc(p.image_url)}">`:`<img src="/media/hamburguesa.png">`}<div><b>${esc(p.name)}</b><small>${esc(p.v16_categories?.name||"")}</small><strong>${money(p.price)}</strong></div></button>`).join("");
}
function renderPosProducts(cat="all"){
  const q=$("#posSearch").value.toLowerCase();
  const list=products.filter(p=>(cat==="all"||String(p.category_id)===cat)&&p.name.toLowerCase().includes(q));
  $("#posProducts").innerHTML=productCards(list,id=>{});
  $("#posProducts").querySelectorAll(".product-card").forEach(b=>b.onclick=()=>addCart(posCart,b.dataset.id,renderPosCart));
}
function addCart(cart,id,render){const row=cart.find(x=>String(x.id)===String(id));if(row)row.qty++;else cart.push({id,qty:1});render()}
function renderCart(target,cart,totalTarget){
  let total=0;
  $(target).innerHTML=cart.length?cart.map(r=>{const p=products.find(x=>String(x.id)===String(r.id));total+=Number(p.price)*r.qty;return `<div class="cart-line"><span>${esc(p.name)} × ${r.qty}<br><small>${money(Number(p.price)*r.qty)}</small></span><span class="qty-buttons"><button data-minus="${r.id}">−</button><button data-plus="${r.id}">+</button></span></div>`}).join(""):"Sin productos";
  $(totalTarget).textContent=money(total);
  $(target).querySelectorAll("[data-minus]").forEach(b=>b.onclick=()=>{const r=cart.find(x=>String(x.id)===String(b.dataset.minus));r.qty--;const i=cart.indexOf(r);if(r.qty<=0)cart.splice(i,1);renderCart(target,cart,totalTarget)});
  $(target).querySelectorAll("[data-plus]").forEach(b=>b.onclick=()=>{cart.find(x=>String(x.id)===String(b.dataset.plus)).qty++;renderCart(target,cart,totalTarget)});
  return total;
}
function renderPosCart(){renderCart("#posCart",posCart,"#posTotal")}
async function createOrder(cart,source,tableId=null,payNow=false){
  if(!cart.length)return toast("Agrega productos");
  const total=cart.reduce((s,r)=>s+Number(products.find(p=>String(p.id)===String(r.id)).price)*r.qty,0);
  const order={source,order_type:source==="command"?"table":$("#posOrderType").value,customer_id:source==="pos"?($("#posCustomer").value||null):null,table_id:tableId,total,subtotal:total,status:"pending",payment_status:"unpaid",created_by:sessionStaff.id};
  const {data,error}=await db.from("v16_orders").insert(order).select().single();
  if(error)return toast(error.message);
  const items=cart.map(r=>{const p=products.find(x=>String(x.id)===String(r.id));return {order_id:data.id,product_id:p.id,product_name:p.name,quantity:r.qty,unit_price:p.price,subtotal:Number(p.price)*r.qty}});
  const {error:itemError}=await db.from("v16_order_items").insert(items);if(itemError)return toast(itemError.message);
  if(tableId)await db.from("v16_tables").update({status:"occupied",current_order_id:data.id}).eq("id",tableId);
  cart.splice(0);renderPosCart();renderCommandCart();
  toast(`Orden #${data.order_number} enviada a Cocina`);
  if(payNow)openPayment(data);else{loadPendingPayments();loadDashboard()}
  return data;
}

async function loadPosPaymentSummary(){
  if(!paymentMethods.length) await loadPaymentMethods();
  const start=todayISO()+"T00:00:00";
  const {data,error}=await db.from("v16_orders")
    .select("total,payment_method,payment_status")
    .eq("payment_status","paid")
    .gte("paid_at",start);
  if(error)return toast(error.message);
  const rows=data||[];
  $("#posPaymentSummary").innerHTML=paymentMethods.map(m=>{
    const methodRows=rows.filter(x=>x.payment_method===m.code);
    const amount=methodRows.reduce((s,x)=>s+Number(x.total),0);
    return `<div><span>${paymentIcon(m.code)} ${esc(m.name)} <small>(${methodRows.length})</small></span><b>${money(amount)}</b></div>`;
  }).join("")||"Sin ventas hoy";
  $("#posDayTotal").textContent=money(rows.reduce((s,x)=>s+Number(x.total),0));
}

async function loadPendingPayments(){
  const {data,error}=await db.from("v16_orders").select("id,order_number,total,source,created_at").eq("payment_status","unpaid").order("created_at",{ascending:false}).limit(20);
  if(error)return;
  $("#pendingPayments").innerHTML=(data||[]).map(o=>`<div class="pending-card"><div><b>#${o.order_number}</b><small> ${o.source==="command"?"Comanda":"Caja"}</small></div><strong>${money(o.total)}</strong><button data-pay="${o.id}">Cobrar</button></div>`).join("")||"No hay cuentas pendientes";
  $("#pendingPayments").querySelectorAll("[data-pay]").forEach(b=>b.onclick=async()=>{const {data}=await db.from("v16_orders").select("*").eq("id",b.dataset.pay).single();openPayment(data)});
}
async function openPayment(order){
  paymentOrder=order;
  if(!paymentMethods.length) await loadPaymentMethods();
  renderPaymentMethodButtons();
  $("#paymentTitle").textContent=`Cobrar orden #${order.order_number}`;
  $("#paymentTotal").textContent=money(order.total);
  $("#paymentReceived").value=Number(order.total).toFixed(2);
  $("#paymentStatusText").textContent="Selecciona la forma de pago y confirma.";
  $("#confirmPayment").disabled=false;
  $("#confirmPayment").textContent="Confirmar cobro";
  updateChange();
  $("#paymentModal").classList.remove("hidden");
}
function selectedMethod(){
  return paymentMethods.find(m=>m.code===$("#paymentMethod").value);
}
function updateChange(){
  const method=selectedMethod();
  const cash=Boolean(method?.requires_cash);
  $("#receivedWrap").classList.toggle("hidden",!cash);
  $("#changeRow").classList.toggle("hidden",!cash);
  const received=Number($("#paymentReceived").value||0);
  const total=Number(paymentOrder?.total||0);
  $("#paymentChange").textContent=money(Math.max(0,received-total));
  if(!method){
    $("#paymentStatusText").textContent="Selecciona una forma de pago.";
  }else if(cash&&received<total){
    $("#paymentStatusText").textContent=`Faltan ${money(total-received)} para completar el pago.`;
  }else if(cash){
    $("#paymentStatusText").textContent=`Cambio a entregar: ${money(Math.max(0,received-total))}`;
  }else{
    $("#paymentStatusText").textContent=`Pago mediante ${method.name}.`;
  }
}
async function confirmPayment(){
  const methodInfo=selectedMethod();
  if(!methodInfo)return toast("Selecciona una forma de pago");
  const method=methodInfo.code,received=methodInfo.requires_cash?Number($("#paymentReceived").value||0):Number(paymentOrder.total);
  if(methodInfo.requires_cash&&received<Number(paymentOrder.total))return toast("El efectivo recibido es menor al total");

  const button=$("#confirmPayment");
  button.disabled=true;
  button.textContent="Procesando cobro…";
  $("#paymentStatusText").textContent="Registrando la venta y actualizando el sistema…";

  const {error}=await db.rpc("v16_pay_order",{p_order_id:paymentOrder.id,p_method:method,p_received:received,p_staff_id:sessionStaff.id,p_pin:sessionPin});
  if(error){
    button.disabled=false;
    button.textContent="Confirmar cobro";
    $("#paymentStatusText").textContent=error.message;
    return toast(error.message);
  }

  $("#paymentModal").classList.add("hidden");
  toast(`Cobro registrado con ${methodInfo.name}`);
  await Promise.all([loadPendingPayments(),loadPosPaymentSummary(),loadDashboard(),loadAccounting()]);
  setSyncStatus("Sincronizado");
}

async function loadOnlineOrders(){
 const {data,error}=await db.from("v16_orders").select("id,order_number,total,status,requested_payment_method,customer_name,customer_phone,customer_address,notes,created_at,v16_order_items(product_name,quantity,subtotal)").eq("source","online").in("status",["awaiting_confirmation","pending","preparing","ready"]).order("created_at",{ascending:false});
 if(error)return toast(error.message);
 $("#onlineOrdersList").innerHTML=(data||[]).map(o=>`<article class="online-order-card"><div class="online-order-head"><div><span class="badge ${o.status}">${statusLabel(o.status)}</span><h3>Pedido web #${o.order_number}</h3><small>${new Date(o.created_at).toLocaleString("es-EC")}</small></div><strong>${money(o.total)}</strong></div><div class="online-customer"><b>${esc(o.customer_name||"Cliente web")}</b><span>${esc(o.customer_phone||"")}</span><span>${esc(o.customer_address||"Retiro en local")}</span><span>Pago: ${esc(paymentMethods.find(m=>m.code===o.requested_payment_method)?.name||o.requested_payment_method||"Por definir")}</span></div><ul>${(o.v16_order_items||[]).map(i=>`<li>${i.quantity} × ${esc(i.product_name)} — ${money(i.subtotal)}</li>`).join("")}</ul>${o.notes?`<p class="notice">${esc(o.notes)}</p>`:""}<div class="online-actions">${o.status==="awaiting_confirmation"?`<button class="primary" data-confirm="${o.id}">Confirmar y enviar a Cocina</button><button data-reject="${o.id}">Rechazar</button>`:`<span class="badge ${o.status}">${statusLabel(o.status)}</span>`}</div></article>`).join("")||"<p>No hay pedidos web pendientes.</p>";
 $("#onlineOrdersList").querySelectorAll("[data-confirm]").forEach(b=>b.onclick=async()=>{const {error}=await db.rpc("v16_confirm_online_order",{p_order_id:b.dataset.confirm,p_staff_id:sessionStaff.id,p_pin:sessionPin});if(error)return toast(error.message);toast("Pedido confirmado");await Promise.all([loadOnlineOrders(),loadKitchen(),loadDashboard(),loadPendingPayments()])});
 $("#onlineOrdersList").querySelectorAll("[data-reject]").forEach(b=>b.onclick=async()=>{if(!confirm("¿Rechazar este pedido?"))return;const {error}=await db.rpc("v16_reject_online_order",{p_order_id:b.dataset.reject,p_staff_id:sessionStaff.id,p_pin:sessionPin});if(error)return toast(error.message);toast("Pedido rechazado");loadOnlineOrders()});
}

async function loadCommands(){
  await loadCatalog();renderCategoryChips("#commandCategories",renderCommandProducts);renderCommandProducts();renderCommandCart();
  const {data,error}=await db.from("v16_tables").select("*").eq("active",true).order("sort_order");if(error)return toast(error.message);
  $("#tablesGrid").innerHTML=(data||[]).map(t=>`<button class="table-card ${t.status}" data-table="${t.id}"><b>${esc(t.name)}</b><small>${t.seats} puestos</small><strong>${t.current_order_id?"Cuenta abierta":"Disponible"}</strong></button>`).join("");
  $("#tablesGrid").querySelectorAll("[data-table]").forEach(b=>b.onclick=()=>selectTable((data||[]).find(t=>String(t.id)===String(b.dataset.table))));
}
function selectTable(table){selectedTable=table;$("#commandTitle").textContent=table.name;$("#commandBuilder").classList.remove("hidden");if(table.current_order_id)toast("Esta mesa ya tiene una cuenta abierta")}
function renderCommandProducts(cat="all"){const q=$("#commandSearch").value.toLowerCase();const list=products.filter(p=>(cat==="all"||String(p.category_id)===cat)&&p.name.toLowerCase().includes(q));$("#commandProducts").innerHTML=productCards(list);$("#commandProducts").querySelectorAll(".product-card").forEach(b=>b.onclick=()=>addCart(commandCart,b.dataset.id,renderCommandCart))}
function renderCommandCart(){renderCart("#commandCart",commandCart,"#commandTotal")}
async function loadKitchen(){
  const {data,error}=await db.from("v16_orders").select("id,order_number,status,source,notes,created_at,v16_order_items(product_name,quantity)").in("status",["pending","preparing","ready"]).order("created_at");if(error)return toast(error.message);
  $("#kitchenBoard").innerHTML=(data||[]).map(o=>`<article class="kitchen-card"><span class="badge ${o.status}">${statusLabel(o.status)}</span><h4>Orden #${o.order_number}</h4><small>${o.source==="command"?"Mesa / Comanda":"Caja"} · ${new Date(o.created_at).toLocaleTimeString("es-EC",{hour:"2-digit",minute:"2-digit"})}</small><ul>${(o.v16_order_items||[]).map(i=>`<li>${i.quantity} × ${esc(i.product_name)}</li>`).join("")}</ul><p>${esc(o.notes||"")}</p><div class="kitchen-actions">${o.status==="pending"?`<button data-status="${o.id}:preparing">Preparar</button>`:""}${o.status==="preparing"?`<button data-status="${o.id}:ready">Marcar lista</button>`:""}${o.status==="ready"?`<button data-status="${o.id}:delivered">Entregar</button>`:""}</div></article>`).join("")||"No hay órdenes activas";
  $("#kitchenBoard").querySelectorAll("[data-status]").forEach(b=>b.onclick=async()=>{const [id,status]=b.dataset.status.split(":");const {error}=await db.rpc("v16_update_order_status",{p_order_id:id,p_status:status,p_staff_id:sessionStaff.id,p_pin:sessionPin});if(error)return toast(error.message);loadKitchen()});
}
async function loadProductsAdmin(){
  await loadCatalog();$("#productCategory").innerHTML=categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
  $("#productsAdmin").innerHTML=products.map(p=>`<div class="list-row"><div><b>${esc(p.name)}</b><small> ${esc(p.v16_categories?.name||"")}</small></div><strong>${money(p.price)}</strong><button data-disable="${p.id}">Desactivar</button></div>`).join("");
  $("#productsAdmin").querySelectorAll("[data-disable]").forEach(b=>b.onclick=async()=>{await db.from("v16_products").update({active:false}).eq("id",b.dataset.disable);loadProductsAdmin()});
}
async function loadInventory(){
  const {data,error}=await db.from("v16_inventory").select("*").order("name");if(error)return toast(error.message);
  $("#inventoryList").innerHTML=(data||[]).map(i=>`<div class="list-row"><div><b>${esc(i.name)}</b><small> mínimo ${i.minimum_stock} ${esc(i.unit)}</small></div><strong>${i.stock} ${esc(i.unit)}</strong><span class="badge ${Number(i.stock)<=Number(i.minimum_stock)?"pending":"paid"}">${Number(i.stock)<=Number(i.minimum_stock)?"Stock bajo":"Correcto"}</span></div>`).join("");
}
async function loadCustomers(){
  const {data,error}=await db.from("v16_customers").select("*").order("created_at",{ascending:false});if(error)return toast(error.message);
  $("#customersList").innerHTML=(data||[]).map(c=>`<div class="list-row"><div><b>${esc(c.name)}</b><small> ${esc(c.phone||"")} ${esc(c.email||"")}</small></div></div>`).join("")||"Sin clientes";
}
async function loadStaffAdmin(){
  const {data,error}=await db.from("v16_staff_public").select("*").order("name");if(error)return toast(error.message);
  $("#staffList").innerHTML=(data||[]).map(s=>`<div class="list-row"><div><b>${esc(s.name)}</b><small> ${roleLabel(s.role)}</small></div><span class="badge ${s.active?"paid":"pending"}">${s.active?"Activo":"Inactivo"}</span>${s.role!=="admin"?`<button data-toggle="${s.id}" data-active="${s.active}">${s.active?"Desactivar":"Activar"}</button>`:""}</div>`).join("");
  $("#staffList").querySelectorAll("[data-toggle]").forEach(b=>b.onclick=async()=>{const {error}=await db.rpc("v16_toggle_staff",{p_target_id:b.dataset.toggle,p_active:b.dataset.active!=="true",p_admin_id:sessionStaff.id,p_pin:sessionPin});if(error)return toast(error.message);loadStaffAdmin()});
}

async function openCashClose(){
  if(!paymentMethods.length) await loadPaymentMethods();
  const start=todayISO()+"T00:00:00";
  const [sales,expenses]=await Promise.all([
    db.from("v16_orders").select("total,payment_method,payment_status,paid_at").eq("payment_status","paid").gte("paid_at",start),
    db.from("v16_expenses").select("amount").gte("created_at",start)
  ]);
  if(sales.error)return toast(sales.error.message);
  if(expenses.error)return toast(expenses.error.message);

  const saleRows=sales.data||[],expenseRows=expenses.data||[];
  const salesTotal=saleRows.reduce((s,x)=>s+Number(x.total),0);
  const expenseTotal=expenseRows.reduce((s,x)=>s+Number(x.amount),0);
  const methods=paymentMethods.map(m=>{
    const rows=saleRows.filter(x=>x.payment_method===m.code);
    return {code:m.code,name:m.name,requires_cash:m.requires_cash,count:rows.length,total:rows.reduce((s,x)=>s+Number(x.total),0)};
  });
  cashCloseData={date:todayISO(),salesTotal,expenseTotal,result:salesTotal-expenseTotal,methods};

  $("#cashCloseTitle").textContent=`Cierre ${new Date().toLocaleDateString("es-EC")}`;
  $("#cashCloseSales").textContent=money(salesTotal);
  $("#cashCloseExpenses").textContent=money(expenseTotal);
  $("#cashCloseResult").textContent=money(salesTotal-expenseTotal);
  $("#cashCloseMethods").innerHTML=methods.map(m=>`<div><span>${esc(m.name)} <small>(${m.count})</small></span><b>${money(m.total)}</b></div>`).join("");
  const expectedCash=methods.filter(m=>m.requires_cash).reduce((s,m)=>s+m.total,0);
  $("#cashCounted").value=expectedCash.toFixed(2);
  updateCashDifference();
  $("#cashCloseModal").classList.remove("hidden");
}
function expectedCashTotal(){
  return (cashCloseData?.methods||[]).filter(m=>m.requires_cash).reduce((s,m)=>s+Number(m.total),0);
}
function updateCashDifference(){
  $("#cashDifference").textContent=money(Number($("#cashCounted").value||0)-expectedCashTotal());
}
async function saveCashClose(){
  if(!cashCloseData)return;
  const counted=Number($("#cashCounted").value||0);
  const payload={
    close_date:cashCloseData.date,
    staff_id:sessionStaff.id,
    sales_total:cashCloseData.salesTotal,
    expenses_total:cashCloseData.expenseTotal,
    expected_cash:expectedCashTotal(),
    counted_cash:counted,
    difference:counted-expectedCashTotal(),
    payment_breakdown:cashCloseData.methods,
    notes:$("#cashCloseNotes").value.trim()
  };
  const {error}=await db.rpc("v16_save_cash_close",{
    p_staff_id:sessionStaff.id,
    p_pin:sessionPin,
    p_sales_total:payload.sales_total,
    p_expenses_total:payload.expenses_total,
    p_expected_cash:payload.expected_cash,
    p_counted_cash:payload.counted_cash,
    p_difference:payload.difference,
    p_payment_breakdown:payload.payment_breakdown,
    p_notes:payload.notes
  });
  if(error)return toast(error.message);
  toast("Cierre de caja guardado");
  $("#cashCloseModal").classList.add("hidden");
}
function printCashClose(){
  if(!cashCloseData)return;
  const rows=cashCloseData.methods.map(m=>`<tr><td>${esc(m.name)}</td><td>${m.count}</td><td>${money(m.total)}</td></tr>`).join("");
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Cierre de Caja</title><style>body{font-family:Arial;padding:24px}h1{margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:18px}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}.totals{margin-top:20px;font-size:18px}.brand{font-weight:bold}</style></head><body><div class="brand">Mordisco Fast Food</div><h1>Cierre de Caja</h1><p>${new Date().toLocaleString("es-EC")}</p><table><thead><tr><th>Método</th><th>Ventas</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><p>Ventas: <b>${money(cashCloseData.salesTotal)}</b></p><p>Egresos: <b>${money(cashCloseData.expenseTotal)}</b></p><p>Resultado: <b>${money(cashCloseData.result)}</b></p><p>Efectivo contado: <b>${money(Number($("#cashCounted").value||0))}</b></p><p>Diferencia: <b>${money(Number($("#cashCounted").value||0)-expectedCashTotal())}</b></p></div></body></html>`;
  const w=window.open("","_blank","width=760,height=900");
  w.document.write(html);w.document.close();w.focus();w.print();
}

async function loadAccounting(){
  if(!paymentMethods.length) await loadPaymentMethods();
  const start=todayISO()+"T00:00:00";
  const [sales,expenses]=await Promise.all([db.from("v16_orders").select("total,paid_at,order_number,payment_method").eq("payment_status","paid").gte("paid_at",start),db.from("v16_expenses").select("*").gte("created_at",start).order("created_at",{ascending:false})]);
  const income=(sales.data||[]).reduce((s,x)=>s+Number(x.total),0),expense=(expenses.data||[]).reduce((s,x)=>s+Number(x.amount),0);
  $("#accountIncome").textContent=money(income);$("#accountExpense").textContent=money(expense);$("#accountResult").textContent=money(income-expense);
  const movements=[...(sales.data||[]).map(x=>({date:x.paid_at,label:`Venta #${x.order_number} · ${esc(paymentMethods.find(m=>m.code===x.payment_method)?.name||x.payment_method||"Sin método")}`,amount:x.total,type:"income"})),...(expenses.data||[]).map(x=>({date:x.created_at,label:x.description,amount:x.amount,type:"expense"}))].sort((a,b)=>new Date(b.date)-new Date(a.date));
  $("#accountingList").innerHTML=movements.map(m=>`<div class="list-row"><div><b>${m.label}</b><small> ${new Date(m.date).toLocaleTimeString("es-EC",{hour:"2-digit",minute:"2-digit"})}</small></div><strong>${m.type==="expense"?"−":"+"}${money(m.amount)}</strong></div>`).join("")||"Sin movimientos hoy";
  await loadPaymentMethodsAdmin();
  const {data:closes}=await db.from("v16_cash_closes").select("*").order("created_at",{ascending:false}).limit(10);
  if(closes?.length){
    $("#accountingList").innerHTML += `<hr><h4>Cierres recientes</h4>`+closes.map(c=>`<div class="list-row"><div><b>Cierre ${new Date(c.created_at).toLocaleDateString("es-EC")}</b><small> ${new Date(c.created_at).toLocaleTimeString("es-EC",{hour:"2-digit",minute:"2-digit"})}</small></div><strong>${money(c.sales_total-c.expenses_total)}</strong><span class="badge ${Number(c.difference)===0?"paid":"pending"}">Dif. ${money(c.difference)}</span></div>`).join("");
  }
}
async function loadPaymentMethodsAdmin(){
  const {data,error}=await db.from("v16_payment_methods").select("*").order("sort_order");
  if(error)return toast(error.message);
  $("#paymentMethodsList").innerHTML=(data||[]).map(m=>`<div class="list-row"><div><b>${esc(m.name)}</b><small> Código: ${esc(m.code)}${m.requires_cash?" · maneja cambio":""}</small></div><span class="badge ${m.active?"paid":"pending"}">${m.active?"Activo":"Inactivo"}</span><button data-method-toggle="${m.id}" data-active="${m.active}">${m.active?"Desactivar":"Activar"}</button></div>`).join("");
  $("#paymentMethodsList").querySelectorAll("[data-method-toggle]").forEach(b=>b.onclick=async()=>{
    const {error}=await db.rpc("v16_toggle_payment_method",{p_method_id:b.dataset.methodToggle,p_active:b.dataset.active!=="true",p_admin_id:sessionStaff.id,p_pin:sessionPin});
    if(error)return toast(error.message);
    await loadPaymentMethods();loadPaymentMethodsAdmin();
  });
}
$("#loginButton").onclick=login;$("#loginPin").onkeydown=e=>{if(e.key==="Enter")login()};$("#logoutButton").onclick=logout;$("#menuButton").onclick=()=>$(".sidebar").classList.toggle("open");
$$("#mainNav button").forEach(b=>b.onclick=()=>{if(canAccessView(b.dataset.view))showView(b.dataset.view);else toast("Acceso no permitido")});
$("#posSearch").oninput=()=>renderPosProducts($("#posCategories .active")?.dataset.cat||"all");
$("#commandSearch").oninput=()=>renderCommandProducts($("#commandCategories .active")?.dataset.cat||"all");
$("#sendPosKitchen").onclick=()=>createOrder(posCart,"pos",null,false);$("#chargePos").onclick=async()=>{const o=await createOrder(posCart,"pos",null,false);if(o)openPayment(o)};
$("#sendCommand").onclick=()=>{if(!selectedTable)return toast("Selecciona una mesa");if(selectedTable.current_order_id)return toast("La mesa ya tiene una cuenta abierta");createOrder(commandCart,"command",selectedTable.id,false).then(()=>loadCommands())};
$("#refreshOnlineOrders").onclick=loadOnlineOrders;
$("#refreshTables").onclick=loadCommands;$("#refreshKitchen").onclick=loadKitchen;$("#closePayment").onclick=()=>$("#paymentModal").classList.add("hidden");$("#paymentMethod").onchange=updateChange;$("#paymentReceived").oninput=updateChange;$("#confirmPayment").onclick=confirmPayment;
$("#productForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await db.from("v16_products").insert(Object.fromEntries(f));if(error)return toast(error.message);e.target.reset();toast("Producto guardado");loadProductsAdmin()};
$("#inventoryForm").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));["stock","minimum_stock","cost"].forEach(k=>f[k]=Number(f[k]||0));const {error}=await db.from("v16_inventory").insert(f);if(error)return toast(error.message);e.target.reset();toast("Ingrediente guardado");loadInventory()};
$("#customerForm").onsubmit=async e=>{e.preventDefault();const {error}=await db.from("v16_customers").insert(Object.fromEntries(new FormData(e.target)));if(error)return toast(error.message);e.target.reset();toast("Cliente guardado");loadCustomers()};
$("#staffForm").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const {error}=await db.rpc("v16_create_staff",{p_name:f.name,p_role:f.role,p_pin:f.pin,p_admin_id:sessionStaff.id,p_admin_pin:sessionPin});if(error)return toast(error.message);e.target.reset();toast("Empleado creado");loadStaffAdmin()};
$("#expenseForm").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.amount=Number(f.amount);f.created_by=sessionStaff.id;const {error}=await db.from("v16_expenses").insert(f);if(error)return toast(error.message);e.target.reset();toast("Egreso registrado");loadAccounting()};
$("#openCashClose").onclick=openCashClose;
$("#closeCashClose").onclick=()=>$("#cashCloseModal").classList.add("hidden");
$("#cashCounted").oninput=updateCashDifference;
$("#saveCashClose").onclick=saveCashClose;
$("#printCashClose").onclick=printCashClose;
$("#addPaymentMethod").onclick=async()=>{
  const name=prompt("Nombre del método de pago:");
  if(!name)return;
  const code=name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
  if(!code)return toast("Nombre inválido");
  const {error}=await db.rpc("v16_create_payment_method",{p_name:name.trim(),p_code:code,p_admin_id:sessionStaff.id,p_pin:sessionPin});
  if(error)return toast(error.message);
  toast("Método de pago agregado");
  await loadPaymentMethods();loadPaymentMethodsAdmin();
};

function startRealtime(){
  if(realtimeChannel)db.removeChannel(realtimeChannel);
  realtimeChannel=db.channel("mordisco-v16-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"v16_orders"},()=>refreshActiveView())
    .on("postgres_changes",{event:"*",schema:"public",table:"v16_order_items"},()=>refreshActiveView())
    .on("postgres_changes",{event:"*",schema:"public",table:"v16_expenses"},()=>refreshActiveView())
    .subscribe(status=>{
      if(status==="SUBSCRIBED")setSyncStatus("En tiempo real");
    });
}

(async()=>{const saved=sessionStorage.getItem("mordisco_staff"),pin=sessionStorage.getItem("mordisco_pin");if(saved&&pin){sessionStaff=JSON.parse(saved);sessionPin=pin;await loadPaymentMethods();enterApp()}else{await loadPaymentMethods();loadLoginStaff()}})();
setInterval(()=>{
  if(!$("#appView").classList.contains("hidden"))refreshActiveView();
},15000);
