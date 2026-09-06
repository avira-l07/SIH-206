import React, { useState } from 'react';
import { Camera, MapPin, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import api from '../services/api';

export default function HazardReportModal({ isOpen, onClose, onReportCreated, defaultCoords }) {
  const [coords, setCoords] = useState(defaultCoords || { lat: 19.0760, lng: 72.8777 });
  const [hazardNote, setHazardNote] = useState('');
  const [severityBenchmark, setSeverityBenchmark] = useState('');
  const [photoBase64, setPhotoBase64] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const acquireLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000 }
    );
  };

  const handlePhotoCapture = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Convert captured image to base64 string
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoBase64(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!severityBenchmark) {
      alert('Please select a water-depth / severity benchmark.');
      return;
    }
    if (!hazardNote.trim()) {
      alert('Please describe the hazard observed.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/hazards', {
        lat: coords.lat,
        lng: coords.lng,
        hazardNote: hazardNote.trim(),
        severityBenchmark,
        photoUrl: photoBase64,
      });

      setSuccessMsg('Report registered under review (Confidence: GREY). Awaiting nearby confirmations.');
      if (onReportCreated) onReportCreated(res.data.report);

      setTimeout(() => {
        setSuccessMsg('');
        setHazardNote('');
        setSeverityBenchmark('');
        setPhotoBase64(null);
        onClose();
      }, 1600);
    } catch (err) {
      console.error('Hazard report submission failed', err);
      alert(err.response?.data?.error || 'Failed to submit hazard report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded max-w-lg w-full p-6 shadow-xl text-[#14231F]">
        <div className="flex items-center justify-between pb-3 border-b border-[#D8D3C7]">
          <div className="flex items-center gap-2 text-[#14231F]">
            <AlertCircle className="w-5 h-5 text-[#C97A2B]" />
            <h2 className="font-display font-bold text-lg uppercase tracking-tight">
              Report Ground Hazard
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-xs font-mono px-2 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {successMsg ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-[#2E6E4E] mx-auto animate-bounce" />
            <p className="font-display font-bold text-base text-[#2E6E4E]">{successMsg}</p>
            <p className="text-xs text-[#14231F]/70 font-mono">
              Unconfirmed report broadcast to nearby citizens for ground-truth verification.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Anti-misinformation notice */}
            <div className="p-2.5 bg-[#EFECE4] border border-[#D8D3C7] rounded text-xs font-mono text-[#14231F]/80 flex items-start gap-2">
              <span className="font-bold text-[#C97A2B]">ANTI-MISINFO:</span>
              <span>
                In-app camera capture only. Reports start at <strong>GREY tier</strong> and require peer confirmations to alert rescue units.
              </span>
            </div>

            {/* In-app camera capture trigger */}
            <div>
              <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1.5">
                On-Site Evidence Photo (Camera Only)
              </label>

              <input
                id="hazard-camera-file-input"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoCapture}
                className="hidden"
              />

              {photoBase64 ? (
                <div className="relative rounded border border-[#D8D3C7] overflow-hidden max-h-48 bg-black/5">
                  <img src={photoBase64} alt="Captured hazard" className="w-full h-48 object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotoBase64(null)}
                    className="absolute top-2 right-2 p-1 bg-black/60 text-white rounded hover:bg-black"
                    title="Retake photo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="hazard-camera-file-input"
                  className="w-full flex flex-col items-center justify-center p-4 border-2 border-dashed border-[#D8D3C7] rounded hover:border-[#14231F] cursor-pointer bg-[#F6F4EF] transition-colors"
                >
                  <Camera className="w-6 h-6 text-[#14231F]/70 mb-1" />
                  <span className="text-xs font-mono font-semibold text-[#14231F]">
                    TAP TO CAPTURE IN-APP CAMERA PHOTO
                  </span>
                  <span className="text-[10px] text-[#14231F]/60 font-mono mt-0.5">
                    Live camera capture only • No file gallery uploads permitted
                  </span>
                </label>
              )}
            </div>

            {/* Structured Water-Depth / Severity Benchmark */}
            <div>
              <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1.5 flex items-center justify-between">
                <span>Water-Depth / Severity Benchmark *</span>
                <span className="text-[10px] text-[#C97A2B] font-semibold">REQUIRED FOR DISPATCH</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'ANKLE', label: 'Ankle-deep', desc: 'Passable on foot/cars' },
                  { id: 'KNEE', label: 'Knee-deep', desc: 'High clearance vehicles only' },
                  { id: 'WAIST', label: 'Waist-deep', desc: 'Route blocked • Boat required' },
                  { id: 'SUBMERGED', label: 'Submerged', desc: 'Ceiling/Roof level • Life threat' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    id={`benchmark-${item.id.toLowerCase()}`}
                    onClick={() => setSeverityBenchmark(item.id)}
                    className={`p-2 rounded text-left border transition-all ${
                      severityBenchmark === item.id
                        ? 'bg-[#14231F] text-white border-[#14231F] shadow-sm'
                        : 'bg-[#F6F4EF] hover:bg-[#EFECE4] text-[#14231F] border-[#D8D3C7]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display font-bold text-xs">{item.label}</span>
                      {severityBenchmark === item.id && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ring-2 ring-white" />
                      )}
                    </div>
                    <div className={`text-[10px] font-mono mt-0.5 ${severityBenchmark === item.id ? 'text-white/80' : 'text-[#14231F]/60'}`}>
                      {item.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Hazard Description */}
            <div>
              <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1">
                Hazard Note / Observation *
              </label>
              <textarea
                required
                rows={3}
                value={hazardNote}
                onChange={(e) => setHazardNote(e.target.value)}
                placeholder="e.g. Flooded subway waist-deep, fallen electric tree on road, bridge overflow..."
                className="w-full p-2.5 bg-[#F6F4EF] border border-[#D8D3C7] rounded text-xs focus:outline-none focus:border-[#14231F]"
              />
            </div>

            {/* GPS Location Details */}
            <div className="p-3 bg-[#F6F4EF] border border-[#D8D3C7] rounded text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[#14231F]/70 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#2E6E4E]" /> GPS Tag:
                </span>
                <button
                  type="button"
                  onClick={acquireLocation}
                  disabled={locating}
                  className="text-[11px] underline text-[#2E6E4E] hover:opacity-80"
                >
                  {locating ? 'Acquiring GPS...' : 'Refresh GPS'}
                </button>
              </div>
              <div className="font-mono tabular-nums text-sm font-semibold text-[#14231F]">
                {coords.lat.toFixed(4)}° N, {coords.lng.toFixed(4)}° E
              </div>
            </div>

            {/* Submit Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#D8D3C7]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-[#14231F]/70 hover:text-[#14231F]"
              >
                Cancel
              </button>
              <button
                type="submit"
                id="submit-hazard-report-btn"
                disabled={submitting || !severityBenchmark || !hazardNote.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-[#14231F] hover:bg-black text-white font-display font-bold text-xs rounded transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertCircle className="w-3.5 h-3.5" />}
                <span>TRANSMIT HAZARD REPORT</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
