import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('sih_user');
      return localStorage.getItem('sih_auth_token') && stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(localStorage.getItem('sih_auth_token') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get('/auth/me');
        if (cancelled) return;
        setUser(res.data.user);
        localStorage.setItem('sih_user', JSON.stringify(res.data.user));
      } catch (err) {
        console.warn('Session verification failed', err.response?.status || 'network unavailable');
        if (!cancelled && [401, 403].includes(err.response?.status)) { localStorage.removeItem('sih_auth_token'); localStorage.removeItem('sih_user'); setToken(null); setUser(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadUser();
    return () => { cancelled = true; };
  }, [token]);

  const refreshUser = useCallback(async () => {
    const sessionToken = localStorage.getItem('sih_auth_token');
    if (!sessionToken) throw new Error('Sign in to refresh your account');
    const res = await api.get('/auth/me', { headers: { Authorization: `Bearer ${sessionToken}` } });
    if (localStorage.getItem('sih_auth_token') !== sessionToken) throw new Error('Session changed');
    setUser(res.data.user);
    localStorage.setItem('sih_user', JSON.stringify(res.data.user));
    return res.data.user;
  }, []);

  const login = async (email, password, code) => {
    const res = await api.post('/auth/login', { email, password, code });
    const { token: receivedToken, user: receivedUser } = res.data;
    setSessionNotice('');
    localStorage.setItem('sih_auth_token', receivedToken);
    localStorage.setItem('sih_user', JSON.stringify(receivedUser));
    setToken(receivedToken);
    setUser(receivedUser);
    window.dispatchEvent(new CustomEvent('sih:session-changed'));
    return receivedUser;
  };

  const register = async (userData) => {
    const res = await api.post('/auth/register', userData);
    const { token: receivedToken, user: receivedUser } = res.data;
    setSessionNotice('');
    localStorage.setItem('sih_auth_token', receivedToken);
    localStorage.setItem('sih_user', JSON.stringify(receivedUser));
    setToken(receivedToken);
    setUser(receivedUser);
    window.dispatchEvent(new CustomEvent('sih:session-changed'));
    return receivedUser;
  };

  const [sessionNotice,setSessionNotice]=useState('');
  const replaceSession=async receivedToken=>{localStorage.setItem('sih_auth_token',receivedToken);setToken(receivedToken);return refreshUser();};
  const logout = async ({revoked=false}={}) => {
    try {if(!revoked)await api.post('/security/logout');setSessionNotice('Signed out; all account sessions revoked.');}catch{setSessionNotice('Signed out on this device. Server revocation could not be confirmed; reconnect and use Account security to revoke sessions.');}
    localStorage.removeItem('sih_auth_token');
    localStorage.removeItem('sih_user');
    setToken(null);
    setUser(null);
    window.dispatchEvent(new CustomEvent('sih:session-changed'));
  };

  // Demo tool: 1-click role switcher during presentation
  const quickSwitchRole = async (targetRole) => {
    const credentials = {
      CITIZEN: { email: 'citizen@sih.gov.in', password: 'password123' },
      VOLUNTEER: { email: 'volunteer@sih.gov.in', password: 'password123' },
      ADMIN: { email: 'admin@sih.gov.in', password: 'password123' },
    };
    if (!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true')) throw new Error('Demo accounts are disabled');
    if (credentials[targetRole]) {
      return await login(credentials[targetRole].email, credentials[targetRole].password);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        role: user?.role || null,
        loading,
        login,
        register,
        logout,
        quickSwitchRole,
        refreshUser,replaceSession,
      }}
    >
      {sessionNotice&&<p role="status" className="bg-amber-50 p-3 text-sm">{sessionNotice}</p>}{children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
