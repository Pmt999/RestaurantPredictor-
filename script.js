/***** ELEMENTS *****/
const elements = {
  predictionForm: document.getElementById('predictionForm'),
  locationSearch: document.getElementById('locationSearch'),
  latitudeInput: document.getElementById('latitude'),
  longitudeInput: document.getElementById('longitude'),
  dateInput: document.getElementById('date'),
  seatsInput: document.getElementById('seats'),
  output: document.getElementById('predictionOutput'),
  loader: document.getElementById('loader'),
  resultSection: document.getElementById('resultSection'),
  resetBtn: document.getElementById('resetBtn'),
  historyList: document.getElementById('predictionHistory'),
  historySection: document.getElementById('historySection'),
  locationError: document.getElementById('locationError'),
  dateError: document.getElementById('dateError'),
  seatsError: document.getElementById('seatsError'),
  addResourceBtn: document.getElementById('addResourceBtn'),
  customResourcesContainer: document.getElementById('customResources'),
  notificationContainer: document.getElementById('notificationContainer'),

  // tabs + forms
  wasteTab: document.getElementById('wasteTab'),
  predictionTab: document.getElementById('predictionTab'),
  wasteTabContent: document.getElementById('wasteTabContent'),
  wasteForm: document.getElementById('wasteForm'),
  restaurantName: document.getElementById('restaurantName'),
  email: document.getElementById('email'),
  wasteMessage: document.getElementById('wasteMessage'),
  restaurantNameError: document.getElementById('restaurantNameError'),
  emailError: document.getElementById('emailError'),
  wasteMessageError: document.getElementById('wasteMessageError'),

  compostTab: document.getElementById('compostTab'),
  compostTabContent: document.getElementById('compostTabContent'),
  compostForm: document.getElementById('compostForm'),
  compostRestaurantName: document.getElementById('compostRestaurantName'),
  compostEmail: document.getElementById('compostEmail'),
  compostMessage: document.getElementById('compostMessage'),
  compostRestaurantNameError: document.getElementById('compostRestaurantNameError'),
  compostEmailError: document.getElementById('compostEmailError'),
  compostMessageError: document.getElementById('compostMessageError'),

  donationTab: document.getElementById('donationTab'),
  donationTabContent: document.getElementById('donationTabContent'),
  donationForm: document.getElementById('donationForm'),
  donationItemsContainer: document.getElementById('donationItems'),
  addDonationItemBtn: document.getElementById('addDonationItemBtn'),
  donationItemsError: document.getElementById('donationItemsError'),
  donationRestaurantName: document.getElementById('donationRestaurantName'),
  donationEmail: document.getElementById('donationEmail'),
  donationMessage: document.getElementById('donationMessage'),
  donationRestaurantNameError: document.getElementById('donationRestaurantNameError'),
  donationEmailError: document.getElementById('donationEmailError'),
  donationMessageError: document.getElementById('donationMessageError'),

  donateNowBtn: document.getElementById('donateNowBtn'),

  // learning panel
  learningPanel: document.getElementById('learningPanel'),
  actualGuests: document.getElementById('actualGuests'),
  actualGuestsError: document.getElementById('actualGuestsError'),
  learnWeather: document.getElementById('learnWeather'),
  learnHoliday: document.getElementById('learnHoliday'),
  saveActualsBtn: document.getElementById('saveActualsBtn'),
};

/***** STATE *****/
let predictionHistory = JSON.parse(localStorage.getItem('predictionHistory')) || [];
let customTrainingData = JSON.parse(localStorage.getItem('rp_training_data') || '[]'); // [d,dow,hol,weather,seatsNorm,label]
let aiModel = null;
let map, marker, donationMarker;
let lastPredictionContext = null;

/***** CONSTANTS *****/
const WEATHER_CODE = {
  'Clear':0, 'Mainly Clear':0, 'Partly Cloudy':3, 'Cloudy':3,
  'Fog':3, 'Foggy':3,
  'Light Drizzle':1, 'Moderate Drizzle':1, 'Dense Drizzle':1,
  'Light Rain':1, 'Moderate Rain':1, 'Heavy Rain':1,
  'Light Snow':2, 'Moderate Snow':2, 'Heavy Snow':2
};
const CLUSTER_DISTANCE_M = 30;

/***** UTILITIES *****/
function showNotification(message, type='success') {
  const n = document.createElement('div');
  n.className = `notification ${type}`;
  n.innerHTML = `
    <i class="fas ${type==='success'?'fa-check-circle':'fa-exclamation-circle'}"></i>
    ${message}
    <button class="btn btn-dismiss" aria-label="Dismiss notification"><i class="fas fa-times" aria-hidden="true"></i></button>
  `;
  elements.notificationContainer.appendChild(n);
  n.querySelector('.btn-dismiss').addEventListener('click', () => n.remove());
  setTimeout(() => n.remove(), 6000);
}
function todayISO() {
  const now = new Date();
  const m = String(now.getMonth()+1).padStart(2,'0');
  const d = String(now.getDate()).padStart(2,'0');
  return `${now.getFullYear()}-${m}-${d}`;
}
function haversineMeters(aLat,aLng,bLat,bLng){
  const R=6371000, toRad=d=>d*Math.PI/180;
  const dLat=toRad(bLat-aLat), dLng=toRad(bLng-aLng);
  const s1=Math.sin(dLat/2), s2=Math.sin(dLng/2);
  const aa=s1*s1 + Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*s2*s2;
  return 2*R*Math.asin(Math.sqrt(aa));
}
function nearBy(aLat,aLng,bLat,bLng,within=CLUSTER_DISTANCE_M){
  if ([aLat,aLng,bLat,bLng].some(v=>typeof v!=='number'||Number.isNaN(v))) return false;
  return haversineMeters(aLat,aLng,bLat,bLng) <= within;
}
function mergeResourceStrings(existing, incoming){
  const clean = s => (s||'').split(/[•,]/).map(x=>x.trim()).filter(Boolean);
  const oldArr = clean(existing), newArr = clean(incoming);
  const seen = new Set(oldArr.map(x=>x.toLowerCase()));
  newArr.forEach(x=>{ if(!seen.has(x.toLowerCase())) oldArr.push(x); });
  return oldArr.join(' • ');
}

/***** MAP *****/
function initMap() {
  map = L.map('map').setView([51.2799, -0.7403], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 18
  }).addTo(map);
  marker = L.marker([51.2799, -0.7403]).addTo(map);

  map.on('click', function(e) {
    const lat = +e.latlng.lat.toFixed(4);
    const lon = +e.latlng.lng.toFixed(4);
    if (isUKLocation(lat, lon)) {
      updateLocation(lat, lon);
      elements.locationSearch.value = `Lat: ${lat}, Lon: ${lon}`;
      elements.locationError.style.display = 'none';
    } else {
      showNotification('Please select a location within the UK', 'error');
    }
  });
}
function updateLocation(lat, lon) {
  elements.latitudeInput.value = lat;
  elements.longitudeInput.value = lon;
  if (marker) map.removeLayer(marker);
  marker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], 12);
}
function isUKLocation(lat, lon) { return lat >= 49.9 && lat <= 60.8 && lon >= -8.6 && lon <= 1.8; }

/***** GEO / WEATHER / HOLIDAY *****/
async function geocodeLocation(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&countrycodes=GB&limit=1`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'RestaurantPredictor/1.0' } });
    if (!resp.ok) throw new Error(`Geocoding HTTP error: ${resp.status}`);
    const data = await resp.json();
    if (data.length > 0) {
      const { lat, lon } = data[0];
      if (isUKLocation(+lat, +lon)) {
        updateLocation(+lat, +lon);
        elements.locationError.style.display = 'none';
        return true;
      } else {
        showNotification('Location must be in the UK', 'error'); return false;
      }
    } else { showNotification('Location not found', 'error'); return false; }
  } catch (err) {
    console.error('Geocoding error:', err.message);
    showNotification('Geocoding failed, using provided coordinates', 'warning');
    const lat = +elements.latitudeInput.value, lon = +elements.longitudeInput.value;
    if (lat && lon && isUKLocation(lat, lon)) { updateLocation(lat, lon); return true; }
    return false;
  }
}
async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&countrycodes=GB`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'RestaurantPredictor/1.0' } });
    if (!resp.ok) throw new Error(`Reverse geocoding HTTP error: ${resp.status}`);
    const data = await resp.json();
    return data.display_name || 'Unknown Location, UK';
  } catch (err) { console.error('Reverse geocoding error:', err.message); return 'Guildford, UK'; }
}
const fetchWeather = async (lat, lon, date) => {
  try{
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode&start_date=${date}&end_date=${date}&timezone=auto`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Weather API HTTP error: ${resp.status}`);
    const data = await resp.json();
    const code = data.daily.weathercode[0];
    const map = {0:'Clear',1:'Mainly Clear',2:'Partly Cloudy',3:'Cloudy',45:'Fog',48:'Foggy',51:'Light Drizzle',53:'Moderate Drizzle',55:'Dense Drizzle',61:'Light Rain',63:'Moderate Rain',65:'Heavy Rain',71:'Light Snow',73:'Moderate Snow',75:'Heavy Snow'};
    return map[code] || 'Cloudy';
  }catch(err){ console.error('Weather fetch error:', err.message); return 'Cloudy'; }
};
const fetchHoliday = async (date) => {
  try{
    const year = date.split('-')[0];
    const resp = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/GB`);
    if (!resp.ok) throw new Error(`Holiday API HTTP error: ${resp.status}`);
    const holidays = await resp.json();
    return holidays.some(h => h.date === date);
  }catch(err){ console.error('Holiday fetch error:', err.message); return false; }
};

/***** AI / TRAINING *****/
const seedTrainingData = [
  [0.9,0,0,0,0.1,0.75],[0.9,0,0,1,0.1,0.70],[0.9,5,1,0,0.2,0.95],[0.9,5,0,2,0.2,0.80],
  [0.6,2,0,0,0.5,0.65],[0.6,2,0,3,0.5,0.60],[0.6,6,1,1,0.8,0.85],[0.6,6,0,0,0.8,0.75],
  [0.2,0,0,0,0.3,0.55],[0.2,0,0,1,0.3,0.50],[0.2,5,1,0,0.4,0.70],[0.2,2,0,3,0.6,0.50],
  [0.2,6,1,1,0.7,0.65],[0.2,6,0,0,0.7,0.60]
];

async function trainAIModel(force=false) {
  if (aiModel && !force) return aiModel;
  try {
    const all = seedTrainingData.concat(customTrainingData || []);
    const xsArr = all.map(d => d.slice(0,5));
    const ysArr = all.map(d => [d[5]]);
    const xs = tf.tensor2d(xsArr);
    const ys = tf.tensor2d(ysArr);

    aiModel = tf.sequential();
    aiModel.add(tf.layers.dense({ units: 16, activation: 'relu', inputShape: [5] }));
    aiModel.add(tf.layers.dense({ units: 8, activation: 'relu' }));
    aiModel.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
    aiModel.compile({ optimizer: 'adam', loss: 'meanSquaredError' });

    await aiModel.fit(xs, ys, { epochs: 120, batchSize: 8, shuffle: true, verbose: 0 });
    xs.dispose(); ys.dispose();
    return aiModel;
  } catch (err) {
    console.error('AI model training error:', err.message);
    return null;
  }
}

function estimateDensity(lat, lon) {
  const centers = [
    { lat: 51.5074, lon: -0.1278, density: 0.9 },
    { lat: 53.4830, lon: -2.2446, density: 0.6 },
    { lat: 52.4862, lon: -1.8904, density: 0.6 },
    { lat: 55.8642, lon: -4.2518, density: 0.5 },
    { lat: 51.2799, lon: -0.7403, density: 0.4 }
  ];
  let minD = Infinity, density = 0.2;
  centers.forEach(c => {
    const d = Math.sqrt((lat - c.lat) ** 2 + (lon - c.lon) ** 2);
    if (d < minD && d < 0.5) { minD = d; density = c.density; }
  });
  return density;
}

async function predictGuests(lat, lon, date, seats, weather, isHoliday) {
  try {
    const model = await trainAIModel();
    const density = estimateDensity(lat, lon);
    const dayOfWeek = new Date(date).getDay();
    const weatherCode = WEATHER_CODE[weather] ?? 3;

    if (model) {
      const input = tf.tensor2d([[density, dayOfWeek/6, isHoliday?1:0, weatherCode/3, seats/500]]);
      const prediction = model.predict(input);
      const guests = prediction.dataSync()[0];
      input.dispose(); prediction.dispose();
      lastPredictionContext = { density, dayOfWeek, isHoliday, weatherCode, seats };
      return Math.round(guests * seats);
    } else {
      throw new Error('AI model unavailable');
    }
  } catch (err) {
    console.error('Guest prediction error:', err.message);
    const density = estimateDensity(lat, lon);
    lastPredictionContext = { density, dayOfWeek:new Date(date).getDay(), isHoliday, weatherCode:(WEATHER_CODE[weather]??3), seats };
    let expected = Math.floor(seats * 0.65);
    if (weather.includes('Rain') || weather.includes('Snow')) expected -= 5;
    if (weather.includes('Clear')) expected += 5;
    if (isHoliday) expected += 8;
    return Math.max(0, Math.min(seats, expected));
  }
}

/***** CUSTOM FIELDS UI *****/
const addCustomResourceInput = () => {
  const el = document.createElement('div');
  el.className='custom-resource-input'; el.setAttribute('role','listitem');
  el.innerHTML = `
    <input type="text" placeholder="Resource Name (e.g., Salt)" class="custom-resource-name" aria-label="Custom resource name">
    <input type="number" placeholder="Amount per Guest" class="custom-resource-amount" min="0" step="0.01" aria-label="Amount per guest">
    <select class="custom-resource-unit" aria-label="Unit of measurement">
      <option value="kg">kg</option><option value="L">L</option><option value="units">units</option><option value="g">g</option>
    </select>
    <button type="button" class="btn btn-remove" aria-label="Remove resource"><i class="fas fa-trash" aria-hidden="true"></i></button>
  `;
  elements.customResourcesContainer.appendChild(el);
  el.querySelector('.btn-remove').addEventListener('click', ()=>el.remove());
};
const addDonationItemInput = () => {
  const el = document.createElement('div');
  el.className='donation-item-input'; el.setAttribute('role','listitem');
  el.innerHTML = `
    <input type="text" placeholder="Item Name (e.g., Pizza)" class="donation-item-name" aria-label="Donation item name">
    <input type="number" placeholder="Quantity" class="donation-item-quantity" min="0" step="0.1" aria-label="Donation item quantity">
    <select class="donation-item-unit" aria-label="Unit of measurement">
      <option value="units">units</option><option value="kg">kg</option><option value="portions">portions</option><option value="L">L</option>
    </select>
    <button type="button" class="btn btn-remove" aria-label="Remove donation item"><i class="fas fa-trash" aria-hidden="true"></i></button>
    <span class="error-message" role="alert"></span>
  `;
  elements.donationItemsContainer.appendChild(el);
  el.querySelector('.btn-remove').addEventListener('click', ()=>el.remove());
};

/***** TAB SWITCHING *****/
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c=>c.style.display='none');
    btn.classList.add('active');
    document.getElementById(`${btn.dataset.tab}TabContent`).style.display='block';
  });
});

/***** VALIDATION *****/
function validateInputs() {
  let ok = true; const today = todayISO();
  if (!elements.latitudeInput.value || !elements.longitudeInput.value || !isUKLocation(+elements.latitudeInput.value, +elements.longitudeInput.value)) {
    elements.locationError.textContent = 'Please select a valid UK location';
    elements.locationError.style.display = 'block'; ok = false;
  } else { elements.locationError.style.display = 'none'; }
  if (!elements.dateInput.value || elements.dateInput.value < today) {
    elements.dateError.textContent = 'Please select today or a future date';
    elements.dateError.style.display = 'block'; ok = false;
  } else { elements.dateError.style.display = 'none'; }
  if (!elements.seatsInput.value || elements.seatsInput.value < 0 || elements.seatsInput.value > 500) {
    elements.seatsError.textContent = 'Seats must be between 0 and 500';
    elements.seatsError.style.display = 'block'; ok = false;
  } else { elements.seatsError.style.display = 'none'; }
  // light validation for custom rows
  elements.customResourcesContainer.querySelectorAll('.custom-resource-input').forEach(g=>{
    const name = g.querySelector('.custom-resource-name').value.trim();
    const amount = parseFloat(g.querySelector('.custom-resource-amount').value);
    let err = g.querySelector('.error-message'); if (!err){err=document.createElement('span'); err.className='error-message'; g.appendChild(err);}
    err.style.display='none';
    if (name && (!amount || amount<=0)){ err.textContent='Enter a valid amount'; err.style.display='block'; ok=false; }
    else if (amount>0 && !name){ err.textContent='Enter a resource name'; err.style.display='block'; ok=false; }
  });
  return ok;
}
function validateDonationForm() {
  let ok = true;
  const donationItems = elements.donationItemsContainer.querySelectorAll('.donation-item-input');
  elements.donationItemsError.style.display = 'none';
  if (donationItems.length === 0) { elements.donationItemsError.textContent = 'At least one donation item is required'; elements.donationItemsError.style.display = 'block'; ok = false; }
  donationItems.forEach(item => {
    const name = item.querySelector('.donation-item-name').value.trim();
    const qty = parseFloat(item.querySelector('.donation-item-quantity').value);
    const err = item.querySelector('.error-message'); err.style.display='none';
    if (!name && qty > 0){ err.textContent='Item name is required'; err.style.display='block'; ok=false; }
    else if (name && (!qty || qty<=0)){ err.textContent='Valid quantity is required'; err.style.display='block'; ok=false; }
  });
  if (!elements.donationRestaurantName.value.trim()){ elements.donationRestaurantNameError.textContent='Restaurant name is required'; elements.donationRestaurantNameError.style.display='block'; ok=false; } else elements.donationRestaurantNameError.style.display='none';
  if (!elements.donationEmail.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(elements.donationEmail.value)){ elements.donationEmailError.textContent='Valid email is required'; elements.donationEmailError.style.display='block'; ok=false; } else elements.donationEmailError.style.display='none';
  if (!elements.donationMessage.value.trim()){ elements.donationMessageError.textContent='Message is required'; elements.donationMessageError.style.display='block'; ok=false; } else elements.donationMessageError.style.display='none';
  return ok;
}

/***** PREDICTION FLOW *****/
elements.addResourceBtn.addEventListener('click', addCustomResourceInput);
elements.addDonationItemBtn.addEventListener('click', addDonationItemInput);

elements.locationSearch.addEventListener('change', async ()=>{
  const q = elements.locationSearch.value.trim();
  if (q) await geocodeLocation(q);
});

elements.predictionForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  if (!validateInputs()){ showNotification('Please fix input errors', 'error'); return; }

  elements.loader.style.display='block';
  elements.resultSection.style.display='block';
  elements.predictionTab.style.display='block';
  elements.wasteTabContent.style.display='none';
  elements.compostTabContent.style.display='none';
  elements.donationTabContent.style.display='none';
  document.querySelector('.tab-btn[data-tab="prediction"]').classList.add('active');
  document.querySelector('.tab-btn[data-tab="waste"]').classList.remove('active');
  document.querySelector('.tab-btn[data-tab="compost"]').classList.remove('active');
  document.querySelector('.tab-btn[data-tab="donation"]').classList.remove('active');

  try {
    const latitude = +elements.latitudeInput.value;
    const longitude = +elements.longitudeInput.value;
    const date = elements.dateInput.value;
    const seats = parseInt(elements.seatsInput.value, 10);
    const weather = await fetchWeather(latitude, longitude, date);
    const isHoliday = await fetchHoliday(date);
    const density = estimateDensity(latitude, longitude);
    const locationName = await reverseGeocode(latitude, longitude);

    const expectedGuests = await predictGuests(latitude, longitude, date, seats, weather, isHoliday);
    const staffNeeded = Math.max(2, Math.ceil(expectedGuests / 4));

    const flourKg = expectedGuests * 0.9;
    const oilL = expectedGuests * 0.08;
    const waterL = expectedGuests * 0.45;
    const vegetablesKg = expectedGuests * 0.18;
    const meatKg = expectedGuests * 0.12;
    const cleaningSuppliesUnits = Math.ceil(expectedGuests / 12);
    const beveragesL = expectedGuests * 0.5;
    const tablewareSets = expectedGuests * 1;
    const napkinsUnits = expectedGuests * 2;
    const condimentsKg = expectedGuests * 0.05;
    const donation = Math.max(0, seats - expectedGuests);

    elements.output.innerHTML = `
      <strong>📍 Location:</strong> ${locationName} (Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}, Density: ${(density*100).toFixed(0)}%)<br>
      <strong>📅 Date:</strong> ${date}<br>
      <strong>🌤 Weather:</strong> ${weather}<br>
      <strong>🎉 Holiday:</strong> ${isHoliday ? 'Yes' : 'No'}<br>
      <strong>👥 Expected Guests:</strong> ${expectedGuests} (AI Predicted)<br>
      <strong>👨‍🍳 Staff Needed:</strong> ${staffNeeded}<br>
      <strong>🍞 Flour:</strong> ${flourKg.toFixed(1)} kg •
      <strong>🛢 Oil:</strong> ${oilL.toFixed(1)} L •
      <strong>💧 Water:</strong> ${waterL.toFixed(1)} L •
      <strong>🥕 Vegetables:</strong> ${vegetablesKg.toFixed(1)} kg •
      <strong>🍖 Meat:</strong> ${meatKg.toFixed(1)} kg •
      <strong>🥤 Beverages:</strong> ${beveragesL.toFixed(1)} L •
      <strong>🍽 Tableware:</strong> ${tablewareSets} sets •
      <strong>🧻 Napkins:</strong> ${napkinsUnits} •
      <strong>🥫 Condiments:</strong> ${condimentsKg.toFixed(2)} kg<br>
      <strong>❤️ Food for Donation:</strong> ${donation} portions
    `;

    elements.wasteTab.style.display = (expectedGuests===0 || seats===0) ? 'inline-block' : 'none';
    elements.compostTab.style.display = (seats-expectedGuests>0) ? 'inline-block' : 'none';
    elements.donationTab.style.display = (seats-expectedGuests>0) ? 'inline-block' : 'none';

    // learning panel defaults
    elements.learningPanel.style.display = 'block';
    elements.actualGuests.value = '';
    elements.actualGuestsError.style.display = 'none';
    elements.learnWeather.value = weather;
    elements.learnHoliday.checked = !!isHoliday;

    savePrediction({ latitude, longitude, locationName, date, guests: expectedGuests, staff: staffNeeded });
    showNotification('AI prediction generated successfully!', 'success');
  } catch (err) {
    console.error('Prediction error:', err.message);
    elements.output.innerHTML = `<span style="color:#ef4444;">❗ Failed to generate prediction: ${err.message}.</span>`;
    showNotification('Failed to generate prediction', 'error');
  } finally {
    elements.loader.style.display='none';
    elements.output.style.display='block';
  }
});

/***** SAVE ACTUALS & LEARN (NO UPPER LIMIT) *****/
if (elements.saveActualsBtn) {
  elements.saveActualsBtn.addEventListener('click', async ()=>{
    if (!lastPredictionContext) { showNotification('Make a prediction first.', 'error'); return; }
    const seats = parseInt(elements.seatsInput.value, 10);
    const actual = parseInt(elements.actualGuests.value, 10);

    // Only require non-negative; no upper cap.
    if (!Number.isFinite(actual) || actual < 0) {
      elements.actualGuestsError.textContent = 'Enter a non-negative whole number.';
      elements.actualGuestsError.style.display = 'block';
      return;
    }
    elements.actualGuestsError.style.display = 'none';

    // Optional user adjustments
    const weatherStr = elements.learnWeather.value || 'Cloudy';
    const weatherCode = WEATHER_CODE[weatherStr] ?? lastPredictionContext.weatherCode ?? 3;
    const isHoliday = !!elements.learnHoliday.checked;

    const density     = lastPredictionContext.density;
    const dayOfWeek   = lastPredictionContext.dayOfWeek;

    // Keep training label in [0,1] for the sigmoid head.
    // If actual > seats, we cap the ratio to 1.0 so the model stays stable.
    const denomSeats  = Math.max(1, seats);
    const label       = Math.min(actual, denomSeats) / denomSeats; // ∈ [0,1]
    const seatsNorm   = seats / 500; // capacity context

    const sample = [ density, dayOfWeek/6, isHoliday?1:0, weatherCode/3, seatsNorm, label ];
    customTrainingData.push(sample);
    localStorage.setItem('rp_training_data', JSON.stringify(customTrainingData));

    await trainAIModel(true);
    showNotification('Thanks! I learned from your actuals and updated the model.', 'success');
  });
}

/***** DONATION → RESOURCE MAP *****/
function getDonationItems() {
  const items = [];
  elements.donationItemsContainer.querySelectorAll('.donation-item-input').forEach(i=>{
    const name = i.querySelector('.donation-item-name').value.trim();
    const quantity = parseFloat(i.querySelector('.donation-item-quantity').value);
    const unit = i.querySelector('.donation-item-unit').value;
    if (name && quantity>0) items.push({ name, quantity, unit });
  });
  return items;
}
function donateNowToResourceMap() {
  if (!validateDonationForm()){ showNotification('Please fix form errors', 'error'); return; }
  const items = getDonationItems();
  const lat = +elements.latitudeInput.value;
  const lng = +elements.longitudeInput.value;
  const name = elements.donationRestaurantName.value.trim();
  const email = elements.donationEmail.value.trim();
  if (!name || !isFinite(lat) || !isFinite(lng)) { showNotification('Missing restaurant name or location', 'error'); return; }

  const resourceText = items.map(i => `${i.quantity} ${i.name}${i.unit==='units'?'':` (${i.unit})`}`).join(' • ');

  let helpers = []; let registeredHelpers = [];
  try { helpers = JSON.parse(localStorage.getItem('helpers') || '[]'); } catch {}
  try { registeredHelpers = JSON.parse(localStorage.getItem('registeredHelpers') || '[]'); } catch {}

  let reg = registeredHelpers.find(h => (h.name||'').toLowerCase() === name.toLowerCase());
  if (!reg) { reg = { name, address: 'Not provided', phone: email || 'N/A', lat, lng, resource: '' }; registeredHelpers.push(reg); }
  reg.lat = lat; reg.lng = lng;

  const idx = helpers.findIndex(h =>
    (h.name||'').toLowerCase() === name.toLowerCase() &&
    typeof h.lat==='number' && typeof h.lng==='number' && nearBy(h.lat, h.lng, lat, lng)
  );
  if (idx >= 0) {
    helpers[idx].resource = mergeResourceStrings(helpers[idx].resource, resourceText);
    helpers[idx].lat = lat; helpers[idx].lng = lng;
    helpers[idx].phone = helpers[idx].phone || email || 'N/A';
  } else {
    helpers.push({ name, address: reg.address || 'Not provided', phone: email || 'N/A', lat, lng, resource: resourceText });
  }
  localStorage.setItem('helpers', JSON.stringify(helpers));
  localStorage.setItem('registeredHelpers', JSON.stringify(registeredHelpers));

  showNotification('Donation posted to Resource Map!', 'success');
  window.open('https://pmt999.github.io/ResourceMap-/', '_blank', 'noopener');
}
if (elements.donateNowBtn) { elements.donateNowBtn.addEventListener('click', donateNowToResourceMap); }

/***** HISTORY *****/
function savePrediction(pred) {
  pred.createdDate = todayISO();
  predictionHistory.unshift(pred);
  if (predictionHistory.length > 5) predictionHistory.pop();
  localStorage.setItem('predictionHistory', JSON.stringify(predictionHistory));
  updateHistory();
}
function updateHistory() {
  elements.historyList.innerHTML = '';
  const today = todayISO();
  const todays = predictionHistory.filter(p => p.createdDate === today);
  if (todays.length) {
    elements.historySection.style.display='block';
    todays.forEach(p=>{
      const li=document.createElement('li');
      li.textContent = `📍 Lat: ${p.latitude.toFixed(4)}, Lon: ${p.longitude.toFixed(4)} | 📅 ${p.date} | 👥 ${p.guests} guests | 👨‍🍳 ${p.staff} staff`;
      elements.historyList.appendChild(li);
    });
  } else {
    elements.historySection.style.display='none';
  }
}

/***** INIT *****/
function setTodayDefaultDate() {
  const iso = todayISO();
  if (!elements.dateInput.value) elements.dateInput.value = iso;
}
function init() {
  setTodayDefaultDate();
  initMap();
  updateHistory();
  trainAIModel(); // warm start (seed + any learned samples)
}
document.addEventListener('DOMContentLoaded', init);
