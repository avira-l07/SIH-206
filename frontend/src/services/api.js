import axios from 'axios';
import { withJsonBody } from './requestConfig';

// Infer API URL dynamically: supports localhost, local LAN IPs (Wi-Fi/hotspot hub), and cloud deployments
export function resolveApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$|\/api\/?$/g, '');
  }
  // In development, Vite proxy forwards /api and /socket.io to http://localhost:5000
  return '';
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
  config = withJsonBody(config);
  const token = localStorage.getItem('sih_auth_token');
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
export { API_BASE_URL };
