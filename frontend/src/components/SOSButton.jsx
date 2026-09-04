import React, { useState } from 'react';
import { AlertOctagon, MapPin, Loader2, CheckCircle2 } from 'lucide-react';
import api from '../services/api';

export default function SOSButton({ onSOSCreated, defaultCoords }) {
  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hazardType, setHazardType] = useState('FLOOD');
  const [message, setMessage] = useState('');
  const [coords, setCoords] = useState(defaultCoords || { lat: 19.0760, lng: 72.8777 });
  const [locating, setLocating] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const acquireLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        console.warn('Geolocation denied or timed out; using preset regional coordinates', err);
        setLocating(false);
      },
      { timeout: 8000 }
    );
  };

  const handleOpenModal = () => {
    acquireLocation();
    setIsOpen(true);
    setSuccessMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        hazardType,
        message: message.trim() || `Emergency distress call for ${hazardType} situation`,
        lat: coords.lat,
        lng: coords.lng,
      };

      const res = await api.post('/sos', payload);
      setSuccessMessage('Emergency broadcast transmitted. Responders alerted.');
      if (onSOSCreated) {
        onSOSCreated(res.data.sos);
      }
      setTimeout(() => {
        setIsOpen(false);
        setMessage('');
        setSuccessMessage('');
      }, 1800);
    } catch (err) {
      console.error('SOS submission failed', err);
      alert(err.response?.data?.error || 'Failed to dispatch SOS signal. Check network.');
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
                <CheckCircle2 className="w-12 h-12 text-[#2E6E4E] mx-auto animate-bounce" />
                <p className="font-display font-bold text-lg text-[#2E6E4E]">{successMessage}</p>
                <p className="text-sm text-[#14231F]/70 font-mono">
                  Coordinates broadcast to all active emergency responders.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                {/* Hazard Type Selector (Capped strictly at 3) */}
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

                {/* Location Display */}
                <div className="p-3 bg-[#F6F4EF] border border-[#D8D3C7] rounded text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[#14231F]/70 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> GPS Coordinates:
                    </span>
                    <button
                      type="button"
                      onClick={acquireLocation}
                      disabled={locating}
                      className="text-[11px] underline text-[#2E6E4E] hover:opacity-80"
                    >
                      {locating ? 'Locating...' : 'Refresh GPS'}
                    </button>
                  </div>
                  <div className="font-mono tabular-nums text-sm font-semibold text-[#14231F]">
                    {coords.lat.toFixed(4)}° N, {coords.lng.toFixed(4)}° E
                  </div>
                </div>

                {/* Distress Details */}
                <div>
                  <label htmlFor="sos-msg" className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1">
                    Situation Details (Optional)
                  </label>
                  <textarea
                    id="sos-msg"
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="e.g. 2 people stranded on terrace, water level rising rapidly..."
                    className="w-full p-2.5 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-sm focus:outline-none focus:border-[#14231F]"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#D8D3C7]">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-[#14231F]/70 hover:text-[#14231F]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="confirm-sos-btn"
                    disabled={submitting}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#B23A2E] hover:bg-[#9E2E23] text-white font-display font-bold text-sm rounded transition-colors disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Broadcasting...</span>
                      </>
                    ) : (
                      <span>TRANSMIT DISTRESS SIGNAL</span>
                    )}
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
