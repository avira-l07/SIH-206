import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  AlertTriangle,
  AlertCircle,
  X,
  ChevronRight,
  Volume2,
  VolumeX,
  ShieldAlert,
  MapPin,
  CheckCircle,
} from 'lucide-react';

/**
 * Web Audio API synthesized emergency alert siren
 * Generates alternating dual-tone acoustic disaster warning frequencies (880Hz / 660Hz)
 */
class EmergencyAudioAlert {
  constructor() {
    this.audioCtx = null;
    this.oscillator = null;
    this.gainNode = null;
    this.intervalId = null;
    this.isPlaying = false;
  }

  start() {
    if (this.isPlaying) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      this.audioCtx = new AudioContextClass();
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.setValueAtTime(0.2, this.audioCtx.currentTime); // controlled volume
      this.gainNode.connect(this.audioCtx.destination);

      this.oscillator = this.audioCtx.createOscillator();
      this.oscillator.type = 'sawtooth';
      this.oscillator.frequency.setValueAtTime(880, this.audioCtx.currentTime);
      this.oscillator.connect(this.gainNode);
      this.oscillator.start();

      let toggle = false;
      this.intervalId = setInterval(() => {
        if (!this.oscillator || !this.audioCtx) return;
        toggle = !toggle;
        const targetFreq = toggle ? 660 : 880;
        this.oscillator.frequency.setTargetAtTime(targetFreq, this.audioCtx.currentTime, 0.08);
      }, 450);

      this.isPlaying = true;
    } catch (err) {
      console.warn('[AlertBanner] Could not play synthesized emergency siren:', err.message);
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch {
        // ignore cleanup error
      }
      this.oscillator = null;
    }
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {
        // ignore cleanup error
      }
      this.gainNode = null;
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {
        // ignore cleanup error
      }
      this.audioCtx = null;
    }
    this.isPlaying = false;
  }
}

function readStoredIds(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function writeStoredIds(key, ids) {
  try {
    sessionStorage.setItem(key, JSON.stringify(ids));
  } catch {}
}

export default function AlertBanner({ alerts = [], onSelectAlert }) {
  const { user } = useAuth();
  const userScope = user?.id ? `u_${user.id}` : (user?.role ? `role_${user.role}` : 'anon');
  const dismissedKey = `sih_dismissed_alert_ids_${userScope}`;
  const fullscreenKey = `sih_fullscreen_dismissed_alert_ids_${userScope}`;

  const [dismissedIds, setDismissedIds] = useState(() => readStoredIds(dismissedKey));
  const [fullscreenDismissedIds, setFullscreenDismissedIds] = useState(() => readStoredIds(fullscreenKey));
  const [isMuted, setIsMuted] = useState(false);
  const audioAlertRef = useRef(null);

  // Reload stored dismissals when active user/role changes
  useEffect(() => {
    setDismissedIds(readStoredIds(dismissedKey));
    setFullscreenDismissedIds(readStoredIds(fullscreenKey));
  }, [dismissedKey, fullscreenKey]);

  // Sync dismissals to sessionStorage whenever they change
  useEffect(() => {
    writeStoredIds(dismissedKey, dismissedIds);
  }, [dismissedKey, dismissedIds]);

  useEffect(() => {
    writeStoredIds(fullscreenKey, fullscreenDismissedIds);
  }, [fullscreenKey, fullscreenDismissedIds]);

  const activeAlerts = alerts.filter(
    (a) => a.active && !dismissedIds.includes(a.id)
  );

  // Critical alerts that haven't been acknowledged in full-screen mode
  const unacknowledgedCritical = activeAlerts.find(
    (a) => a.severity === 'CRITICAL' && !fullscreenDismissedIds.includes(a.id)
  );

  // Audio trigger on critical alert receipt
  useEffect(() => {
    if (!audioAlertRef.current) {
      audioAlertRef.current = new EmergencyAudioAlert();
    }

    if (unacknowledgedCritical && !isMuted) {
      audioAlertRef.current.start();
    } else {
      audioAlertRef.current.stop();
    }

    return () => {
      if (audioAlertRef.current) {
        audioAlertRef.current.stop();
      }
    };
  }, [unacknowledgedCritical, isMuted]);

  // Handle explicit dismissal of full-screen takeover
  const handleAcknowledgeCritical = (alertId) => {
    if (audioAlertRef.current) {
      audioAlertRef.current.stop();
    }
    setFullscreenDismissedIds((prev) => [...prev, alertId]);
  };

  if (activeAlerts.length === 0) {
    return null;
  }

  // Display most critical alert prominently in top banner
  const currentAlert = activeAlerts[0];
  const isCritical = currentAlert.severity === 'CRITICAL';

  const bgClasses = isCritical
    ? 'bg-[#B23A2E] text-[#FFFFFF]'
    : 'bg-[#C97A2B] text-[#FFFFFF]';

  return (
    <>
      {/* 1. MAX-PRIORITY FULL-SCREEN EMERGENCY TAKEOVER MODAL */}
      {unacknowledgedCritical && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="max-priority-title"
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div className="relative max-w-xl w-full bg-[#14231F] border-4 border-[#B23A2E] text-[#F6F4EF] rounded-xl shadow-2xl p-6 sm:p-8 space-y-6 overflow-hidden">
            {/* Pulsing hazard background aura */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#B23A2E]/25 rounded-full blur-3xl pointer-events-none animate-pulse" />

            {/* Header with audio mute & flashing siren */}
            <div className="flex items-start justify-between gap-3 border-b border-white/15 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-[#B23A2E] text-white flex items-center justify-center animate-bounce">
                  <ShieldAlert className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#B23A2E] animate-ping" />
                    <span className="font-mono text-xs uppercase font-bold tracking-widest text-[#B23A2E]">
                      MAX-PRIORITY CIVIL DEFENSE BROADCAST
                    </span>
                  </div>
                  <h2
                    id="max-priority-title"
                    className="text-xl sm:text-2xl font-display font-black text-white tracking-tight"
                  >
                    CRITICAL EMERGENCY ALERT
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                title={isMuted ? 'Unmute Emergency Siren' : 'Mute Emergency Siren'}
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5 animate-pulse text-[#E5A93C]" />}
              </button>
            </div>

            {/* Alert Severity / Hazard / Region Badges */}
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
              <span className="px-2.5 py-1 bg-[#B23A2E] text-white font-bold rounded uppercase">
                {unacknowledgedCritical.severity}
              </span>
              <span className="px-2.5 py-1 bg-white/15 text-white font-semibold rounded uppercase">
                HAZARD: {unacknowledgedCritical.hazardType}
              </span>
              <span className="px-2.5 py-1 bg-white/15 text-white font-semibold rounded uppercase flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#E5A93C]" />
                {unacknowledgedCritical.region}
              </span>
            </div>

            {/* Emergency Message Body */}
            <div className="p-4 bg-white/5 border border-white/10 rounded-lg space-y-2">
              <div className="text-xs font-mono uppercase text-white/60">Official Broadcast Transmission:</div>
              <p className="text-base sm:text-lg font-medium text-white leading-relaxed">
                "{unacknowledgedCritical.message}"
              </p>
            </div>

            <div className="text-xs text-white/70 font-mono">
              ⚠️ Immediate protective action advised. Follow local SDRF / NDMA instructions and proceed to designated emergency shelters.
            </div>

            {/* Explicit Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                id="acknowledge-critical-alert-btn"
                onClick={() => handleAcknowledgeCritical(unacknowledgedCritical.id)}
                className="w-full sm:flex-1 py-3.5 px-5 bg-[#B23A2E] hover:bg-[#972E24] text-white font-display font-bold text-sm rounded-lg shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
              >
                <CheckCircle className="w-5 h-5" />
                <span>I ACKNOWLEDGE THIS EMERGENCY ALERT</span>
              </button>

              {onSelectAlert && (
                <button
                  type="button"
                  onClick={() => {
                    handleAcknowledgeCritical(unacknowledgedCritical.id);
                    onSelectAlert(unacknowledgedCritical);
                  }}
                  className="w-full sm:w-auto py-3.5 px-4 bg-white/10 hover:bg-white/20 text-white font-mono text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                >
                  <MapPin className="w-4 h-4 text-[#E5A93C]" />
                  <span>View on Map</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. PERSISTENT TOP BANNER (Active Alerts) */}
      <aside
        aria-label="Disaster Alerts"
        className={`w-full ${bgClasses} px-4 py-2.5 transition-all border-b border-black/10`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {isCritical ? (
              <AlertTriangle className="w-5 h-5 flex-shrink-0 animate-pulse text-white" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-white" />
            )}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate">
              <span className="font-mono font-bold text-xs uppercase px-1.5 py-0.5 bg-black/20 rounded tracking-wider">
                {currentAlert.severity} // {currentAlert.hazardType}
              </span>
              <span className="font-bold">{currentAlert.region}:</span>
              <span className="opacity-95 truncate">{currentAlert.message}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {activeAlerts.length > 1 && (
              <span className="text-xs font-mono bg-black/20 px-2 py-0.5 rounded">
                +{activeAlerts.length - 1} more
              </span>
            )}

            {onSelectAlert && (
              <button
                onClick={() => onSelectAlert(currentAlert)}
                className="text-xs underline flex items-center gap-0.5 hover:opacity-80"
              >
                Focus Map <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={() => setDismissedIds((prev) => [...prev, currentAlert.id])}
              className="p-1 hover:bg-black/20 rounded transition-colors"
              title="Acknowledge alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
