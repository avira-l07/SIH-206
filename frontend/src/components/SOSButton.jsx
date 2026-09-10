import React, { useState, useEffect } from 'react';
import { AlertOctagon, MapPin, Loader2, CheckCircle2, HeartHandshake, Battery, BatteryWarning, Users, WifiOff } from 'lucide-react';
import api from '../services/api';
import { enqueueAction, isManualOffline } from '../services/offlineQueue';

const VULNERABILITY_OPTIONS = [
  { id: 'dialysis', label: 'Dialysis Patient' },
  { id: 'elderly', label: 'Bedridden / Elderly' },
  { id: 'infant', label: 'Infant / Toddler' },
  { id: 'pregnant', label: 'Pregnant' },
];

export default function SOSButton({ onSOSCreated, defaultCoords }) {
  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hazardType, setHazardType] = useState('FLOOD');
  const [vulnerabilityTags, setVulnerabilityTags] = useState([]);
  const [message, setMessage] = useState('');
  const [coords, setCoords] = useState(defaultCoords || { lat: 19.0760, lng: 72.8777 });
  const [accuracy, setAccuracy] = useState(null);
  const [locating, setLocating] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [isQueuedOffline, setIsQueuedOffline] = useState(false);
  const [reportedByProxy, setReportedByProxy] = useState(false);
  const [subjectDescription, setSubjectDescription] = useState('');

  // Battery status (Decision 0.1 & Item 1.4)
  const [batteryLevel, setBatteryLevel] = useState(null);

  const readBatteryStatus = async () => {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      try {
        const battery = await navigator.getBattery();
        setBatteryLevel(Math.round(battery.level * 100));

        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      } catch (err) {
        console.warn('Battery Status API blocked or unavailable', err);
      }
    }
  };

  // Read Battery Status API on mount
  useEffect(() => {
    readBatteryStatus();
  }, []);

  const acquireLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracy(pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null);
        setLocating(false);
      },
      (err) => {
        console.warn('Geolocation denied or timed out; using preset regional coordinates', err);
        setLocating(false);
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  const handleOpenModal = () => {
    acquireLocation();
    readBatteryStatus();
    setIsOpen(true);
    setSuccessMessage('');
    setIsQueuedOffline(false);
  };

  const toggleVulnerabilityTag = (id) => {
    setVulnerabilityTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (reportedByProxy && !subjectDescription.trim()) {
      alert('Please describe who you are reporting this SOS for.');
      return;
    }

    setSubmitting(true);
    setIsQueuedOffline(false);

    const payload = {
      hazardType,
      message: message.trim() || `Emergency distress call for ${hazardType} situation`,
      lat: coords.lat,
      lng: coords.lng,
      coordsAccuracy: accuracy,
      capturedAt: new Date().toISOString(),
      vulnerabilityTags: vulnerabilityTags.join(','),
      batteryLevel,
      reportedByProxy,
      subjectDescription: reportedByProxy ? subjectDescription.trim() : null,
    };

    // If device is in manual outage mode or browser reports offline, queue directly into IndexedDB
    const shouldQueueDirectly =
      isManualOffline() || (typeof navigator !== 'undefined' && !navigator.onLine);

    if (shouldQueueDirectly) {
      try {
        await enqueueAction({
          type: 'SOS',
          endpoint: '/sos',
          payload,
        });
        setIsQueuedOffline(true);
        setSuccessMessage('Offline Outage: SOS Distress Signal Queued Locally');
        setTimeout(() => {
          setIsOpen(false);
          setMessage('');
          setVulnerabilityTags([]);
          setReportedByProxy(false);
          setSubjectDescription('');
          setSuccessMessage('');
          setIsQueuedOffline(false);
        }, 2200);
        return;
      } catch (qErr) {
        console.error('Failed to queue offline SOS:', qErr);
      } finally {
        setSubmitting(false);
      }
    }

    try {
      const res = await api.post('/sos', payload);
      setSuccessMessage('Emergency broadcast transmitted. Priority dispatch queued.');
      if (onSOSCreated) {
        onSOSCreated(res.data.sos);
      }
      setTimeout(() => {
        setIsOpen(false);
        setMessage('');
        setVulnerabilityTags([]);
        setReportedByProxy(false);
        setSubjectDescription('');
        setSuccessMessage('');
      }, 1800);
    } catch (err) {
      console.warn('Live SOS dispatch failed, falling back to local IndexedDB queue:', err);
      try {
        await enqueueAction({
          type: 'SOS',
          endpoint: '/sos',
          payload,
        });
        setIsQueuedOffline(true);
        setSuccessMessage('Offline Outage: SOS Distress Signal Queued Locally');
        setTimeout(() => {
          setIsOpen(false);
          setMessage('');
          setVulnerabilityTags([]);
          setReportedByProxy(false);
          setSubjectDescription('');
          setSuccessMessage('');
          setIsQueuedOffline(false);
        }, 2200);
      } catch (queueErr) {
        alert(err.response?.data?.error || 'Failed to dispatch SOS signal. Check network.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Primary Accessible Emergency Trigger Button */}
      <button
        id="main-sos-button"
        onClick={handleOpenModal}
        aria-label="Trigger Emergency SOS Distress Signal"
        className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-4 bg-[#B23A2E] hover:bg-[#9E2E23] text-white font-display font-bold text-base sm:text-lg tracking-wide rounded border-2 border-[#B23A2E] focus:outline-none focus:ring-4 focus:ring-[#B23A2E]/30 transition-all active:scale-[0.99] shadow-sm animate-emergency"
      >
        <AlertOctagon className="w-6 h-6 flex-shrink-0" />
        <span>SEND SOS // EMERGENCY HELP</span>
      </button>

      {/* Confirmation & Details Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded max-w-lg w-full p-6 shadow-xl text-[#14231F]">
            <div className="flex items-center justify-between pb-3 border-b border-[#D8D3C7]">
              <div className="flex items-center gap-2 text-[#B23A2E]">
                <AlertOctagon className="w-6 h-6" />
                <h2 className="font-display font-bold text-lg uppercase tracking-tight">
                  Emergency Distress Signal
                </h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-xs font-mono px-2 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] rounded text-[#14231F]"
              >
                ESC / CANCEL
              </button>
            </div>

            {successMessage ? (
              <div className="py-8 text-center space-y-3">
                {isQueuedOffline ? (
                  <WifiOff className="w-12 h-12 text-[#C97A2B] mx-auto animate-pulse" />
                ) : (
                  <CheckCircle2 className="w-12 h-12 text-[#2E6E4E] mx-auto animate-bounce" />
                )}
                <p
                  className={`font-display font-bold text-lg ${
                    isQueuedOffline ? 'text-[#C97A2B]' : 'text-[#2E6E4E]'
                  }`}
                >
                  {successMessage}
                </p>
                <p className="text-sm text-[#14231F]/70 font-mono">
                  {isQueuedOffline
                    ? 'Stored safely in local IndexedDB. Will auto-sync to local hub or cell network immediately when reconnected.'
                    : 'Coordinates & vulnerability tags broadcast to rescue commanders.'}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                {/* Hazard Type Selector */}
                <div>
                  <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1.5">
                    Select Hazard Type *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {['FLOOD', 'EARTHQUAKE', 'FIRE'].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setHazardType(type)}
                        className={`py-2 px-3 text-xs font-bold font-mono rounded border transition-colors ${
                          hazardType === type
                            ? 'bg-[#14231F] text-[#F6F4EF] border-[#14231F]'
                            : 'bg-[#EFECE4] text-[#14231F] border-[#D8D3C7] hover:bg-[#D8D3C7]'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Vulnerability Tags Selector (Auto jumps triage queue) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-mono uppercase text-[#14231F]/80 flex items-center gap-1.5">
                      <HeartHandshake className="w-3.5 h-3.5 text-[#B23A2E]" />
                      Special Vulnerability Tags (Optional)
                    </label>
                    <span className="text-[10px] font-mono text-[#B23A2E] font-semibold">
                      Auto-Jumps Triage Queue
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {VULNERABILITY_OPTIONS.map(({ id, label }) => {
                      const isSelected = vulnerabilityTags.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          id={`tag-${id}`}
                          onClick={() => toggleVulnerabilityTag(id)}
                          className={`py-1.5 px-2.5 text-left text-xs font-mono rounded border transition-colors flex items-center justify-between ${
                            isSelected
                              ? 'bg-[#14231F] text-white border-[#14231F] font-bold'
                              : 'bg-[#F6F4EF] text-[#14231F]/80 border-[#D8D3C7] hover:border-[#14231F]'
                          }`}
                        >
                          <span>{label}</span>
                          <span className="text-[10px] font-mono">{isSelected ? '✓' : '+'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Battery Telemetry (Decision 0.1 / Section 5) */}
                <div className="p-2.5 bg-[#F6F4EF] border border-[#D8D3C7] rounded text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {batteryLevel !== null && batteryLevel <= 15 ? (
                      <BatteryWarning className="w-4 h-4 text-[#B23A2E] animate-pulse" />
                    ) : (
                      <Battery className="w-4 h-4 text-[#14231F]/70" />
                    )}
                    <span className="font-mono text-[#14231F]/80">Device Telemetry:</span>
                  </div>
                  <div className="font-mono font-semibold text-[11px]">
                    {batteryLevel !== null ? (
                      batteryLevel <= 15 ? (
                        <span className="text-[#B23A2E] font-bold">
                          ⚡ {batteryLevel}% Battery (CRITICAL &bull; Auto-Urgent Priority)
                        </span>
                      ) : (
                        <span className="text-[#2E6E4E]">
                          ⚡ {batteryLevel}% Battery
                        </span>
                      )
                    ) : (
                      <span className="text-[#14231F]/60">
                        Battery: Unavailable (Desktop / Restricted)
                      </span>
                    )}
                  </div>
                </div>

                {/* Proxy Distress Reporting (Item 2.1) */}
                <div className="p-3 bg-[#EFECE4]/60 border border-[#D8D3C7] rounded space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-mono select-none">
                    <input
                      type="checkbox"
                      id="proxy-distress-checkbox"
                      checked={reportedByProxy}
                      onChange={(e) => setReportedByProxy(e.target.checked)}
                      className="rounded border-[#D8D3C7] text-[#14231F] focus:ring-0"
                    />
                    <span className="font-bold text-[#14231F] flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[#C97A2B]" />
                      Report on behalf of someone else (Proxy SOS)
                    </span>
                  </label>

                  {reportedByProxy && (
                    <div className="pl-5 pt-1 space-y-1 animate-fade-in">
                      <label className="block text-[11px] font-mono text-[#14231F]/80">
                        Who needs rescue? (Name, mobility constraints, exact floor/spot) *
                      </label>
                      <input
                        type="text"
                        required={reportedByProxy}
                        value={subjectDescription}
                        onChange={(e) => setSubjectDescription(e.target.value)}
                        placeholder="e.g. Neighbor Mrs. Joshi (82yo, wheelchair), 2nd floor balcony"
                        className="w-full p-2 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-xs focus:outline-none focus:border-[#14231F]"
                      />
                    </div>
                  )}
                </div>

                {/* Location Display */}
                <div className="p-3 bg-[#F6F4EF] border border-[#D8D3C7] rounded text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[#14231F]/70 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> GPS Coordinates:
                    </span>
                    <div className="flex items-center gap-2">
                      {accuracy && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#2E6E4E]/10 text-[#2E6E4E] rounded border border-[#2E6E4E]/30 font-semibold">
                          ±{accuracy}m precision
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={acquireLocation}
                        disabled={locating}
                        className="text-[11px] underline text-[#2E6E4E] hover:opacity-80"
                      >
                        {locating ? 'Locating...' : 'Refresh GPS'}
                      </button>
                    </div>
                  </div>
                  <div className="font-mono tabular-nums text-sm font-semibold text-[#14231F]">
                    {coords.lat.toFixed(4)}° N, {coords.lng.toFixed(4)}° E
                  </div>
                </div>

                {/* Message / Details */}
                <div>
                  <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1">
                    Distress Details / Situation Description *
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="e.g. Ground floor flooded 4ft, 2 people trapped on roof, urgent medical attention required..."
                    className="w-full p-2.5 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-xs focus:outline-none focus:border-[#14231F]"
                  />
                </div>

                {/* Dispatch Trigger Actions */}
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#D8D3C7]">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-[#14231F]/70"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="confirm-sos-dispatch-btn"
                    disabled={submitting}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#B23A2E] hover:bg-[#9E2E23] text-white font-display font-bold text-xs rounded tracking-wider uppercase transition-colors disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertOctagon className="w-3.5 h-3.5" />}
                    <span>TRANSMIT DISTRESS BEACON</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
