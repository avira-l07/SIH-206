import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Bell,
  Phone,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Radio,
  ArrowLeft,
  Volume2,
  Lock,
  Smartphone,
  Info,
  Loader2,
} from 'lucide-react';

const POPULAR_REGIONS = [
  'All Regions (National/Statewide)',
  'Mumbai',
  'Pune',
  'Thane',
  'Raigad',
  'Ratnagiri',
  'Sindhudurg',
  'Nashik',
  'Nagpur',
];

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PublicAlertRegistry({ onBackToLogin }) {
  // SMS Registration State
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All Regions (National/Statewide)');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneSuccess, setPhoneSuccess] = useState('');
  const [phoneError, setPhoneError] = useState('');

  // Web Push State
  const [pushStatus, setPushStatus] = useState('checking'); // 'checking', 'unsupported', 'prompt', 'granted', 'denied'
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSuccess, setPushSuccess] = useState('');
  const [pushError, setPushError] = useState('');

  // Live Stats State
  const [stats, setStats] = useState({ totalPhones: 0, totalPushSubs: 0 });

  // Fetch Public Stats
  const loadStats = async () => {
    try {
      const res = await api.get('/registry/stats');
      setStats({
        totalPhones: res.data?.totalPhones || 0,
        totalPushSubs: res.data?.totalPushSubs || 0,
      });
    } catch (err) {
      console.warn('Could not fetch registry stats:', err.message);
    }
  };

  useEffect(() => {
    loadStats();

    // Check Push & Service Worker capability
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported');
    } else {
      if (Notification.permission === 'granted') {
        setPushStatus('granted');
      } else if (Notification.permission === 'denied') {
        setPushStatus('denied');
      } else {
        setPushStatus('prompt');
      }
    }
  }, []);

  // Submit Phone Number for SMS Broadcast
  const handlePhoneSubmit = async (e) => {
    e.preventDefault();
    setPhoneError('');
    setPhoneSuccess('');
    setPhoneLoading(true);

    try {
      const regionValue = selectedRegion.startsWith('All') ? null : selectedRegion;
      const res = await api.post('/registry/phone', {
        phoneNumber,
        region: regionValue,
      });

      setPhoneSuccess(res.data?.message || 'Phone enrolled in emergency SMS registry!');
      setPhoneNumber('');
      loadStats();
    } catch (err) {
      console.error('Phone registration error:', err);
      setPhoneError(err.response?.data?.error || 'Registration failed. Check number format.');
    } finally {
      setPhoneLoading(false);
    }
  };

  // Subscribe Browser to Web Push
  const handleEnablePush = async () => {
    setPushError('');
    setPushSuccess('');
    setPushLoading(true);

    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Web Push is not supported on this browser.');
      }

      // Request Permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus(permission === 'denied' ? 'denied' : 'prompt');
        throw new Error('Notification permission was not granted.');
      }
      setPushStatus('granted');

      // Ensure SW is ready
      const registration = await navigator.serviceWorker.ready;

      // Get VAPID public key
      const keyRes = await api.get('/registry/vapid-public-key');
      const vapidPublicKey = keyRes.data?.publicKey;
      if (!vapidPublicKey) {
        throw new Error('Could not retrieve VAPID key from server.');
      }

      const convertedKey = urlBase64ToUint8Array(vapidPublicKey);

      // Subscribe device with pushManager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey,
      });

      const subscriptionJson = subscription.toJSON();
      const regionValue = selectedRegion.startsWith('All') ? null : selectedRegion;

      // Post subscription to backend registry
      await api.post('/registry/push', {
        endpoint: subscriptionJson.endpoint,
        keys: subscriptionJson.keys,
        region: regionValue,
      });

      setPushSuccess('This browser is now armed for instantaneous emergency alerts!');
      loadStats();
    } catch (err) {
      console.error('Web Push subscription error:', err);
      setPushError(err.message || 'Failed to subscribe to Web Push.');
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F4EF] text-[#14231F] flex flex-col justify-between selection:bg-[#B23A2E]/20">
      {/* Top Bar */}
      <header className="w-full bg-[#FFFFFF] border-b border-[#D8D3C7] px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[#14231F] text-[#F6F4EF] flex items-center justify-center font-bold">
              <Radio className="w-4 h-4 text-[#B23A2E] animate-pulse" />
            </div>
            <div>
              <div className="font-display font-bold text-sm tracking-tight">
                PUBLIC EMERGENCY ALERT REACH
              </div>
              <div className="text-[10px] font-mono text-[#14231F]/60 uppercase">
                Zero-Account Disaster Broadcast Registry
              </div>
            </div>
          </div>

          {onBackToLogin && (
            <button
              onClick={onBackToLogin}
              className="flex items-center gap-1 text-xs font-mono font-semibold text-[#14231F] hover:text-[#2E6E4E] border border-[#D8D3C7] bg-[#EFECE4] px-3 py-1.5 rounded transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Responders / Login</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Banner Explaining Architecture */}
        <div className="bg-[#14231F] text-[#F6F4EF] p-5 rounded-lg shadow-sm">
          <div className="flex items-start gap-3">
            <Shield className="w-6 h-6 text-[#E5A93C] flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h1 className="font-display font-bold text-lg sm:text-xl text-white">
                Never Miss a Life-Critical Disaster Warning
              </h1>
              <p className="text-xs sm:text-sm text-[#F6F4EF]/80 leading-relaxed">
                Emergency alerts shouldn’t stop at registered users. Enrolling here connects you to
                high-priority emergency broadcasts via <strong>SMS</strong> and <strong>Web Push Notifications</strong>{' '}
                with <strong>zero login required</strong>.
              </p>
            </div>
          </div>

          {/* Live Reach Telemetry Counter */}
          <div className="mt-4 pt-4 border-t border-[#F6F4EF]/15 grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
            <div className="bg-white/5 p-2 rounded border border-white/10">
              <div className="text-lg font-mono font-bold text-[#E5A93C]">{stats.totalPhones}</div>
              <div className="text-[10px] font-mono text-white/70 uppercase">Registered Phones (SMS)</div>
            </div>
            <div className="bg-white/5 p-2 rounded border border-white/10">
              <div className="text-lg font-mono font-bold text-[#4ADE80]">{stats.totalPushSubs}</div>
              <div className="text-[10px] font-mono text-white/70 uppercase">Active Push Devices</div>
            </div>
            <div className="hidden sm:block bg-white/5 p-2 rounded border border-white/10">
              <div className="text-lg font-mono font-bold text-white">3 Channels</div>
              <div className="text-[10px] font-mono text-white/70 uppercase">SMS • Push • In-App Takeover</div>
            </div>
          </div>
        </div>

        {/* Two-Column Setup: Phone SMS + Web Push */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 1. Phone SMS Registry */}
          <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded-lg p-5 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-[#EFECE4] rounded text-[#14231F]">
                  <Phone className="w-4 h-4 text-[#14231F]" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-base text-[#14231F]">
                    1. SMS Emergency Broadcast
                  </h2>
                  <p className="text-[11px] font-mono text-[#14231F]/60">
                    Direct SMS when an alert is declared in your region
                  </p>
                </div>
              </div>

              {phoneSuccess && (
                <div className="mb-4 p-3 bg-[#2E6E4E]/10 border border-[#2E6E4E]/30 text-[#2E6E4E] text-xs rounded flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{phoneSuccess}</span>
                </div>
              )}

              {phoneError && (
                <div className="mb-4 p-3 bg-[#B23A2E]/10 border border-[#B23A2E]/30 text-[#B23A2E] text-xs rounded flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{phoneError}</span>
                </div>
              )}

              <form onSubmit={handlePhoneSubmit} className="space-y-3 mt-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1" htmlFor="public-phone-input">
                    Mobile Phone Number
                  </label>
                  <div className="relative">
                    <input
                      id="public-phone-input"
                      type="tel"
                      required
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full p-2.5 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-sm text-[#14231F] font-mono focus:outline-none focus:border-[#14231F]"
                    />
                  </div>
                  <p className="text-[10px] text-[#14231F]/60 mt-1">
                    Demo hint: Use pre-verified test numbers or your mobile to test live Twilio delivery.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1" htmlFor="public-region-select">
                    Alert Region
                  </label>
                  <select
                    id="public-region-select"
                    value={selectedRegion}
                    onChange={(e) => setSelectedRegion(e.target.value)}
                    className="w-full p-2.5 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-sm text-[#14231F] focus:outline-none focus:border-[#14231F]"
                  >
                    {POPULAR_REGIONS.map((reg) => (
                      <option key={reg} value={reg}>
                        {reg}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  id="submit-phone-registry-btn"
                  disabled={phoneLoading}
                  className="w-full mt-2 py-2.5 px-4 bg-[#14231F] hover:bg-black text-[#F6F4EF] font-semibold text-xs rounded font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {phoneLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Phone className="w-3.5 h-3.5" />
                      <span>Subscribe to SMS Alerts</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            <div className="mt-4 pt-3 border-t border-[#D8D3C7] flex items-center gap-1.5 text-[10px] text-[#14231F]/60 font-mono">
              <Lock className="w-3 h-3 text-[#2E6E4E]" />
              <span>Strict Privacy: Numbers never exported or exposed via API.</span>
            </div>
          </div>

          {/* 2. Web Push Notification */}
          <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded-lg p-5 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-[#EFECE4] rounded text-[#14231F]">
                  <Bell className="w-4 h-4 text-[#14231F]" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-base text-[#14231F]">
                    2. Instant Web Push Alerts
                  </h2>
                  <p className="text-[11px] font-mono text-[#14231F]/60">
                    Browser & lock-screen notifications even when tab is closed
                  </p>
                </div>
              </div>

              {pushSuccess && (
                <div className="mb-4 p-3 bg-[#2E6E4E]/10 border border-[#2E6E4E]/30 text-[#2E6E4E] text-xs rounded flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{pushSuccess}</span>
                </div>
              )}

              {pushError && (
                <div className="mb-4 p-3 bg-[#B23A2E]/10 border border-[#B23A2E]/30 text-[#B23A2E] text-xs rounded flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{pushError}</span>
                </div>
              )}

              <div className="space-y-4 mt-4">
                <div className="p-3 bg-[#F6F4EF] rounded border border-[#D8D3C7] space-y-2">
                  <div className="text-xs font-semibold text-[#14231F] flex items-center justify-between">
                    <span>Notification Capability:</span>
                    <span className="font-mono text-[11px] uppercase font-bold px-2 py-0.5 rounded bg-white border border-[#D8D3C7]">
                      {pushStatus === 'granted' && '✅ Permission Granted'}
                      {pushStatus === 'denied' && '❌ Blocked by Browser'}
                      {pushStatus === 'prompt' && '🔔 Ready to Request'}
                      {pushStatus === 'unsupported' && '⚠️ Unsupported Device'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#14231F]/70 leading-relaxed">
                    Uses W3C Web Push with VAPID cryptographic signing. Android Chrome receives alerts
                    even with browser backgrounded. (iOS requires "Add to Home Screen").
                  </p>
                </div>

                <button
                  type="button"
                  id="enable-web-push-btn"
                  onClick={handleEnablePush}
                  disabled={pushLoading || pushStatus === 'unsupported'}
                  className={`w-full py-2.5 px-4 font-semibold text-xs rounded font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
                    pushStatus === 'granted'
                      ? 'bg-[#2E6E4E] text-white hover:bg-[#25583E]'
                      : 'bg-[#B23A2E] text-white hover:bg-[#972E24]'
                  } disabled:opacity-50`}
                >
                  {pushLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Bell className="w-3.5 h-3.5" />
                      <span>
                        {pushStatus === 'granted'
                          ? 'Re-Sync / Update Push Token'
                          : 'Arm Device with Web Push'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#D8D3C7] flex items-center gap-1.5 text-[10px] text-[#14231F]/60 font-mono">
              <Smartphone className="w-3 h-3 text-[#14231F]" />
              <span>Android Chrome & PWA native background delivery supported.</span>
            </div>
          </div>
        </div>

        {/* Technical Architecture Notes & Defense Accordion */}
        <div className="bg-[#EFECE4] border border-[#D8D3C7] rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 font-mono text-xs uppercase font-bold text-[#14231F]">
            <Info className="w-4 h-4 text-[#14231F]" />
            <span>Platform Broadcast Architecture & Transparency</span>
          </div>
          <p className="text-xs text-[#14231F]/80 leading-relaxed">
            Standard web platforms cannot forcefully bypass hardware Do Not Disturb / Silent switches;
            those privileges are reserved by mobile operating systems for native cell broadcast (NDMA Sachet).
            Instead, our multi-channel architecture pushes alerts via <strong>instant WebSocket dispatch</strong>,{' '}
            <strong>SMS broadcast</strong>, and <strong>Web Push notifications</strong> with a maximum-priority in-app
            takeover to maximize reach across every available channel.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-[#EFECE4] border-t border-[#D8D3C7] py-3 px-4 text-center text-[10px] font-mono text-[#14231F]/60">
        SIH26206 DISASTER RESILIENCE PLATFORM • ZERO-ACCOUNT PUBLIC REACH LAYER • NDMA COMPLIANT
      </footer>
    </div>
  );
}
