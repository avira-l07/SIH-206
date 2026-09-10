import axios from 'axios';

// Infer API URL dynamically: supports localhost, local LAN IPs (Wi-Fi/hotspot hub), and cloud deployments
export function resolveApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const host = window.location.hostname;
    // If accessing from mobile phone or laptop via LAN IP (e.g., 192.168.x.x, 10.x.x.x)
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return `${window.location.protocol}//${host}:5000`;
    }
  }
  return 'http://localhost:5000';
}

const API_BASE_URL = resolveApiBaseUrl();

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 12000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sih_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
export { API_BASE_URL };
