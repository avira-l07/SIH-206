import React, { useState } from 'react';
import { ShieldCheck, MapPin, X, Check, AlertTriangle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import api from '../services/api';
import { calculateDistanceKm } from '../services/haversine';
import { useAuth } from '../context/AuthContext';

export default function HazardConfirmationPrompt({ reports = [], userCoords, onConfirmed }) {
  const { user } = useAuth();
  const [dismissedIds, setDismissedIds] = useState([]);
  const [votingId, setVotingId] = useState(null);
  const [lastVoteTime, setLastVoteTime] = useState(0);

  if (!userCoords) return null;

  // Find reports that are unconfirmed/under review (GREY or AMBER) within 1.5km of current user
  // Skip reports authored by the current user
  const nearbyReports = reports.filter((r) => {
    if (r.confidenceTier === 'RESOLVED' || r.confidenceTier === 'DISPUTED') return false;
    if (user?.id && r.userId === user.id) return false;
    if (dismissedIds.includes(r.id)) return false;

    const distKm = calculateDistanceKm(userCoords.lat, userCoords.lng, r.lat, r.lng);
    return distKm <= 2.0; // 2km radius
  });

  if (nearbyReports.length === 0) return null;

  const currentReport = nearbyReports[0];
  const distMeters = Math.round(
    calculateDistanceKm(userCoords.lat, userCoords.lng, currentReport.lat, currentReport.lng) * 1000
  );

  // Check if current user already voted on this report
  const existingVoteObj = currentReport.confirmations?.find(
    (c) => c.confirmingUserId === user?.id
  );
  const existingVoteType = existingVoteObj?.voteType || null;

  // Count votes by category
  const confirmCount = currentReport.confirmations?.filter((c) => c.voteType === 'CONFIRM').length || 0;
  const falseCount = currentReport.confirmations?.filter((c) => c.voteType === 'FALSE').length || 0;
  const resolvedCount = currentReport.confirmations?.filter((c) => c.voteType === 'RESOLVED').length || 0;

  const handleVote = async (voteType) => {
    const now = Date.now();
    if (existingVoteType === voteType && now - lastVoteTime < 2500) {
      // Rapid identical repeat vote guard (Decision 0.4)
      return;
    }

    setVotingId(currentReport.id);
    setLastVoteTime(now);

    try {
      const res = await api.post(`/hazards/${currentReport.id}/confirm`, { voteType });
      if (onConfirmed) onConfirmed(res.data.report);

      // If report transitioned to DISPUTED or RESOLVED, dismiss card
      if (res.data.report.confidenceTier === 'DISPUTED' || res.data.report.confidenceTier === 'RESOLVED') {
        setDismissedIds((prev) => [...prev, currentReport.id]);
      }
    } catch (err) {
      if (err.response?.status === 409) {
        // Fast duplicate vote
      } else {
        alert(err.response?.data?.error || 'Failed to submit vote');
      }
    } finally {
      setVotingId(null);
    }
  };

  const handleDismiss = () => {
    setDismissedIds((prev) => [...prev, currentReport.id]);
  };

  const benchmarkBadgeColors = {
    ANKLE: 'bg-blue-100 text-blue-800 border-blue-200',
    KNEE: 'bg-amber-100 text-amber-800 border-amber-200',
    WAIST: 'bg-orange-100 text-orange-800 border-orange-200',
    SUBMERGED: 'bg-red-100 text-red-800 border-red-200',
  };

  return (
    <div
      id="hazard-peer-confirmation-card"
      className="bg-[#FFFFFF] border-2 border-[#C97A2B] rounded p-4 shadow-md flex flex-col gap-3 text-xs transition-all animate-fade-in"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-[#C97A2B]/15 text-[#C97A2B] flex items-center justify-center flex-shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-[#C97A2B] font-mono uppercase text-[11px] tracking-wide shrink-0">
                GROUND VERIFICATION // NEARBY HAZARD REPORT
              </span>
              <span className="px-1.5 py-0.5 rounded bg-[#9A968C]/20 text-[#14231F] text-[10px] font-bold font-mono shrink-0 whitespace-nowrap">
                {distMeters < 1000 ? `${distMeters}m away` : `${(distMeters / 1000).toFixed(1)}km away`}
              </span>
              {currentReport.severityBenchmark && (
                <span
                  className={`px-1.5 py-0.5 rounded border text-[10px] font-bold font-mono uppercase shrink-0 whitespace-nowrap ${
                    benchmarkBadgeColors[currentReport.severityBenchmark] || 'bg-gray-100'
                  }`}
                >
                  {currentReport.severityBenchmark}-DEEP
                </span>
              )}
              <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-mono shrink-0 whitespace-nowrap">
                TIER: <strong>{currentReport.confidenceTier}</strong>
              </span>
            </div>

            <div className="text-sm font-display font-semibold text-[#14231F] mt-1">
              &ldquo;{currentReport.hazardNote}&rdquo;
            </div>

            <div className="text-[11px] text-[#14231F]/70 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>Reported by <strong>{currentReport.userName}</strong></span>
              <span>•</span>
              <span className="text-emerald-700 font-semibold">{confirmCount} Confirms</span>
              <span>•</span>
              <span className="text-amber-700 font-semibold">{falseCount} False</span>
              <span>•</span>
              <span className="text-blue-700 font-semibold">{resolvedCount} Resolved</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="text-xs text-[#14231F]/60 hover:text-[#14231F] px-2 py-1 rounded self-start sm:self-auto"
        >
          Dismiss
        </button>
      </div>

      {/* Decision 0.4: Multi-Vote & Correction Action Bar */}
      <div className="pt-2 border-t border-[#D8D3C7]/60 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-[#14231F]/70">
          {existingVoteType ? (
            <span className="text-[#C97A2B] font-semibold flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> You voted <strong>{existingVoteType}</strong>. Tap another button to update vote:
            </span>
          ) : (
            <span>Help verify ground conditions:</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* CONFIRM VOTE */}
          <button
            type="button"
            id={`confirm-hazard-btn-${currentReport.id}`}
            disabled={votingId === currentReport.id}
            onClick={() => handleVote('CONFIRM')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-display font-bold text-xs transition-all ${
              existingVoteType === 'CONFIRM'
                ? 'bg-[#2E6E4E] text-white ring-2 ring-[#2E6E4E] ring-offset-1 shadow-sm'
                : 'bg-[#2E6E4E]/10 hover:bg-[#2E6E4E]/20 text-[#2E6E4E] border border-[#2E6E4E]/30'
            }`}
          >
            {votingId === currentReport.id ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span>{existingVoteType === 'CONFIRM' ? '✓ CONFIRMED' : 'CONFIRM HAZARD'}</span>
          </button>

          {/* FALSE / RUMOR VOTE */}
          <button
            type="button"
            id={`false-hazard-btn-${currentReport.id}`}
            disabled={votingId === currentReport.id}
            onClick={() => handleVote('FALSE')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-display font-bold text-xs transition-all ${
              existingVoteType === 'FALSE'
                ? 'bg-[#B23A2E] text-white ring-2 ring-[#B23A2E] ring-offset-1 shadow-sm'
                : 'bg-[#B23A2E]/10 hover:bg-[#B23A2E]/20 text-[#B23A2E] border border-[#B23A2E]/30'
            }`}
          >
            <X className="w-3.5 h-3.5" />
            <span>{existingVoteType === 'FALSE' ? '✗ MARKED FALSE' : 'MARK FALSE / RUMOR'}</span>
          </button>

          {/* RESOLVED / CLEARED VOTE */}
          <button
            type="button"
            id={`resolve-hazard-btn-${currentReport.id}`}
            disabled={votingId === currentReport.id}
            onClick={() => handleVote('RESOLVED')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-display font-bold text-xs transition-all ${
              existingVoteType === 'RESOLVED'
                ? 'bg-[#14231F] text-white ring-2 ring-[#14231F] ring-offset-1 shadow-sm'
                : 'bg-[#14231F]/10 hover:bg-[#14231F]/20 text-[#14231F] border border-[#14231F]/30'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{existingVoteType === 'RESOLVED' ? '✓ MARKED CLEARED' : 'MARK RESOLVED'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

