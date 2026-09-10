import React, { useState } from 'react';
import {
  ShieldAlert,
  Clock,
  MapPin,
  Phone,
  Lock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  XCircle,
  Stethoscope,
  Activity,
} from 'lucide-react';
import { calculateDistanceKm } from '../services/haversine';
import api from '../services/api';

const COLUMNS = [
  {
    id: 'REPORTED',
    statuses: ['PENDING'],
    label: '1. REPORTED',
    desc: 'Incoming civilian signals',
  },
  {
    id: 'VERIFIED',
    statuses: ['VERIFIED'],
    label: '2. VERIFIED',
    desc: 'Command verified dispatch-ready',
  },
  {
    id: 'ACTIVE_DISPATCH',
    statuses: ['EN_ROUTE', 'ON_SCENE'],
    label: '3. EN ROUTE / ON SCENE',
    desc: 'Units deployed & on ground',
  },
  {
    id: 'EVACUATED_HANDOVER',
    statuses: ['EVACUATED', 'HANDED_OVER_TO_MEDICAL'],
    label: '4. EVACUATED / HANDOVER',
    desc: 'Extricated / medical handoff',
  },
  {
    id: 'RESOLVED',
    statuses: ['RESOLVED'],
    label: '5. RESCUED / RESOLVED',
    desc: 'Safe & closure confirmed',
  },
];

const TRIAGE_TAGS = [
  { id: 'IMMEDIATE', label: 'RED // IMMEDIATE', color: 'bg-[#B23A2E] text-white', desc: 'Critical / life threat' },
  { id: 'DELAYED', label: 'YELLOW // DELAYED', color: 'bg-[#C97A2B] text-white', desc: 'Serious / stable' },
  { id: 'MINOR', label: 'GREEN // MINOR', color: 'bg-[#2E6E4E] text-white', desc: 'Walking wounded' },
  { id: 'DECEASED', label: 'BLACK // DECEASED', color: 'bg-[#14231F] text-white', desc: 'Non-salvageable' },
];

function timeAgo(dateString) {
  if (!dateString) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(dateString).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function TriageKanban({
  sosList = [],
  userCoords,
  currentUser,
  onSOSUpdated,
  onSelectCoords,
}) {
  const [updatingId, setUpdatingId] = useState(null);
  const [cancelModalSOS, setCancelModalSOS] = useState(null);
  const [cancelReasonInput, setCancelReasonInput] = useState('');
  const [triageDropdownId, setTriageDropdownId] = useState(null);

  const isAdmin = currentUser?.role === 'ADMIN';

  const handleVerify = async (sosId) => {
    setUpdatingId(sosId);
    try {
      const res = await api.patch(`/sos/${sosId}/verify`);
      if (onSOSUpdated) onSOSUpdated(res.data.sos);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to verify ticket');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAssign = async (sosId) => {
    setUpdatingId(sosId);
    try {
      const res = await api.patch(`/sos/${sosId}/assign`);
      if (onSOSUpdated) onSOSUpdated(res.data.sos);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to assign ticket');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStatusChange = async (sosId, newStatus) => {
    setUpdatingId(sosId);
    try {
      const res = await api.patch(`/sos/${sosId}/status`, { status: newStatus });
      if (onSOSUpdated) onSOSUpdated(res.data.sos);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update request status');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSetTriageTag = async (sosId, tag) => {
    setUpdatingId(sosId);
    try {
      const res = await api.patch(`/sos/${sosId}/triage-tag`, { triageTag: tag });
      if (onSOSUpdated) onSOSUpdated(res.data.sos);
      setTriageDropdownId(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to set triage tag');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelModalSOS || !cancelReasonInput.trim()) {
      alert('Please provide a reason for cancelling this ticket');
      return;
    }

    setUpdatingId(cancelModalSOS.id);
    try {
      const res = await api.patch(`/sos/${cancelModalSOS.id}/cancel`, {
        cancelReason: cancelReasonInput.trim(),
      });
      if (onSOSUpdated) onSOSUpdated(res.data.sos);
      setCancelModalSOS(null);
      setCancelReasonInput('');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel ticket');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-xs font-mono text-[#14231F]/70">
        <span className="font-bold">TRIAGE KANBAN BOARD // 5-STAGE MULTI-AGENCY FIELD COORDINATION</span>
        <span>URGENT CALLS AUTO-PINNED TOP • OWNERSHIP GUARDS ACTIVE</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2.5">
        {COLUMNS.map((col) => {
          // Filter calls for this column by matched statuses
          const calls = sosList
            .filter((s) => col.statuses.includes(s.status))
            .sort((a, b) => {
              if (a.priority === 'URGENT' && b.priority !== 'URGENT') return -1;
              if (b.priority === 'URGENT' && a.priority !== 'URGENT') return 1;
              return new Date(b.createdAt) - new Date(a.createdAt);
            });

          return (
            <div
              key={col.id}
              className="bg-[#EDE9DE] border border-[#D8D3C7] rounded flex flex-col min-h-[460px] max-h-[640px] overflow-hidden"
            >
              {/* Column Header */}
              <div className="p-2 bg-[#E2DEC8] border-b border-[#D8D3C7] flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-xs uppercase text-[#14231F] tracking-tight">
                    {col.label}
                  </h3>
                  <p className="text-[9px] font-mono text-[#14231F]/60 truncate">{col.desc}</p>
                </div>
                <span className="font-mono text-xs font-bold px-1.5 py-0.5 bg-white/70 border border-[#D8D3C7] rounded text-[#14231F]">
                  {calls.length}
                </span>
              </div>

              {/* Cards Container */}
              <div className="p-1.5 space-y-2 overflow-y-auto flex-1">
                {calls.length === 0 ? (
                  <div className="py-12 text-center text-[10px] font-mono text-[#14231F]/50">
                    No active requests
                  </div>
                ) : (
                  calls.map((sos) => {
                    const isReopened = sos.message?.includes('[REOPENED BY CITIZEN');
                    const isCriticalBattery = sos.batteryLevel !== null && sos.batteryLevel <= 15;
                    const isUrgent =
                      sos.priority === 'URGENT' ||
                      isCriticalBattery ||
                      isReopened ||
                      (sos.vulnerabilityTags && sos.vulnerabilityTags.length > 0);

                    const distKm = userCoords
                      ? calculateDistanceKm(userCoords.lat, userCoords.lng, sos.lat, sos.lng)
                      : null;

                    const isAssignedToMe = currentUser && sos.assignedVolunteerId === currentUser.id;
                    const isAssignedToOther =
                      sos.assignedVolunteerId && currentUser && sos.assignedVolunteerId !== currentUser.id;
                    const canControlLifecycle = isAssignedToMe || isAdmin;

                    return (
                      <div
                        key={sos.id}
                        onClick={() => onSelectCoords && onSelectCoords([sos.lat, sos.lng])}
                        className={`bg-[#FFFFFF] rounded border p-2.5 text-xs space-y-1.5 cursor-pointer hover:border-[#14231F] transition-all relative ${
                          isReopened
                            ? 'border-2 border-[#B23A2E] bg-red-50/70 shadow-md ring-2 ring-[#B23A2E]/20'
                            : isUrgent
                            ? 'border-l-4 border-l-[#B23A2E] border-[#D8D3C7]'
                            : 'border-[#D8D3C7]'
                        }`}
                      >
                        {/* Reopened Banner */}
                        {isReopened && (
                          <div className="bg-[#B23A2E] text-white px-1.5 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1 uppercase tracking-wide animate-pulse">
                            <ShieldAlert className="w-3 h-3" /> CITIZEN REOPENED
                          </div>
                        )}

                        {/* Card Header: Hazard, Battery, Status Sub-badge, Urgency */}
                        <div className="flex items-center justify-between gap-1 flex-wrap">
                          <div className="flex items-center gap-1">
                            <span className="font-mono font-bold text-[9px] uppercase px-1 py-0.5 rounded bg-[#14231F] text-[#F6F4EF]">
                              {sos.hazardType}
                            </span>

                            {/* Sub-status label */}
                            <span className="font-mono text-[9px] font-bold px-1 py-0.5 rounded bg-[#EFECE4] border border-[#D8D3C7] text-[#14231F]/80 uppercase">
                              {sos.status}
                            </span>

                            {/* Battery badge */}
                            {sos.batteryLevel !== null && (
                              <span
                                className={`font-mono font-bold text-[9px] px-1 py-0.5 rounded flex items-center gap-0.5 ${
                                  isCriticalBattery
                                    ? 'bg-[#B23A2E] text-white animate-pulse'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                }`}
                              >
                                ⚡{sos.batteryLevel}%
                              </span>
                            )}
                          </div>

                          {isUrgent && (
                            <span className="font-mono font-bold text-[9px] px-1 py-0.5 rounded bg-[#B23A2E]/10 text-[#B23A2E] border border-[#B23A2E]/30 flex items-center gap-0.5">
                              <ShieldAlert className="w-2.5 h-2.5" /> URGENT
                            </span>
                          )}
                        </div>

                        {/* Casualty Triage Tag Badge */}
                        {sos.triageTag && (
                          <div className="flex items-center gap-1">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase flex items-center gap-1 ${
                                sos.triageTag === 'IMMEDIATE'
                                  ? 'bg-[#B23A2E] text-white'
                                  : sos.triageTag === 'DELAYED'
                                  ? 'bg-[#C97A2B] text-white'
                                  : sos.triageTag === 'MINOR'
                                  ? 'bg-[#2E6E4E] text-white'
                                  : 'bg-[#14231F] text-white'
                              }`}
                            >
                              <Activity className="w-2.5 h-2.5" /> TRIAGE: {sos.triageTag}
                            </span>
                          </div>
                        )}

                        {/* Proxy Details */}
                        {sos.reportedByProxy && (
                          <div className="p-1 bg-amber-50 border border-amber-300 rounded text-[9px] font-mono text-amber-900 space-y-0.5">
                            <div className="font-bold uppercase">PROXY SOS (Reported for another)</div>
                            {sos.subjectDescription && (
                              <div className="italic text-[9px] text-amber-800 font-semibold truncate">
                                &bull; {sos.subjectDescription}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Caller Info & Message */}
                        <div>
                          <div className="font-display font-bold text-xs text-[#14231F] flex items-center justify-between">
                            <span className="truncate max-w-[120px]">{sos.userName}</span>
                            <span className="text-[9px] font-mono font-normal text-[#14231F]/60">
                              {new Date(sos.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-[10px] text-[#14231F]/90 italic bg-[#F6F4EF] p-1.5 rounded border border-[#D8D3C7]/60 mt-0.5 line-clamp-2">
                            &ldquo;{sos.message}&rdquo;
                          </p>
                        </div>

                        {/* Vulnerability Chips */}
                        {sos.vulnerabilityTags && sos.vulnerabilityTags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {sos.vulnerabilityTags.map((tag) => (
                              <span
                                key={tag}
                                className="px-1 py-0.2 rounded border border-[#14231F] text-[#14231F] font-mono text-[9px] uppercase font-medium bg-[#EFECE4]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Caller Phone & Proximity & Accuracy/Age */}
                        <div className="flex items-center justify-between text-[9px] font-mono text-[#14231F]/70 pt-1 border-t border-[#D8D3C7]/40">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {distKm !== null && (
                              <span className="flex items-center gap-0.5 font-semibold">
                                <MapPin className="w-2.5 h-2.5 text-[#2E6E4E]" /> {distKm} km
                              </span>
                            )}
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#EFECE4] text-[#14231F]/80">
                              ±{sos.coordsAccuracy ? `${Math.round(sos.coordsAccuracy)}m` : '10m'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-mono text-[#14231F]/60">
                              {timeAgo(sos.capturedAt || sos.createdAt)}
                            </span>
                            {sos.userPhone && (
                              <a
                                href={`tel:${sos.userPhone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-0.5 underline font-bold"
                              >
                                <Phone className="w-2.5 h-2.5 text-[#14231F]/50" /> {sos.userPhone}
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Assignment Status Notice */}
                        {isAssignedToOther && (
                          <div className="p-1 bg-[#C97A2B]/10 border border-[#C97A2B]/30 rounded text-[9px] font-mono text-[#C97A2B] flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> Assigned to another responder
                          </div>
                        )}

                        {/* ACTION CONTROLS // ROLE & STAGE GATED */}
                        <div className="pt-1 flex flex-col gap-1">
                          {/* Column 1: REPORTED (PENDING) */}
                          {sos.status === 'PENDING' && (
                            <div className="flex gap-1">
                              {isAdmin ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={updatingId === sos.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleVerify(sos.id);
                                    }}
                                    className="flex-1 py-1 bg-[#2E6E4E] hover:bg-[#24583e] text-white font-display font-semibold text-[10px] rounded"
                                  >
                                    Verify
                                  </button>
                                  <button
                                    type="button"
                                    disabled={updatingId === sos.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAssign(sos.id);
                                    }}
                                    className="flex-1 py-1 bg-[#14231F] hover:bg-black text-white font-display font-semibold text-[10px] rounded"
                                    title="Fast-path claim for Control Room Admin"
                                  >
                                    Claim
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  disabled={true}
                                  className="w-full py-1 bg-gray-200 text-gray-500 font-display font-semibold text-[10px] rounded cursor-not-allowed"
                                  title="Ticket must be verified by control room before dispatch"
                                >
                                  Claim (Needs Verify)
                                </button>
                              )}

                              {isAdmin && (
                                <button
                                  type="button"
                                  disabled={updatingId === sos.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCancelModalSOS(sos);
                                  }}
                                  className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-[10px] font-bold"
                                  title="Cancel false alarm"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          )}

                          {/* Column 2: VERIFIED (VERIFIED) */}
                          {sos.status === 'VERIFIED' && (
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={updatingId === sos.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAssign(sos.id);
                                }}
                                className="flex-1 py-1 bg-[#14231F] hover:bg-black text-white font-display font-semibold text-[10px] rounded shadow-xs"
                              >
                                Claim Dispatch
                              </button>

                              {isAdmin && (
                                <button
                                  type="button"
                                  disabled={updatingId === sos.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCancelModalSOS(sos);
                                  }}
                                  className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-[10px] font-bold"
                                  title="Cancel false alarm"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          )}

                          {/* Column 3: EN_ROUTE or ON_SCENE */}
                          {sos.status === 'EN_ROUTE' && (
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={updatingId === sos.id || !canControlLifecycle}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(sos.id, 'ON_SCENE');
                                }}
                                className="flex-1 py-1 bg-[#C97A2B] hover:bg-[#b06720] text-white font-display font-semibold text-[10px] rounded transition-colors disabled:opacity-40"
                              >
                                Mark On Scene
                              </button>

                              {canControlLifecycle && (
                                <button
                                  type="button"
                                  disabled={updatingId === sos.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCancelModalSOS(sos);
                                  }}
                                  className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-[10px] font-bold"
                                  title="Cancel call"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          )}

                          {sos.status === 'ON_SCENE' && (
                            <div className="space-y-1">
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  disabled={updatingId === sos.id || !canControlLifecycle}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusChange(sos.id, 'EVACUATED');
                                  }}
                                  className="flex-1 py-1 bg-[#14231F] hover:bg-black text-white font-display font-semibold text-[10px] rounded disabled:opacity-40"
                                >
                                  Evacuate
                                </button>
                                <button
                                  type="button"
                                  disabled={updatingId === sos.id || !canControlLifecycle}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusChange(sos.id, 'RESOLVED');
                                  }}
                                  className="flex-1 py-1 bg-[#2E6E4E] hover:bg-[#23583e] text-white font-display font-semibold text-[10px] rounded disabled:opacity-40"
                                  title="Direct close without medical handover"
                                >
                                  Safe Close
                                </button>
                              </div>

                              {/* Triage tagging trigger */}
                              {canControlLifecycle && (
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTriageDropdownId(triageDropdownId === sos.id ? null : sos.id);
                                    }}
                                    className="w-full py-0.5 px-1 bg-[#EFECE4] hover:bg-[#D8D3C7] border border-[#D8D3C7] text-[#14231F] rounded text-[9px] font-mono font-bold flex items-center justify-center gap-1"
                                  >
                                    <Stethoscope className="w-2.5 h-2.5 text-[#C97A2B]" />
                                    <span>{sos.triageTag ? `Change Triage Tag (${sos.triageTag})` : 'Set Casualty Triage Tag'}</span>
                                  </button>

                                  {triageDropdownId === sos.id && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#D8D3C7] rounded shadow-lg p-1 z-30 space-y-1 animate-fade-in"
                                    >
                                      {TRIAGE_TAGS.map((t) => (
                                        <button
                                          key={t.id}
                                          type="button"
                                          onClick={() => handleSetTriageTag(sos.id, t.id)}
                                          className={`w-full py-1 px-2 text-left rounded text-[9px] font-mono font-bold flex items-center justify-between ${t.color}`}
                                        >
                                          <span>{t.label}</span>
                                          <span className="text-[8px] opacity-80">{t.desc}</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Column 4: EVACUATED or HANDED_OVER_TO_MEDICAL */}
                          {sos.status === 'EVACUATED' && (
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={updatingId === sos.id || !canControlLifecycle}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(sos.id, 'HANDED_OVER_TO_MEDICAL');
                                }}
                                className="flex-1 py-1 bg-[#14231F] hover:bg-black text-white font-display font-semibold text-[10px] rounded disabled:opacity-40"
                              >
                                Medical Handoff
                              </button>
                              <button
                                type="button"
                                disabled={updatingId === sos.id || !canControlLifecycle}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(sos.id, 'RESOLVED');
                                }}
                                className="flex-1 py-1 bg-[#2E6E4E] hover:bg-[#23583e] text-white font-display font-semibold text-[10px] rounded disabled:opacity-40"
                              >
                                Resolved
                              </button>
                            </div>
                          )}

                          {sos.status === 'HANDED_OVER_TO_MEDICAL' && (
                            <button
                              type="button"
                              disabled={updatingId === sos.id || !canControlLifecycle}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(sos.id, 'RESOLVED');
                              }}
                              className="w-full py-1 bg-[#2E6E4E] hover:bg-[#23583e] text-white font-display font-semibold text-[10px] rounded disabled:opacity-40"
                            >
                              Confirm Rescue Complete
                            </button>
                          )}

                          {/* Column 5: RESOLVED */}
                          {sos.status === 'RESOLVED' && (
                            <div className="w-full text-center font-mono text-[9px] font-bold py-0.5">
                              {sos.citizenConfirmedResolved ? (
                                <span className="text-[#2E6E4E] flex items-center justify-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> CITIZEN CONFIRMED SAFE
                                </span>
                              ) : (
                                <span className="text-[#C97A2B] flex items-center justify-center gap-1 bg-amber-50 p-0.5 rounded border border-amber-200">
                                  <Clock className="w-2.5 h-2.5" /> AWAITING CITIZEN CONFIRM
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

      {/* Cancellation Reason Modal */}
      {cancelModalSOS && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-[#D8D3C7] max-w-md w-full p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-display font-bold text-sm text-[#B23A2E] flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Cancel Emergency Signal
              </h3>
              <button
                onClick={() => {
                  setCancelModalSOS(null);
                  setCancelReasonInput('');
                }}
                className="text-gray-400 hover:text-black font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#14231F]/80">
              Provide an official cancellation reason for ticket #{cancelModalSOS.id} (&ldquo;
              {cancelModalSOS.message}&rdquo;):
            </p>

            <textarea
              rows={3}
              value={cancelReasonInput}
              onChange={(e) => setCancelReasonInput(e.target.value)}
              placeholder="E.g., Duplicate civilian report; caller confirmed self-evacuated; hazard water receded..."
              className="w-full p-2 border border-[#D8D3C7] rounded text-xs focus:outline-none focus:border-[#14231F]"
            />

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setCancelModalSOS(null);
                  setCancelReasonInput('');
                }}
                className="px-3 py-1.5 bg-[#EFECE4] text-[#14231F] font-bold text-xs rounded"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!cancelReasonInput.trim()}
                onClick={handleConfirmCancel}
                className="px-3 py-1.5 bg-[#B23A2E] text-white font-bold text-xs rounded hover:bg-red-800 disabled:opacity-50"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
