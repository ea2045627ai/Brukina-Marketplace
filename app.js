const products = [
  {name:'Portland Cement · 50kg', vendor:'Akosombo Materials', price:'GH₵ 92.00', tag:'−18% DEAL', image:'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=700&q=80', checkout:'https://checkout.paystack.com/brukina-cement-50kg'},
  {name:'Rechargeable Angle Grinder', vendor:'Toolsmith Ghana', price:'GH₵ 480.00', tag:'BULK RATE', image:'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=700&q=80', checkout:'https://checkout.paystack.com/brukina-angle-grinder'},
  {name:'Premium Jasmine Rice · 25kg', vendor:'Golden Harvest Co.', price:'GH₵ 385.00', tag:'TOP SELLER', image:'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=700&q=80', checkout:'https://checkout.paystack.com/brukina-jasmine-rice'},
  {name:'EcoCool Chest Freezer', vendor:'Volta Appliance Hub', price:'GH₵ 4,250.00', tag:'−12% DEAL', image:'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?auto=format&fit=crop&w=700&q=80', checkout:'https://checkout.paystack.com/brukina-chest-freezer'},
  {name:'Industrial Safety Boots', vendor:'Kente Workwear', price:'GH₵ 240.00', tag:'TRADE PRICE', image:'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=700&q=80', checkout:'https://checkout.paystack.com/brukina-safety-boots'},
  {name:'Heavy Duty Drill Set', vendor:'Toolsmith Ghana', price:'GH₵ 650.00', tag:'BULK RATE', image:'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=700&q=80', checkout:'https://checkout.paystack.com/brukina-drill-set'},
  {name:'Smart LED Panel · 4 pack', vendor:'Accra Electric', price:'GH₵ 310.00', tag:'NEW', image:'https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?auto=format&fit=crop&w=700&q=80', checkout:'https://checkout.paystack.com/brukina-led-panel'},
  {name:'Compact Water Pump', vendor:'Northern Machinery', price:'GH₵ 1,180.00', tag:'−9% DEAL', image:'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=700&q=80', checkout:'https://checkout.paystack.com/brukina-water-pump'}
];
const grid = document.querySelector('#product-grid');
const toast = document.querySelector('#toast');
const installButton = document.querySelector('#install-button');
let toastTimer;
function showToast(message){ toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2800); }
function renderProducts(list = products){ grid.innerHTML = list.map((product, index) => `<article class="product-card"><div class="product-image" style="background-image:url('${product.image}')"><span class="product-tag">${product.tag}</span></div><div class="product-info"><h3>${product.name}</h3><span class="vendor-name">${product.vendor}</span><div class="price-row"><span class="price">${product.price}<small> / unit</small></span><button class="buy-button" data-checkout="${product.checkout}" data-product="${product.name}">Buy now</button></div></div></article>`).join(''); }
renderProducts();

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
['vendor-form','rider-form'].forEach(id => document.querySelector(`#${id}`).addEventListener('submit', event => { event.preventDefault(); event.target.reset(); showToast('Application received · verification review started'); }));
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
