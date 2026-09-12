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
 * Global Shared AudioContext Singleton
 * Maintains a single, long-lived AudioContext instance across the app lifecycle.
 * Unlocks proactively on the first user interaction anywhere on the window.
 */
let sharedAudioCtx = null;

function getSharedAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      sharedAudioCtx = new AudioContextClass();
    }
  }
  return sharedAudioCtx;
}

/**
 * Proactively attach window gesture listeners to awaken audio hardware
 * on the very first tap/click/keypress on the application.
 */
function initGlobalAudioUnlocker() {
  if (typeof window === 'undefined') return;

  const unlock = () => {
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        if (ctx.state === 'running') {
          // Play 1 silent sample to awaken OS audio engine (iOS/Android/Chrome policy requirement)
          try {
            const buffer = ctx.createBuffer(1, 1, 22050);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start(0);
          } catch {}
          detach();
        }
      }).catch(() => {});
    } else if (ctx.state === 'running') {
      detach();
    }
  };

  function detach() {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('touchstart', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('click', unlock);
  }

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
  window.addEventListener('click', unlock, { passive: true });
}

if (typeof window !== 'undefined') {
  initGlobalAudioUnlocker();
}

/**
 * Web Audio API synthesized emergency alert siren & advisory chimer
 *
 * Sound Tiers:
 * 1. CRITICAL: Alternating dual-tone EAS acoustic disaster warning (880Hz / 660Hz) for 6 seconds.
 * 2. WATCH: Distinct advisory alert warning chime (750Hz / 550Hz) for 4 seconds.
 *
 * Guarantees:
 * 1. Auto-Termination: Automatically silences after duration to eliminate sensory fatigue.
 * 2. Autoplay Recovery: If unprompted background event is blocked by browser policy,
 *    flags state and registers immediate unlock on next touch/click anywhere on page.
 * 3. Envelope Shaping: Soft attack and decay ramps eliminate speaker pop and harsh clipping.
 */
class EmergencyAudioAlert {
  constructor(onStatusChange) {
    this.oscillator = null;
    this.gainNode = null;
    this.intervalId = null;
    this.stopTimer = null;
    this.countdownInterval = null;
    this.isPlaying = false;
    this.alertTier = 'CRITICAL';
    this.remainingSeconds = 6;
    this.onStatusChange = onStatusChange || (() => {});
    this.autoplayBlocked = false;
  }

  async start(tier = 'CRITICAL', durationSeconds = 6) {
    this.alertTier = tier;
    const ctx = getSharedAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn('[AlertBanner] ctx.resume() error:', err);
      }
    }

    // Check if browser autoplay policy blocked audio context transition to 'running'
    if (ctx.state !== 'running') {
      this.autoplayBlocked = true;
      this.isPlaying = false;
      this.onStatusChange({
        isPlaying: false,
        remainingSeconds: 0,
        autoplayBlocked: true,
        autoSilenced: false,
        tier: this.alertTier,
      });

      // User interaction anywhere on window will immediately sound the alarm
      const oneTimeUnlock = async () => {
        window.removeEventListener('click', oneTimeUnlock);
        window.removeEventListener('touchstart', oneTimeUnlock);
        window.removeEventListener('pointerdown', oneTimeUnlock);
        window.removeEventListener('keydown', oneTimeUnlock);
        await this.start(tier, durationSeconds);
      };
      window.addEventListener('click', oneTimeUnlock, { once: true });
      window.addEventListener('touchstart', oneTimeUnlock, { once: true });
      window.addEventListener('pointerdown', oneTimeUnlock, { once: true });
      window.addEventListener('keydown', oneTimeUnlock, { once: true });
      return;
    }

    // AudioContext is fully running: clean up any existing nodes and play
    this.stopAudioNodesOnly();
    this.runAudioGraph(ctx, tier, durationSeconds);
  }

  stopAudioNodesOnly() {
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
  }

  runAudioGraph(ctx, tier, durationSeconds) {
    try {
      const isCritical = tier === 'CRITICAL';
      const targetGain = isCritical ? 0.22 : 0.14;
      const freqHigh = isCritical ? 880 : 750;
      const freqLow = isCritical ? 660 : 550;
      const pulseInterval = isCritical ? 420 : 550;

      // Soft gain envelope ramp to prevent harsh speaker pop
      this.gainNode = ctx.createGain();
      this.gainNode.gain.setValueAtTime(0.001, ctx.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 0.12);
      this.gainNode.connect(ctx.destination);

      // Acoustic disaster warning wave
      this.oscillator = ctx.createOscillator();
      this.oscillator.type = isCritical ? 'triangle' : 'sine';
      this.oscillator.frequency.setValueAtTime(freqHigh, ctx.currentTime);
      this.oscillator.connect(this.gainNode);
      this.oscillator.start();

      let toggle = false;
      this.intervalId = setInterval(() => {
        if (!this.oscillator) return;
        toggle = !toggle;
        const targetFreq = toggle ? freqLow : freqHigh;
        this.oscillator.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.05);
      }, pulseInterval);

      this.isPlaying = true;
      this.remainingSeconds = durationSeconds;
      this.autoplayBlocked = false;

      this.onStatusChange({
        isPlaying: true,
        remainingSeconds: this.remainingSeconds,
        autoplayBlocked: false,
        autoSilenced: false,
        tier,
      });

      // 1-second countdown tick
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
            tier,
          });
        }
      }, 1000);

      // Auto-termination timer
      this.stopTimer = setTimeout(() => {
        this.stop(true);
      }, durationSeconds * 1000);
    } catch (err) {
      console.warn('[AlertBanner] Error initializing audio graph:', err);
      this.autoplayBlocked = true;
      this.isPlaying = false;
      this.onStatusChange({
        isPlaying: false,
        remainingSeconds: 0,
        autoplayBlocked: true,
        autoSilenced: false,
        tier,
      });
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

    const ctx = getSharedAudioContext();
    if (this.gainNode && ctx) {
      try {
        this.gainNode.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      } catch {}
    }

    setTimeout(() => {
      this.stopAudioNodesOnly();
    }, 130);

    this.isPlaying = false;
    this.remainingSeconds = 0;
    this.onStatusChange({
      isPlaying: false,
      remainingSeconds: 0,
      autoplayBlocked: false,
      autoSilenced,
      tier: this.alertTier,
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
  const [currentScopeKey, setCurrentScopeKey] = useState(dismissedKey);
  const [isMuted, setIsMuted] = useState(false);
  const [alarmState, setAlarmState] = useState({
    isPlaying: false,
    remainingSeconds: 6,
    autoplayBlocked: false,
    autoSilenced: false,
    tier: 'CRITICAL',
  });

  // State synchronization pattern: adjust state during render on scope key change
  if (currentScopeKey !== dismissedKey) {
    setCurrentScopeKey(dismissedKey);
    setDismissedIds(readStoredIds(dismissedKey));
    setFullscreenDismissedIds(readStoredIds(fullscreenKey));
  }

  const audioAlertRef = useRef(null);
  // Track alert IDs that have already triggered audio during this session to prevent re-trigger loops
  const playedAlertIdsRef = useRef(new Set());

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

  // Prominently displayed alert in top banner
  const currentAlert = activeAlerts[0];
  const isCritical = currentAlert?.severity === 'CRITICAL';

  // Audio trigger on alert arrival: handles both CRITICAL siren (6s) and WATCH chime (4s)
  useEffect(() => {
    if (!audioAlertRef.current) {
      audioAlertRef.current = new EmergencyAudioAlert((status) => {
        setAlarmState((prev) => ({ ...prev, ...status }));
      });
    }

    if (isMuted || activeAlerts.length === 0) {
      return;
    }

    // 1. Unacknowledged CRITICAL emergency takes absolute priority
    if (unacknowledgedCritical) {
      if (!playedAlertIdsRef.current.has(unacknowledgedCritical.id)) {
        playedAlertIdsRef.current.add(unacknowledgedCritical.id);
        audioAlertRef.current.start('CRITICAL', 6);
      }
      return;
    }

    // 2. New WATCH advisory alert triggers distinct advisory chime
    const unplayedWatch = activeAlerts.find(
      (a) => a.severity === 'WATCH' && !playedAlertIdsRef.current.has(a.id)
    );
    if (unplayedWatch) {
      playedAlertIdsRef.current.add(unplayedWatch.id);
      audioAlertRef.current.start('WATCH', 4);
    }
  }, [alerts, unacknowledgedCritical, isMuted, activeAlerts]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioAlertRef.current) {
        audioAlertRef.current.stop();
      }
    };
  }, []);

  // Explicitly replay emergency sound
  const handleReplaySiren = () => {
    setIsMuted(false);
    if (audioAlertRef.current) {
      const tier = unacknowledgedCritical?.severity === 'CRITICAL' || currentAlert?.severity === 'CRITICAL' ? 'CRITICAL' : 'WATCH';
      const duration = tier === 'CRITICAL' ? 6 : 4;
      audioAlertRef.current.start(tier, duration);
    }
  };

  // Explicitly silence/mute sound
  const handleSilenceSiren = () => {
    setIsMuted(true);
    if (audioAlertRef.current) {
      audioAlertRef.current.stop(false);
    }
  };

  // Handle explicit dismissal of full-screen takeover
  const handleAcknowledgeCritical = (alertId) => {
    if (audioAlertRef.current) {
      audioAlertRef.current.stop(false);
    }
    setFullscreenDismissedIds((prev) => [...prev, alertId]);
  };

  if (activeAlerts.length === 0) {
    return null;
  }

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
