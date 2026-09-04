const axios = require('axios');

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || 'mock_mode_active';

// Pre-configured coordinates for key regions to support instant demo triggers
const REGION_COORDINATES = {
  'Mumbai': { lat: 19.0760, lng: 72.8777 },
  'Kurla East': { lat: 19.0726, lng: 72.8845 },
  'Bandra': { lat: 19.0596, lng: 72.8295 },
  'Dadar': { lat: 19.0178, lng: 72.8478 },
  'Chennai': { lat: 13.0827, lng: 80.2707 },
  'Delhi NCR': { lat: 28.6139, lng: 77.2090 },
};

async function getWeatherData(region = 'Mumbai', customLat = null, customLng = null) {
  const coords = (customLat && customLng)
    ? { lat: customLat, lng: customLng }
    : (REGION_COORDINATES[region] || REGION_COORDINATES['Mumbai']);

  // If real API key is supplied, attempt live call
  if (OPENWEATHER_API_KEY && OPENWEATHER_API_KEY !== 'mock_mode_active') {
    try {
      const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: {
          lat: coords.lat,
          lon: coords.lng,
          appid: OPENWEATHER_API_KEY,
          units: 'metric',
        },
        timeout: 4000,
      });

      const data = response.data;
      return {
        region,
        lat: coords.lat,
        lng: coords.lng,
        temp: data.main?.temp || 30,
        humidity: data.main?.humidity || 85,
        windSpeed: data.wind?.speed ? data.wind.speed * 3.6 : 25, // km/h
        rain1h: data.rain ? (data.rain['1h'] || 0) : 0,
        condition: data.weather?.[0]?.main || 'Clouds',
        isLive: true,
      };
    } catch (err) {
      console.warn(`[WeatherService] Live API failed (${err.message}). Using reliable offline telemetry simulator.`);
    }
  }

  // Graceful offline fallback simulator for venue resilience
  const mockScenarios = {
    'Mumbai': { temp: 28.5, humidity: 92, windSpeed: 38, rain1h: 42, condition: 'Heavy Rain' },
    'Kurla East': { temp: 27.2, humidity: 95, windSpeed: 45, rain1h: 75, condition: 'Torrential Rain' },
    'Bandra': { temp: 29.0, humidity: 88, windSpeed: 32, rain1h: 18, condition: 'Moderate Rain' },
    'Dadar': { temp: 28.8, humidity: 90, windSpeed: 30, rain1h: 22, condition: 'Rain' },
    'Chennai': { temp: 34.0, humidity: 70, windSpeed: 20, rain1h: 0, condition: 'Dry / High Heat' },
  };

  const selected = mockScenarios[region] || {
    temp: 29,
    humidity: 85,
    windSpeed: 30,
    rain1h: 15,
    condition: 'Rain',
  };

  return {
    region,
    lat: coords.lat,
    lng: coords.lng,
    ...selected,
    isLive: false,
  };
}

module.exports = {
  getWeatherData,
  REGION_COORDINATES,
};
