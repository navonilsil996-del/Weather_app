// ============================================================
//  WeatherDrift — app.js
//  Uses Open-Meteo API (Free tier, no API key required)
// ============================================================

const GEO_BASE = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_BASE = 'https://api.open-meteo.com/v1/forecast';

// ---- State ----
let currentTempC = null;
let currentFeelsC = null;
let isCelsius = true;
let searchHistory = JSON.parse(localStorage.getItem('wd_history') || '[]');

// ---- DOM Refs ----
const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const geoBtn = document.getElementById('geoBtn');
const loader = document.getElementById('loader');
const errorMsg = document.getElementById('errorMsg');
const weatherCard = document.getElementById('weatherCard');
const forecastSection = document.getElementById('forecastSection');
const historySection = document.getElementById('historySection');
const celsiusBtn = document.getElementById('celsiusBtn');
const fahrenheitBtn = document.getElementById('fahrenheitBtn');

// ---- Init ----
renderHistory();
updateLastUpdated();

// ---- Event Listeners ----
searchBtn.addEventListener('click', () => handleSearch(cityInput.value.trim()));

cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSearch(cityInput.value.trim());
});

geoBtn.addEventListener('click', handleGeoLocation);

celsiusBtn.addEventListener('click', () => {
  if (!isCelsius) { isCelsius = true; updateTempDisplay(); setActiveUnit(); }
});

fahrenheitBtn.addEventListener('click', () => {
  if (isCelsius) { isCelsius = false; updateTempDisplay(); setActiveUnit(); }
});

// ---- Core Functions ----

async function handleSearch(city) {
  if (!city) return showError('Please enter a city name.');
  clearError();
  showLoader();
  try {
    const loc = await getCoordinates(city);
    const weatherData = await fetchMeteoData(loc.latitude, loc.longitude);
    displayWeather(weatherData, loc.name, loc.country_code?.toUpperCase() || loc.country);
    displayForecast(weatherData.daily);
    addToHistory(loc.name);
  } catch (err) {
    showError(err.message || 'Could not fetch weather. Check the city name.');
  } finally {
    hideLoader();
  }
}

async function handleGeoLocation() {
  if (!navigator.geolocation) return showError('Geolocation not supported by your browser.');
  clearError();
  showLoader();
  geoBtn.textContent = '⊕ LOCATING...';
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      try {
        const weatherData = await fetchMeteoData(coords.latitude, coords.longitude);
        displayWeather(weatherData, 'Current Location', '');
        displayForecast(weatherData.daily);
      } catch (err) {
        showError(err.message || 'Could not fetch weather for your location.');
      } finally {
        hideLoader();
        geoBtn.textContent = '⊕ USE MY LOCATION';
      }
    },
    () => {
      showError('Location access denied. Please allow location in your browser.');
      hideLoader();
      geoBtn.textContent = '⊕ USE MY LOCATION';
    }
  );
}

// ---- API Calls ----

async function getCoordinates(city) {
  const res = await fetch(`${GEO_BASE}?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    throw new Error(`City "${city}" not found.`);
  }
  return data.results[0]; // Returns { name, country, latitude, longitude }
}

async function fetchMeteoData(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,surface_pressure,wind_speed_10m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset',
    wind_speed_unit: 'kmh',
    timezone: 'auto'
  });

  const res = await fetch(`${WEATHER_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error('Could not fetch weather data.');
  return res.json();
}

// ---- Display Functions ----

function displayWeather(data, locationName, countryCode) {
  const current = data.current;
  const daily = data.daily;
  const weatherInfo = getWmoDetails(current.weather_code);

  currentTempC = current.temperature_2m;
  currentFeelsC = current.apparent_temperature;

  document.getElementById('cityName').textContent = locationName;
  
  const locationText = countryCode ? `${countryCode} · ` : '';
  document.getElementById('countryName').textContent =
    `${locationText}${data.latitude.toFixed(2)}°, ${data.longitude.toFixed(2)}°`;
    
  document.getElementById('weatherDesc').textContent = weatherInfo.desc;
  document.getElementById('humidity').textContent = `${current.relative_humidity_2m}%`;
  document.getElementById('windSpeed').textContent = `${current.wind_speed_10m} km/h`;
  document.getElementById('pressure').textContent = `${Math.round(current.surface_pressure)} hPa`;
  document.getElementById('visibility').textContent = 'N/A'; // Open-Meteo free tier omits surface visibility

  // Format Sunrise & Sunset from ISO string
  const sunriseDate = new Date(daily.sunrise[0]);
  const sunsetDate = new Date(daily.sunset[0]);
  document.getElementById('sunrise').textContent = formatTime(sunriseDate);
  document.getElementById('sunset').textContent = formatTime(sunsetDate);

  document.getElementById('weatherIconBig').textContent = weatherInfo.emoji;

  isCelsius = true;
  setActiveUnit();
  updateTempDisplay();

  weatherCard.classList.remove('hidden');
  updateLastUpdated();
}

function displayForecast(daily) {
  const forecastRow = document.getElementById('forecastRow');
  forecastRow.innerHTML = '';

  const totalDays = Math.min(5, daily.time.length);
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(daily.time[i]);
    const dayLabel = i === 0 ? 'TODAY' : date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const temp = Math.round(daily.temperature_2m_max[i]);
    const { desc, emoji } = getWmoDetails(daily.weather_code[i]);

    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.innerHTML = `
      <div class="fc-day">${dayLabel}</div>
      <div class="fc-icon">${emoji}</div>
      <div class="fc-temp">${temp}°</div>
      <div class="fc-desc">${desc}</div>
    `;
    forecastRow.appendChild(card);
  }

  forecastSection.classList.remove('hidden');
}

// ---- Temp Toggle ----

function updateTempDisplay() {
  const displayTemp = isCelsius
    ? Math.round(currentTempC)
    : Math.round(toFahrenheit(currentTempC));
  const displayFeels = isCelsius
    ? Math.round(currentFeelsC)
    : Math.round(toFahrenheit(currentFeelsC));
  const unit = isCelsius ? '°C' : '°F';

  document.getElementById('temperature').textContent = `${displayTemp}${unit}`;
  document.getElementById('feelsLike').textContent = `${displayFeels}${unit}`;
}

function setActiveUnit() {
  celsiusBtn.classList.toggle('active', isCelsius);
  fahrenheitBtn.classList.toggle('active', !isCelsius);
}

function toFahrenheit(c) { return (c * 9) / 5 + 32; }

// ---- Search History ----

function addToHistory(city) {
  const normalized = city.trim();
  if (!normalized) return;
  searchHistory = [normalized, ...searchHistory.filter(c => c.toLowerCase() !== normalized.toLowerCase())].slice(0, 8);
  localStorage.setItem('wd_history', JSON.stringify(searchHistory));
  renderHistory();
}

function renderHistory() {
  if (!searchHistory.length) return;
  const container = document.getElementById('historyTags');
  container.innerHTML = '';
  searchHistory.forEach(city => {
    const tag = document.createElement('button');
    tag.className = 'hist-tag';
    tag.textContent = city;
    tag.addEventListener('click', () => {
      cityInput.value = city;
      handleSearch(city);
    });
    container.appendChild(tag);
  });
  historySection.classList.remove('hidden');
}

// ---- Utility ----

function getWmoDetails(code) {
  const codeMap = {
    0: { desc: 'Clear sky', emoji: '☀️' },
    1: { desc: 'Mainly clear', emoji: '🌤' },
    2: { desc: 'Partly cloudy', emoji: '⛅' },
    3: { desc: 'Overcast', emoji: '☁️' },
    45: { desc: 'Foggy', emoji: '🌫' },
    48: { desc: 'Depositing rime fog', emoji: '🌫' },
    51: { desc: 'Light drizzle', emoji: '🌦' },
    53: { desc: 'Moderate drizzle', emoji: '🌦' },
    55: { desc: 'Dense drizzle', emoji: '🌧' },
    61: { desc: 'Slight rain', emoji: '🌧' },
    63: { desc: 'Moderate rain', emoji: '🌧' },
    65: { desc: 'Heavy rain', emoji: '🌊' },
    71: { desc: 'Slight snow', emoji: '❄️' },
    73: { desc: 'Moderate snow', emoji: '❄️' },
    75: { desc: 'Heavy snow', emoji: '🌨' },
    80: { desc: 'Slight rain showers', emoji: '🌦' },
    81: { desc: 'Moderate rain showers', emoji: '🌧' },
    82: { desc: 'Violent rain showers', emoji: '⛈' },
    95: { desc: 'Thunderstorm', emoji: '⛈' },
    96: { desc: 'Thunderstorm with hail', emoji: '⛈' },
    99: { desc: 'Heavy thunderstorm with hail', emoji: '⛈' }
  };
  return codeMap[code] || { desc: 'Unknown', emoji: '🌡' };
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function showLoader() { loader.classList.remove('hidden'); }
function hideLoader() { loader.classList.add('hidden'); }
function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
  weatherCard.classList.add('hidden');
  forecastSection.classList.add('hidden');
}
function clearError() { errorMsg.classList.add('hidden'); }

function updateLastUpdated() {
  const el = document.getElementById('lastUpdated');
  if (el) el.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
}
