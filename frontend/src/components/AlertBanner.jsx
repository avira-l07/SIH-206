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
  RotateCcw,
} from 'lucide-react';

/**
 * Web Audio API synthesized emergency alert siren
 * Generates alternating dual-tone acoustic disaster warning frequencies (880Hz / 660Hz)
 *
 * Reliability & UX Guarantees:
 * 1. Auto-Termination: Automatically silences after 6 seconds to prevent sensory overload/ear fatigue.
 * 2. Autoplay Recovery: Modern browsers block unprompted AudioContext starts on WebSocket events.
 *    Attaches passive window event listeners to immediately unlock and play as soon as the citizen touches the screen.
 * 3. Envelope Shaping: Soft attack and decay ramps eliminate harsh audio clipping.
 */
class EmergencyAudioAlert {
  constructor(onStatusChange) {
    this.audioCtx = null;
    this.oscillator = null;
    this.gainNode = null;
    this.intervalId = null;
    this.stopTimer = null;
    this.countdownInterval = null;
    this.isPlaying = false;
    this.remainingSeconds = 6;
    this.onStatusChange = onStatusChange || (() => {});
    this.autoplayBlocked = false;

    this.attachPassiveUnlock();
  }

  attachPassiveUnlock() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().then(() => {
          this.autoplayBlocked = false;
          this.onStatusChange({ isPlaying: this.isPlaying, autoplayBlocked: false });
        }).catch(() => {});
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('pointerdown', unlock, { passive: true, once: true });
    window.addEventListener('keydown', unlock, { passive: true, once: true });
    window.addEventListener('touchstart', unlock, { passive: true, once: true });
  }

  getAudioContext() {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    return this.audioCtx;
  }

  start(durationSeconds = 6) {
    if (this.isPlaying) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      if (ctx.state === 'suspended') {
        ctx.resume()
          .then(() => {
            this.autoplayBlocked = false;
            this.runAudioGraph(ctx, durationSeconds);
          })
          .catch(() => {
            this.autoplayBlocked = true;
            this.isPlaying = false;
            this.onStatusChange({
              isPlaying: false,
              remainingSeconds: 0,
              autoplayBlocked: true,
              autoSilenced: false,
            });

            // Auto-play as soon as user performs first interaction anywhere on page
            const oneTimeUnlock = () => {
              window.removeEventListener('click', oneTimeUnlock);
              window.removeEventListener('touchstart', oneTimeUnlock);
              this.start(durationSeconds);
            };
            window.addEventListener('click', oneTimeUnlock, { once: true });
            window.addEventListener('touchstart', oneTimeUnlock, { once: true });
          });
        return;
      }

      this.runAudioGraph(ctx, durationSeconds);
    } catch (err) {
      console.warn('[AlertBanner] Could not play emergency siren:', err.message);
      this.autoplayBlocked = true;
      this.onStatusChange({
        isPlaying: false,
        remainingSeconds: 0,
        autoplayBlocked: true,
        autoSilenced: false,
      });
    }
  }

  runAudioGraph(ctx, durationSeconds) {
    if (this.isPlaying) return;
    try {
      // Soft gain envelope ramp to prevent harsh pop
      this.gainNode = ctx.createGain();
      this.gainNode.gain.setValueAtTime(0.001, ctx.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.1);
      this.gainNode.connect(ctx.destination);

      // Dual-frequency EAS emergency siren (triangle wave for clear, non-abrasive urgency)
      this.oscillator = ctx.createOscillator();
      this.oscillator.type = 'triangle';
      this.oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      this.oscillator.connect(this.gainNode);
      this.oscillator.start();

      let toggle = false;
      this.intervalId = setInterval(() => {
        if (!this.oscillator || !this.audioCtx) return;
        toggle = !toggle;
        const targetFreq = toggle ? 660 : 880;
        this.oscillator.frequency.setTargetAtTime(targetFreq, this.audioCtx.currentTime, 0.06);
      }, 450);

      this.isPlaying = true;
      this.remainingSeconds = durationSeconds;
      this.autoplayBlocked = false;

      this.onStatusChange({
        isPlaying: true,
        remainingSeconds: this.remainingSeconds,
        autoplayBlocked: false,
        autoSilenced: false,
      });

      // 1-second countdown tick
      if (this.countdownInterval) clearInterval(this.countdownInterval);
      this.countdownInterval = setInterval(() => {
        this.remainingSeconds -= 1;
        if (this.remainingSeconds <= 0) {
          clearInterval(this.countdownInterval);
        } else {
          this.onStatusChange({
            isPlaying: true,
            remainingSeconds: this.remainingSeconds,
            autoplayBlocked: false,
            autoSilenced: false,
          });
        }
      }, 1000);

      // Auto-termination timer: silence after fixed duration (6 seconds)
      if (this.stopTimer) clearTimeout(this.stopTimer);
      if (durationSeconds > 0) {
        this.stopTimer = setTimeout(() => {
          this.stop(true); // true = auto-stopped
        }, durationSeconds * 1000);
      }
    } catch (err) {
      console.warn('[AlertBanner] Error initializing audio graph:', err);
    }
  }

  stop(autoSilenced = false) {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.gainNode && this.audioCtx) {
      try {
        // Soft decay before stop
        this.gainNode.gain.linearRampToValueAtTime(0.0001, this.audioCtx.currentTime + 0.15);
      } catch {}
    }

    setTimeout(() => {
      if (this.oscillator) {
        try {
          this.oscillator.stop();
          this.oscillator.disconnect();
        } catch {}
        this.oscillator = null;
      }
      if (this.gainNode) {
        try {
          this.gainNode.disconnect();
        } catch {}
        this.gainNode = null;
      }
    }, 160);

    this.isPlaying = false;
    this.remainingSeconds = 0;
    this.onStatusChange({
      isPlaying: false,
      remainingSeconds: 0,
      autoplayBlocked: false,
      autoSilenced,
    });
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
  const [alarmState, setAlarmState] = useState({
    isPlaying: false,
    remainingSeconds: 6,
    autoplayBlocked: false,
    autoSilenced: false,
  });

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

  // Audio trigger on critical alert receipt with 6-second auto-termination
  useEffect(() => {
    if (!audioAlertRef.current) {
      audioAlertRef.current = new EmergencyAudioAlert((status) => {
        setAlarmState((prev) => ({ ...prev, ...status }));
      });
    }

    if (unacknowledgedCritical && !isMuted) {
      audioAlertRef.current.start(6);
    } else {
      audioAlertRef.current.stop();
    }

    return () => {
      if (audioAlertRef.current) {
        audioAlertRef.current.stop();
      }
    };
  }, [unacknowledgedCritical, isMuted]);

  // Explicitly replay 6-second siren
  const handleReplaySiren = () => {
    setIsMuted(false);
    if (audioAlertRef.current) {
      audioAlertRef.current.stop();
      audioAlertRef.current.start(6);
    }
  };

  // Explicitly silence/mute siren
  const handleSilenceSiren = () => {
    setIsMuted(true);
    if (audioAlertRef.current) {
      audioAlertRef.current.stop();
    }
  };

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

            {/* Header with audio controls & flashing siren */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/15 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-[#B23A2E] text-white flex items-center justify-center animate-bounce shrink-0">
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

              {/* Siren Status & Control Widget */}
              <div className="flex items-center gap-2 self-end sm:self-center">
                {alarmState.isPlaying ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#B23A2E]/40 border border-[#B23A2E] text-white rounded-lg text-xs font-mono font-bold animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
                      <span>SIREN ({alarmState.remainingSeconds}s)</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleSilenceSiren}
                      className="px-2.5 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-xs font-mono flex items-center gap-1 transition-colors"
                      title="Silence emergency siren"
                    >
                      <VolumeX className="w-4 h-4 text-white/80" />
                      <span>Silence</span>
                    </button>
                  </div>
                ) : alarmState.autoplayBlocked ? (
                  <button
                    type="button"
                    onClick={handleReplaySiren}
                    className="px-3 py-1.5 bg-[#E5A93C] hover:bg-[#d6982f] text-[#14231F] font-bold rounded-lg text-xs font-mono flex items-center gap-1.5 animate-bounce shadow-md transition-transform active:scale-95"
                    title="Browser blocked automatic sound. Click to play alarm!"
                  >
                    <Volume2 className="w-4 h-4 text-[#14231F]" />
                    <span>🔊 SOUND ALARM</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono text-white/50">
                      {alarmState.autoSilenced ? 'Auto-silenced (6s)' : 'Muted'}
                    </span>
                    <button
                      type="button"
                      onClick={handleReplaySiren}
                      className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-mono flex items-center gap-1 transition-colors"
                      title="Replay 6-second emergency siren"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-[#E5A93C]" />
                      <span>Replay</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Autoplay Blocked Informational Banner */}
            {alarmState.autoplayBlocked && (
              <div className="bg-amber-500/20 border border-amber-500/40 rounded-lg p-2.5 flex items-center gap-2 text-xs font-mono text-amber-200">
                <VolumeX className="w-4 h-4 text-amber-300 shrink-0" />
                <span>
                  Browser policy blocked automated background siren. Tap <strong>SOUND ALARM</strong> above or click anywhere to sound warning siren.
                </span>
              </div>
            )}

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
