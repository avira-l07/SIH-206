import React, { useState } from 'react';
import { ShieldAlert, Clock, MapPin, Phone, Lock, CheckCircle2, UserCheck, ArrowRight } from 'lucide-react';
import { calculateDistanceKm } from '../services/haversine';
import api from '../services/api';

const COLUMNS = [
  { id: 'PENDING', label: '1. REPORTED', desc: 'Incoming signals' },
  { id: 'VERIFIED', label: '2. VERIFIED', desc: 'Command verified' },
  { id: 'IN_PROGRESS', label: '3. DISPATCHED', desc: 'Responders en route' },
  { id: 'RESOLVED', label: '4. RESCUED', desc: 'Evacuated / Safe' },
];

export default function TriageKanban({
  sosList = [],
  userCoords,
  currentUser,
  onSOSUpdated,
  onSelectCoords,
}) {
  const [updatingId, setUpdatingId] = useState(null);

  const handleStatusChange = async (sosId, newStatus) => {
    setUpdatingId(sosId);
    try {
      let res;
      if (newStatus === 'IN_PROGRESS') {
        res = await api.patch(`/sos/${sosId}/assign`);
      } else if (newStatus === 'RESOLVED') {
        res = await api.patch(`/sos/${sosId}/resolve`);
      } else {
        res = await api.patch(`/sos/${sosId}/status`, { status: newStatus });
      }

      if (onSOSUpdated) onSOSUpdated(res.data.sos);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update request status');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-xs font-mono text-[#14231F]/70">
        <span className="font-bold">TRIAGE KANBAN BOARD // MULTI-AGENCY FIELD COORDINATION</span>
        <span>URGENT CALLS AUTO-PINNED TOP • RED ACCENT BAR</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {COLUMNS.map((col) => {
          // Filter calls for this column
          const calls = sosList
            .filter((s) => s.status === col.id)
            .sort((a, b) => {
              // Urgent priority always sorts to top
              if (a.priority === 'URGENT' && b.priority !== 'URGENT') return -1;
              if (b.priority === 'URGENT' && a.priority !== 'URGENT') return 1;
              return new Date(b.createdAt) - new Date(a.createdAt);
            });

          return (
            <div
              key={col.id}
              className="bg-[#EDE9DE] border border-[#D8D3C7] rounded flex flex-col min-h-[440px] max-h-[620px] overflow-hidden"
            >
              {/* Column Header */}
              <div className="p-2.5 bg-[#E2DEC8] border-b border-[#D8D3C7] flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-xs uppercase text-[#14231F] tracking-tight">
                    {col.label}
                  </h3>
                  <p className="text-[10px] font-mono text-[#14231F]/60">{col.desc}</p>
                </div>
                <span className="font-mono text-xs font-bold px-1.5 py-0.5 bg-white/70 border border-[#D8D3C7] rounded text-[#14231F]">
                  {calls.length}
                </span>
              </div>

              {/* Cards Container */}
              <div className="p-2 space-y-2.5 overflow-y-auto flex-1">
                {calls.length === 0 ? (
                  <div className="py-12 text-center text-[11px] font-mono text-[#14231F]/50">
                    No requests in this stage
                  </div>
                ) : (
                  calls.map((sos) => {
                    const isReopened = sos.message?.includes('[REOPENED BY CITIZEN');
                    const isCriticalBattery = sos.batteryLevel !== null && sos.batteryLevel <= 15;
                    const isUrgent = sos.priority === 'URGENT' || isCriticalBattery || isReopened || (sos.vulnerabilityTags && sos.vulnerabilityTags.length > 0);
                    const distKm = userCoords
                      ? calculateDistanceKm(userCoords.lat, userCoords.lng, sos.lat, sos.lng)
                      : null;
                    const isAssignedToOther =
                      sos.status === 'IN_PROGRESS' &&
                      sos.assignedVolunteerId &&
                      currentUser &&
                      sos.assignedVolunteerId !== currentUser.id;

                    return (
                      <div
                        key={sos.id}
                        onClick={() => onSelectCoords && onSelectCoords([sos.lat, sos.lng])}
                        className={`bg-[#FFFFFF] rounded border p-3 text-xs space-y-2 cursor-pointer hover:border-[#14231F] transition-all relative ${
                          isReopened
                            ? 'border-2 border-[#B23A2E] bg-red-50/70 shadow-md ring-2 ring-[#B23A2E]/20'
                            : isUrgent
                            ? 'border-l-4 border-l-[#B23A2E] border-[#D8D3C7]'
                            : 'border-[#D8D3C7]'
                        }`}
                      >
                        {/* Reopened Banner (Item 1.3) */}
                        {isReopened && (
                          <div className="bg-[#B23A2E] text-white px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 uppercase tracking-wide animate-pulse">
                            <ShieldAlert className="w-3 h-3" /> CITIZEN REOPENED // RESCUE INCOMPLETE
                          </div>
                        )}

                        {/* Card Header: Hazard, Battery, Urgency */}
                        <div className="flex items-center justify-between gap-1.5 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-[10px] uppercase px-1.5 py-0.5 rounded bg-[#14231F] text-[#F6F4EF]">
                              {sos.hazardType}
                            </span>

                            {/* Battery badge (Decision 0.1 & Item 1.4) */}
                            {sos.batteryLevel !== null && (
                              <span
                                className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                                  isCriticalBattery
                                    ? 'bg-[#B23A2E] text-white animate-pulse'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                }`}
                              >
                                ⚡ {sos.batteryLevel}% {isCriticalBattery ? 'CRITICAL' : ''}
                              </span>
                            )}
                          </div>

                          {isUrgent && (
                            <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-[#B23A2E]/10 text-[#B23A2E] border border-[#B23A2E]/30 flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" /> URGENT
                            </span>
                          )}
                        </div>

                        {/* Proxy Details (Item 2.1) */}
                        {sos.reportedByProxy && (
                          <div className="p-1.5 bg-amber-50 border border-amber-300 rounded text-[10px] font-mono text-amber-900 space-y-0.5">
                            <div className="font-bold flex items-center gap-1 uppercase">
                              <span>PROXY SOS (Reported for another person)</span>
                            </div>
                            {sos.subjectDescription && (
                              <div className="italic text-[10px] text-amber-800 font-semibold">
                                &bull; {sos.subjectDescription}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Caller Info & Message */}
                        <div>
                          <div className="font-display font-bold text-xs text-[#14231F] flex items-center justify-between">
                            <span>{sos.userName}</span>
                            <span className="text-[10px] font-mono font-normal text-[#14231F]/60">
                              {new Date(sos.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#14231F]/90 italic bg-[#F6F4EF] p-1.5 rounded border border-[#D8D3C7]/60 mt-1 line-clamp-2">
                            &ldquo;{sos.message}&rdquo;
                          </p>
                        </div>

                        {/* Vulnerability Chips per design.md */}
                        {sos.vulnerabilityTags && sos.vulnerabilityTags.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {sos.vulnerabilityTags.map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.2 rounded border border-[#14231F] text-[#14231F] font-mono text-[10px] uppercase font-medium bg-[#EFECE4]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Caller Phone & Proximity */}
                        <div className="flex items-center justify-between text-[10px] font-mono text-[#14231F]/70 pt-1 border-t border-[#D8D3C7]/40">
                          {distKm !== null && (
                            <span className="flex items-center gap-0.5 font-semibold">
                              <MapPin className="w-3 h-3 text-[#2E6E4E]" /> {distKm} km
                            </span>
                          )}
                          {sos.userPhone && (
                            <a
                              href={`tel:${sos.userPhone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-0.5 underline font-bold"
                            >
                              <Phone className="w-3 h-3 text-[#14231F]/50" /> {sos.userPhone}
                            </a>
                          )}
                        </div>

                        {/* Assignment Status Notice */}
                        {isAssignedToOther && (
                          <div className="p-1 bg-[#C97A2B]/10 border border-[#C97A2B]/30 rounded text-[10px] font-mono text-[#C97A2B] flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Locked to another responder
                          </div>
                        )}

                        {/* Triage Progression Action Buttons */}
                        <div className="pt-1.5 flex gap-1.5">
                          {col.id === 'PENDING' && (
                            <>
                              <button
                                type="button"
                                disabled={updatingId === sos.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(sos.id, 'VERIFIED');
                                }}
                                className="flex-1 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] text-[#14231F] font-display font-semibold text-[11px] rounded border border-[#D8D3C7]"
                              >
                                Verify
                              </button>
                              <button
                                type="button"
                                disabled={updatingId === sos.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(sos.id, 'IN_PROGRESS');
                                }}
                                className="flex-1 py-1 bg-[#14231F] hover:bg-black text-white font-display font-semibold text-[11px] rounded"
                              >
                                Dispatch
                              </button>
                            </>
                          )}

                          {col.id === 'VERIFIED' && (
                            <button
                              type="button"
                              disabled={updatingId === sos.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(sos.id, 'IN_PROGRESS');
                              }}
                              className="w-full py-1 bg-[#14231F] hover:bg-black text-white font-display font-semibold text-[11px] rounded"
                            >
                              Claim Dispatch
                            </button>
                          )}

                          {col.id === 'IN_PROGRESS' && (
                            <button
                              type="button"
                              disabled={updatingId === sos.id || isAssignedToOther}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(sos.id, 'RESOLVED');
                              }}
                              className="w-full py-1 bg-[#2E6E4E] hover:bg-[#23583e] text-white font-display font-semibold text-[11px] rounded transition-colors disabled:opacity-40"
                            >
                              Mark Rescued
                            </button>
                          )}

                          {col.id === 'RESOLVED' && (
                            <div className="w-full text-center font-mono text-[10px] font-bold py-0.5">
                              {sos.citizenConfirmedResolved ? (
                                <span className="text-[#2E6E4E] flex items-center justify-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> CITIZEN CONFIRMED SAFE
                                </span>
                              ) : (
                                <span className="text-[#C97A2B] flex items-center justify-center gap-1 bg-amber-50 p-1 rounded border border-amber-200">
                                  <Clock className="w-3 h-3" /> AWAITING CITIZEN CONFIRM
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
