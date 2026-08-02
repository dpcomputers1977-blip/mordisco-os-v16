console.info('MORDISCO OS V17 cargado correctamente — sin app.js antiguo');
window.addEventListener('error',event=>{
  console.error('Error global Mordisco OS:',event.error||event.message);
  const node=document.querySelector('#toast');
  if(node){
    node.textContent='Ocurrió un error: '+(event.error?.message||event.message||'Error desconocido');
    node.classList.add('show');
    setTimeout(()=>node.classList.remove('show'),5000);
  }
});

const SUPABASE_URL='https://nmmjthqflxwucpmmmrks.supabase.co';
const SUPABASE_KEY='sb_publishable_izCztp4wZ0MzKOHjT2KGYA_ot_3pgb0';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let products=[],categories=[],settings={},orders=[],cart=[],posCart=[],ingredients=[],inventoryMovements=[],recipes=[],staffMembers=[],tables=[],tableCart=[],currentTable=null,currentEmployee=null,currentShift=null,shifts=[],financeMovements=[],customers=[],promotions=[],contentPages=[],isAdminSession=false,shiftAction='start',selectedCategory='Todos',editingImage='',adminProductQuery='',adminProductFilter='all',orderStatusFilter='all',ordersChannel=null,lastKnownOrderIds=new Set(),kitchenTimerHandle=null,lastReceiptOrder=null;
const $$=s=>[...document.querySelectorAll(s)];
const missingElementProxy=new Proxy({},{
  get(_target,property){
    if(property==='classList')return{add(){},remove(){},toggle(){},contains(){return false}};
    if(property==='style')return{};
    if(property==='selectedOptions')return[];
    if(property==='files')return[];
    if(property==='dataset')return{};
    if(property==='value')return'';
    if(property==='checked')return false;
    if(property==='textContent'||property==='innerHTML'||property==='src')return'';
    if(['focus','select','reset','scrollIntoView','addEventListener','click'].includes(property))return()=>{};
    return null;
  },
  set(){return true}
});
const $=s=>document.querySelector(s)||missingElementProxy;
const money=n=>new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(Number(n||0));
const bind=(selector,event,handler)=>{
  const node=document.querySelector(selector);
  if(node)node.addEventListener(event,handler);
  return node;
};

function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

function showAdmin(){
  $('#publicView').classList.add('hidden');
  $('#adminView').classList.remove('hidden');
  $('.topbar').classList.add('hidden');
  $('#loginModal').classList.add('hidden');

  const firstButton=$('.sidebar [data-tab="dashboard"]');
  if(firstButton&&typeof firstButton.click==='function')firstButton.click();
}

async function verifyAdmin(showWelcome=true){
  const {data:{session},error:sessionError}=await db.auth.getSession();
  if(sessionError)throw sessionError;

  if(!session){
    isAdminSession=false;
    $('#adminView').classList.add('hidden');
    $('#loginModal').classList.remove('hidden');
    return false;
  }

  let role='admin';
  const {data:profile,error:profileError}=await db
    .from('profiles')
    .select('role')
    .eq('id',session.user.id)
    .maybeSingle();

  if(profileError){
    console.warn('No se pudo comprobar el perfil; se conserva la sesión autenticada:',profileError);
  }else if(profile?.role){
    role=profile.role;
  }

  if(role!=='admin'){
    await db.auth.signOut();
    isAdminSession=false;
    $('#adminView').classList.add('hidden');
    $('#loginModal').classList.remove('hidden');
    toast('Esta cuenta no tiene permisos de administrador');
    return false;
  }

  isAdminSession=true;
  currentEmployee=null;
  document.body.classList.remove('employeeMode');
  showAdmin();

  await Promise.allSettled([
    loadOrders(),
    loadInventoryData(),
    loadStaff(),
    loadTables(),
    loadShifts(),
    loadFinance(),
    loadCustomers(),
    loadPromotions(),
    loadContentPages()
  ]);

  renderAll();
  if(showWelcome)toast('Bienvenido al panel de administración');
  return true;
}

async function init(){
  const params=new URLSearchParams(location.search);
  const employeeMode=params.get('employee')==='1';
  const requestedTab=params.get('tab');

  try{
    await Promise.all([loadCategories(),loadProducts(),loadSettings()]);
    renderAll();
  }catch(error){
    console.warn('Carga inicial:',error);
  }

  if(employeeMode){
    let savedEmployee=null;
    try{savedEmployee=JSON.parse(localStorage.getItem('mordisco_employee')||'null')}catch{}
    if(!savedEmployee?.id||!savedEmployee?.role){
      location.href='/staff';
      return;
    }

    currentEmployee=savedEmployee;
    isAdminSession=false;
    document.body.classList.add('employeeMode');
    $('#loginModal').classList.add('hidden');
    showAdmin();

    await Promise.all([loadOrders(),loadStaff()]);
    renderAll();
    applyEmployeePermissions(savedEmployee);

    const allowed={
      waiter:['tables','orders'],
      cashier:['pos','orders','tables','shifts'],
      kitchen:['kitchen'],
      admin:['dashboard','products','categories','orders','kitchen','pos','inventory','tables','shifts','finance','customers','promotions','pages','staff','settings']
    }[savedEmployee.role]||[];

    const target=allowed.includes(requestedTab)?requestedTab:allowed[0];
    const targetButton=$(`.sidebar [data-tab="${target}"]`);
    if(targetButton)targetButton.click();

    subscribeOrdersRealtime();
    return;
  }

  const {data:{session}}=await db.auth.getSession();
  if(session){
    await verifyAdmin(false);
  }else{
    $('#publicView').classList.add('hidden');
    $('#adminView').classList.add('hidden');
    $('.topbar').classList.add('hidden');
    $('#loginModal').classList.remove('hidden');
  }
}
async function loadCategories(){const {data,error}=await db.from('categories').select('*').order('sort_order');if(error) return toast('Error cargando categorías');categories=data||[]}
async function loadProducts(){const {data,error}=await db.from('products').select('*,categories(name)').order('sort_order');$('#loadingProducts').classList.add('hidden');if(error)return toast('Error cargando productos');products=data||[]}
async function loadSettings(){const {data}=await db.from('business_settings').select('*').eq('id',1).maybeSingle();settings=data||{};applySettings()}
function applySettings(){$('#businessDescription').textContent=settings.description||'El mejor sabor para compartir.';$('#businessAddress').textContent=settings.address||'Dirección por configurar';$('#businessSchedule').textContent=settings.schedule||'Horario por configurar'}
function renderAll(){renderFilters();renderProducts();renderCart();renderAdminProducts();renderAdminCategories();fillCategorySelect();fillSettings();fillPosCategories();renderPosProducts();renderPosCart();fillPosStaff();renderHomePromotions()}
function renderFilters(){const names=['Todos',...categories.filter(c=>c.active).map(c=>c.name)];$('#categoryFilters').innerHTML=names.map(n=>`<button class="${n===selectedCategory?'active':''}" data-cat="${esc(n)}">${esc(n)}</button>`).join('');$$('[data-cat]').forEach(b=>b.onclick=()=>{selectedCategory=b.dataset.cat;renderFilters();renderProducts()})}
function filteredProducts(){const q=$('#searchInput').value.toLowerCase();return products.filter(p=>p.active&&(selectedCategory==='Todos'||p.categories?.name===selectedCategory)&&(`${p.name} ${p.description||''}`).toLowerCase().includes(q))}
function renderProducts(){
  const list=filteredProducts();
  $('#productGrid').innerHTML=list.length?list.map(p=>`<article class="productCard">
    ${p.featured?'<span class="featured">Favorito</span>':''}
    <div class="productImage">${p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.name)}">`:'<div class="noImage">Sin imagen</div>'}</div>
    <div class="productBody">
      <small>${esc(p.categories?.name||'Sin categoría')}</small>
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.description||'')}</p>
      <div class="productFoot"><strong>${money(p.price)}</strong><button data-add="${p.id}">+ Agregar</button></div>
    </div>
  </article>`).join(''):'<div class="notice">No hay productos disponibles.</div>';
  $$('[data-add]').forEach(b=>b.onclick=()=>addCart(b.dataset.add));
}
if(document.querySelector('#searchInput'))document.querySelector('#searchInput').oninput=renderProducts;
function addCart(id){const f=cart.find(x=>x.id===id);if(f)f.qty++;else cart.push({id,qty:1});renderCart();openCart()}
function changeQty(id,d){const f=cart.find(x=>x.id===id);if(!f)return;f.qty+=d;cart=cart.filter(x=>x.qty>0);renderCart()}
function totals(){const subtotal=cart.reduce((s,x)=>{const p=products.find(y=>y.id===x.id);return s+(p?Number(p.price)*x.qty:0)},0);const delivery=$('#orderType').value==='delivery'?Number(settings.delivery_cost||0):0;return{subtotal,delivery,total:subtotal+delivery}}
function renderCart(){$('#cartCount').textContent=cart.reduce((s,x)=>s+x.qty,0);$('#cartItems').innerHTML=cart.length?cart.map(x=>{const p=products.find(y=>y.id===x.id);if(!p)return'';return`<div class="cartItem">${p.image_url?`<img src="${esc(p.image_url)}">`:'<div></div>'}<div><b>${esc(p.name)}</b><small>${money(p.price)}</small><div class="qty"><button data-minus="${p.id}">−</button><span>${x.qty}</span><button data-plus="${p.id}">+</button></div></div><b>${money(Number(p.price)*x.qty)}</b></div>`}).join(''):'<p class="notice">Tu carrito está vacío.</p>';$$('[data-minus]').forEach(b=>b.onclick=()=>changeQty(b.dataset.minus,-1));$$('[data-plus]').forEach(b=>b.onclick=()=>changeQty(b.dataset.plus,1));const t=totals();$('#subtotal').textContent=money(t.subtotal);$('#deliveryTotal').textContent=money(t.delivery);$('#grandTotal').textContent=money(t.total)}
function openCart(){$('#cartDrawer').classList.add('open')} if(document.querySelector('#cartBtn'))document.querySelector('#cartBtn').onclick=openCart;if(document.querySelector('#orderNowBtn'))document.querySelector('#orderNowBtn').onclick=openCart;if(document.querySelector('#closeCart'))document.querySelector('#closeCart').onclick=()=>$('#cartDrawer').classList.remove('open');if(document.querySelector('#orderType'))document.querySelector('#orderType').onchange=()=>{renderCart();$('#customerAddress').classList.toggle('hidden',$('#orderType').value!=='delivery')};

$$('.sidebar [data-tab]').forEach(b=>b.onclick=async()=>{const tab=b.dataset.tab;$$('.sidebar [data-tab]').forEach(x=>x.classList.toggle('active',x===b));$$('.tab').forEach(x=>x.classList.add('hidden'));$('#tab-'+tab).classList.remove('hidden');$('#adminTitle').textContent={dashboard:'Resumen',products:'Productos',categories:'Categorías',kitchen:'Cocina',pos:'POS / Caja',inventory:'Inventario',tables:'Mesas',shifts:'Turnos',staff:'Personal',finance:'Contabilidad',customers:'Clientes',promotions:'Promociones',pages:'Páginas',settings:'Negocio'}[tab];if(tab==='orders'||tab==='kitchen')await loadOrders();if(tab==='dashboard'){await loadOrders();renderMetrics()}if(tab==='kitchen')startKitchenClock();if(tab==='pos'){fillPosCategories();renderPosProducts();renderPosCart();await loadOrders();renderPosPendingOrders()}if(tab==='inventory')await loadInventoryData();if(tab==='staff'){
    if($('#staffSearch'))$('#staffSearch').value='';
    if($('#staffRoleFilter'))$('#staffRoleFilter').value='all';
    await loadStaff();
  }if(tab==='tables')await loadTables();if(tab==='shifts')await loadShifts();if(tab==='finance')await loadFinance();if(tab==='customers')await loadCustomers();if(tab==='promotions')await loadPromotions();if(tab==='pages')await loadContentPages()});
function fillCategorySelect(){$('#pCategory').innerHTML=categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}
function resetProduct(){$('#productForm').reset();$('#pId').value='';$('#pActive').checked=true;$('#pSort').value=0;editingImage='';updatePreview('')}
function updatePreview(src){
  $('#pPreview').src=src||'';
  $('#pPreview').classList.toggle('hidden',!src);
  $('#pNoImage').classList.toggle('hidden',!!src);
  $('#removeProductImage').classList.toggle('hidden',!src);
}

function getStoragePathFromPublicUrl(url){
  if(!url)return null;
  const marker='/storage/v1/object/public/product-images/';
  const index=url.indexOf(marker);
  return index>=0?decodeURIComponent(url.slice(index+marker.length)):null;
}

async function removeStoredImage(url){
  const path=getStoragePathFromPublicUrl(url);
  if(!path)return;
  const {error}=await db.storage.from('product-images').remove([path]);
  if(error)console.warn('No se pudo borrar la imagen anterior:',error);
}

function validateProductImage(file){
  if(!file)return;
  const allowed=['image/png','image/jpeg','image/webp'];
  if(!allowed.includes(file.type))throw new Error('La imagen debe ser PNG, JPG o WEBP');
  if(file.size>5*1024*1024)throw new Error('La imagen supera el máximo de 5 MB');
}

async function uploadImage(file){
  if(!file)return editingImage||'';
  validateProductImage(file);

  const extension={
    'image/png':'png',
    'image/jpeg':'jpg',
    'image/webp':'webp'
  }[file.type]||'jpg';

  const path=`products/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const {error}=await db.storage.from('product-images').upload(path,file,{
    cacheControl:'3600',
    upsert:false,
    contentType:file.type
  });

  if(error)throw error;
  return db.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}

function resetProduct(){
  $('#productForm').reset();
  $('#pId').value='';
  $('#pSort').value=0;
  $('#pActive').checked=true;
  $('#pImageFile').value='';
  editingImage='';
  updatePreview('');

  if($('#productFormHeading'))$('#productFormHeading').textContent='Crear producto';
  if($('#productEditBadge'))$('#productEditBadge').classList.add('hidden');
  if($('#saveProductBtn'))$('#saveProductBtn').textContent='Guardar producto';
}

if(document.querySelector('#clearProduct'))document.querySelector('#clearProduct').onclick=resetProduct;

if(document.querySelector('#removeProductImage'))document.querySelector('#removeProductImage').onclick=()=>{
  editingImage='';
  $('#pImageFile').value='';
  updatePreview('');
};

if(document.querySelector('#pImageFile'))document.querySelector('#pImageFile').onchange=e=>{
  const file=e.target.files[0];
  if(!file)return;

  try{
    validateProductImage(file);
    updatePreview(URL.createObjectURL(file));
  }catch(error){
    e.target.value='';
    updatePreview(editingImage);
    toast(error.message);
  }
};

if(document.querySelector('#productForm'))document.querySelector('#productForm').onsubmit=async e=>{
  e.preventDefault();

  const button=$('#saveProductBtn');
  const id=$('#pId').value;
  const previousProduct=id?products.find(p=>String(p.id)===String(id)):null;
  const previousImage=previousProduct?.image_url||'';
  const selectedFile=$('#pImageFile').files[0];

  button.disabled=true;
  button.textContent=selectedFile?'Subiendo imagen...':'Guardando...';

  try{
    const image=await uploadImage(selectedFile);

    const row={
      name:$('#pName').value.trim(),
      category_id:$('#pCategory').value||null,
      price:Number($('#pPrice').value),
      description:$('#pDescription').value.trim(),
      image_url:image||null,
      featured:$('#pFeatured').checked,
      active:$('#pActive').checked,
      sort_order:Number($('#pSort').value||0)
    };

    const query=id
      ?db.from('products').update(row).eq('id',id)
      :db.from('products').insert(row);

    const {error}=await query;

    if(error){
      if(selectedFile&&image!==previousImage)await removeStoredImage(image);
      throw error;
    }

    if(id&&previousImage&&previousImage!==image){
      await removeStoredImage(previousImage);
    }

    toast(id?'Producto actualizado correctamente':'Producto creado correctamente');
    resetProduct();
    await loadProducts();
    renderAll();
  }catch(error){
    console.error('Error guardando producto:',error);
    toast('No se pudo guardar: '+(error.message||'Error desconocido'));
  }finally{
    button.disabled=false;
    button.textContent=$('#pId').value?'Actualizar producto':'Guardar producto';
  }
};
function getAdminProducts(){
  return products.filter(p=>{
    const text=`${p.name} ${p.description||''} ${p.categories?.name||''}`.toLowerCase();
    const matchesText=text.includes(adminProductQuery.toLowerCase());
    const matchesFilter=adminProductFilter==='all'
      ||(adminProductFilter==='visible'&&p.active)
      ||(adminProductFilter==='hidden'&&!p.active)
      ||(adminProductFilter==='featured'&&p.featured);
    return matchesText&&matchesFilter;
  });
}
function renderAdminProducts(){
  const list=getAdminProducts();
  $('#adminProductCount').textContent=`${list.length} producto${list.length===1?'':'s'}`;
  $('#adminProducts').innerHTML=list.length?list.map(p=>`<article class="adminRow">${p.image_url?`<img src="${esc(p.image_url)}">`:'<div></div>'}<div><b>${esc(p.name)}</b><small>${esc(p.categories?.name||'Sin categoría')} · ${money(p.price)} · ${p.active?'Visible':'Oculto'}${p.featured?' · Destacado':''}</small></div><div class="adminRowActions"><button data-edit-product="${p.id}">Editar</button><button class="dark" data-duplicate-product="${p.id}">Duplicar</button><button class="${p.active?'warning':'success'}" data-toggle-product="${p.id}">${p.active?'Ocultar':'Mostrar'}</button><button class="danger" data-delete-product="${p.id}">Eliminar</button></div></article>`).join(''):'<div class="notice">No hay productos que coincidan con el filtro.</div>';
  $$('[data-edit-product]').forEach(b=>b.onclick=()=>editProduct(b.dataset.editProduct));
  $$('[data-delete-product]').forEach(b=>b.onclick=()=>deleteProduct(b.dataset.deleteProduct));
  $$('[data-duplicate-product]').forEach(b=>b.onclick=()=>duplicateProduct(b.dataset.duplicateProduct));
  $$('[data-toggle-product]').forEach(b=>b.onclick=()=>toggleProduct(b.dataset.toggleProduct));
}
async function duplicateProduct(id){
  const p=products.find(x=>x.id===id); if(!p)return;
  const row={name:`${p.name} (copia)`,category_id:p.category_id,price:p.price,description:p.description||'',image_url:p.image_url||'',featured:false,active:false,sort_order:Number(p.sort_order||0)+1};
  const {error}=await db.from('products').insert(row);
  if(error)return toast(error.message);
  await loadProducts(); renderAll(); toast('Producto duplicado como oculto');
}
async function toggleProduct(id){
  const p=products.find(x=>x.id===id); if(!p)return;
  const {error}=await db.from('products').update({active:!p.active}).eq('id',id);
  if(error)return toast(error.message);
  await loadProducts(); renderAll(); toast(p.active?'Producto ocultado':'Producto publicado');
}
function editProduct(id){
  const p=products.find(x=>String(x.id)===String(id));
  if(!p)return toast('Producto no encontrado');

  $('#pId').value=p.id;
  $('#pName').value=p.name;
  $('#pCategory').value=p.category_id||'';
  $('#pPrice').value=p.price;
  $('#pSort').value=p.sort_order||0;
  $('#pDescription').value=p.description||'';
  $('#pFeatured').checked=!!p.featured;
  $('#pActive').checked=!!p.active;
  $('#pImageFile').value='';

  editingImage=p.image_url||'';
  updatePreview(editingImage);

  if($('#productFormHeading'))$('#productFormHeading').textContent=`Editar: ${p.name}`;
  if($('#productEditBadge'))$('#productEditBadge').classList.remove('hidden');
  if($('#saveProductBtn'))$('#saveProductBtn').textContent='Actualizar producto';

  document.getElementById('productForm').scrollIntoView({
    behavior:'smooth',
    block:'start'
  });
}

async function deleteProduct(id){
  const product=products.find(p=>String(p.id)===String(id));
  if(!product)return toast('Producto no encontrado');

  const accepted=confirm(
    `¿Eliminar definitivamente "${product.name}"?\n\n`+
    `Esta acción no se puede deshacer.`
  );
  if(!accepted)return;

  const {error}=await db.from('products').delete().eq('id',id);
  if(error)return toast('No se pudo eliminar: '+error.message);

  if(product.image_url)await removeStoredImage(product.image_url);
  if(String($('#pId').value)===String(id))resetProduct();

  await loadProducts();
  renderAll();
  toast('Producto eliminado correctamente');
}
function resetCategory(){$('#categoryForm').reset();$('#cId').value='';$('#cSort').value=0;$('#cActive').checked=true} if(document.querySelector('#clearCategory'))document.querySelector('#clearCategory').onclick=resetCategory;
if(document.querySelector('#categoryForm'))document.querySelector('#categoryForm').onsubmit=async e=>{e.preventDefault();const id=$('#cId').value,row={name:$('#cName').value.trim(),sort_order:Number($('#cSort').value||0),active:$('#cActive').checked};const {error}=await(id?db.from('categories').update(row).eq('id',id):db.from('categories').insert(row));if(error)return toast(error.message);resetCategory();await loadCategories();renderAll();toast('Categoría guardada')};
function renderAdminCategories(){$('#adminCategories').innerHTML=categories.map(c=>`<article class="adminRow"><div></div><div><b>${esc(c.name)}</b><small>Orden ${c.sort_order} · ${c.active?'Activa':'Oculta'}</small></div><button data-edit-cat="${c.id}">Editar</button><button class="danger" data-delete-cat="${c.id}">Eliminar</button></article>`).join('');$$('[data-edit-cat]').forEach(b=>b.onclick=()=>{const c=categories.find(x=>x.id===b.dataset.editCat);$('#cId').value=c.id;$('#cName').value=c.name;$('#cSort').value=c.sort_order;$('#cActive').checked=c.active});$$('[data-delete-cat]').forEach(b=>b.onclick=async()=>{if(!confirm('¿Eliminar categoría? Los productos quedarán sin categoría.'))return;const {error}=await db.from('categories').delete().eq('id',b.dataset.deleteCat);if(error)return toast(error.message);await loadCategories();await loadProducts();renderAll()})}



function renderPosPendingOrders(){
  if(!$('#posPendingOrders'))return;

  const pending=orders
    .filter(o=>(o.payment_status||'unpaid')!=='paid'&&o.status!=='cancelled')
    .sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));

  if($('#posPendingCount'))$('#posPendingCount').textContent=pending.length;

  $('#posPendingOrders').innerHTML=pending.length?pending.map(o=>`
    <article class="posPendingCard">
      <div class="posPendingMain">
        <div class="posPendingNumber">
          <small>PEDIDO</small>
          <strong>#${o.order_number}</strong>
        </div>
        <div class="posPendingInfo">
          <h4>${esc(o.customer_name||'Consumidor final')}</h4>
          <p>${o.order_items?.map(i=>`${i.quantity}× ${esc(i.product_name)}`).join(', ')||'Sin detalle'}</p>
          <small>
            ${o.restaurant_tables?.name?`🍽️ ${esc(o.restaurant_tables.name)} · `:''}
            ${orderTypeLabel(o.order_type)} ·
            ${new Date(o.created_at).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}
          </small>
        </div>
      </div>
      <div class="posPendingPayment">
        <span>Pendiente</span>
        <strong>${money(o.total)}</strong>
        <button class="primary posPayNowBtn" data-pos-pay="${o.id}">Cobrar ahora</button>
      </div>
    </article>
  `).join(''):`<div class="posPendingEmpty">
    <span>✓</span>
    <div><b>No hay pedidos pendientes</b><p>Las órdenes enviadas a cocina aparecerán aquí para cobrarlas.</p></div>
  </div>`;

  $$('[data-pos-pay]').forEach(button=>{
    button.onclick=()=>openChargeOrder(button.dataset.posPay);
  });
}

if($('#refreshPosPending'))if(document.querySelector('#refreshPosPending'))document.querySelector('#refreshPosPending').onclick=async()=>{
  const button=$('#refreshPosPending');
  button.disabled=true;
  button.textContent='Actualizando...';
  await loadOrders();
  button.disabled=false;
  button.textContent='Actualizar';
};

function getChargeCalculation(){
  const order=orders.find(o=>String(o.id)===String(paymentOrderId));
  if(!order)return{subtotal:0,discountType:'none',discountValue:0,discountAmount:0,total:0};

  const subtotal=Number(order.subtotal??order.total??0);
  const discountType=$('#chargeDiscountType')?.value||'none';
  let discountValue=Math.max(0,Number($('#chargeDiscountValue')?.value||0));
  let discountAmount=0;

  if(discountType==='percent'){
    discountValue=Math.min(discountValue,100);
    discountAmount=subtotal*(discountValue/100);
  }else if(discountType==='fixed'){
    discountAmount=Math.min(discountValue,subtotal);
  }

  discountAmount=Math.round(discountAmount*100)/100;
  const total=Math.max(0,Math.round((subtotal-discountAmount)*100)/100);
  return{subtotal,discountType,discountValue,discountAmount,total};
}

function renderChargeCalculation(){
  const calculation=getChargeCalculation();
  $('#chargeSubtotal').textContent=money(calculation.subtotal);
  $('#chargeDiscountAmount').textContent='− '+money(calculation.discountAmount);
  $('#chargeOrderTotal').textContent=money(calculation.total);

  const method=$('#chargePaymentMethod').value;
  const cash=method==='cash';
  $('#chargeReceivedWrap').classList.toggle('hidden',!cash);
  $('.chargeChange').classList.toggle('hidden',!cash);

  if(cash){
    const received=Number($('#chargeReceived').value||0);
    $('#chargeChange').textContent=money(Math.max(0,received-calculation.total));
  }
}

function openChargeOrder(orderId){
  const order=orders.find(o=>String(o.id)===String(orderId));
  if(!order)return toast('No se encontró el pedido');
  if(order.payment_status==='paid')return toast('Este pedido ya está pagado');

  paymentOrderId=orderId;
  $('#chargeOrderTitle').textContent=`Cobrar pedido #${order.order_number}`;
  $('#chargePaymentMethod').value='cash';
  $('#chargeDiscountType').value='none';
  $('#chargeDiscountValue').value='0';
  $('#chargeDiscountValue').disabled=true;
  $('#chargeReceived').value=Number(order.subtotal??order.total).toFixed(2);
  renderChargeCalculation();
  $('#chargeOrderModal').classList.remove('hidden');
}

function updateChargeChange(){
  renderChargeCalculation();
}

async function confirmChargeOrder(){
  const order=orders.find(o=>String(o.id)===String(paymentOrderId));
  if(!order)return toast('No se encontró el pedido');

  if(currentEmployee?.role==='cashier'&&!currentShift){
    return toast('Debes iniciar tu turno antes de cobrar');
  }

  const calculation=getChargeCalculation();
  const method=$('#chargePaymentMethod').value;
  const received=method==='cash'?Number($('#chargeReceived').value||0):calculation.total;

  if(method==='cash'&&received<calculation.total){
    return toast('El efectivo recibido es menor al total final');
  }

  const button=$('#confirmChargeOrder');
  button.disabled=true;
  button.textContent='Procesando...';

  const {data,error}=await db.rpc('pay_order_with_discount',{
    p_order_id:order.id,
    p_payment_method:method,
    p_received:received,
    p_cashier_id:currentEmployee?.role==='cashier'?currentEmployee.id:(order.cashier_id||null),
    p_discount_type:calculation.discountType,
    p_discount_value:calculation.discountValue
  });

  button.disabled=false;
  button.textContent='Confirmar cobro';

  if(error)return toast('No se pudo cobrar: '+error.message);

  const paidOrder={
    ...order,
    subtotal:calculation.subtotal,
    discount_type:calculation.discountType,
    discount_value:calculation.discountValue,
    discount_amount:calculation.discountAmount,
    total:calculation.total,
    payment_method:method,
    payment_status:'paid',
    cashier_name:currentEmployee?.name||order.cashier?.name||'Administrador'
  };

  lastReceiptOrder={order:paidOrder,items:order.order_items||[],received};
  $('#receiptContent').innerHTML=buildReceipt(paidOrder,order.order_items||[],received);
  $('#chargeOrderModal').classList.add('hidden');
  $('#receiptModal').classList.remove('hidden');

  await Promise.all([loadOrders(),loadFinance()]);
  renderPosPendingOrders();
  if(typeof loadShifts==='function')await loadShifts();
  toast(`Pedido #${order.order_number} cobrado correctamente`);
}

if(document.querySelector('#chargeDiscountType'))document.querySelector('#chargeDiscountType').onchange=()=>{
  const type=$('#chargeDiscountType').value;
  $('#chargeDiscountValue').disabled=type==='none';
  if(type==='none')$('#chargeDiscountValue').value='0';
  renderChargeCalculation();
};
if(document.querySelector('#chargeDiscountValue'))document.querySelector('#chargeDiscountValue').oninput=renderChargeCalculation;
if(document.querySelector('#chargePaymentMethod'))document.querySelector('#chargePaymentMethod').onchange=renderChargeCalculation;
if(document.querySelector('#chargeReceived'))document.querySelector('#chargeReceived').oninput=renderChargeCalculation;
if(document.querySelector('#confirmChargeOrder'))document.querySelector('#confirmChargeOrder').onclick=confirmChargeOrder;

async function deleteSale(orderId){
  if(!isAdminSession){
    return toast('Solo un administrador autenticado puede eliminar ventas');
  }

  const order=orders.find(o=>String(o.id)===String(orderId));
  if(!order)return toast('No se encontró la venta');

  const accepted=confirm(
    `¿Eliminar definitivamente la venta #${order.order_number||order.id}?\n\n`+
    `Total: ${money(order.total)}\n`+
    `Cliente: ${order.customer_name||'Sin cliente'}\n\n`+
    `La venta y su ingreso contable relacionado serán eliminados.`
  );
  if(!accepted)return;

  const {error}=await db.rpc('delete_order_admin',{p_order_id:orderId});
  if(error)return toast('No se pudo eliminar la venta: '+error.message);

  toast('Venta eliminada correctamente');
  await Promise.all([loadOrders(),loadFinance()]);
  if(typeof loadShifts==='function')await loadShifts();
}

async function loadOrders(){
  const {data,error}=await db.from('orders').select('*,order_items(*)').order('created_at',{ascending:false}).limit(100);
  if(error){
    console.error('Error cargando pedidos:',error);
    return toast('Error cargando pedidos: '+error.message);
  }

  orders=data||[];

  const staffIds=[...new Set(orders.flatMap(o=>[o.cashier_id,o.waiter_id]).filter(Boolean))];
  const tableIds=[...new Set(orders.map(o=>o.table_id).filter(Boolean))];

  let staffMap={},tableMap={};

  if(staffIds.length){
    const {data:staffData,error:staffError}=await db.from('staff').select('id,name').in('id',staffIds);
    if(staffError)console.warn('No se pudieron cargar nombres del personal:',staffError);
    else staffMap=Object.fromEntries((staffData||[]).map(s=>[s.id,s]));
  }

  if(tableIds.length){
    const {data:tableData,error:tableError}=await db.from('restaurant_tables').select('id,name').in('id',tableIds);
    if(tableError)console.warn('No se pudieron cargar nombres de mesas:',tableError);
    else tableMap=Object.fromEntries((tableData||[]).map(t=>[t.id,t]));
  }

  orders=orders.map(o=>({
    ...o,
    cashier:o.cashier_id?staffMap[o.cashier_id]||null:null,
    waiter:o.waiter_id?staffMap[o.waiter_id]||null:null,
    restaurant_tables:o.table_id?tableMap[o.table_id]||null:null
  }));

  renderOrders();
  renderMetrics();
  renderKitchen();
  renderPosPendingOrders();
}
const statusLabels={pending:'Pendiente',confirmed:'Confirmado',preparing:'Preparando',ready:'Listo',delivered:'Entregado',cancelled:'Cancelado'};
function getFilteredOrders(){return orderStatusFilter==='all'?orders:orders.filter(o=>o.status===orderStatusFilter)}
function renderOrders(){
  const list=getFilteredOrders();
  $('#adminOrders').innerHTML=list.length?list.map(o=>`<article class="orderCard">
    <small>Pedido #${o.order_number}</small>
    <h3>${esc(o.customer_name)}</h3>
    <p>${o.order_items?.map(i=>`${i.quantity}× ${esc(i.product_name)}`).join(', ')||''}</p>
    <p>${esc(o.customer_phone||'Sin teléfono')} · ${esc(orderTypeLabel(o.order_type))}</p>
    <p class="orderStaff">${o.cashier?.name?`💵 Cajero: ${esc(o.cashier.name)}`:'💵 Cajero: pendiente'}${o.waiter?.name?` · 🧑‍🍽️ Mesero: ${esc(o.waiter.name)}`:''}${o.restaurant_tables?.name?` · 🍽️ ${esc(o.restaurant_tables.name)}`:''}</p>
    <div class="orderPaymentStatus ${o.payment_status==='paid'?'paid':'unpaid'}">${o.payment_status==='paid'?'✓ Pagada':'⏳ Pendiente de pago'}</div>
    <strong>${money(o.total)}</strong>
    <p>${new Date(o.created_at).toLocaleString('es-EC')}</p>
    <div class="orderActions">
      <select data-status="${o.id}">${Object.entries(statusLabels).map(([value,label])=>`<option ${value===o.status?'selected':''} value="${value}">${label}</option>`).join('')}</select>
      ${(isAdminSession||currentEmployee?.role==='cashier')&&o.payment_status!=='paid'?`<button class="primary chargeOrderBtn" data-charge-order="${o.id}">Cobrar</button>`:''}
      ${isAdminSession?`<button class="danger deleteSaleBtn" data-delete-order="${o.id}">Eliminar venta</button>`:''}
    </div>
  </article>`).join(''):'<div class="notice">No hay pedidos con ese estado.</div>';

  $$('[data-status]').forEach(s=>s.onchange=async()=>{
    const {error}=await db.from('orders').update({status:s.value}).eq('id',s.dataset.status);
    if(error)toast(error.message);
    else{toast('Estado actualizado');await loadOrders()}
  });

  $$('[data-charge-order]').forEach(b=>b.onclick=()=>openChargeOrder(b.dataset.chargeOrder));
  $$('[data-delete-order]').forEach(b=>b.onclick=()=>deleteSale(b.dataset.deleteOrder));
}
function elapsedLabel(createdAt){
  const mins=Math.max(0,Math.floor((Date.now()-new Date(createdAt).getTime())/60000));
  if(mins<60)return `${mins} min`;
  const h=Math.floor(mins/60),m=mins%60;
  return `${h}h ${m}m`;
}
function orderTypeLabel(type){return({delivery:'Delivery',pickup:'Retiro',local:'En local'})[type]||type}
function kitchenCard(o){
  const mins=Math.max(0,Math.floor((Date.now()-new Date(o.created_at).getTime())/60000));
  const late=mins>=20&&o.status!=='ready';
  let actions='';
  if(o.status==='pending'||o.status==='confirmed'){
    actions=`<button class="primary" data-kitchen-status="${o.id}" data-next-status="preparing">Empezar preparación</button><button class="danger" data-kitchen-status="${o.id}" data-next-status="cancelled">Cancelar</button>`;
  }else if(o.status==='preparing'){
    actions=`<button class="success" data-kitchen-status="${o.id}" data-next-status="ready">Marcar como listo</button>`;
  }else if(o.status==='ready'){
    actions=`<button class="dark" data-kitchen-status="${o.id}" data-next-status="delivered">Entregar pedido</button>`;
  }
  return `<article class="kitchenCard ${late?'isLate':''}">
    <div class="kitchenCardHead"><h3>#${o.order_number}</h3><span class="kitchenTimer" data-created-at="${o.created_at}">${elapsedLabel(o.created_at)}</span></div>
    <p class="kitchenCustomer">${esc(o.customer_name)}</p>
    <p class="kitchenMeta">${orderTypeLabel(o.order_type)} · ${new Date(o.created_at).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}</p>
    <ul class="kitchenItems">${(o.order_items||[]).map(i=>`<li>${i.quantity} × ${esc(i.product_name)}${i.notes?`<small> — ${esc(i.notes)}</small>`:''}</li>`).join('')}</ul>
    ${o.notes?`<div class="kitchenNotes"><b>Nota:</b> ${esc(o.notes)}</div>`:''}
    <div class="kitchenCardActions">${actions}</div>
  </article>`;
}
function renderKitchen(){
  const pending=orders.filter(o=>['pending','confirmed'].includes(o.status));
  const preparing=orders.filter(o=>o.status==='preparing');
  const ready=orders.filter(o=>o.status==='ready');
  $('#kitchenPendingCount').textContent=pending.length;
  $('#kitchenPreparingCount').textContent=preparing.length;
  $('#kitchenReadyCount').textContent=ready.length;
  $('#kitchenPending').innerHTML=pending.length?pending.map(kitchenCard).join(''):'<div class="kitchenEmpty">Sin pedidos nuevos</div>';
  $('#kitchenPreparing').innerHTML=preparing.length?preparing.map(kitchenCard).join(''):'<div class="kitchenEmpty">Nada en preparación</div>';
  $('#kitchenReady').innerHTML=ready.length?ready.map(kitchenCard).join(''):'<div class="kitchenEmpty">No hay pedidos listos</div>';
  $$('[data-kitchen-status]').forEach(b=>b.onclick=()=>updateKitchenStatus(b.dataset.kitchenStatus,b.dataset.nextStatus));
}
async function updateKitchenStatus(id,status){
  const {error}=await db.from('orders').update({status}).eq('id',id);
  if(error)return toast(error.message);
  toast(`Pedido actualizado: ${statusLabels[status]||status}`);
  await loadOrders();
}
function startKitchenClock(){
  clearInterval(kitchenTimerHandle);
  kitchenTimerHandle=setInterval(()=>{
    $$('[data-created-at]').forEach(el=>el.textContent=elapsedLabel(el.dataset.createdAt));
  },30000);
}
function playKitchenAlert(){
  if(!$('#kitchenSound')?.checked)return;
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.connect(gain);gain.connect(ctx.destination);
    osc.frequency.value=880;gain.gain.value=.08;osc.start();
    setTimeout(()=>{osc.stop();ctx.close()},220);
  }catch{}
}
function subscribeOrdersRealtime(){
  if(ordersChannel)db.removeChannel(ordersChannel);
  lastKnownOrderIds=new Set(orders.map(o=>o.id));
  ordersChannel=db.channel('mordisco-orders-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'orders'},async payload=>{
      const isNew=payload.eventType==='INSERT'&&!lastKnownOrderIds.has(payload.new?.id);
      await loadOrders();
      if(isNew){playKitchenAlert();toast(`Nuevo pedido #${payload.new.order_number||''}`)}
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'order_items'},async()=>{await loadOrders()})
    .subscribe();
}

function renderMetrics(){
  const valid=orders.filter(o=>o.status!=='cancelled');
  const today=new Date().toISOString().slice(0,10);
  const todaySales=valid.filter(o=>String(o.created_at).slice(0,10)===today).reduce((s,o)=>s+Number(o.total),0);
  $('#metricOrders').textContent=orders.length;
  $('#metricSales').textContent=money(valid.reduce((s,o)=>s+Number(o.total),0));
  $('#metricToday').textContent=money(todaySales);
  $('#metricPending').textContent=orders.filter(o=>['pending','confirmed','preparing'].includes(o.status)).length;
  $('#metricProducts').textContent=products.filter(p=>p.active).length;
  $('#metricCategories').textContent=categories.length;
  renderDashboardExtras();
}
function renderDashboardExtras(){
  const recent=orders.slice(0,5);
  $('#recentOrders').innerHTML=recent.length?recent.map(o=>`<div class="miniOrder"><div><b>#${o.order_number} · ${esc(o.customer_name)}</b><small>${new Date(o.created_at).toLocaleString('es-EC')}</small></div><div><span class="statusBadge status-${o.status}">${statusLabels[o.status]||o.status}</span><strong>${money(o.total)}</strong></div></div>`).join(''):'<p class="emptySmall">Todavía no hay pedidos.</p>';
  const featured=products.filter(p=>p.featured&&p.active).slice(0,6);
  $('#featuredSummary').innerHTML=featured.length?featured.map(p=>`<div class="miniProduct"><span>${esc(p.name)}</span><strong>${money(p.price)}</strong></div>`).join(''):'<p class="emptySmall">No hay productos destacados.</p>';
}
if(document.querySelector('#refreshOrders'))document.querySelector('#refreshOrders').onclick=loadOrders;
if(document.querySelector('#refreshKitchen'))document.querySelector('#refreshKitchen').onclick=loadOrders;
if(document.querySelector('#fullscreenKitchen'))document.querySelector('#fullscreenKitchen').onclick=()=>{const board=$('#kitchenBoard');if(!document.fullscreenElement)board.requestFullscreen?.();else document.exitFullscreen?.()};
if(document.querySelector('#dashboardRefresh'))document.querySelector('#dashboardRefresh').onclick=loadOrders;
if(document.querySelector('#adminProductSearch'))document.querySelector('#adminProductSearch').oninput=e=>{adminProductQuery=e.target.value;renderAdminProducts()};
if(document.querySelector('#adminProductFilter'))document.querySelector('#adminProductFilter').onchange=e=>{adminProductFilter=e.target.value;renderAdminProducts()};
if(document.querySelector('#orderStatusFilter'))document.querySelector('#orderStatusFilter').onchange=e=>{orderStatusFilter=e.target.value;renderOrders()};

function fillPosCategories(){
  const current=$('#posCategory')?.value||'all';
  if(!$('#posCategory'))return;
  $('#posCategory').innerHTML='<option value="all">Todas las categorías</option>'+categories.filter(c=>c.active).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('#posCategory').value=[...$('#posCategory').options].some(o=>o.value===current)?current:'all';
}
function getPosProducts(){
  const q=($('#posSearch')?.value||'').trim().toLowerCase();
  const category=$('#posCategory')?.value||'all';
  return products.filter(p=>p.active&&(category==='all'||String(p.category_id)===String(category))&&(`${p.name} ${p.description||''}`).toLowerCase().includes(q));
}
function renderPosProducts(){
  if(!$('#posProducts'))return;
  const list=getPosProducts();
  $('#posProducts').innerHTML=list.length?list.map(p=>`<button class="posProduct" data-pos-add="${p.id}">
    ${p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.name)}">`:'<div class="posProductNoImage">Sin imagen</div>'}
    <span class="posProductInfo"><small>${esc(p.categories?.name||'Sin categoría')}</small><b>${esc(p.name)}</b><strong>${money(p.price)}</strong></span>
  </button>`).join(''):'<div class="notice">No hay productos disponibles.</div>';
  $$('[data-pos-add]').forEach(b=>b.onclick=()=>addPosItem(b.dataset.posAdd));
}
function addPosItem(id){
  const item=posCart.find(x=>String(x.id)===String(id));
  if(item)item.qty++;
  else posCart.push({id,qty:1});
  renderPosCart();
}
function changePosQty(id,delta){
  const item=posCart.find(x=>String(x.id)===String(id));
  if(!item)return;
  item.qty+=delta;
  posCart=posCart.filter(x=>x.qty>0);
  renderPosCart();
}
function removePosItem(id){
  posCart=posCart.filter(x=>String(x.id)!==String(id));
  renderPosCart();
}
function posTotals(){
  const subtotal=posCart.reduce((sum,item)=>{
    const p=products.find(x=>String(x.id)===String(item.id));
    return sum+(p?Number(p.price)*item.qty:0);
  },0);
  return{subtotal,total:subtotal};
}
function updatePosChange(){
  if(!$('#posReceived'))return;
  const total=posTotals().total;
  const received=Number($('#posReceived').value||0);
  const cash=$('#posPayment').value==='cash';
  $('#posReceivedWrap').classList.toggle('hidden',!cash);
  $('#posChange').textContent=money(cash?Math.max(0,received-total):0);
}
function renderPosCart(){
  if(!$('#posCart'))return;
  $('#posCart').innerHTML=posCart.length?posCart.map(item=>{
    const p=products.find(x=>String(x.id)===String(item.id));
    if(!p)return'';
    return `<div class="posCartRow">
      <div class="posCartRowMain"><b>${esc(p.name)}</b><small>${money(p.price)} c/u</small>
        <div class="posQty"><button data-pos-minus="${p.id}">−</button><span>${item.qty}</span><button data-pos-plus="${p.id}">+</button></div>
      </div>
      <div class="posCartPrice">${money(Number(p.price)*item.qty)}<button class="posRemove" data-pos-remove="${p.id}">Eliminar</button></div>
    </div>`;
  }).join(''):'<div class="posEmpty">Selecciona productos para comenzar.</div>';
  $$('[data-pos-minus]').forEach(b=>b.onclick=()=>changePosQty(b.dataset.posMinus,-1));
  $$('[data-pos-plus]').forEach(b=>b.onclick=()=>changePosQty(b.dataset.posPlus,1));
  $$('[data-pos-remove]').forEach(b=>b.onclick=()=>removePosItem(b.dataset.posRemove));
  const total=posTotals();
  $('#posSubtotal').textContent=money(total.subtotal);
  $('#posTotal').textContent=money(total.total);
  $('#posHeaderTotal').textContent=money(total.total);
  updatePosChange();
}
function resetPosSale(){
  posCart=[];
  $('#posCustomer').value='';
  $('#posPhone').value='';
  $('#posOrderType').value='local';$('#posCashier').value=currentEmployee?.role==='cashier'?currentEmployee.id:'';$('#posWaiter').value='';
  if($('#posPayment'))$('#posPayment').value='cash';
  if($('#posReceived'))$('#posReceived').value='0';
  $('#posNotes').value='';
  renderPosCart();
}
function paymentLabel(value){return({cash:'Efectivo',card:'Tarjeta',transfer:'Transferencia',deuna:'DeUna',ahorita:'Ahorita'})[value]||value}
function buildReceipt(order,items,received){
  const change=order.payment_method==='cash'?Math.max(0,Number(received)-Number(order.total)):0;
  return `<div class="receiptBrand">
    <h2>${esc(settings.business_name||'MORDISCO FAST FOOD')}</h2>
    <p>Comprobante de venta</p>
    <p>${new Date(order.created_at||Date.now()).toLocaleString('es-EC')}</p>
  </div>
  <div class="receiptLine"></div>
  <p><b>Pedido #${order.order_number}</b></p>
  <p>Cliente: ${esc(order.customer_name)}</p>
  <p>Cajero: ${esc(order.cashier_name||$('#posCashier').selectedOptions[0]?.textContent||'No registrado')}</p>
  ${order.waiter_name?`<p>Mesero: ${esc(order.waiter_name)}</p>`:''}
  <p>Tipo: ${orderTypeLabel(order.order_type)}</p>
  <div class="receiptLine"></div>
  ${items.map(i=>`<div class="receiptItem"><span>${i.quantity} × ${esc(i.product_name)}</span><b>${money(i.subtotal)}</b></div>`).join('')}
  <div class="receiptLine"></div>
  <div class="receiptSummary">
    <div><span>Subtotal</span><b>${money(order.subtotal)}</b></div>
    ${Number(order.discount_amount||0)>0?`<div class="receiptDiscount"><span>Descuento${order.discount_type==='percent'?` (${Number(order.discount_value)}%)`:''}</span><b>− ${money(order.discount_amount)}</b></div>`:''}
    <div class="receiptGrand"><span>TOTAL</span><b>${money(order.total)}</b></div>
    <div><span>Pago</span><b>${paymentLabel(order.payment_method)}</b></div>
    ${order.payment_method==='cash'?`<div><span>Recibido</span><b>${money(received)}</b></div><div><span>Cambio</span><b>${money(change)}</b></div>`:''}
  </div>
  <div class="receiptLine"></div>
  <p>¡Gracias por tu compra!</p>`;
}
async function completePosSale(){
  if(!posCart.length)return toast('Agrega al menos un producto');

  const totals=posTotals();
  const order={
    customer_name:$('#posCustomer').value.trim()||'Consumidor final',
    customer_phone:$('#posPhone').value.trim(),
    customer_address:'',
    order_type:$('#posOrderType').value,
    payment_method:null,
    payment_status:'unpaid',
    notes:$('#posNotes').value.trim(),
    cashier_id:null,
    waiter_id:$('#posWaiter').value||null,
    subtotal:totals.subtotal,
    delivery_cost:0,
    total:totals.total,
    status:'pending'
  };

  const sendBtn=$('#posCharge');
  sendBtn.disabled=true;
  sendBtn.textContent='Enviando...';

  const {data,error}=await db.from('orders').insert(order).select().single();
  if(error){
    sendBtn.disabled=false;
    sendBtn.textContent='Enviar a cocina';
    return toast('No se pudo crear la orden: '+error.message);
  }

  const items=posCart.map(item=>{
    const p=products.find(x=>String(x.id)===String(item.id));
    return{
      order_id:data.id,
      product_id:p.id,
      product_name:p.name,
      unit_price:p.price,
      quantity:item.qty,
      subtotal:Number(p.price)*item.qty
    };
  });

  const {error:itemError}=await db.from('order_items').insert(items);
  sendBtn.disabled=false;
  sendBtn.textContent='Enviar a cocina';

  if(itemError)return toast('La orden se creó, pero fallaron los detalles: '+itemError.message);

  resetPosSale();
  await loadOrders();
  renderPosPendingOrders();toast(`Pedido #${data.order_number} enviado a cocina. Ya aparece abajo para cobrar después.`);
}
if(document.querySelector('#posSearch'))document.querySelector('#posSearch').oninput=renderPosProducts;
if(document.querySelector('#posCategory'))document.querySelector('#posCategory').onchange=renderPosProducts;
if(document.querySelector('#posCashier'))document.querySelector('#posCashier').onchange=()=>{if($('#activeCashierName'))$('#activeCashierName').textContent=$('#posCashier').selectedOptions[0]?.textContent||'Sin seleccionar'};
if(document.querySelector('#posClear'))document.querySelector('#posClear').onclick=()=>{if(!posCart.length||confirm('¿Vaciar la venta actual?'))resetPosSale()};
if(document.querySelector('#posCharge'))document.querySelector('#posCharge').onclick=completePosSale;
if(document.querySelector('#printReceipt'))document.querySelector('#printReceipt').onclick=()=>window.print();


async function loadInventoryData(){
  const [ingRes,movRes,recRes]=await Promise.all([
    db.from('ingredients').select('*').order('name'),
    db.from('inventory_movements').select('*,ingredients(name,unit)').order('created_at',{ascending:false}).limit(100),
    db.from('product_recipes').select('*,ingredients(name,unit,cost_per_unit),products(name)').order('created_at')
  ]);
  if(ingRes.error)return toast('Primero ejecuta el SQL de Inventario en Supabase');
  ingredients=ingRes.data||[];
  inventoryMovements=movRes.data||[];
  recipes=recRes.data||[];
  fillInventorySelects();
  renderIngredientList();
  renderMovementList();
  renderRecipeList();
  renderInventorySummary();
}
function renderInventorySummary(){
  if(!$('#inventoryTotalCount'))return;
  const active=ingredients.filter(i=>i.active);
  const low=active.filter(i=>Number(i.current_stock)<=Number(i.minimum_stock));
  const value=active.reduce((sum,i)=>sum+Number(i.current_stock)*Number(i.cost_per_unit),0);
  $('#inventoryTotalCount').textContent=active.length;
  $('#inventoryLowCount').textContent=low.length;
  $('#inventoryValue').textContent=money(value);
}
function fillInventorySelects(){
  const ingredientOptions=ingredients.filter(i=>i.active).map(i=>`<option value="${i.id}">${esc(i.name)} (${esc(i.unit)})</option>`).join('');
  $('#movementIngredient').innerHTML=ingredientOptions;
  $('#recipeIngredient').innerHTML=ingredientOptions;
  const productOptions=products.filter(p=>p.active).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('#recipeProduct').innerHTML=productOptions;
  const current=$('#recipeProductFilter').value||'all';
  $('#recipeProductFilter').innerHTML='<option value="all">Todos los productos</option>'+productOptions;
  $('#recipeProductFilter').value=[...$('#recipeProductFilter').options].some(o=>o.value===current)?current:'all';
}
function resetIngredientForm(){
  $('#ingredientForm').reset();
  $('#ingredientId').value='';
  $('#ingredientActive').checked=true;
  $('#ingredientCost').value='0';
  $('#ingredientStock').value='0';
  $('#ingredientMinimum').value='0';
}
function renderIngredientList(){
  if(!$('#ingredientList'))return;
  const q=($('#ingredientSearch').value||'').trim().toLowerCase();
  const list=ingredients.filter(i=>i.name.toLowerCase().includes(q));
  $('#ingredientList').innerHTML=list.length?list.map(i=>{
    const low=Number(i.current_stock)<=Number(i.minimum_stock);
    return `<article class="ingredientRow ${low?'lowStock':''}">
      <div class="ingredientName"><b>${esc(i.name)}</b><small>${i.active?'Activo':'Inactivo'} · ${esc(i.unit)}</small></div>
      <div><span class="stockBadge ${low?'low':''}">${Number(i.current_stock).toLocaleString('es-EC')} ${esc(i.unit)}</span><small>${low?' Stock bajo':' Disponible'}</small></div>
      <div class="ingredientValue"><b>${money(Number(i.current_stock)*Number(i.cost_per_unit))}</b><small>${money(i.cost_per_unit)} / ${esc(i.unit)}</small></div>
      <div class="rowActions"><button class="dark" data-edit-ingredient="${i.id}">Editar</button><button class="danger" data-delete-ingredient="${i.id}">Eliminar</button></div>
    </article>`;
  }).join(''):'<div class="inventoryEmpty">No hay ingredientes registrados.</div>';
  $$('[data-edit-ingredient]').forEach(b=>b.onclick=()=>editIngredient(b.dataset.editIngredient));
  $$('[data-delete-ingredient]').forEach(b=>b.onclick=()=>deleteIngredient(b.dataset.deleteIngredient));
}
function editIngredient(id){
  const i=ingredients.find(x=>String(x.id)===String(id));if(!i)return;
  $('#ingredientId').value=i.id;$('#ingredientName').value=i.name;$('#ingredientUnit').value=i.unit;
  $('#ingredientCost').value=i.cost_per_unit;$('#ingredientStock').value=i.current_stock;
  $('#ingredientMinimum').value=i.minimum_stock;$('#ingredientActive').checked=i.active;
  $('#ingredientName').focus();
}
async function deleteIngredient(id){
  if(!confirm('¿Eliminar este ingrediente? También se eliminará de las recetas.'))return;
  const {error}=await db.from('ingredients').delete().eq('id',id);
  if(error)return toast(error.message);
  toast('Ingrediente eliminado');await loadInventoryData();
}
if(document.querySelector('#ingredientForm'))document.querySelector('#ingredientForm').onsubmit=async e=>{
  e.preventDefault();
  const id=$('#ingredientId').value;
  const payload={name:$('#ingredientName').value.trim(),unit:$('#ingredientUnit').value,cost_per_unit:Number($('#ingredientCost').value||0),current_stock:Number($('#ingredientStock').value||0),minimum_stock:Number($('#ingredientMinimum').value||0),active:$('#ingredientActive').checked};
  const res=id?await db.from('ingredients').update(payload).eq('id',id):await db.from('ingredients').insert(payload);
  if(res.error)return toast(res.error.message);
  toast(id?'Ingrediente actualizado':'Ingrediente creado');resetIngredientForm();await loadInventoryData();
};
if(document.querySelector('#clearIngredient'))document.querySelector('#clearIngredient').onclick=resetIngredientForm;
if(document.querySelector('#ingredientSearch'))document.querySelector('#ingredientSearch').oninput=renderIngredientList;

function movementTypeLabel(type){return({purchase:'Compra',adjustment_in:'Ajuste entrada',waste:'Merma',adjustment_out:'Ajuste salida',sale:'Venta'})[type]||type}
function movementIsIn(type){return ['purchase','adjustment_in'].includes(type)}
function renderMovementList(){
  if(!$('#movementList'))return;
  $('#movementList').innerHTML=inventoryMovements.length?inventoryMovements.map(m=>{
    const incoming=Number(m.quantity)>0;
    return `<article class="movementRow"><div><h4>${esc(m.ingredients?.name||'Ingrediente eliminado')}</h4><p>${movementTypeLabel(m.movement_type)} · ${new Date(m.created_at).toLocaleString('es-EC')}${m.supplier?` · ${esc(m.supplier)}`:''}${m.note?` · ${esc(m.note)}`:''}</p></div><div class="movementAmount ${incoming?'in':'out'}">${incoming?'+':''}${Number(m.quantity).toLocaleString('es-EC')} ${esc(m.ingredients?.unit||'')}</div></article>`;
  }).join(''):'<div class="inventoryEmpty">Todavía no hay movimientos.</div>';
}
if(document.querySelector('#movementForm'))document.querySelector('#movementForm').onsubmit=async e=>{
  e.preventDefault();
  const type=$('#movementType').value;
  const raw=Number($('#movementQuantity').value||0);
  const quantity=movementIsIn(type)?raw:-raw;
  const payload={ingredient_id:$('#movementIngredient').value,movement_type:type,quantity,unit_cost:Number($('#movementUnitCost').value||0),supplier:$('#movementSupplier').value.trim(),note:$('#movementNote').value.trim()};
  const {error}=await db.rpc('register_inventory_movement',payload);
  if(error)return toast(error.message);
  $('#movementForm').reset();$('#movementUnitCost').value='0';
  toast('Movimiento registrado');await loadInventoryData();
};
if(document.querySelector('#refreshMovements'))document.querySelector('#refreshMovements').onclick=loadInventoryData;

function renderRecipeList(){
  if(!$('#recipeList'))return;
  const filter=$('#recipeProductFilter').value||'all';
  const list=filter==='all'?recipes:recipes.filter(r=>String(r.product_id)===String(filter));
  const grouped={};
  list.forEach(r=>{(grouped[r.product_id]??=[]).push(r)});
  const cards=Object.values(grouped).map(group=>{
    const productName=group[0].products?.name||'Producto';
    const recipeCost=group.reduce((sum,r)=>sum+Number(r.quantity)*Number(r.ingredients?.cost_per_unit||0),0);
    return `<article class="recipeCard"><header class="recipeCardHead"><h4>${esc(productName)}</h4><b>Costo: ${money(recipeCost)}</b></header><div class="recipeItems">${group.map(r=>`<div class="recipeItem"><span>${esc(r.ingredients?.name||'Ingrediente')}</span><b>${Number(r.quantity).toLocaleString('es-EC')} ${esc(r.ingredients?.unit||'')}</b><button class="danger" data-delete-recipe="${r.id}">Quitar</button></div>`).join('')}</div></article>`;
  });
  $('#recipeList').innerHTML=cards.length?cards.join(''):'<div class="inventoryEmpty">No hay recetas configuradas para esta selección.</div>';
  $$('[data-delete-recipe]').forEach(b=>b.onclick=()=>deleteRecipe(b.dataset.deleteRecipe));
}
if(document.querySelector('#recipeForm'))document.querySelector('#recipeForm').onsubmit=async e=>{
  e.preventDefault();
  const payload={product_id:$('#recipeProduct').value,ingredient_id:$('#recipeIngredient').value,quantity:Number($('#recipeQuantity').value||0)};
  const {error}=await db.from('product_recipes').upsert(payload,{onConflict:'product_id,ingredient_id'});
  if(error)return toast(error.message);
  $('#recipeQuantity').value='';
  toast('Receta actualizada');await loadInventoryData();
};
async function deleteRecipe(id){
  const {error}=await db.from('product_recipes').delete().eq('id',id);
  if(error)return toast(error.message);
  toast('Ingrediente quitado de la receta');await loadInventoryData();
}
if(document.querySelector('#recipeProductFilter'))document.querySelector('#recipeProductFilter').onchange=renderRecipeList;
$$('[data-inventory-view]').forEach(b=>b.onclick=()=>{
  $$('[data-inventory-view]').forEach(x=>x.classList.toggle('active',x===b));
  $$('.inventoryView').forEach(x=>x.classList.add('hidden'));
  $('#inventoryView'+b.dataset.inventoryView.charAt(0).toUpperCase()+b.dataset.inventoryView.slice(1)).classList.remove('hidden');
});




async function loadShifts(){
  const today=new Date();today.setHours(0,0,0,0);
  const {data,error}=await db.from('work_shifts').select('*,staff(name,role)').gte('started_at',today.toISOString()).order('started_at',{ascending:false});
  if(error){console.error(error);return toast('Error cargando turnos: '+error.message)}
  shifts=data||[];
  currentShift=currentEmployee?shifts.find(s=>s.staff_id===currentEmployee.id&&s.status==='open')||null:null;
  renderShifts();
}
function renderShifts(){
  if(!$('#shiftHistoryBody'))return;
  $('#openShiftCount').textContent=shifts.filter(s=>s.status==='open').length;
  $('#shiftSalesCount').textContent=shifts.reduce((n,s)=>n+Number(s.sales_count||0),0);
  $('#shiftSalesTotal').textContent=money(shifts.reduce((n,s)=>n+Number(s.sales_total||0),0));

  const c=$('#currentShiftCard');
  if(!currentEmployee){
    c.className='panel currentShiftCard closed';
    c.innerHTML='<h3>Inicia sesión como empleado para administrar tu turno.</h3>';
  }else if(currentShift){
    c.className='panel currentShiftCard active';
    c.innerHTML=`<h3>Turno activo — ${esc(currentEmployee.name)}</h3>
      <p>Inicio: ${new Date(currentShift.started_at).toLocaleString()}</p>
      <div class="shiftSummaryGrid">
        <div><span>Efectivo inicial</span><strong>${money(currentShift.opening_cash||0)}</strong></div>
        <div><span>Ventas</span><strong>${currentShift.sales_count||0}</strong></div>
        <div><span>Total cobrado</span><strong>${money(currentShift.sales_total||0)}</strong></div>
        <div><span>Estado</span><strong>Abierto</strong></div>
      </div>`;
  }else{
    c.className='panel currentShiftCard closed';
    c.innerHTML=`<h3>${esc(currentEmployee.name)}</h3><p>No tienes un turno abierto.</p>`;
  }

  $('#shiftHistoryBody').innerHTML=shifts.length?shifts.map(s=>`<tr>
    <td>${esc(s.staff?.name||'Empleado')}</td>
    <td>${staffRoleLabel(s.staff?.role||'')}</td>
    <td>${new Date(s.started_at).toLocaleString()}</td>
    <td>${s.ended_at?new Date(s.ended_at).toLocaleString():'—'}</td>
    <td>${s.sales_count||0}</td>
    <td>${money(s.sales_total||0)}</td>
    <td>${s.status==='open'?'Abierto':'Cerrado'}</td>
  </tr>`).join(''):'<tr><td colspan="7">No hay turnos registrados hoy.</td></tr>';
}
function openShiftModal(action){
  if(!currentEmployee)return toast('Primero inicia sesión como empleado');
  shiftAction=action;
  $('#shiftPinTitle').textContent=action==='start'?'Iniciar turno':'Cerrar turno';
  $('#shiftPinHelp').textContent=action==='start'?'Confirma tu PIN y registra el efectivo inicial.':'Confirma tu PIN y registra el efectivo contado al cierre.';
  $('#openingCashLabel').classList.toggle('hidden',action!=='start');
  $('#closingCashLabel').classList.toggle('hidden',action!=='close');
  $('#shiftPinInput').value='';
  $('#shiftPinModal').classList.remove('hidden');
}
if(document.querySelector('#startShiftBtn'))document.querySelector('#startShiftBtn').onclick=()=>{if(currentShift)return toast('Ya tienes un turno abierto');openShiftModal('start')};
if(document.querySelector('#closeShiftBtn'))document.querySelector('#closeShiftBtn').onclick=()=>{if(!currentShift)return toast('No tienes un turno abierto');openShiftModal('close')};
if(document.querySelector('#refreshShiftsBtn'))document.querySelector('#refreshShiftsBtn').onclick=loadShifts;
if(document.querySelector('#shiftPinConfirm'))document.querySelector('#shiftPinConfirm').onclick=async()=>{
  const pin=$('#shiftPinInput').value.trim();
  if(!/^\d{4,6}$/.test(pin))return toast('Ingresa un PIN válido');
  if(shiftAction==='start'){
    const {data,error}=await db.rpc('start_work_shift',{employee_id:currentEmployee.id,employee_pin:pin,initial_cash:Number($('#openingCashInput').value||0)});
    if(error)return toast(error.message);
    toast('Turno iniciado correctamente');
  }else{
    const {data,error}=await db.rpc('close_work_shift',{employee_id:currentEmployee.id,employee_pin:pin,counted_cash:Number($('#closingCashInput').value||0)});
    if(error)return toast(error.message);
    toast('Turno cerrado correctamente');
  }
  $('#shiftPinModal').classList.add('hidden');
  await loadShifts();
};
$$('[data-close="shiftPinModal"]').forEach(b=>b.onclick=()=>$('#shiftPinModal').classList.add('hidden'));

function tableStatusLabel(status){return({free:'Libre',occupied:'Ocupada',preparing:'Preparando',payment:'Por cobrar'})[status]||status}
async function loadTables(){
  const {data,error}=await db.from('restaurant_tables').select('*,staff(name)').order('sort_order');
  if(error)return toast('Primero ejecuta el SQL V9 en Supabase');
  tables=data||[];renderTables();
}
function renderTables(){
  if(!$('#tablesGrid'))return;
  $('#tablesFreeCount').textContent=tables.filter(t=>t.status==='free').length;
  $('#tablesBusyCount').textContent=tables.filter(t=>['occupied','preparing'].includes(t.status)).length;
  $('#tablesPaymentCount').textContent=tables.filter(t=>t.status==='payment').length;
  $('#tablesGrid').innerHTML=tables.length?tables.map(t=>`<button class="tableCard ${t.status}" data-open-table="${t.id}">
    <h3>${esc(t.name)}</h3><p>${t.seats} puestos</p><strong>${tableStatusLabel(t.status)}</strong>
    <div class="tableMeta">${t.staff?.name?`Mesero: ${esc(t.staff.name)}`:'Sin mesero asignado'}</div>
  </button>`).join(''):'<div class="inventoryEmpty">No hay mesas. Crea la primera.</div>';
  $$('[data-open-table]').forEach(b=>b.onclick=()=>openTableOrder(b.dataset.openTable));
}
if(document.querySelector('#createTableBtn'))document.querySelector('#createTableBtn').onclick=async()=>{
  const name=$('#newTableName').value.trim();if(!name)return toast('Escribe el nombre de la mesa');
  const payload={name,seats:Number($('#newTableSeats').value||4),sort_order:tables.length+1};
  const {error}=await db.from('restaurant_tables').insert(payload);if(error)return toast(error.message);
  $('#newTableName').value='';toast('Mesa creada');await loadTables();
};
function fillTableSelectors(){
  $('#tableCategory').innerHTML='<option value="all">Todas las categorías</option>'+categories.filter(c=>c.active).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
}
function getTableProducts(){
  const q=($('#tableProductSearch').value||'').toLowerCase(),cat=$('#tableCategory').value||'all';
  return products.filter(p=>p.active&&(cat==='all'||String(p.category_id)===String(cat))&&(`${p.name} ${p.description||''}`).toLowerCase().includes(q));
}
function renderTableProducts(){
  const list=getTableProducts();
  $('#tableProducts').innerHTML=list.map(p=>`<button class="posProduct" data-table-add="${p.id}">
    ${p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.name)}">`:'<div class="posProductNoImage">Sin imagen</div>'}
    <span class="posProductInfo"><small>${esc(p.categories?.name||'')}</small><b>${esc(p.name)}</b><strong>${money(p.price)}</strong></span>
  </button>`).join('');
  $$('[data-table-add]').forEach(b=>b.onclick=()=>{const r=tableCart.find(x=>String(x.id)===String(b.dataset.tableAdd));if(r)r.qty++;else tableCart.push({id:b.dataset.tableAdd,qty:1});renderTableCart()});
}
function renderTableCart(){
  const total=tableCart.reduce((s,r)=>{const p=products.find(x=>String(x.id)===String(r.id));return s+(p?Number(p.price)*r.qty:0)},0);
  $('#tableTotal').textContent=money(total);
  $('#tableCart').innerHTML=tableCart.length?tableCart.map(r=>{const p=products.find(x=>String(x.id)===String(r.id));return `<div class="posCartRow"><div class="posCartRowMain"><b>${esc(p.name)}</b><div class="posQty"><button data-table-minus="${p.id}">−</button><span>${r.qty}</span><button data-table-plus="${p.id}">+</button></div></div><div class="posCartPrice">${money(Number(p.price)*r.qty)}</div></div>`}).join(''):'<div class="posEmpty">Selecciona productos.</div>';
  $$('[data-table-minus]').forEach(b=>b.onclick=()=>{const r=tableCart.find(x=>String(x.id)===String(b.dataset.tableMinus));r.qty--;tableCart=tableCart.filter(x=>x.qty>0);renderTableCart()});
  $$('[data-table-plus]').forEach(b=>b.onclick=()=>{tableCart.find(x=>String(x.id)===String(b.dataset.tablePlus)).qty++;renderTableCart()});
}
async function openTableOrder(id){
  currentTable=tables.find(t=>String(t.id)===String(id));if(!currentTable)return;
  tableCart=[];fillTableSelectors();renderTableProducts();renderTableCart();
  $('#tableOrderTitle').textContent=currentTable.name;$('#tableOrderStatus').textContent=tableStatusLabel(currentTable.status);
  $('#tableCustomer').value='';$('#tableNotes').value='';$('#tableOrderModal').classList.remove('hidden');
}
if(document.querySelector('#tableProductSearch'))document.querySelector('#tableProductSearch').oninput=renderTableProducts;if(document.querySelector('#tableCategory'))document.querySelector('#tableCategory').onchange=renderTableProducts;
if(document.querySelector('#sendTableOrder'))document.querySelector('#sendTableOrder').onclick=async()=>{
  if(!currentTable||!tableCart.length)return toast('Agrega productos');
  const total=tableCart.reduce((s,r)=>{const p=products.find(x=>String(x.id)===String(r.id));return s+Number(p.price)*r.qty},0);
  const order={customer_name:$('#tableCustomer').value.trim()||currentTable.name,customer_phone:'',customer_address:'',order_type:'local',payment_method:null,payment_status:'unpaid',notes:`${currentTable.name}. ${$('#tableNotes').value.trim()}`.trim(),subtotal:total,delivery_cost:0,total,status:'pending',waiter_id:currentEmployee?.role==='waiter'?currentEmployee.id:(currentTable.staff_id||null),table_id:currentTable.id};
  const {data,error}=await db.from('orders').insert(order).select().single();if(error)return toast(error.message);
  const items=tableCart.map(r=>{const p=products.find(x=>String(x.id)===String(r.id));return{order_id:data.id,product_id:p.id,product_name:p.name,unit_price:p.price,quantity:r.qty,subtotal:Number(p.price)*r.qty}});
  const {error:itemError}=await db.from('order_items').insert(items);if(itemError)return toast(itemError.message);
  await db.from('restaurant_tables').update({status:'preparing',current_order_id:data.id,staff_id:order.waiter_id,updated_at:new Date().toISOString()}).eq('id',currentTable.id);
  toast(`Comanda #${data.order_number} enviada a cocina`);$('#tableOrderModal').classList.add('hidden');await loadTables();await loadOrders();
};
if(document.querySelector('#markTablePayment'))document.querySelector('#markTablePayment').onclick=async()=>{if(!currentTable)return;await db.from('restaurant_tables').update({status:'payment',updated_at:new Date().toISOString()}).eq('id',currentTable.id);toast('Mesa pendiente de cobro');$('#tableOrderModal').classList.add('hidden');await loadTables()};
if(document.querySelector('#freeTable'))document.querySelector('#freeTable').onclick=async()=>{if(!currentTable)return;await db.from('restaurant_tables').update({status:'free',current_order_id:null,staff_id:null,updated_at:new Date().toISOString()}).eq('id',currentTable.id);toast('Mesa liberada');$('#tableOrderModal').classList.add('hidden');await loadTables()};

function staffRoleLabel(role){return({waiter:'Mesero',cashier:'Cajero',kitchen:'Cocina'})[role]||role}
function staffRoleIcon(role){return({waiter:'🧑‍🍽️',cashier:'💵',kitchen:'👨‍🍳'})[role]||'👤'}
async function loadStaff(){
  const {data,error}=await db.from('staff').select('id,name,role,phone,active,created_at,updated_at').order('name');
  if(error){
    console.error('Error cargando personal:',error);
    return toast('Error cargando personal: '+error.message);
  }
  staffMembers=data||[];

  if($('#staffSearch')){
    const currentSearch=$('#staffSearch').value.trim();
    if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentSearch))$('#staffSearch').value='';
  }
  if($('#staffPhone')){
    const currentPhone=$('#staffPhone').value.trim();
    if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentPhone))$('#staffPhone').value='';
  }

  renderStaff();
  fillPosStaff();
  fillEmployeeLogin();
}
function renderStaff(){
  if(!$('#staffList'))return;
  let q=($('#staffSearch')?.value||'').trim().toLowerCase();
  const role=$('#staffRoleFilter')?.value||'all';

  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q)){
    q='';
    if($('#staffSearch'))$('#staffSearch').value='';
  }

  const list=staffMembers.filter(s=>
    (role==='all'||s.role===role)&&
    (`${s.name} ${s.phone||''} ${staffRoleLabel(s.role)}`).toLowerCase().includes(q)
  );
  const active=staffMembers.filter(s=>s.active);
  $('#staffActiveCount').textContent=active.length;
  $('#staffWaiterCount').textContent=active.filter(s=>s.role==='waiter').length;
  $('#staffCashierCount').textContent=active.filter(s=>s.role==='cashier').length;
  $('#staffList').innerHTML=list.length?list.map(s=>`<article class="staffCard ${s.active?'':'staffInactive'}">
    <div class="staffIdentity"><div class="staffAvatar">${staffRoleIcon(s.role)}</div><div><h4>${esc(s.name)}</h4><p>${esc(s.phone||'Sin teléfono')} · ${s.active?'Activo':'Inactivo'}</p></div></div>
    <span class="staffRoleBadge ${s.role}">${staffRoleLabel(s.role)}</span>
    <div class="staffActions"><button class="dark" data-edit-staff="${s.id}">Editar</button><button class="${s.active?'warning':'success'}" data-toggle-staff="${s.id}" data-active="${s.active}">${s.active?'Desactivar':'Activar'}</button><button class="danger" data-delete-staff="${s.id}">Eliminar</button></div>
  </article>`).join(''):'<div class="inventoryEmpty">No hay empleados registrados.</div>';
  $$('[data-edit-staff]').forEach(b=>b.onclick=()=>editStaff(b.dataset.editStaff));
  $$('[data-toggle-staff]').forEach(b=>b.onclick=()=>toggleStaff(b.dataset.toggleStaff,b.dataset.active==='true'));
  $$('[data-delete-staff]').forEach(b=>b.onclick=()=>deleteStaff(b.dataset.deleteStaff));
}
function fillPosStaff(){
  if(!$('#posCashier')||!$('#posWaiter'))return;
  const cashierCurrent=$('#posCashier').value;
  const waiterCurrent=$('#posWaiter').value;
  $('#posCashier').innerHTML='<option value="">Seleccionar cajero</option>'+staffMembers.filter(s=>s.active&&s.role==='cashier').map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('#posWaiter').innerHTML='<option value="">Sin mesero</option>'+staffMembers.filter(s=>s.active&&s.role==='waiter').map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  const forcedCashier=currentEmployee?.role==='cashier'?currentEmployee.id:cashierCurrent;
  $('#posCashier').value=[...$('#posCashier').options].some(o=>o.value===forcedCashier)?forcedCashier:'';
  $('#posCashier').disabled=currentEmployee?.role==='cashier';
  $('#posWaiter').value=[...$('#posWaiter').options].some(o=>o.value===waiterCurrent)?waiterCurrent:'';
  if($('#activeCashierName'))$('#activeCashierName').textContent=currentEmployee?.role==='cashier'?currentEmployee.name:($('#posCashier').selectedOptions[0]?.textContent||'Sin seleccionar');
}
function resetStaffForm(){
  $('#staffForm').reset();$('#staffId').value='';$('#staffActive').checked=true;$('#staffPin').value='';
}
function editStaff(id){
  const s=staffMembers.find(x=>String(x.id)===String(id));if(!s)return;
  $('#staffId').value=s.id;$('#staffName').value=s.name;$('#staffRole').value=s.role;$('#staffPhone').value=s.phone||'';$('#staffActive').checked=s.active;$('#staffPin').value='';$('#staffName').focus();
}
async function toggleStaff(id,isActive){
  const {error}=await db.from('staff').update({active:!isActive,updated_at:new Date().toISOString()}).eq('id',id);
  if(error)return toast(error.message);
  toast(isActive?'Empleado desactivado':'Empleado activado');await loadStaff();
}
async function deleteStaff(id){
  const employee=staffMembers.find(s=>String(s.id)===String(id));
  if(!employee)return;
  if(currentEmployee&&String(currentEmployee.id)===String(id)){
    return toast('No puedes eliminar al empleado que tiene la sesión abierta');
  }
  const accepted=confirm(`¿Eliminar definitivamente a ${employee.name}?\n\nSus ventas y pedidos anteriores se conservarán, pero ya no podrá iniciar sesión.`);
  if(!accepted)return;
  const {error}=await db.from('staff').delete().eq('id',id);
  if(error)return toast('No se pudo eliminar: '+error.message);
  if(String($('#staffId').value)===String(id))resetStaffForm();
  toast('Empleado eliminado');
  await loadStaff();
}
if(document.querySelector('#staffForm'))document.querySelector('#staffForm').onsubmit=async e=>{
  e.preventDefault();
  const id=$('#staffId').value;
  const pin=$('#staffPin').value.trim();
  if(!id&&!/^\d{4,6}$/.test(pin))return toast('El PIN debe tener entre 4 y 6 números');
  if(id&&pin&&!/^\d{4,6}$/.test(pin))return toast('El PIN debe tener entre 4 y 6 números');
  const payload={staff_id:id||null,staff_name:$('#staffName').value.trim(),staff_role:$('#staffRole').value,staff_phone:$('#staffPhone').value.trim()||null,staff_pin:pin||null,staff_active:$('#staffActive').checked};
  const {error}=await db.rpc('save_staff_member',payload);
  if(error)return toast(error.message);
  toast(id?'Empleado actualizado':'Empleado creado');resetStaffForm();await loadStaff();
};
if(document.querySelector('#clearStaff'))document.querySelector('#clearStaff').onclick=resetStaffForm;
if(document.querySelector('#staffSearch'))document.querySelector('#staffSearch').oninput=renderStaff;
if(document.querySelector('#staffRoleFilter'))document.querySelector('#staffRoleFilter').onchange=renderStaff;
if($('#clearStaffSearch'))if(document.querySelector('#clearStaffSearch'))document.querySelector('#clearStaffSearch').onclick=()=>{
  $('#staffSearch').value='';
  $('#staffRoleFilter').value='all';
  renderStaff();
};


function fillEmployeeLogin(){
  if(!$('#employeeLoginStaff'))return;
  $('#employeeLoginStaff').innerHTML=staffMembers.filter(s=>s.active).map(s=>`<option value="${s.id}">${esc(s.name)} — ${staffRoleLabel(s.role)}</option>`).join('');
}
function applyEmployeePermissions(employee){
  currentEmployee=employee;localStorage.setItem('mordisco_employee',JSON.stringify(employee));
  if(employee.role==='cashier'){
    setTimeout(()=>{
      if($('#posCashier')){
        $('#posCashier').value=employee.id;
        $('#posCashier').disabled=true;
      }
      if($('#activeCashierName'))$('#activeCashierName').textContent=employee.name;
    },0);
  }else{
    if($('#posCashier'))$('#posCashier').disabled=false;
    if($('#activeCashierName'))$('#activeCashierName').textContent='Sin seleccionar';
  }
  const allowed={waiter:['tables','orders'],cashier:['pos','orders','tables','shifts'],kitchen:['kitchen'],admin:['dashboard','products','categories','orders','kitchen','pos','inventory','tables','shifts','finance','customers','promotions','pages','staff','settings']}[employee.role]||[];
  $$('.sidebar [data-tab]').forEach(b=>b.classList.toggle('roleRestricted',!allowed.includes(b.dataset.tab)));
  $('#logoutBtn').textContent='Cerrar turno';
  const first=$(`.sidebar [data-tab="${allowed[0]}"]`);if(first)first.click();
}
async function loginEmployee(){
  const id=$('#employeeLoginStaff').value,pin=$('#employeeLoginPin').value.trim();
  if(!id||!/^\d{4,6}$/.test(pin))return toast('Ingresa un PIN válido');
  const {data,error}=await db.rpc('verify_staff_pin',{staff_id:id,staff_pin:pin});
  if(error||!data)return toast('PIN incorrecto');
  const employee=staffMembers.find(s=>String(s.id)===String(id));if(!employee)return;
  $('#employeeLoginModal').classList.add('hidden');$('#employeeLoginPin').value='';
  $('#publicView').classList.add('hidden');$('#adminView').classList.remove('hidden');
  applyEmployeePermissions(employee);await loadShifts();toast(`Bienvenido, ${employee.name}`);
}
$('#employeeAccessBtn')?.addEventListener('click',async()=>{await loadStaff();fillEmployeeLogin();$('#employeeLoginModal').classList.remove('hidden')});
if(document.querySelector('#employeeLoginSubmit'))document.querySelector('#employeeLoginSubmit').onclick=loginEmployee;
if(document.querySelector('#employeeLoginPin'))document.querySelector('#employeeLoginPin').onkeydown=e=>{if(e.key==='Enter')loginEmployee()};

function fillSettings(){$('#sName').value=settings.business_name||'';$('#sWhatsapp').value=settings.whatsapp||'';$('#sDescription').value=settings.description||'';$('#sAddress').value=settings.address||'';$('#sSchedule').value=settings.schedule||'';$('#sDelivery').value=settings.delivery_cost||0;$('#sMinimum').value=settings.minimum_order||0;$('#sAccepting').checked=settings.accepting_orders!==false}
if(document.querySelector('#settingsForm'))document.querySelector('#settingsForm').onsubmit=async e=>{e.preventDefault();const row={id:1,business_name:$('#sName').value,whatsapp:$('#sWhatsapp').value,description:$('#sDescription').value,address:$('#sAddress').value,schedule:$('#sSchedule').value,delivery_cost:Number($('#sDelivery').value||0),minimum_order:Number($('#sMinimum').value||0),accepting_orders:$('#sAccepting').checked};const {error}=await db.from('business_settings').upsert(row);if(error)return toast(error.message);settings=row;applySettings();toast('Configuración guardada en la nube')};

function isoToday(){return new Date().toISOString().slice(0,10)}
function methodLabel(v){return ({cash:'Efectivo',transfer:'Transferencia',card:'Tarjeta',deuna:'DeUna',ahorita:'Ahorita',other:'Otro'})[v]||v}
function tierLabel(v){return ({new:'Nuevo',frequent:'Frecuente',vip:'VIP'})[v]||v}
function slugify(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}

/* CONTABILIDAD */
async function loadFinance(){
  const month=$('#financeMonth')?.value||new Date().toISOString().slice(0,7);
  const start=month+'-01', end=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),1).toISOString().slice(0,10);
  const {data,error}=await db.from('financial_movements').select('*,staff(name)').gte('movement_date',start).lt('movement_date',end).order('movement_date',{ascending:false}).order('created_at',{ascending:false});
  if(error)return toast('Error cargando contabilidad: '+error.message);
  financeMovements=data||[];renderFinance();
}
function renderFinance(){
  if(!$('#financeBody'))return;
  const income=financeMovements.filter(x=>x.type==='income').reduce((s,x)=>s+Number(x.amount),0);
  const expense=financeMovements.filter(x=>x.type==='expense').reduce((s,x)=>s+Number(x.amount),0);
  $('#financeIncome').textContent=money(income);$('#financeExpense').textContent=money(expense);$('#financeBalance').textContent=money(income-expense);
  $('#financeBody').innerHTML=financeMovements.length?financeMovements.map(x=>`<tr>
    <td>${x.movement_date}</td><td>${x.type==='income'?'Ingreso':'Egreso'}</td><td>${esc(x.category)}</td>
    <td>${esc(x.description)}<small>${x.reference?` · ${esc(x.reference)}`:''}${x.staff?.name?` · ${esc(x.staff.name)}`:''}</small></td>
    <td>${methodLabel(x.payment_method)}</td><td class="${x.type==='income'?'positive':'negative'}">${x.type==='income'?'+':'−'}${money(x.amount)}</td>
    <td><button data-fin-edit="${x.id}">Editar</button> <button class="danger" data-fin-delete="${x.id}">Eliminar</button></td></tr>`).join(''):'<tr><td colspan="7">No hay movimientos en este mes.</td></tr>';
  $$('[data-fin-edit]').forEach(b=>b.onclick=()=>editFinance(b.dataset.finEdit));
  $$('[data-fin-delete]').forEach(b=>b.onclick=()=>deleteFinance(b.dataset.finDelete));
}
function resetFinance(){ $('#financeForm').reset();$('#financeId').value='';$('#financeDate').value=isoToday(); }
function editFinance(id){const x=financeMovements.find(v=>v.id===id);if(!x)return;$('#financeId').value=x.id;$('#financeType').value=x.type;$('#financeCategory').value=x.category;$('#financeAmount').value=x.amount;$('#financeMethod').value=x.payment_method;$('#financeDate').value=x.movement_date;$('#financeReference').value=x.reference||'';$('#financeDescription').value=x.description}
async function deleteFinance(id){if(!confirm('¿Eliminar este movimiento?'))return;const {error}=await db.from('financial_movements').delete().eq('id',id);if(error)return toast(error.message);await loadFinance()}
if($('#financeForm'))if(document.querySelector('#financeForm'))document.querySelector('#financeForm').onsubmit=async e=>{e.preventDefault();const id=$('#financeId').value;const row={type:$('#financeType').value,category:$('#financeCategory').value,amount:Number($('#financeAmount').value),payment_method:$('#financeMethod').value,movement_date:$('#financeDate').value,reference:$('#financeReference').value.trim(),description:$('#financeDescription').value.trim(),staff_id:currentEmployee?.id||null};const q=id?db.from('financial_movements').update(row).eq('id',id):db.from('financial_movements').insert(row);const {error}=await q;if(error)return toast(error.message);toast('Movimiento guardado');resetFinance();await loadFinance()};
if($('#clearFinance'))if(document.querySelector('#clearFinance'))document.querySelector('#clearFinance').onclick=resetFinance;
if($('#refreshFinance'))if(document.querySelector('#refreshFinance'))document.querySelector('#refreshFinance').onclick=loadFinance;
if($('#financeMonth')){$('#financeMonth').value=new Date().toISOString().slice(0,7);if(document.querySelector('#financeMonth'))document.querySelector('#financeMonth').onchange=loadFinance}
if($('#financeDate'))$('#financeDate').value=isoToday();

/* CLIENTES */
async function loadCustomers(){
  const {data,error}=await db.from('customers').select('*').order('updated_at',{ascending:false});
  if(error)return toast('Error cargando clientes: '+error.message);customers=data||[];renderCustomers();
}
function filteredCustomers(){const q=($('#customerAdminSearch')?.value||'').toLowerCase();return customers.filter(c=>`${c.full_name} ${c.phone||''} ${c.email||''}`.toLowerCase().includes(q))}
function renderCustomers(){
  if(!$('#customerAdminList'))return;
  $('#customerCount').textContent=customers.length;$('#frequentCount').textContent=customers.filter(c=>c.tier==='frequent').length;$('#vipCount').textContent=customers.filter(c=>c.tier==='vip').length;
  $('#customerAdminList').innerHTML=filteredCustomers().map(c=>`<article class="customerCardAdmin">
    <div><b>${esc(c.full_name)}</b> <span class="customerTag">${tierLabel(c.tier)}</span>
    <small>📱 ${esc(c.phone||'Sin teléfono')} · ✉ ${esc(c.email||'Sin correo')}</small>
    <small>${c.order_count||0} pedidos · ${money(c.total_spent||0)} gastados · ${c.loyalty_points||0} puntos</small></div>
    <div><button data-customer-edit="${c.id}">Editar</button><button class="danger" data-customer-delete="${c.id}">Eliminar</button>${c.phone?`<a class="dark miniButton" target="_blank" href="https://wa.me/${String(c.phone).replace(/\D/g,'')}">WhatsApp</a>`:''}</div>
  </article>`).join('')||'<p>No hay clientes registrados.</p>';
  $$('[data-customer-edit]').forEach(b=>b.onclick=()=>editCustomer(b.dataset.customerEdit));$$('[data-customer-delete]').forEach(b=>b.onclick=()=>deleteCustomer(b.dataset.customerDelete));
}
function resetCustomer(){ $('#customerFormAdmin').reset();$('#customerIdAdmin').value='';$('#customerActiveAdmin').checked=true;$('#customerPoints').value=0; }
function editCustomer(id){const c=customers.find(v=>v.id===id);if(!c)return;$('#customerIdAdmin').value=c.id;$('#customerFullName').value=c.full_name;$('#customerPhoneAdmin').value=c.phone||'';$('#customerEmailAdmin').value=c.email||'';$('#customerBirthday').value=c.birthday||'';$('#customerAddressAdmin').value=c.address||'';$('#customerTier').value=c.tier||'new';$('#customerPoints').value=c.loyalty_points||0;$('#customerNotesAdmin').value=c.notes||'';$('#customerActiveAdmin').checked=c.active!==false}
async function deleteCustomer(id){if(!confirm('¿Eliminar este cliente?'))return;const {error}=await db.from('customers').delete().eq('id',id);if(error)return toast(error.message);await loadCustomers()}
if($('#customerFormAdmin'))if(document.querySelector('#customerFormAdmin'))document.querySelector('#customerFormAdmin').onsubmit=async e=>{e.preventDefault();const id=$('#customerIdAdmin').value;const row={full_name:$('#customerFullName').value.trim(),phone:$('#customerPhoneAdmin').value.trim(),email:$('#customerEmailAdmin').value.trim()||null,birthday:$('#customerBirthday').value||null,address:$('#customerAddressAdmin').value.trim(),tier:$('#customerTier').value,loyalty_points:Number($('#customerPoints').value||0),notes:$('#customerNotesAdmin').value.trim(),active:$('#customerActiveAdmin').checked};const q=id?db.from('customers').update(row).eq('id',id):db.from('customers').insert(row);const {error}=await q;if(error)return toast(error.message);toast('Cliente guardado');resetCustomer();await loadCustomers()};
if($('#clearCustomerAdmin'))if(document.querySelector('#clearCustomerAdmin'))document.querySelector('#clearCustomerAdmin').onclick=resetCustomer;
if($('#customerAdminSearch'))if(document.querySelector('#customerAdminSearch'))document.querySelector('#customerAdminSearch').oninput=renderCustomers;

/* PROMOCIONES */
async function loadPromotions(renderAdmin=true){
  const {data,error}=await db.from('promotions').select('*').order('sort_order').order('created_at',{ascending:false});
  if(error){console.warn(error);return}promotions=data||[];renderHomePromotions();if(renderAdmin)renderAdminPromotions();
}
function promotionValid(p){const now=isoToday();return p.active&&(!p.starts_on||p.starts_on<=now)&&(!p.ends_on||p.ends_on>=now)}
function promotionCard(p){return `<article class="promotionCard">${p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.title)}">`:''}<div class="promotionCardBody">${p.badge?`<span class="promotionBadge">${esc(p.badge)}</span>`:''}<h3>${esc(p.title)}</h3><p>${esc(p.description)}</p>${p.promo_price!=null?`<b class="promotionPrice">${money(p.promo_price)}</b>`:''}${p.link_url?`<p><a href="${esc(p.link_url)}">Ver promoción →</a></p>`:''}</div></article>`}
function renderHomePromotions(){if(!$('#homePromotions'))return;const list=promotions.filter(p=>p.featured&&promotionValid(p)).slice(0,6);$('#homePromotions').innerHTML=list.map(promotionCard).join('')||'<p class="notice">Próximamente tendremos nuevas promociones.</p>'}
function renderAdminPromotions(){if(!$('#adminPromotionList'))return;$('#adminPromotionList').innerHTML=promotions.map(p=>`<article class="adminRow"><div>${p.image_url?`<img src="${esc(p.image_url)}">`:''}</div><div><b>${esc(p.title)}</b><small>${p.active?'Publicada':'Oculta'} · ${p.featured?'Destacada':'Normal'}</small></div><button data-promo-edit="${p.id}">Editar</button><button class="danger" data-promo-delete="${p.id}">Eliminar</button></article>`).join('')||'<p>No hay promociones.</p>';$$('[data-promo-edit]').forEach(b=>b.onclick=()=>editPromotion(b.dataset.promoEdit));$$('[data-promo-delete]').forEach(b=>b.onclick=()=>deletePromotion(b.dataset.promoDelete))}
function resetPromotion(){$('#promotionForm').reset();$('#promotionId').value='';$('#promotionActive').checked=true;$('#promotionSort').value=0}
function editPromotion(id){const p=promotions.find(v=>v.id===id);if(!p)return;$('#promotionId').value=p.id;$('#promotionTitle').value=p.title;$('#promotionBadge').value=p.badge||'';$('#promotionDescription').value=p.description;$('#promotionPrice').value=p.promo_price??'';$('#promotionImage').value=p.image_url||'';$('#promotionStart').value=p.starts_on||'';$('#promotionEnd').value=p.ends_on||'';$('#promotionLink').value=p.link_url||'';$('#promotionSort').value=p.sort_order||0;$('#promotionFeatured').checked=p.featured;$('#promotionActive').checked=p.active}
async function deletePromotion(id){if(!confirm('¿Eliminar promoción?'))return;const {error}=await db.from('promotions').delete().eq('id',id);if(error)return toast(error.message);await loadPromotions()}
if($('#promotionForm'))if(document.querySelector('#promotionForm'))document.querySelector('#promotionForm').onsubmit=async e=>{e.preventDefault();const id=$('#promotionId').value;const row={title:$('#promotionTitle').value.trim(),badge:$('#promotionBadge').value.trim(),description:$('#promotionDescription').value.trim(),promo_price:$('#promotionPrice').value===''?null:Number($('#promotionPrice').value),image_url:$('#promotionImage').value.trim(),starts_on:$('#promotionStart').value||null,ends_on:$('#promotionEnd').value||null,link_url:$('#promotionLink').value.trim(),sort_order:Number($('#promotionSort').value||0),featured:$('#promotionFeatured').checked,active:$('#promotionActive').checked};const q=id?db.from('promotions').update(row).eq('id',id):db.from('promotions').insert(row);const {error}=await q;if(error)return toast(error.message);toast('Promoción guardada');resetPromotion();await loadPromotions()};
if($('#clearPromotion'))if(document.querySelector('#clearPromotion'))document.querySelector('#clearPromotion').onclick=resetPromotion;

/* SUBPÁGINAS */
async function loadContentPages(){const {data,error}=await db.from('content_pages').select('*').order('sort_order').order('created_at',{ascending:false});if(error)return toast('Error cargando páginas: '+error.message);contentPages=data||[];renderAdminPages()}
function renderAdminPages(){if(!$('#adminPageList'))return;$('#adminPageList').innerHTML=contentPages.map(p=>`<article class="adminRow"><div></div><div><b>${esc(p.title)}</b><small>/pagina/${esc(p.slug)} · ${p.published?'Publicada':'Borrador'}</small></div><a class="dark miniButton" target="_blank" href="/pagina/${esc(p.slug)}">Ver</a><button data-page-edit="${p.id}">Editar</button><button class="danger" data-page-delete="${p.id}">Eliminar</button></article>`).join('')||'<p>No hay páginas.</p>';$$('[data-page-edit]').forEach(b=>b.onclick=()=>editPage(b.dataset.pageEdit));$$('[data-page-delete]').forEach(b=>b.onclick=()=>deletePage(b.dataset.pageDelete))}
function resetPage(){$('#pageForm').reset();$('#pageId').value='';$('#pagePublished').checked=true;$('#pageSort').value=0}
function editPage(id){const p=contentPages.find(v=>v.id===id);if(!p)return;$('#pageId').value=p.id;$('#pageTitle').value=p.title;$('#pageSlug').value=p.slug;$('#pageSummary').value=p.summary||'';$('#pageHeroImage').value=p.hero_image||'';$('#pageContent').value=p.content;$('#pageButtonText').value=p.button_text||'';$('#pageButtonLink').value=p.button_link||'';$('#pageSort').value=p.sort_order||0;$('#pageShowMenu').checked=p.show_in_menu;$('#pagePublished').checked=p.published}
async function deletePage(id){if(!confirm('¿Eliminar página?'))return;const {error}=await db.from('content_pages').delete().eq('id',id);if(error)return toast(error.message);await loadContentPages()}
if($('#pageTitle'))if(document.querySelector('#pageTitle'))document.querySelector('#pageTitle').oninput=()=>{if(!$('#pageId').value)$('#pageSlug').value=slugify($('#pageTitle').value)};
if($('#pageForm'))if(document.querySelector('#pageForm'))document.querySelector('#pageForm').onsubmit=async e=>{e.preventDefault();const id=$('#pageId').value;const row={title:$('#pageTitle').value.trim(),slug:slugify($('#pageSlug').value),summary:$('#pageSummary').value.trim(),hero_image:$('#pageHeroImage').value.trim(),content:$('#pageContent').value.trim(),button_text:$('#pageButtonText').value.trim(),button_link:$('#pageButtonLink').value.trim(),sort_order:Number($('#pageSort').value||0),show_in_menu:$('#pageShowMenu').checked,published:$('#pagePublished').checked};const q=id?db.from('content_pages').update(row).eq('id',id):db.from('content_pages').insert(row);const {error}=await q;if(error)return toast(error.message);toast('Página guardada');resetPage();await loadContentPages()};
if($('#clearPage'))if(document.querySelector('#clearPage'))document.querySelector('#clearPage').onclick=resetPage;




const loginFormNode=document.querySelector('#loginForm');
if(loginFormNode){
  loginFormNode.addEventListener('submit',async event=>{
    event.preventDefault();

    const email=(document.querySelector('#loginEmail')?.value||'').trim();
    const password=document.querySelector('#loginPassword')?.value||'';
    const submitButton=loginFormNode.querySelector('button[type="submit"],button');

    if(!email||!password){
      toast('Escribe el correo y la contraseña');
      return;
    }

    if(submitButton){
      submitButton.disabled=true;
      submitButton.textContent='Ingresando...';
    }

    try{
      const {error}=await db.auth.signInWithPassword({email,password});
      if(error)throw error;

      const {data:{session},error:sessionError}=await db.auth.getSession();
      if(sessionError)throw sessionError;
      if(!session)throw new Error('No se pudo crear la sesión');

      let allowed=true;
      const {data:profile,error:profileError}=await db
        .from('profiles')
        .select('role')
        .eq('id',session.user.id)
        .maybeSingle();

      if(profileError){
        console.warn('profiles no disponible; se usa la cuenta autenticada:',profileError);
      }else if(profile?.role&&profile.role!=='admin'){
        allowed=false;
      }

      if(!allowed){
        await db.auth.signOut();
        throw new Error('Esta cuenta no tiene permisos de administrador');
      }

      isAdminSession=true;
      currentEmployee=null;
      document.body.classList.remove('employeeMode');

      document.querySelector('#loginModal')?.classList.add('hidden');
      document.querySelector('#publicView')?.classList.add('hidden');
      document.querySelector('#adminView')?.classList.remove('hidden');
      document.querySelector('.topbar')?.classList.add('hidden');

      document.querySelector('.sidebar [data-tab="dashboard"]')?.click();

      await Promise.allSettled([
        typeof loadOrders==='function'?loadOrders():Promise.resolve(),
        typeof loadInventoryData==='function'?loadInventoryData():Promise.resolve(),
        typeof loadStaff==='function'?loadStaff():Promise.resolve(),
        typeof loadTables==='function'?loadTables():Promise.resolve(),
        typeof loadShifts==='function'?loadShifts():Promise.resolve(),
        typeof loadFinance==='function'?loadFinance():Promise.resolve(),
        typeof loadCustomers==='function'?loadCustomers():Promise.resolve(),
        typeof loadPromotions==='function'?loadPromotions():Promise.resolve(),
        typeof loadContentPages==='function'?loadContentPages():Promise.resolve()
      ]);

      if(typeof renderAll==='function')renderAll();
      toast('Bienvenido al panel de administración');
    }catch(error){
      console.error('LOGIN V17:',error);
      toast('No se pudo iniciar sesión: '+(error?.message||'Error desconocido'));
    }finally{
      if(submitButton){
        submitButton.disabled=false;
        submitButton.textContent='Ingresar';
      }
    }
  });
}

init();

$$('[data-close="employeeLoginModal"]').forEach(b=>b.onclick=()=>$('#employeeLoginModal').classList.add('hidden'));
$$('[data-close="tableOrderModal"]').forEach(b=>b.onclick=()=>$('#tableOrderModal').classList.add('hidden'));
