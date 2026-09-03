const SUPABASE_URL = 'https://lhpdxsnsepvlhwkwsvel.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_f21PTSo3zKr1oayFCTTyxA_yn6C7QKo';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const roleLabels = { customer:'Customer', vendor:'Vendor', driver:'Driver', rider:'Rider', admin:'Administrator' };
let currentUser = null;
let currentRole = 'customer';
let products = [];
const grid = document.querySelector('#product-grid');
const toast = document.querySelector('#toast');
const installButton = document.querySelector('#install-button');
let toastTimer;
function showToast(message){ toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2800); }
function mapInventoryRow(row){ return {name:row.product_name || row.name || 'Marketplace offer', vendor:row.vendor_name || row.vendor || 'Verified vendor', price:row.price_display || `GH₵ ${Number(row.price || 0).toLocaleString('en-GH',{minimumFractionDigits:2})}`, tag:row.badge || row.tag || 'TRADE PRICE', image:row.image_url || row.image || 'icon.svg', paystack_checkout_url:row.paystack_checkout_url}; }
function renderProducts(list = products){ grid.innerHTML = list.length ? list.map(product => `<article class="product-card"><div class="product-image" style="background-image:url('${product.image}')"><span class="product-tag">${product.tag}</span></div><div class="product-info"><h3>${product.name}</h3><span class="vendor-name">${product.vendor}</span><div class="price-row"><span class="price">${product.price}<small> / unit</small></span><button class="buy-button" data-checkout="${product.paystack_checkout_url || ''}" data-product="${product.name}">Buy now</button></div></div></article>`).join('') : '<p class="empty-state">No live offers are available yet. Connect your Supabase project to load inventory.</p>'; }
async function loadInventory(){ const {data,error} = await supabaseClient.from('marketplace_inventory').select('*'); if(error){ renderProducts(); showToast(`Inventory unavailable: ${error.message}`); return; } products = (data || []).map(mapInventoryRow); renderProducts(); }
loadInventory();

grid.addEventListener('click', event => { const button = event.target.closest('[data-checkout]'); if (!button) return; const checkoutUrl = new URL(button.dataset.checkout); if (checkoutUrl.protocol !== 'https:' || !checkoutUrl.hostname.endsWith('paystack.com')) { showToast('Secure checkout URL could not be verified.'); return; } showToast(`Opening secure Paystack checkout for ${button.dataset.product}`); window.setTimeout(() => window.location.assign(checkoutUrl.href), 650); });
const search = document.querySelector('#search-input');
search.addEventListener('input', () => { const query = search.value.toLowerCase().trim(); renderProducts(products.filter(product => `${product.name} ${product.vendor}`.toLowerCase().includes(query))); });
document.querySelectorAll('.geo-option').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.geo-option').forEach(item => item.classList.remove('selected')); button.classList.add('selected'); showToast(`${button.dataset.region === 'urban' ? 'Urban hub' : 'Rural market'} offers loaded`); }));
document.querySelectorAll('.category').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.category').forEach(item => item.classList.remove('active')); button.classList.add('active'); showToast(`${button.textContent} deals loaded`); }));
function navigate(viewName){ document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.dataset.view === viewName)); document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('selected', item.dataset.nav === viewName)); if(viewName === 'tracking') initMap(); window.scrollTo({top:0,behavior:'smooth'}); }
document.querySelectorAll('[data-nav]').forEach(item => item.addEventListener('click', event => { event.preventDefault(); navigate(item.dataset.nav); history.replaceState(null,'',`#${item.dataset.nav}`); }));
window.addEventListener('hashchange', () => navigate(location.hash.slice(1) || 'home'));

document.querySelectorAll('.partner-tab').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.partner-tab').forEach(item => item.classList.remove('selected')); tab.classList.add('selected'); document.querySelectorAll('.partner-panel').forEach(panel => panel.classList.toggle('hidden', panel.id !== tab.dataset.panel)); }));
document.querySelectorAll('.tier').forEach(tier => tier.addEventListener('click', () => { tier.parentElement.querySelectorAll('.tier').forEach(item => item.classList.remove('selected')); tier.classList.add('selected'); }));
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
  form.reset(); showToast('Application saved · verification review started');
}
document.querySelector('#vendor-form').addEventListener('submit', event => submitPartnerApplication(event, 'vendor'));
document.querySelector('#rider-form').addEventListener('submit', event => submitPartnerApplication(event, 'rider'));
document.querySelector('#track-rider-form').addEventListener('submit', event => submitPartnerApplication(event, 'rider'));
document.querySelector('#status-toggle').addEventListener('click', event => { const toggle = event.currentTarget; toggle.classList.toggle('selected'); document.querySelector('#admin-status-label').textContent = toggle.classList.contains('selected') ? 'Verified' : 'Pending verification'; showToast(toggle.classList.contains('selected') ? 'Account marked verified' : 'Account moved to pending'); });
document.querySelector('#deposit-button').addEventListener('click', () => { const amount = Number(document.querySelector('#amount-input').value); if (!amount || amount < 1) return showToast('Enter a valid top-up amount'); showToast(`Top-up request for GH₵ ${amount.toFixed(2)} initiated`); });
document.querySelector('#withdraw-button').addEventListener('click', () => showToast('Payout trigger queued · settlement in progress'));
document.querySelector('.online-row .toggle').addEventListener('click', event => { event.currentTarget.classList.toggle('selected'); showToast(event.currentTarget.classList.contains('selected') ? 'You are now receiving delivery requests' : 'You are offline'); });
document.querySelector('.call-button').addEventListener('click', () => showToast('Calling Kwame Mensah…'));

let map;
let riderMarker;
let riderStep = 0;
function initMap(){ if(map || !window.L) return; map = L.map('map',{zoomControl:false,attributionControl:false}).setView([5.6037,-0.1870],13); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18}).addTo(map); const vendor = L.latLng(5.6062,-0.1903), riderStart = L.latLng(5.5988,-0.1794), customer = L.latLng(5.6138,-0.1753); const icon = (color, label) => L.divIcon({className:'custom-pin',html:`<div style="background:${color};border:3px solid #fff;color:#fff;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:grid;place-items:center;box-shadow:0 3px 8px #0004"><span style="transform:rotate(45deg);font:700 10px Manrope">${label}</span></div>`,iconSize:[30,30],iconAnchor:[15,30]}); L.marker(vendor,{icon:icon('#bf543c','V')}).addTo(map).bindTooltip('Akosombo Materials · pickup'); L.marker(customer,{icon:icon('#7043a4','E')}).addTo(map).bindTooltip('Emmanuel A. · drop-off'); riderMarker = L.marker(riderStart,{icon:icon('#e1ae39','R')}).addTo(map).bindTooltip('Kwame Mensah · active'); L.polyline([vendor,customer],{color:'#bf543c',weight:3,dashArray:'7 9',opacity:.65}).addTo(map); map.fitBounds(L.latLngBounds([vendor,customer]),{padding:[30,30]}); setInterval(() => { riderStep = (riderStep + 1) % 101; const position = L.latLng(riderStart.lat + (customer.lat-riderStart.lat)*(riderStep/100), riderStart.lng + (customer.lng-riderStart.lng)*(riderStep/100)); riderMarker.setLatLng(position); document.querySelector('#rider-eta').textContent = riderStep > 55 ? 'Arriving at your address in 02 min' : `Arriving at pickup in ${Math.max(1,4-Math.floor(riderStep/25)).toString().padStart(2,'0')} min`; },3000); setTimeout(() => map.invalidateSize(), 200); }
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; installButton.hidden = false; });
installButton.addEventListener('click', async () => {
  if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; installButton.hidden = true; return; }
  const isAppleDevice = /iphone|ipad|ipod/i.test(navigator.userAgent);
  showToast(isAppleDevice ? 'Tap Share, then Add to Home Screen' : 'Use your browser menu to install Brukina');
});
window.addEventListener('appinstalled', () => { installButton.hidden = true; showToast('Brukina installed successfully'); });
navigate(location.hash.slice(1) || 'home');

const authBackdrop = document.querySelector('#auth-backdrop');
const adminBackdrop = document.querySelector('#admin-backdrop');
const openAuth = () => { authBackdrop.hidden = false; document.querySelector('#auth-name').focus(); };
const closeAuth = () => { authBackdrop.hidden = true; };
const openAdmin = () => { closeAuth(); adminBackdrop.hidden = false; adminBackdrop.querySelector('input').focus(); };
document.querySelector('.profile-button').addEventListener('click', () => { if (currentUser) navigate('dashboard'); else openAuth(); });
document.querySelector('#auth-close').addEventListener('click', closeAuth);
document.querySelector('#admin-close').addEventListener('click', () => { adminBackdrop.hidden = true; });
document.querySelector('#admin-login-button').addEventListener('click', openAdmin);
document.querySelector('#admin-auth-button').addEventListener('click', openAdmin);
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

document.querySelector('#auth-form').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; const {data,error} = await supabaseClient.auth.signUp({email:document.querySelector('#auth-email').value.trim(),password:document.querySelector('#auth-password').value,options:{data:{full_name:document.querySelector('#auth-name').value.trim(),role:currentRole}}}); if(error){ showToast(error.message); return; } currentUser = data.user; closeAuth(); renderDashboard(); navigate('dashboard'); showToast(data.session ? `Welcome to Brukina, ${roleLabels[currentRole]}` : 'Check your email to confirm your Brukina account'); form.reset(); });
document.querySelector('#admin-form').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; const {data,error} = await supabaseClient.auth.signInWithPassword({email:form.querySelector('input[type="email"]').value.trim(),password:form.querySelector('input[type="password"]').value}); if(error){ showToast(error.message); return; } const role = data.user.app_metadata?.role; if(role !== 'admin'){ await supabaseClient.auth.signOut(); showToast('This account does not have administrator access.'); return; } currentUser = data.user; currentRole = 'admin'; adminBackdrop.hidden = true; renderDashboard(); navigate('dashboard'); showToast('Administrator session opened'); });
document.querySelector('#auth-form').addEventListener('reset', () => { currentRole = 'customer'; });
supabaseClient.auth.getSession().then(({data}) => { if(data.session){ currentUser = data.session.user; currentRole = data.session.user.user_metadata?.role || 'customer'; renderDashboard(); } });
