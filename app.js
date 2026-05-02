// ============================================================
//  WeatherDrift — app.js
//  Uses OpenWeatherMap API (Free tier)
//  Replace API_KEY with your own key from openweathermap.org
// ============================================================

const API_KEY = 'YOUR_API_KEY_HERE'; // ← Paste your key here
const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const GEO_URL = 'https://api.openweathermap.org/geo/1.0';

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
  if (API_KEY === 'YOUR_API_KEY_HERE') {
    return showError('⚠ No API key set. Open app.js and replace YOUR_API_KEY_HERE with your OpenWeatherMap key.');
  }
  clearError();
  showLoader();
  try {
    const weather = await fetchWeather(city);
    const forecast = await fetchForecast(city);
    displayWeather(weather);
    displayForecast(forecast);
    addToHistory(city);
  } catch (err) {
    showError(err.message || 'Could not fetch weather. Check the city name.');
  } finally {
    hideLoader();
  }
}

async function handleGeoLocation() {
  if (!navigator.geolocation) return showError('Geolocation not supported by your browser.');
  if (API_KEY === 'YOUR_API_KEY_HERE') {
    return showError('⚠ No API key set. Open app.js and replace YOUR_API_KEY_HERE with your OpenWeatherMap key.');
  }
  clearError();
  showLoader();
  geoBtn.textContent = '⊕ LOCATING...';
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      try {
        const weather = await fetchWeatherByCoords(coords.latitude, coords.longitude);
        const forecast = await fetchForecastByCoords(coords.latitude, coords.longitude);
        displayWeather(weather);
        displayForecast(forecast);
        addToHistory(weather.name);
        cityInput.value = weather.name;
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

async function fetchWeather(city) {
  const res = await fetch(
    `${BASE_URL}/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`
  );
  if (!res.ok) throw new Error(res.status === 404 ? `City "${city}" not found.` : 'API error. Check your key.');
  return res.json();
}

async function fetchWeatherByCoords(lat, lon) {
  const res = await fetch(
    `${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`
  );
  if (!res.ok) throw new Error('Could not get weather for your location.');
  return res.json();
}

async function fetchForecast(city) {
  const res = await fetch(
    `${BASE_URL}/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric&cnt=40`
  );
  if (!res.ok) throw new Error('Could not fetch forecast.');
  return res.json();
}

async function fetchForecastByCoords(lat, lon) {
  const res = await fetch(
    `${BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&cnt=40`
  );
  if (!res.ok) throw new Error('Could not fetch forecast.');
  return res.json();
}

// ---- Display Functions ----

function displayWeather(data) {
  currentTempC = data.main.temp;
  currentFeelsC = data.main.feels_like;

  document.getElementById('cityName').textContent = data.name;
  document.getElementById('countryName').textContent =
    `${data.sys.country} · ${data.coord.lat.toFixed(2)}°, ${data.coord.lon.toFixed(2)}°`;
  document.getElementById('weatherDesc').textContent = data.weather[0].description;
  document.getElementById('humidity').textContent = `${data.main.humidity}%`;
  document.getElementById('windSpeed').textContent = `${(data.wind.speed * 3.6).toFixed(1)} km/h`;
  document.getElementById('pressure').textContent = `${data.main.pressure} hPa`;
  document.getElementById('visibility').textContent = data.visibility
    ? `${(data.visibility / 1000).toFixed(1)} km` : 'N/A';

  const sunriseTime = new Date(data.sys.sunrise * 1000);
  const sunsetTime = new Date(data.sys.sunset * 1000);
  document.getElementById('sunrise').textContent = formatTime(sunriseTime);
  document.getElementById('sunset').textContent = formatTime(sunsetTime);

  document.getElementById('weatherIconBig').textContent = getWeatherEmoji(data.weather[0].id);

  isCelsius = true;
  setActiveUnit();
  updateTempDisplay();

  weatherCard.classList.remove('hidden');
  updateLastUpdated();
}

function displayForecast(data) {
  const forecastRow = document.getElementById('forecastRow');
  forecastRow.innerHTML = '';

  // Get one reading per day (around noon)
  const days = {};
  data.list.forEach(item => {
    const date = new Date(item.dt * 1000);
    const dayKey = date.toDateString();
    const hour = date.getHours();
    if (!days[dayKey] || Math.abs(hour - 12) < Math.abs(new Date(days[dayKey].dt * 1000).getHours() - 12)) {
      days[dayKey] = item;
    }
  });

  const dayEntries = Object.values(days).slice(0, 5);

  dayEntries.forEach((item, i) => {
    const date = new Date(item.dt * 1000);
    const dayLabel = i === 0 ? 'TODAY' : date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const temp = Math.round(item.main.temp);
    const emoji = getWeatherEmoji(item.weather[0].id);
    const desc = item.weather[0].description;

    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.innerHTML = `
      <div class="fc-day">${dayLabel}</div>
      <div class="fc-icon">${emoji}</div>
      <div class="fc-temp">${temp}°</div>
      <div class="fc-desc">${desc}</div>
    `;
    forecastRow.appendChild(card);
  });

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

function getWeatherEmoji(id) {
  if (id >= 200 && id < 300) return '⛈';
  if (id >= 300 && id < 400) return '🌦';
  if (id >= 500 && id < 600) return id < 502 ? '🌧' : '🌊';
  if (id >= 600 && id < 700) return id < 611 ? '❄️' : '🌨';
  if (id >= 700 && id < 800) return id === 741 ? '🌫' : '🌪';
  if (id === 800) return '☀️';
  if (id === 801) return '🌤';
  if (id === 802) return '⛅';
  if (id >= 803) return '☁️';
  return '🌡';
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
