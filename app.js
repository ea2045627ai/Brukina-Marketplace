import { executeDatabaseLogin, validateLogin, validateSignupForm } from './lib/validation.mjs';

const SUPABASE_URL = 'https://lhpdxsnsepvlhwkwsvel.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_f21PTSo3zKr1oayFCTTyxA_yn6C7QKo';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
globalThis.brukinaSupabase = supabaseClient;
const roleLabels = { customer:'Customer', vendor:'Vendor', driver:'Driver', rider:'Rider', admin:'Administrator' };
const selectableRoles = new Set(['customer', 'vendor', 'driver', 'rider']);
let currentUser = null;
let currentRole = 'customer';
let products = [];
let activeCategory = 'All products';
const grid = document.querySelector('#product-grid');
const toast = document.querySelector('#toast');
const installButton = document.querySelector('#install-button');
let toastTimer;
function showToast(message){ toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2800); }
const fallbackCatalog = [
  {name:'Premium roofing sheets',vendor:'Akosombo Materials',category:'Building materials',source:'Made in Ghana',price:'GH₵ 1,850.00',tag:'WHOLESALE',image:'icon.svg'},
  {name:'Leeknives utility knife set',vendor:'Leeknives Supply Co.',category:'Tools & equipment',source:'American market brand',price:'GH₵ 420.00',tag:'TRADE PRICE',image:'icon.svg'},
  {name:'Solar power station 600W',vendor:'BrightGrid Devices',category:'Devices & gadgets',source:'Shopify partner',price:'GH₵ 3,280.00',tag:'BEST VALUE',image:'icon.svg'},
  {name:'USB-C fast charge kit',vendor:'Northstar Accessories',category:'Accessories & body products',source:'American market brand',price:'GH₵ 185.00',tag:'BULK DEAL',image:'icon.svg'},
  {name:'Unisex workwear overshirt',vendor:'Common Thread Co.',category:'Clothing',source:'Sourcing network',price:'GH₵ 290.00',tag:'NEW ARRIVAL',image:'icon.svg'},
  {name:'Stainless kitchen tap',vendor:'Homeform Trade',category:'Home & living',source:'Made in China',price:'GH₵ 610.00',tag:'CONTAINER RATE',image:'icon.svg'}
];
function mapInventoryRow(row){ return {id:row.id,name:row.product_name || row.name || 'Marketplace offer',vendor:row.vendor_name || row.vendor || 'Verified vendor',category:row.category || 'General',source:row.source_country || row.source || 'Verified supply',price:row.price_display || `GH₵ ${Number(row.price || 0).toLocaleString('en-GH',{minimumFractionDigits:2})}`,tag:row.badge || row.tag || 'TRADE PRICE',image:row.image_url || row.image || 'icon.svg',paystack_checkout_url:row.paystack_checkout_url}; }
function renderProducts(list = products){ grid.innerHTML = list.length ? list.map(product => `<article class="product-card"><div class="product-image" style="background-image:url('${product.image}')"><span class="product-tag">${product.tag}</span></div><div class="product-info"><h3>${product.name}</h3><span class="vendor-name">${product.vendor}</span><small class="product-source">${product.source}</small><div class="price-row"><span class="price">${product.price}<small> / unit</small></span><button class="buy-button" data-inventory-id="${product.id || ''}" data-checkout="${product.paystack_checkout_url || ''}" data-product="${product.name}">Buy now</button></div></div></article>`).join('') : '<p class="empty-state">No offers match this market choice yet. Try another category or search.</p>'; }
function visibleProducts(){ const query = search?.value.toLowerCase().trim() || ''; return products.filter(product => (activeCategory === 'All products' || product.category.toLowerCase() === activeCategory.toLowerCase()) && `${product.name} ${product.vendor} ${product.category} ${product.source}`.toLowerCase().includes(query)); }
async function loadInventory(){ const {data,error} = await supabaseClient.from('marketplace_inventory').select('*').eq('active',true); if(error || !data?.length){ products = fallbackCatalog; renderProducts(visibleProducts()); if(error) showToast('Showing starter catalog · connect Supabase for live inventory'); return; } products = data.map(mapInventoryRow); renderProducts(visibleProducts()); }
loadInventory();
function formatGhs(amount){ return `GH₵ ${Number(amount || 0).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2})}`; }
async function loadWallet(){
  const balance = document.querySelector('#wallet-balance');
  const escrow = document.querySelector('#wallet-escrow');
  const payout = document.querySelector('#wallet-payout');
  const transactions = document.querySelector('#wallet-transactions');
  if(!balance || !transactions) return;
  if(!currentUser){ balance.textContent = escrow.textContent = payout.textContent = 'Sign in to view'; transactions.innerHTML = '<p class="empty-state">Sign in to view wallet activity.</p>'; return; }
  balance.textContent = escrow.textContent = payout.textContent = 'Loading...';
  const {data: wallet, error: walletError} = await supabaseClient.from('wallets').select('id,balance,escrow_balance').eq('user_id',currentUser.id).maybeSingle();
  if(walletError){ balance.textContent = escrow.textContent = payout.textContent = 'Unavailable'; transactions.innerHTML = '<p class="empty-state">Wallet data is unavailable until the wallet migration is applied.</p>'; return; }
  if(!wallet){ balance.textContent = escrow.textContent = payout.textContent = 'GH₵ 0.00'; transactions.innerHTML = '<p class="empty-state">No wallet activity yet.</p>'; return; }
  balance.textContent = formatGhs(wallet.balance);
  escrow.textContent = formatGhs(wallet.escrow_balance);
  payout.textContent = formatGhs(wallet.balance);
  const {data: entries, error: entriesError} = await supabaseClient.from('wallet_transactions').select('amount,transaction_type,description,created_at').eq('wallet_id',wallet.id).order('created_at',{ascending:false}).limit(10);
  if(entriesError || !entries?.length){ transactions.innerHTML = '<p class="empty-state">No wallet activity yet.</p>'; return; }
  transactions.innerHTML = entries.map(entry => `<div class="transaction"><span class="transaction-icon ${entry.amount >= 0 ? 'green' : 'gray'}">${entry.amount >= 0 ? '↙' : '↗'}</span><div><strong>${entry.description}</strong><small>${new Date(entry.created_at).toLocaleString()}</small></div><b class="${entry.amount >= 0 ? 'positive' : 'negative'}">${entry.amount >= 0 ? '+' : '−'} ${formatGhs(Math.abs(entry.amount))}</b></div>`).join('');
}
loadWallet();
let dispatchProviders = [];
let activeDispatchProvider = null;
async function loadDispatchProviders(){
  const {data,error} = await supabaseClient.from('dispatch_providers').select('id,provider_code,display_name,enabled,available,priority').order('priority',{ascending:true});
  if(error){ showToast('Dispatch health is unavailable. Backup dispatch remains available after database setup.'); return; }
  dispatchProviders = (data || []).filter(provider => provider.enabled).sort((a,b) => a.priority - b.priority);
  activeDispatchProvider = dispatchProviders.find(provider => provider.available) || dispatchProviders.find(provider => provider.provider_code === 'brukina_backup');
  const externalAvailable = dispatchProviders.some(provider => provider.provider_code !== 'brukina_backup' && provider.available);
  const copy = document.querySelector('#dispatch-provider-copy');
  const badge = document.querySelector('#dispatch-provider-badge');
  const list = document.querySelector('#provider-list');
  const status = document.querySelector('#dispatch-status');
  const request = document.querySelector('#dispatch-request');
  const buyerList = document.querySelector('#buyer-provider-list');
  if(list) list.innerHTML = dispatchProviders.map(provider => `<div class="provider-chip ${provider.available ? 'available' : 'unavailable'}"><strong>${provider.display_name}</strong><small>${provider.available ? 'Available' : 'Unavailable'}</small></div>`).join('');
  if(buyerList) buyerList.innerHTML = dispatchProviders.map(provider => `<button class="buyer-provider ${provider.id === activeDispatchProvider?.id ? 'selected' : ''}" data-provider-id="${provider.id}" ${provider.available ? '' : 'disabled'}><strong>${provider.display_name}</strong><small>${provider.available ? 'Choose' : 'Offline'}</small></button>`).join('');
  if(copy) copy.textContent = externalAvailable ? `${activeDispatchProvider.display_name} is available for this delivery.` : 'Bolt and Yango are unavailable. Brukina Backup is standing by.';
  if(badge) badge.textContent = externalAvailable ? 'READY' : 'FALLBACK';
  if(status){ status.classList.toggle('fallback', !externalAvailable); status.querySelector('span').firstChild.nextSibling.textContent = `Dispatch provider: ${activeDispatchProvider?.display_name || 'Brukina Backup'}`; }
  if(request) request.hidden = externalAvailable || !activeDispatchProvider;
  buyerList?.querySelectorAll('[data-provider-id]').forEach(button => button.addEventListener('click', () => {
    activeDispatchProvider = dispatchProviders.find(provider => provider.id === button.dataset.providerId);
    buyerList.querySelectorAll('.buyer-provider').forEach(item => item.classList.toggle('selected', item === button));
    if(copy) copy.textContent = `${activeDispatchProvider.display_name} selected for this delivery.`;
    if(badge) badge.textContent = activeDispatchProvider.provider_code === 'brukina_backup' ? 'FALLBACK' : 'READY';
    if(status){ status.classList.toggle('fallback', activeDispatchProvider.provider_code === 'brukina_backup'); status.querySelector('span').firstChild.nextSibling.textContent = `Dispatch provider: ${activeDispatchProvider.display_name}`; }
    if(request) request.hidden = activeDispatchProvider.provider_code !== 'brukina_backup';
  }));
}
loadDispatchProviders();

grid.addEventListener('click', async event => { const button = event.target.closest('[data-inventory-id]'); if (!button) return; if (!currentUser) { openAuth(); showToast('Sign in before placing an order.'); return; } if (!button.dataset.inventoryId) { showToast('This offer is available for inquiry while secure checkout is being connected.'); return; } button.disabled = true; const {data:{session}} = await supabaseClient.auth.getSession(); const response = await fetch('/.netlify/functions/create-order',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token || ''}`},body:JSON.stringify({inventory_id:button.dataset.inventoryId,quantity:1})}); const result = await response.json().catch(() => ({})); button.disabled = false; if(!response.ok){ showToast(result.error || 'Order could not be created.'); return; } showToast(`Order ${result.order_number} created successfully.`); navigate('tracking'); });
const search = document.querySelector('#search-input');
search.addEventListener('input', () => renderProducts(visibleProducts()));
document.querySelectorAll('.geo-option').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.geo-option').forEach(item => item.classList.remove('selected')); button.classList.add('selected'); showToast(`${button.dataset.region === 'urban' ? 'Urban hub' : 'Rural market'} offers loaded`); }));
document.querySelectorAll('.category').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.category').forEach(item => item.classList.remove('active')); button.classList.add('active'); activeCategory = button.textContent.trim(); renderProducts(visibleProducts()); showToast(`${activeCategory} deals loaded`); }));
const pageRoles = { profile:null, settings:null, inventory:'vendor', orders:'customer', dispatch:null, verify:null, admin:'admin' };
const sampleOrders = [
  { id:'BRK-9901', detail:'Premium Millet Brukina Mix x2', total:'GH₵ 70.00', status:'In transit' },
  { id:'BRK-9842', detail:'Organic Fresh Cow Milk Extract x1', total:'GH₵ 60.00', status:'Delivered' }
];
const dispatchQueue = [
  { id:'BRK-9905', route:'Brukina Delights Hub (Osu) -> Labone Estate', fee:'GH₵ 25.00' },
  { id:'BRK-9908', route:'Millet Blend Wholesale (East Legon) -> Airport Residential', fee:'GH₵ 40.00' }
];
let acceptedDispatch = [];
let localProducts = [
  { name:'Premium Millet Brukina Mix', detail:'45 units · GH₵ 35.00', status:'Active' },
  { name:'Organic Fresh Cow Milk Extract', detail:'12 units · GH₵ 60.00', status:'Active' },
  { name:'Traditional Sweetener Blend', detail:'0 units · GH₵ 15.00', status:'Out of stock' }
];
function requireSession(page){
  if(currentUser) return true;
  openAuth();
  showToast('Sign in to open this workspace.');
  return false;
}
function renderProfilePage(){
  const name = currentUser?.user_metadata?.full_name || 'Emmanuel';
  const email = currentUser?.email || 'Not available';
  const initials = name.split(' ').map(part => part[0]).join('').slice(0,2).toUpperCase();
  document.querySelector('#profile-name').textContent = name;
  document.querySelector('#profile-email').textContent = email;
  document.querySelector('#profile-avatar').textContent = initials;
  document.querySelector('#profile-role').textContent = roleLabels[currentRole] || 'Customer';
  document.querySelector('#profile-workspace').textContent = roleLabels[currentRole] || 'Customer';
  document.querySelector('#settings-name').value = name;
  document.querySelector('#settings-email').value = email;
  document.querySelector('#settings-role').value = currentRole;
  document.querySelector('#verify-email').textContent = email;
}
function renderDataRows(selector, rows){
  document.querySelector(selector).innerHTML = rows.map(row => `<div class="data-row"><div class="data-row-main"><strong>${row.id || row.name}</strong><small>${row.detail || row.route}</small></div>${row.status ? `<span class="status-chip ${row.status.toLowerCase().includes('pending') || row.status.toLowerCase().includes('stock') ? 'pending' : ''}">${row.status}</span>` : ''}<b>${row.total || row.fee || ''}</b>${selector === '#dispatch-queue' ? `<button class="outline-button" data-dispatch-id="${row.id}">Accept <span>→</span></button>` : ''}${selector === '#admin-queue' ? '<button class="outline-button">Review</button>' : ''}</div>`).join('');
}
function renderWorkspacePage(page){
  if(!requireSession(page)) return false;
  const requiredRole = pageRoles[page];
  if(requiredRole && currentRole !== requiredRole){ showToast(`This page is for ${roleLabels[requiredRole]} accounts.`); return false; }
  if(page === 'profile' || page === 'settings' || page === 'verify') renderProfilePage();
  if(page === 'orders') renderDataRows('#orders-list', sampleOrders);
  if(page === 'inventory'){ renderDataRows('#inventory-list', localProducts); document.querySelector('#inventory-count').textContent = `${localProducts.length} products`; }
  if(page === 'dispatch'){ renderDataRows('#dispatch-queue', dispatchQueue); renderDataRows('#dispatch-manifest', acceptedDispatch); }
  if(page === 'admin') renderDataRows('#admin-queue', [{id:'USR-2041',detail:'Tina Arthur · Vendor · Brukina Delights Hub',status:'Pending'}, {id:'USR-1988',detail:'Kofi Mensah · Driver · Motorcycle',status:'Pending'}, {id:'USR-3104',detail:'Ama Serwaa · Vendor · Millet Blend Wholesale',status:'Pending'}]);
  return true;
}
function navigate(viewName){
  if(pageRoles[viewName] && !renderWorkspacePage(viewName)) return;
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.dataset.view === viewName));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('selected', item.dataset.nav === viewName));
  if(viewName === 'tracking') loadActiveDelivery(); if(viewName === 'hub') initializeVendorDashboard(); if(viewName === 'wallet') loadWallet();
  window.scrollTo({top:0,behavior:'smooth'});
  return true;
}
const pathToView = {
  '/': 'home',
  '/signup': 'home',
  '/login': 'login',
  '/dashboard': 'dashboard',
  '/dashboard/home': 'home',
  '/dashboard/vendor': 'inventory',
  '/dashboard/vendor/profile': 'profile',
  '/dashboard/rider': 'dispatch',
  '/dashboard/driver': 'dispatch',
  '/dashboard/wallet': 'wallet'
};
export function renderApp(){
  const requestedView = location.hash.slice(1) || pathToView[location.pathname] || 'home';
  navigate(requestedView);
}
export function navigateTo(urlPath){
  const [path, hash] = urlPath.split('#');
  history.pushState(null, '', `${path}${hash ? `#${hash}` : ''}`);
  renderApp();
}
document.querySelectorAll('[data-nav]').forEach(item => item.addEventListener('click', event => { event.preventDefault(); navigate(item.dataset.nav); history.replaceState(null,'',`#${item.dataset.nav}`); }));
document.querySelectorAll('[data-page]').forEach(item => item.addEventListener('click', event => { event.preventDefault(); const page = item.dataset.page; if(page === 'signup'){ openAuth(); return; } if(navigate(page)) history.replaceState(null,'',`#${page}`); }));
window.addEventListener('popstate', renderApp);
document.querySelector('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const errorBox = document.querySelector('#login-error');
  const submitLabel = document.querySelector('#login-submit-label');
  errorBox.hidden = true;
  const email = document.querySelector('#login-email').value.trim();
  const password = document.querySelector('#login-password').value;
  if(!validateLogin(email, password)){ errorBox.textContent = 'Enter a valid email address and password.'; errorBox.hidden = false; return; }
  submitLabel.textContent = 'Signing in...';
  form.querySelector('button[type="submit"]').disabled = true;
  const loginResult = await executeDatabaseLogin(supabaseClient, email, password);
  form.querySelector('button[type="submit"]').disabled = false;
  submitLabel.textContent = 'Sign in to workspace';
  if(!loginResult.success){ errorBox.textContent = loginResult.error; errorBox.hidden = false; return; }
  currentUser = loginResult.user;
  const role = loginResult.role;
  currentRole = selectableRoles.has(role) || role === 'admin' ? role : 'customer';
  renderDashboard();
  navigate('dashboard');
  form.reset();
  showToast(`Welcome back, ${roleLabels[currentRole]}.`);
});
document.querySelector('#forgot-password').addEventListener('click', async () => {
  const email = document.querySelector('#login-email').value.trim();
  const errorBox = document.querySelector('#login-error');
  if(!email){ errorBox.textContent = 'Enter your email address first.'; errorBox.hidden = false; return; }
  const {error} = await supabaseClient.auth.resetPasswordForEmail(email, {redirectTo:`${window.location.origin}/#settings`});
  if(error){ errorBox.textContent = error.message; errorBox.hidden = false; return; }
  showToast('Password reset instructions sent.');
});
document.querySelector('#settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  const name = document.querySelector('#settings-name').value.trim();
  const email = document.querySelector('#settings-email').value.trim();
  const validation = validateSignupForm({fullName:name, email, password:'Valid8_'});
  if(validation.errors.fullName || validation.errors.email){ showToast(validation.errors.fullName || validation.errors.email); return; }
  const {data,error} = await supabaseClient.auth.updateUser({data:{full_name:name}});
  if(error){ showToast(error.message); return; }
  currentUser = data.user;
  renderProfilePage();
  showToast('Profile changes saved.');
});
document.querySelector('#inventory-form').addEventListener('submit', event => {
  event.preventDefault();
  const stock = Number(document.querySelector('#inventory-stock').value);
  const price = Number(document.querySelector('#inventory-price').value);
  localProducts.unshift({name:document.querySelector('#inventory-name').value.trim(),detail:`${stock} units · GH₵ ${price.toFixed(2)}`,status:stock > 0 ? 'Active' : 'Out of stock'});
  event.currentTarget.reset();
  renderDataRows('#inventory-list', localProducts);
  document.querySelector('#inventory-count').textContent = `${localProducts.length} products`;
  showToast('Product added to your local catalog.');
});
document.querySelector('#dispatch-view').addEventListener('click', event => {
  const button = event.target.closest('[data-dispatch-id]');
  if(!button) return;
  const job = dispatchQueue.find(item => item.id === button.dataset.dispatchId);
  if(!job) return;
  acceptedDispatch.unshift({...job, status:'In transit'});
  dispatchQueue.splice(dispatchQueue.indexOf(job), 1);
  renderDataRows('#dispatch-queue', dispatchQueue);
  renderDataRows('#dispatch-manifest', acceptedDispatch);
  showToast(`${job.id} added to your active manifest.`);
});
document.querySelector('#admin-view').addEventListener('click', event => {
  const row = event.target.closest('.data-row');
  if(!row) return;
  row.remove();
  const pending = document.querySelectorAll('#admin-queue .data-row').length;
  document.querySelector('#admin-pending').textContent = pending;
  showToast('Verification request marked as reviewed.');
});
document.querySelector('#verify-check').addEventListener('click', async () => {
  if(!currentUser) return;
  const {data} = await supabaseClient.auth.getUser();
  const status = document.querySelector('#verify-status');
  if(data.user?.email_confirmed_at){ status.textContent = 'Email confirmed. Your workspace is active.'; showToast('Workspace verification complete.'); navigate('dashboard'); }
  else { status.textContent = 'Confirmation is still pending. Open the link in your email, then try again.'; }
});
document.querySelector('#verify-resend').addEventListener('click', async () => {
  if(!currentUser?.email) return;
  const {error} = await supabaseClient.auth.resend({type:'signup', email:currentUser.email});
  document.querySelector('#verify-status').textContent = error ? error.message : 'A fresh verification link has been sent.';
});
window.addEventListener('hashchange', () => navigate(location.hash.slice(1) || 'home'));

document.querySelectorAll('.partner-tab').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.partner-tab').forEach(item => item.classList.remove('selected')); tab.classList.add('selected'); document.querySelectorAll('.partner-panel').forEach(panel => panel.classList.toggle('hidden', panel.id !== tab.dataset.panel)); }));
document.querySelectorAll('.tier').forEach(tier => tier.addEventListener('click', () => { tier.parentElement.querySelectorAll('.tier').forEach(item => item.classList.remove('selected')); tier.classList.add('selected'); }));
let vendorLeadChannel;
async function fetchOpenB2BRequests(){
  const container = document.querySelector('#vendor-b2b-leads');
  if(!container) return;
  if(!currentUser || !['vendor','admin'].includes(currentRole)){ container.innerHTML = '<p class="empty-state">Sign in as a verified vendor to view buyer requests.</p>'; return; }
  const {data: requests, error} = await supabaseClient.from('sourcing_requests').select('id,title,description,category,quantity,target_budget,delivery_territory').eq('status','open').order('created_at',{ascending:false});
  if(error){ container.innerHTML = '<p class="empty-state">Buyer requests are unavailable until sourcing is configured.</p>'; return; }
  container.innerHTML = requests?.length ? requests.map(request => `<article class="vendor-lead"><div><span class="accent-label">${request.category}</span><h3>${request.title}</h3><p>${request.description || 'Buyer has not added more details.'}</p><small>${request.quantity} units · ${request.delivery_territory}${request.target_budget ? ` · Budget GH₵ ${Number(request.target_budget).toLocaleString('en-GH',{minimumFractionDigits:2})}` : ''}</small></div><button class="outline-button" data-quote-request="${request.id}">Submit quote <span>→</span></button></article>`).join('') : '<p class="empty-state">No open wholesale requests match your market yet.</p>';
  container.querySelectorAll('[data-quote-request]').forEach(button => button.addEventListener('click', () => submitVendorQuote(button.dataset.quoteRequest)));
}
async function submitVendorQuote(requestId){
  if(!currentUser){ openAuth(); showToast('Sign in before submitting a vendor quote.'); return; }
  const unitPrice = Number(window.prompt('Wholesale price per unit (GH₵):', '40'));
  const leadTimeDays = Number(window.prompt('Estimated delivery time (days):', '7'));
  if(!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isInteger(leadTimeDays) || leadTimeDays < 0){ showToast('Enter a valid price and delivery time.'); return; }
  const {data: vendor, error: vendorError} = await supabaseClient.from('global_vendors').select('id').eq('owner_id',currentUser.id).eq('verification_status','verified').maybeSingle();
  if(vendorError || !vendor){ showToast('A verified vendor profile is required before quoting.'); return; }
  const {error} = await supabaseClient.from('sourcing_quotes').insert({request_id:requestId,vendor_id:vendor.id,unit_price:unitPrice,shipping_fee:0,lead_time_days:leadTimeDays,notes:'Submitted through Brukina Vendor Hub'});
  if(error){ showToast(`Quote could not be submitted: ${error.message}`); return; }
  showToast('Wholesale quote submitted successfully.');
  fetchOpenB2BRequests();
}
function initializeVendorDashboard(){
  fetchOpenB2BRequests();
  if(vendorLeadChannel) return;
  vendorLeadChannel = supabaseClient.channel('vendor:sourcing_pool').on('postgres_changes',{event:'INSERT',schema:'public',table:'sourcing_requests'},fetchOpenB2BRequests).subscribe();
}
async function submitPartnerApplication(event, role){
  event.preventDefault();
  if (!currentUser) { openAuth(); showToast('Create an account before submitting an application.'); return; }
  const form = event.currentTarget;
  const textInputs = [...form.querySelectorAll('input[type="text"], input:not([type])')];
  const fullNameOrBusiness = textInputs[0]?.value.trim();
  const territory = textInputs[1]?.value.trim();
  const categoryOrVehicle = form.querySelector('select')?.value;
  const license = form.querySelector('input[type="file"]')?.files[0];
  const profile = {id:currentUser.id, full_name:fullNameOrBusiness, role, territory, verification_status:'pending', document_name:license?.name || null};
  const {error: profileError} = await supabaseClient.from('user_profiles').upsert(profile);
  if(profileError){ showToast(`Profile could not be saved: ${profileError.message}`); return; }
  const vendor = {owner_id:currentUser.id, business_name:role === 'vendor' ? fullNameOrBusiness : `${fullNameOrBusiness} Dispatch`, category:role === 'vendor' ? categoryOrVehicle : 'Delivery rider', territory, vendor_tier:document.querySelector('#vendor-panel .tier.selected b')?.textContent || null, vehicle_type:role === 'rider' ? categoryOrVehicle : null, verification_status:'pending', document_name:license?.name || null};
  const {error: vendorError} = await supabaseClient.from('global_vendors').insert(vendor);
  if(vendorError){ showToast(`Partner record could not be saved: ${vendorError.message}`); return; }
  const localRecord = role === 'vendor'
    ? {owner_id:currentUser.id,business_name:fullNameOrBusiness,category:categoryOrVehicle,locality:territory,verification_status:'pending',is_active:false}
    : {user_id:currentUser.id,courier_type:role === 'driver' ? 'driver' : 'rider',full_name:fullNameOrBusiness,vehicle_type:categoryOrVehicle,locality:territory,verification_status:'pending',is_online:false};
  const localTable = role === 'vendor' ? 'local_vendors' : 'local_couriers';
  const localWrite = role === 'vendor' ? supabaseClient.from(localTable).insert(localRecord) : supabaseClient.from(localTable).upsert(localRecord, {onConflict:'user_id'});
  const {error: localError} = await localWrite;
  if(localError){ showToast(`Local operations record could not be saved: ${localError.message}`); return; }
  form.reset(); showToast('Application saved · verification review started');
}
document.querySelector('#vendor-form').addEventListener('submit', event => submitPartnerApplication(event, 'vendor'));
document.querySelector('#rider-form').addEventListener('submit', event => submitPartnerApplication(event, 'rider'));
document.querySelector('#track-rider-form').addEventListener('submit', event => submitPartnerApplication(event, 'rider'));
document.querySelector('#status-toggle').addEventListener('click', event => { const toggle = event.currentTarget; toggle.classList.toggle('selected'); document.querySelector('#admin-status-label').textContent = toggle.classList.contains('selected') ? 'Verified' : 'Pending verification'; showToast(toggle.classList.contains('selected') ? 'Account marked verified' : 'Account moved to pending'); });
document.querySelector('#deposit-button').addEventListener('click', () => { const amount = Number(document.querySelector('#amount-input').value); if (!amount || amount < 1) return showToast('Enter a valid top-up amount'); showToast(`Top-up request for GH₵ ${amount.toFixed(2)} initiated`); });
document.querySelector('#withdraw-button').addEventListener('click', () => showToast('Payout trigger queued · settlement in progress'));
document.querySelector('.online-row .toggle').addEventListener('click', async event => {
  const toggle = event.currentTarget;
  if(!currentUser || !['rider','driver'].includes(currentRole)){ showToast('Sign in as an approved rider or driver to change availability.'); return; }
  const goingOnline = !toggle.classList.contains('selected');
  if(goingOnline && !navigator.geolocation){ showToast('Location sharing is required to go online.'); return; }
  toggle.disabled = true;
  let location = null;
  if(goingOnline){
    try { location = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {enableHighAccuracy:true,timeout:10000,maximumAge:30000})); }
    catch { toggle.disabled = false; showToast('Location permission is required to go online.'); return; }
  }
  const updates = {is_online:goingOnline};
  if(location) { updates.current_lat = location.coords.latitude; updates.current_lng = location.coords.longitude; }
  const {error} = await supabaseClient.from('local_couriers').update(updates).eq('user_id',currentUser.id);
  toggle.disabled = false;
  if(error){ showToast(`Availability could not be updated: ${error.message}`); return; }
  toggle.classList.toggle('selected',goingOnline);
  showToast(goingOnline ? 'You are now receiving delivery requests' : 'You are offline');
});
document.querySelector('.call-button').addEventListener('click', () => showToast('Calling Kwame Mensah…'));

let map;
let riderMarker;
let deliveryChannel;
let activeDelivery;
function renderDelivery(delivery, courier){
  activeDelivery = delivery;
  const order = delivery?.orders;
  document.querySelector('#tracking-order-label').textContent = order ? `ACTIVE DELIVERY · #${order.order_number}` : 'DELIVERY TRACKING';
  document.querySelector('#delivery-id').textContent = order ? `#${order.order_number}` : 'No active delivery';
  document.querySelector('#delivery-status').textContent = delivery?.status?.replaceAll('_',' ').toUpperCase() || 'WAITING';
  document.querySelector('#delivery-vendor').textContent = order?.global_vendors?.business_name || 'Vendor pickup';
  document.querySelector('#delivery-customer').textContent = currentUser?.user_metadata?.full_name || 'Customer drop-off';
  document.querySelector('#rider-name').textContent = courier?.full_name ? `${courier.full_name} is riding` : 'No rider assigned';
  document.querySelector('#rider-avatar').textContent = courier?.full_name ? courier.full_name.split(' ').map(part => part[0]).join('').slice(0,2).toUpperCase() : '--';
  document.querySelector('#rider-eta').textContent = delivery?.eta_minutes ? `Arriving in ${delivery.eta_minutes} min` : 'Live ETA pending';
  document.querySelector('#tracking-alert strong').textContent = delivery ? `Delivery status: ${delivery.status.replaceAll('_',' ')}` : 'No active delivery';
  document.querySelector('#tracking-alert small').textContent = delivery ? `Updated ${new Date(delivery.updated_at).toLocaleTimeString()}` : 'Sign in to view active delivery';
}
async function loadActiveDelivery(){
  if(!currentUser){ renderDelivery(null,null); return; }
  const {data, error} = await supabaseClient.from('deliveries').select('id,rider_id,status,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,eta_minutes,updated_at,orders!inner(order_number,customer_id,global_vendors(business_name))').eq('orders.customer_id',currentUser.id).not('status','eq','delivered').not('status','eq','unassigned').order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(error || !data){ renderDelivery(null,null); return; }
  const {data: courier} = data.rider_id ? await supabaseClient.from('local_couriers').select('full_name,current_lat,current_lng').eq('user_id',data.rider_id).maybeSingle() : {data:null};
  renderDelivery(data,courier);
  initMap(data,courier);
  if(deliveryChannel) supabaseClient.removeChannel(deliveryChannel);
  deliveryChannel = supabaseClient.channel(`delivery:${data.id}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'deliveries',filter:`id=eq.${data.id}`},payload => loadActiveDelivery()).subscribe();
}
function initMap(delivery = activeDelivery, courier){
  if(!window.L || !delivery?.pickup_lat || !delivery.dropoff_lat) return;
  if(map) map.remove();
  map = L.map('map',{zoomControl:false,attributionControl:false}).setView([Number(delivery.pickup_lat),Number(delivery.pickup_lng)],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18}).addTo(map);
  const icon = (color, label) => L.divIcon({className:'custom-pin',html:`<div style="background:${color};border:3px solid #fff;color:#fff;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:grid;place-items:center;box-shadow:0 3px 8px #0004"><span style="transform:rotate(45deg);font:700 10px Manrope">${label}</span></div>`,iconSize:[30,30],iconAnchor:[15,30]});
  const pickup = L.latLng(Number(delivery.pickup_lat),Number(delivery.pickup_lng));
  const dropoff = L.latLng(Number(delivery.dropoff_lat),Number(delivery.dropoff_lng));
  L.marker(pickup,{icon:icon('#bf543c','V')}).addTo(map).bindTooltip('Vendor pickup');
  L.marker(dropoff,{icon:icon('#7043a4','E')}).addTo(map).bindTooltip('Customer drop-off');
  if(courier?.current_lat && courier?.current_lng){ riderMarker = L.marker([Number(courier.current_lat),Number(courier.current_lng)],{icon:icon('#e1ae39','R')}).addTo(map).bindTooltip('Rider live'); }
  L.polyline([pickup,dropoff],{color:'#bf543c',weight:3,dashArray:'7 9',opacity:.65}).addTo(map);
  map.fitBounds(L.latLngBounds([pickup,dropoff]),{padding:[30,30]});
  setTimeout(() => map.invalidateSize(),200);
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; installButton.hidden = false; });
installButton.addEventListener('click', async () => {
  if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; installButton.hidden = true; return; }
  const isAppleDevice = /iphone|ipad|ipod/i.test(navigator.userAgent);
  showToast(isAppleDevice ? 'Tap Share, then Add to Home Screen' : 'Use your browser menu to install Brukina');
});
window.addEventListener('appinstalled', () => { installButton.hidden = true; showToast('Brukina installed successfully'); });
renderApp();

const authBackdrop = document.querySelector('#auth-backdrop');
const adminBackdrop = document.querySelector('#admin-backdrop');
const openAuth = () => { authBackdrop.hidden = false; document.querySelector('#auth-name').focus(); };
const closeAuth = () => { authBackdrop.hidden = true; };
const openAdmin = () => { closeAuth(); adminBackdrop.hidden = false; adminBackdrop.querySelector('input').focus(); };
if(location.pathname === '/signup' && !location.hash) openAuth();
document.querySelector('.profile-button').addEventListener('click', () => { if (currentUser) navigate('dashboard'); else openAuth(); });
document.querySelector('#auth-close').addEventListener('click', closeAuth);
document.querySelector('#admin-close').addEventListener('click', () => { adminBackdrop.hidden = true; });
document.querySelector('#admin-login-button').addEventListener('click', openAdmin);
document.querySelector('#admin-auth-button').addEventListener('click', openAdmin);
document.querySelector('#login-auth-button').addEventListener('click', () => { closeAuth(); navigate('login'); history.replaceState(null,'','#login'); });
[authBackdrop, adminBackdrop].forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) backdrop.hidden = true; }));
document.querySelectorAll('.role-choice').forEach(choice => choice.addEventListener('click', () => { document.querySelectorAll('.role-choice').forEach(item => item.classList.remove('selected')); choice.classList.add('selected'); currentRole = choice.dataset.role; }));

function renderDashboard(){
  const name = currentUser?.user_metadata?.full_name || 'Emmanuel';
  const firstName = name.split(' ')[0];
  const role = currentRole;
  const configs = {
    customer:{copy:'Track orders, discover better prices, and keep every delivery in view.',metrics:[['Active orders','03'],['Saved vendors','12'],['Wallet balance','GH₵ 8,920']],listTitle:'Recent orders',items:[['BK-4928','Akosombo Materials · Out for delivery','GH₵ 1,240.00'],['BK-4914','Tools & Equipment · Delivered','GH₵ 820.00'],['BK-4881','Groceries · Processing','GH₵ 340.50']],actions:[['Browse marketplace','home'],['Track a delivery','tracking'],['Top up wallet','wallet']]},
    vendor:{copy:'Keep inventory moving, respond to demand, and grow your local trade network.',metrics:[['Today\'s sales','GH₵ 4,280'],['Live listings','28'],['Pending orders','07']],listTitle:'Order queue',items:[['BK-4928','Tools order · Awaiting pickup','GH₵ 1,240.00'],['BK-4925','Materials order · New request','GH₵ 680.00'],['BK-4918','Hardware order · Packed','GH₵ 420.00']],actions:[['Add inventory','home'],['Open vendor hub','hub'],['View payouts','wallet']]},
    driver:{copy:'See your dispatch queue, route progress, and next payout at a glance.',metrics:[['Today\'s trips','08'],['Distance covered','42.6 km'],['Next payout','GH₵ 620']],listTitle:'Dispatch queue',items:[['BK-4928','Akosombo Materials → Emmanuel A.','04 min'],['BK-4921','Osu → Ridge · Ready','12 min'],['BK-4916','Airport → Labone · Scheduled','18 min']],actions:[['Go active','wallet'],['Open live route','tracking'],['View earnings','wallet']]},
    rider:{copy:'Pick up nearby work, stay visible to customers, and build your delivery record.',metrics:[['Available jobs','06'],['Completed trips','124'],['This week','GH₵ 1,842']],listTitle:'Nearby requests',items:[['BK-4930','East Legon → Cantonments · 2.1 km','GH₵ 42'],['BK-4928','Materials pickup · Active','GH₵ 38'],['BK-4920','Airport → Osu · New','GH₵ 55']],actions:[['Go online','wallet'],['View dispatch map','tracking'],['Update profile','hub']]},
    admin:{copy:'Monitor marketplace health, approve partners, and keep settlements moving across Brukina.',metrics:[['Pending reviews','18'],['Live inventory','1,284'],['Today\'s GMV','GH₵ 42,860']],listTitle:'Operations queue',items:[['18 applications','Vendor and rider verification pending','Review'],['128 offers','Inventory refreshed across 14 hubs','Monitor'],['06 dispatches','Rider exceptions need attention','Open']],actions:[['Review applications','hub'],['Monitor dispatch','tracking'],['Audit settlements','wallet']]}
  }[role] || {};
  document.querySelector('#dashboard-title').textContent = `${roleLabels[role]} dashboard`;
  document.querySelector('#dashboard-greeting').textContent = `Welcome back, ${firstName}`;
  document.querySelector('#dashboard-copy').textContent = configs.copy;
  document.querySelector('#dashboard-avatar').textContent = name.split(' ').map(part => part[0]).join('').slice(0,2).toUpperCase();
  document.querySelector('#dashboard-metrics').innerHTML = configs.metrics.map(metric => `<div class="metric"><small>${metric[0]}</small><strong>${metric[1]}</strong></div>`).join('');
  document.querySelector('#dashboard-list-title').textContent = configs.listTitle;
  document.querySelector('#dashboard-list').innerHTML = configs.items.map(item => `<div class="dashboard-item"><span class="dashboard-item-icon">✓</span><div><strong>${item[0]}</strong><small>${item[1]}</small></div><b>${item[2]}</b></div>`).join('');
  document.querySelector('#dashboard-actions').innerHTML = configs.actions.map(action => `<button class="action-button" data-action="${action[1]}">${action[0]} <span>→</span></button>`).join('');
  document.querySelectorAll('[data-action]').forEach(action => action.addEventListener('click', () => navigate(action.dataset.action)));
}

document.querySelector('#auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const fullName = document.querySelector('#auth-name').value.trim();
  const email = document.querySelector('#auth-email').value.trim();
  const password = document.querySelector('#auth-password').value;
  const validation = validateSignupForm({ fullName, email, password });
  if(!validation.isValid){ showToast(Object.values(validation.errors)[0]); return; }
  if(!selectableRoles.has(currentRole)){ showToast('Choose a valid marketplace workspace.'); return; }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.setAttribute('aria-busy', 'true');
  try {
    const {data,error} = await supabaseClient.auth.signUp({email,password,options:{data:{full_name:fullName,role:currentRole}}});
    if(error){ showToast(error.message); return; }
    form.reset();
    if(!data.session){
      closeAuth();
      showToast('Check your email to confirm your account before opening the workspace.');
      return;
    }
    currentUser = data.user;
    closeAuth();
    renderDashboard();
    navigate('dashboard');
    showToast(`Welcome to Brukina, ${roleLabels[currentRole]}`);
  } finally {
    submitButton.disabled = false;
    submitButton.removeAttribute('aria-busy');
  }
});
document.querySelector('#admin-form').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; const {data,error} = await supabaseClient.auth.signInWithPassword({email:form.querySelector('input[type="email"]').value.trim(),password:form.querySelector('input[type="password"]').value}); if(error){ showToast(error.message); return; } const role = data.user.app_metadata?.role; if(role !== 'admin'){ await supabaseClient.auth.signOut(); showToast('This account does not have administrator access.'); return; } currentUser = data.user; currentRole = 'admin'; adminBackdrop.hidden = true; renderDashboard(); navigate('dashboard'); showToast('Administrator session opened'); });
document.querySelector('#auth-form').addEventListener('reset', () => { currentRole = 'customer'; });
supabaseClient.auth.getSession().then(({data}) => {
  if(!data.session) return;
  currentUser = data.session.user;
  const storedRole = data.session.user.app_metadata?.role || data.session.user.user_metadata?.role || 'customer';
  currentRole = selectableRoles.has(storedRole) || storedRole === 'admin' ? storedRole : 'customer';
  renderDashboard();
  loadWallet();
  if(document.querySelector('#tracking-view.active')) loadActiveDelivery();
  if(document.querySelector('#hub-view.active')) initializeVendorDashboard();
});
document.querySelector('#dispatch-request').addEventListener('click', async () => {
  if(!currentUser){ openAuth(); showToast('Sign in to request backup dispatch.'); return; }
  if(!activeDispatchProvider){ showToast('No dispatch provider is currently available.'); return; }
  const {data: dispatchRequest, error} = await supabaseClient.from('dispatch_requests').insert({customer_id:currentUser.id,provider_id:activeDispatchProvider.id,status:'queued',pickup_address:'Akosombo Materials, 14 Independence Ave',dropoff_address:'Customer address pin'}).select('id').single();
  if(error){ showToast(`Backup dispatch could not be queued: ${error.message}`); return; }
  document.querySelector('#dispatch-request').disabled = true;
  document.querySelector('#dispatch-request').textContent = 'Queued';
  showToast('Brukina Backup dispatch request queued securely.');
});

const assistantBackdrop = document.querySelector('#assistant-backdrop');
const callbackBackdrop = document.querySelector('#callback-backdrop');
const assistantLanguage = document.querySelector('#assistant-language');
const assistantQuestion = document.querySelector('#assistant-question');
const assistantStatus = document.querySelector('#assistant-status');
const assistantResponses = { en: 'I can help with marketplace orders, vendor listings, deliveries, and wallet questions. A support representative can follow up when needed.' };
function assistantReply(question){ const normalized = question.toLowerCase(); if(normalized.includes('delivery') || normalized.includes('rider')) return 'For delivery help, open Rider Track to see provider availability and request Brukina Backup when external providers are offline.'; if(normalized.includes('vendor') || normalized.includes('sell')) return 'Vendors can join Vendor Hub, submit verification, and manage their local marketplace profile after approval.'; if(normalized.includes('wallet') || normalized.includes('pay')) return 'Wallet actions are available in My Wallet. Payment and payout settlement require the connected Supabase and Paystack production setup.'; return assistantResponses.en; }
function speakAssistant(text){ if(!window.speechSynthesis){ assistantStatus.textContent = text; return; } const utterance = new SpeechSynthesisUtterance(text); utterance.lang = assistantLanguage.value; window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance); assistantStatus.textContent = text; }
document.querySelector('#assistant-launcher').addEventListener('click', () => { assistantBackdrop.hidden = false; assistantQuestion.focus(); });
document.querySelector('#assistant-close').addEventListener('click', () => { assistantBackdrop.hidden = true; });
document.querySelector('#assistant-speak').addEventListener('click', () => speakAssistant(assistantReply(assistantQuestion.value || 'How can you help me?')));
document.querySelector('#assistant-listen').addEventListener('click', () => { const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition; if(!Recognition){ assistantStatus.textContent = 'Voice input is unavailable in this browser. Type your question instead.'; return; } const recognition = new Recognition(); recognition.lang = assistantLanguage.value; recognition.onstart = () => { assistantStatus.textContent = 'Listening...'; }; recognition.onresult = event => { assistantQuestion.value = event.results[0][0].transcript; assistantStatus.textContent = 'Question received. Press Speak or Send question.'; }; recognition.onerror = () => { assistantStatus.textContent = 'Voice input could not start. Type your question instead.'; }; recognition.start(); });
document.querySelector('#assistant-form').addEventListener('submit', event => { event.preventDefault(); const question = assistantQuestion.value.trim(); if(!question) return; speakAssistant(assistantReply(question)); });
document.querySelector('#assistant-callback-button').addEventListener('click', () => { if(!currentUser){ openAuth(); showToast('Sign in before requesting a support callback.'); return; } assistantBackdrop.hidden = true; callbackBackdrop.hidden = false; document.querySelector('#callback-phone').focus(); });
document.querySelector('#callback-close').addEventListener('click', () => { callbackBackdrop.hidden = true; });
document.querySelector('#callback-form').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; const { error } = await supabaseClient.from('support_callback_requests').insert({ user_id:currentUser.id, phone_number:document.querySelector('#callback-phone').value.trim(), preferred_language:assistantLanguage.value, role:currentRole, topic:document.querySelector('#callback-topic').value.trim(), consent_at:new Date().toISOString() }); if(error){ showToast(`Callback request could not be queued: ${error.message}`); return; } callbackBackdrop.hidden = true; form.reset(); showToast('Callback request queued for the support team.'); });
