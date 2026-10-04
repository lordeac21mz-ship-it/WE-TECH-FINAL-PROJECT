let products=[], currentClient=null, config={}, activeFilter='todos';
const $=id=>document.getElementById(id);
async function api(url,opt={}){const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.message||'Erro no servidor');return d}
async function init(){
  setTimeout(()=>{$('splash').classList.add('hidden');$('site').classList.remove('hidden')},1600);
  try{
    config=await api('/api/config');
    applyStoreAppearance(config);
    $('slogan').textContent=config.slogan||'';$('footerSlogan').textContent=config.slogan||'';
    $('contact').textContent=config.whatsappNumber?`WhatsApp: +${config.whatsappNumber}`:'';
    if(config.announcement){$('announcement').textContent='📢 '+config.announcement;$('announcement').classList.remove('hidden')}
    renderSocials(); products=await api('/api/products'); renderProducts();
    const me=await api('/api/client/me'); if(me.isAuthenticated){currentClient=me.client;updateAccountLabel()}
    const saved=localStorage.getItem('we_theme');if(saved)document.body.className=saved;
  }catch(e){console.error(e)}
}
function renderSocials(){let s=[];if(config.instagram)s.push(`<a href="${safeUrl(config.instagram)}" target="_blank" rel="noopener">Instagram</a>`);if(config.facebook)s.push(`<a href="${safeUrl(config.facebook)}" target="_blank" rel="noopener">Facebook</a>`);if(config.tiktok)s.push(`<a href="${safeUrl(config.tiktok)}" target="_blank" rel="noopener">TikTok</a>`);$('socials').innerHTML=s.join(' · ')}
function safeUrl(x){try{const u=new URL(x);return ['http:','https:'].includes(u.protocol)?u.href:'#'}catch{return '#'}}
function money(n){return `${Number(n).toLocaleString('pt-MZ')} MT`}
function renderProducts(list=products){
  $('products').innerHTML=list.length?list.map(p=>{let price=Number(p.finalPrice??p.price),old=Number(p.discount)>0?`<span class="old">${money(p.price)}</span>`:'';return `<article class="product-card"><div class="card-top"><span class="category-badge">${esc(p.category)}</span>${p.announcement?'<span class="new-badge">🔥 NOVO</span>':''}</div><div><h3>${esc(p.title)}</h3><p class="platform">${esc(p.platform||'Digital')}</p><p class="description">${esc(p.description||'')}</p></div><div class="price-row"><div>${old}<span class="price">${money(price)}</span>${p.discount?`<span class="discount">-${p.discount}%</span>`:''}</div><span class="stock">${p.inStock?'Em stock':'Esgotado'}</span></div><button class="buy" ${!p.inStock?'disabled':''} onclick="openBuy(${p.id})">${p.inStock?'Comprar agora':'Sem stock'}</button></article>`}).join(''):'<div class="empty">Nenhum produto disponível nesta categoria.</div>'
}
function filter(cat,btn){activeFilter=cat;document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));btn.classList.add('active');renderProducts(cat==='todos'?products:products.filter(p=>p.category===cat))}
function openAccount(){ $('account').classList.remove('hidden'); currentClient?showClient():authTab('login') }
function closeAccount(){$('account').classList.add('hidden')}
function authTab(tab){$('loginForm').classList.toggle('hidden',tab!=='login');$('registerForm').classList.toggle('hidden',tab!=='register');$('loginTab').classList.toggle('active',tab==='login');$('regTab').classList.toggle('active',tab==='register')}
function updateAccountLabel(){if($('accountLabel'))$('accountLabel').textContent=currentClient?currentClient.name:'Minha Conta'}
async function showClient(){
  $('auth').classList.add('hidden');$('clientArea').classList.remove('hidden');$('clientName').textContent=currentClient.name;updateAccountLabel();
  let orders=await api('/api/client/orders');$('purchaseCount').textContent=orders.length;$('pendingCount').textContent=orders.filter(o=>o.status==='Pendente de Verificação').length;
  $('orders').innerHTML=orders.length?orders.map(o=>`<div class="order"><div><b>${esc(o.productName)}</b> × ${o.quantity}<small>${new Date(o.date).toLocaleString('pt-MZ')} · ${money(o.total)}</small></div><span class="status">${esc(o.status)}</span></div>`).join(''):'<p class="muted">Ainda não tens compras.</p>'
}
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginError').textContent='';try{let d=await api('/api/client/login',{method:'POST',body:JSON.stringify({email:$('email').value,password:$('password').value})});currentClient=d.client;await showClient()}catch(e){$('loginError').textContent=e.message}};
$('registerForm').onsubmit=async e=>{e.preventDefault();$('regError').textContent='';try{let d=await api('/api/client/register',{method:'POST',body:JSON.stringify({name:$('name').value,email:$('regEmail').value,phone:$('phone').value,password:$('regPassword').value})});currentClient=d.client;await showClient()}catch(e){$('regError').textContent=e.message}};
async function logout(){await api('/api/client/logout',{method:'POST'});currentClient=null;updateAccountLabel();$('clientArea').classList.add('hidden');$('auth').classList.remove('hidden');authTab('login')}
function openBuy(id){let p=products.find(x=>x.id===id);if(!p)return;if(!currentClient){openAccount();alert('Entra na tua conta para fazer uma compra.');return}let price=Number(p.finalPrice??p.price);$('buyBox').innerHTML=`<div class="buy-info"><span class="category-badge">${esc(p.category)}</span><h2>${esc(p.title)}</h2><p class="muted">${esc(p.description||'')}</p><div class="buy-total">${money(price)}</div><label>Quantidade</label><input id="qty" type="number" min="1" max="${p.stock}" value="1"><label>Método de pagamento</label><select id="pay"><option>M-Pesa</option><option>e-Mola</option><option>Transferência Bancária</option></select><label>Comprovativo (opcional)</label><input id="receipt" type="file" accept="image/*"><button class="buy" onclick="sendOrder(${p.id})">Confirmar compra</button></div>`;$('buyModal').classList.remove('hidden')}
function closeBuy(){$('buyModal').classList.add('hidden')}
async function sendOrder(productId){let file=$('receipt').files[0],receiptData=null;if(file){if(file.size>5*1024*1024)return alert('O comprovativo deve ter no máximo 5 MB.');receiptData=await readFile(file)}try{await api('/api/client/orders',{method:'POST',body:JSON.stringify({productId,quantity:Number($('qty').value),paymentMethod:$('pay').value,receiptData})});alert('Compra registada! O administrador irá verificar o pagamento.');closeBuy();products=await api('/api/products');renderProducts(activeFilter==='todos'?products:products.filter(p=>p.category===activeFilter));await showClient()}catch(e){alert(e.message)}}
function readFile(f){return new Promise((res,rej)=>{let r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)})}

function applyStoreAppearance(c){
  const themes=['red','blue','purple','green','orange','light'];
  document.body.classList.remove(...themes.map(x=>'theme-'+x));
  document.body.classList.add('theme-'+(themes.includes(c.theme)?c.theme:'red'));
  if(c.wallpaper) document.body.style.backgroundImage=`linear-gradient(#050608cc,#050608cc),url(\"${c.wallpaper}\")`;
  else document.body.style.backgroundImage='';
}
function toggleTheme(){const light=document.body.classList.contains('light-theme');document.body.className=light?'dark-theme':'light-theme';localStorage.setItem('we_theme',document.body.className);$('themeIcon').textContent=light?'☀️':'🌙'}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
window.addEventListener('load',init);
