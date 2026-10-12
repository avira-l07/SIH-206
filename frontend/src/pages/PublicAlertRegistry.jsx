import { useSocket } from '../context/SocketContext';
import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { subscribePush } from '../services/push';
import { Bell, Phone, Shield, CheckCircle2, AlertTriangle, Radio, ArrowLeft, Lock, Smartphone, Info, Loader2 } from 'lucide-react';

const POPULAR_REGIONS = [
  'All Regions (National/Statewide)',
  'Chamoli - Badrinath Corridor',
  'Dehradun - Doon Valley Catchment',
  'Rishikesh - Ganga Basin',
  'Haridwar - Silt & Flood Zone',
  'Joshimath - Mountain Refuge',
  'Rudraprayag - Valley Confluence',
  'Mumbai',
  'Pune',
  'Thane',
  'Raigad',
  'Ratnagiri',
  'Sindhudurg',
  'Nashik',
  'Nagpur',
];

export default function PublicAlertRegistry({ onBackToLogin, onBackToLanding }) {
  // SMS Registration State
  const [challenge,setChallenge]=useState(''),[verificationCode,setVerificationCode]=useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All Regions (National/Statewide)');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneSuccess, setPhoneSuccess] = useState('');
  const [phoneError, setPhoneError] = useState('');

  // Web Push State
  const [isSecure, setIsSecure] = useState(true);
  const [pushStatus, setPushStatus] = useState('checking'); // 'checking', 'unsupported', 'insecure_context', 'prompt', 'granted', 'denied'
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSuccess, setPushSuccess] = useState('');
  const [pushError, setPushError] = useState('');

  const { socket } = useSocket();
  // Live Stats State
  const [stats, setStats] = useState({ totalPhones: null, totalPushSubs: null });

  const [statsError, setStatsError] = useState(false);
  // Fetch Public Stats
  const loadStats = async () => {
    try {
      const res = await api.get('/registry/stats');
      setStatsError(false);
      setStats({
        channelsActive: res.data?.channelsActive || [],
        totalPhones: res.data?.totalPhones || 0,
        totalPushSubs: res.data?.totalPushSubs || 0,
      });
    } catch (err) {
      setStatsError(true);
      console.warn('Could not fetch registry stats:', err.message);
    }
  };

  useEffect(() => {
    loadStats();

    // Check Push & Service Worker capability with Secure Context check
    const secure = typeof window !== 'undefined' ? Boolean(window.isSecureContext) : true;
    setIsSecure(secure);

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported');
    } else if (!secure) {
      setPushStatus('insecure_context');
    } else {
      if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') {
          setPushStatus('granted');
        } else if (Notification.permission === 'denied') {
          setPushStatus('denied');
        } else {
          setPushStatus('prompt');
        }
      } else {
        setPushStatus('unsupported');
      }
    }
  }, []);

  useEffect(() => {
    socket?.on('registry:changed', loadStats); socket?.on('connect', loadStats);
    return () => { socket?.off('registry:changed', loadStats); socket?.off('connect', loadStats); };
  }, [socket]);

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

      setPhoneSuccess(res.data?.message || 'Enrollment request received');setChallenge(res.data.challengeId||'');
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
      await subscribePush(selectedRegion.startsWith('All') ? null : selectedRegion);
      setPushStatus('granted');
      setPushSuccess('Browser subscription registered. Alerts depend on connectivity and delivery configuration.');
      loadStats();
    } catch (err) {
      console.error('Web Push subscription error:', err);
      setPushError(err.response?.data?.error || err.message || 'Failed to subscribe to Web Push.');
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

          <div className="flex items-center gap-2">
            {onBackToLanding && (
              <button
                type="button"
                id="back-to-landing-btn"
                onClick={onBackToLanding}
                className="flex items-center gap-1.5 text-xs font-mono font-semibold text-[#14231F] hover:text-[#2E6E4E] border border-[#D8D3C7] bg-[#FFFFFF] px-3 py-1.5 rounded transition-colors shadow-xs"
              >
                <span>←</span>
                <span>Landing</span>
              </button>
            )}
            {onBackToLogin && (
              <button
                type="button"
                id="back-to-login-btn"
                onClick={onBackToLogin}
                className="flex items-center gap-1 text-xs font-mono font-semibold text-[#14231F] hover:text-[#2E6E4E] border border-[#D8D3C7] bg-[#EFECE4] px-3 py-1.5 rounded transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Responders / Login</span>
              </button>
            )}
          </div>
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
                Receive local disaster warnings
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
              <div className="text-lg font-mono font-bold text-[#E5A93C]">{stats.verifiedPhones ?? '—'}</div>
              <div className="text-[10px] font-mono text-white/70 uppercase">Verified Phones (SMS)</div>
            </div>
            <div className="bg-white/5 p-2 rounded border border-white/10">
              <div className="text-lg font-mono font-bold text-[#4ADE80]">{stats.totalPushSubs ?? '—'}</div>
              <div className="text-[10px] font-mono text-white/70 uppercase">Registered Push Devices</div>
            </div>
            <div className="hidden sm:block bg-white/5 p-2 rounded border border-white/10">
              <div className="text-lg font-mono font-bold text-white">{stats.channelsActive?.length ?? '—'} Channels</div>
              <div className="text-[10px] font-mono text-white/70 uppercase">Configured Delivery Channels</div>
            </div>
          </div>
        </div>

        {statsError && <p role="status" className="text-sm text-amber-800">Registry statistics are unavailable; previously loaded counts may be stale.</p>}
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

              {challenge&&<form className="mb-3 space-y-2" onSubmit={async e=>{e.preventDefault();setPhoneLoading(true);setPhoneError('');try{const r=await api.post('/registry/phone/verify',{challengeId:challenge,code:verificationCode});setPhoneSuccess(r.data.message);setChallenge('');setVerificationCode('');loadStats();}catch(err){setPhoneError(err.response?.data?.error||'Verification failed.');}finally{setPhoneLoading(false);}}}><label className="block text-sm">Phone verification code<input required autoComplete="one-time-code" value={verificationCode} onChange={e=>setVerificationCode(e.target.value)} className="block w-full rounded border p-2"/></label><button disabled={phoneLoading} className="rounded border p-2 text-sm">Verify and enroll phone</button></form>}
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
                      {pushStatus === 'insecure_context' && '⚠️ Insecure Origin (LAN)'}
                      {pushStatus === 'unsupported' && '⚠️ Unsupported Device'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#14231F]/70 leading-relaxed">
                    Uses W3C Web Push with VAPID cryptographic signing. Android Chrome receives alerts
                    even with browser backgrounded. (iOS requires "Add to Home Screen").
                  </p>
                </div>

                {!isSecure && (
                  <div className="p-2.5 bg-[#FAF8F5] border border-[#E5A93C]/50 text-[#8F5B10] text-xs rounded font-mono space-y-1">
                    <div className="font-bold flex items-center gap-1 text-[#B23A2E]">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Security Requirement: HTTPS or Localhost</span>
                    </div>
                    <p className="text-[11px] text-[#14231F]/80 leading-relaxed">
                      Web Push is blocked over plain HTTP on LAN IPs (e.g. 192.168.x.x) by browser security rules. To test Web Push, access via <strong>http://localhost:5173</strong> or your deployed HTTPS URL. (SMS registration above works over any IP).
                    </p>
                  </div>
                )}

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
