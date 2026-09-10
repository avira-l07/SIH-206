import React, { useState, useEffect } from 'react';
import { sortSheltersByDistance } from '../services/haversine';
import {
  Home,
  Navigation,
  Search,
  AlertTriangle,
  Check,
  X,
  Sliders,
  ArrowRight,
  Package,
  Droplets,
  Utensils,
  ArrowUpDown,
  History,
  Plus,
  Minus,
} from 'lucide-react';
import ShelterSuppliesModal from './ShelterSuppliesModal';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { enqueueAction, isManualOffline } from '../services/offlineQueue';
import api from '../services/api';

export default function ShelterList({
  shelters = [],
  userCoords,
  onSelectShelter,
  onShelterUpdated,
}) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const isOperator = user?.role === 'VOLUNTEER' || user?.role === 'ADMIN';

  const [searchTerm, setSearchTerm] = useState('');
  const [auditingShelter, setAuditingShelter] = useState(null);
  const [auditForm, setAuditForm] = useState(null);
  const [submittingAudit, setSubmittingAudit] = useState(false);
  const [viewingSuppliesShelter, setViewingSuppliesShelter] = useState(null);
  const [restockNotifications, setRestockNotifications] = useState({});

  // Commutative Delta Flow Events state (Step 2 - LWW Resolution)
  const [eventShelter, setEventShelter] = useState(null);
  const [shelterEvents, setShelterEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [deltaOccupancy, setDeltaOccupancy] = useState(0);
  const [deltaWater, setDeltaWater] = useState(0);
  const [deltaRations, setDeltaRations] = useState(0);
  const [eventReason, setEventReason] = useState('');
  const [submittingDelta, setSubmittingDelta] = useState(false);
  const [deltaSuccessMsg, setDeltaSuccessMsg] = useState('');

  useEffect(() => {
    if (!socket || !isOperator) return;

    const handleRestock = ({ shelter, resourceType }) => {
      setRestockNotifications((prev) => ({
        ...prev,
        [shelter.id]: {
          resourceType,
          at: new Date(),
        },
      }));
    };

    socket.on('shelter:restock_needed', handleRestock);
    return () => {
      socket.off('shelter:restock_needed', handleRestock);
    };
  }, [socket, isOperator]);

  const sorted = sortSheltersByDistance(
    shelters,
    userCoords?.lat ?? 19.076,
    userCoords?.lng ?? 72.8777
  );

  const filtered = sorted.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Auto-Redirect Calculation (Citizen and Operator view):
  const nearestShelter = sorted[0];
  const isNearestCritical = nearestShelter && nearestShelter.status === 'RED';
  const nextViableShelter = isNearestCritical
    ? sorted.find((s) => s.id !== nearestShelter.id && s.status !== 'RED')
    : null;

  // Shelters with depleted inventory thresholds (for operator banner)
  const restockNeededShelters = isOperator
    ? filtered.filter(
        (s) =>
          (typeof s.waterLitersRemaining === 'number' && s.waterLitersRemaining < s.waterThreshold) ||
          (typeof s.rationsUnitsRemaining === 'number' && s.rationsUnitsRemaining < s.rationsThreshold) ||
          restockNotifications[s.id]
      )
    : [];

  const handleOpenAudit = (e, shelter) => {
    e.stopPropagation();
    setAuditingShelter(shelter);
    setAuditForm({
      currentOccupancy: shelter.currentOccupancy,
      capacity: shelter.capacity,
      waterOk: shelter.waterOk ?? true,
      rationsOk: shelter.rationsOk ?? true,
      restroomsOk: shelter.restroomsOk ?? true,
      powerOk: shelter.powerOk ?? true,
      waterLitersRemaining: shelter.waterLitersRemaining ?? 1000,
      waterThreshold: shelter.waterThreshold ?? 200,
      rationsUnitsRemaining: shelter.rationsUnitsRemaining ?? 200,
      rationsThreshold: shelter.rationsThreshold ?? 50,
    });
  };

  const handleSaveAudit = async (e) => {
    e.preventDefault();
    if (!auditingShelter || !auditForm) return;

    setSubmittingAudit(true);
    try {
      const res = await api.patch(`/shelters/${auditingShelter.id}/audit`, auditForm);
      if (onShelterUpdated) onShelterUpdated(res.data.shelter);
      setAuditingShelter(null);
      setAuditForm(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update shelter audit');
    } finally {
      setSubmittingAudit(false);
    }
  };

  const fetchEvents = async (shelterId) => {
    setLoadingEvents(true);
    try {
      const res = await api.get(`/shelters/${shelterId}/events`);
      setShelterEvents(res.data.events || []);
    } catch (err) {
      console.warn('Failed to load shelter events (may be offline):', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleOpenEvents = (e, shelter) => {
    e.stopPropagation();
    setEventShelter(shelter);
    setDeltaOccupancy(0);
    setDeltaWater(0);
    setDeltaRations(0);
    setEventReason('');
    setDeltaSuccessMsg('');
    fetchEvents(shelter.id);
  };

  const submitDeltaPayload = async (payload) => {
    setSubmittingDelta(true);
    setDeltaSuccessMsg('');

    const shouldQueue = isManualOffline() || (typeof navigator !== 'undefined' && !navigator.onLine);

    if (shouldQueue) {
      try {
        await enqueueAction({
          type: 'SHELTER_EVENT',
          endpoint: `/shelters/${payload.shelterId}/events`,
          payload,
        });

        // Optimistically apply delta to local shelter state
        const currentOcc = eventShelter.currentOccupancy || 0;
        const newOcc = Math.max(0, Math.min(eventShelter.capacity, currentOcc + (payload.deltaOccupancy || 0)));
        const newWater =
          eventShelter.waterLitersRemaining !== null
            ? Math.max(0, (eventShelter.waterLitersRemaining || 0) + (payload.deltaWaterLiters || 0))
            : null;
        const newRations =
          eventShelter.rationsUnitsRemaining !== null
            ? Math.max(0, (eventShelter.rationsUnitsRemaining || 0) + (payload.deltaRations || 0))
            : null;

        const updated = {
          ...eventShelter,
          currentOccupancy: newOcc,
          waterLitersRemaining: newWater,
          rationsUnitsRemaining: newRations,
        };

        if (onShelterUpdated) onShelterUpdated(updated);
        setEventShelter(updated);

        const syntheticEvent = {
          id: `local-${Date.now()}`,
          shelterId: payload.shelterId,
          deltaOccupancy: payload.deltaOccupancy,
          deltaWaterLiters: payload.deltaWaterLiters,
          deltaRations: payload.deltaRations,
          reason: `${payload.reason} (Stored in Local Offline Queue)`,
          operatorName: payload.operatorName,
          capturedAt: payload.capturedAt,
        };
        setShelterEvents((prev) => [syntheticEvent, ...prev]);
        setDeltaSuccessMsg('Delta recorded offline. Will commutatively merge on reconnect without overwriting other operators.');
        setDeltaOccupancy(0);
        setDeltaWater(0);
        setDeltaRations(0);
        setEventReason('');
      } catch (err) {
        console.error('Failed to queue delta event offline:', err);
      } finally {
        setSubmittingDelta(false);
      }
      return;
    }

    try {
      const res = await api.post(`/shelters/${payload.shelterId}/events`, payload);
      if (onShelterUpdated && res.data.shelter) {
        onShelterUpdated(res.data.shelter);
        setEventShelter(res.data.shelter);
      }
      if (res.data.event) {
        setShelterEvents((prev) => [res.data.event, ...prev]);
      }
      setDeltaSuccessMsg(res.data.message || 'Delta event recorded successfully');
      setDeltaOccupancy(0);
      setDeltaWater(0);
      setDeltaRations(0);
      setEventReason('');
    } catch (err) {
      console.warn('Direct delta update failed, falling back to offline queue:', err);
      try {
        await enqueueAction({
          type: 'SHELTER_EVENT',
          endpoint: `/shelters/${payload.shelterId}/events`,
          payload,
        });
        setDeltaSuccessMsg('Relay offline: Delta queued in IndexedDB for commutative sync.');
      } catch (queueErr) {
        alert(err.response?.data?.error || 'Failed to record delta event');
      }
    } finally {
      setSubmittingDelta(false);
    }
  };

  const handleQuickDelta = (dOcc, dWater, dRat, defaultReason) => {
    if (!eventShelter) return;
    submitDeltaPayload({
      shelterId: eventShelter.id,
      deltaOccupancy: dOcc,
      deltaWaterLiters: dWater,
      deltaRations: dRat,
      reason: eventReason.trim() || defaultReason,
      operatorName: user?.name || 'Field Operator',
      capturedAt: new Date().toISOString(),
    });
  };

  const handleCustomDeltaSubmit = (e) => {
    e.preventDefault();
    if (!eventShelter) return;
    const dOcc = parseInt(deltaOccupancy) || 0;
    const dWater = parseInt(deltaWater) || 0;
    const dRat = parseInt(deltaRations) || 0;
    if (dOcc === 0 && dWater === 0 && dRat === 0) {
      alert('Please enter at least one non-zero delta adjustment.');
      return;
    }
    submitDeltaPayload({
      shelterId: eventShelter.id,
      deltaOccupancy: dOcc,
      deltaWaterLiters: dWater,
      deltaRations: dRat,
      reason: eventReason.trim() || 'Custom field adjustment',
      operatorName: user?.name || 'Field Operator',
      capturedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="p-3 bg-[#EFECE4] border-b border-[#D8D3C7] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Home className="w-4 h-4 text-[#14231F]" />
          <h3 className="font-display font-bold text-sm text-[#14231F] uppercase tracking-tight">
            Emergency Shelters ({filtered.length})
          </h3>
        </div>
        <span className="text-[10px] font-mono text-[#14231F]/60">SORTED BY PROXIMITY</span>
      </div>

      {/* Auto-Redirect Alert Banner if nearest shelter is RED */}
      {isNearestCritical && nextViableShelter && (
        <div
          id="shelter-auto-redirect-banner"
          className="p-2.5 bg-[#B23A2E] text-white text-xs font-mono flex items-start gap-2 border-b border-black/20"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 animate-pulse mt-0.5" />
          <div className="flex-1">
            <div className="font-bold uppercase tracking-wide">
              NEAREST SHELTER ({nearestShelter.name}) IS AT CAPACITY / DEPLETED
            </div>
            <div className="text-[11px] text-white/95 mt-0.5 flex items-center gap-1">
              <span>Auto-Rerouting to nearest viable safe haven:</span>
              <button
                type="button"
                onClick={() => onSelectShelter && onSelectShelter(nextViableShelter)}
                className="underline font-bold hover:text-white flex items-center gap-0.5"
              >
                {nextViableShelter.name} ({nextViableShelter.distanceKm} km) <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OPERATIONAL RESTOCK NEEDED BANNER (Visible strictly to Volunteers & Admins, Decision 0.3) */}
      {isOperator && restockNeededShelters.length > 0 && (
        <div
          id="shelter-restock-alert-banner"
          className="p-2.5 bg-[#C97A2B]/15 border-b border-[#C97A2B] text-[#14231F] text-xs font-mono flex items-start gap-2 animate-fade-in"
        >
          <AlertTriangle className="w-4 h-4 text-[#C97A2B] flex-shrink-0 mt-0.5 animate-pulse" />
          <div className="flex-1">
            <div className="font-bold text-[#C97A2B] uppercase tracking-wide flex items-center justify-between">
              <span>LOGISTICAL ALERT // RESTOCK REQUIRED ({restockNeededShelters.length} SITES)</span>
              <span className="text-[9px] px-1 py-0.2 bg-[#C97A2B] text-white rounded font-bold">DISPATCH ONLY</span>
            </div>
            <div className="text-[10px] text-[#14231F]/90 mt-0.5 space-y-0.5">
              {restockNeededShelters.map((s) => (
                <div key={s.id}>
                  &bull; <span className="font-semibold">{s.name}</span>: Water{' '}
                  {s.waterLitersRemaining !== null ? `${s.waterLitersRemaining}L (min: ${s.waterThreshold}L)` : 'Depleted'} • Rations{' '}
                  {s.rationsUnitsRemaining !== null ? `${s.rationsUnitsRemaining} units (min: ${s.rationsThreshold})` : 'Low'}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter search bar */}
      <div className="p-2 border-b border-[#D8D3C7] bg-[#F6F4EF]">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#14231F]/40" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by area or shelter name..."
            className="w-full pl-8 pr-3 py-1.5 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-xs focus:outline-none focus:border-[#14231F]"
          />
        </div>
      </div>

      {/* Shelters List */}
      <div className="divide-y divide-[#D8D3C7] overflow-y-auto flex-1 max-h-[440px]">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#14231F]/60 font-mono">
            No emergency shelters found matching query.
          </div>
        ) : (
          filtered.map((shelter) => {
            const availableBeds = Math.max(0, shelter.capacity - shelter.currentOccupancy);
            const occupancyPct = Math.round((shelter.currentOccupancy / shelter.capacity) * 100);
            const statusColor =
              shelter.status === 'RED'
                ? 'bg-[#B23A2E] text-white'
                : shelter.status === 'YELLOW'
                ? 'bg-[#C97A2B] text-white'
                : 'bg-[#2E6E4E] text-white';

            const isWaterLow =
              typeof shelter.waterLitersRemaining === 'number'
                ? shelter.waterLitersRemaining < shelter.waterThreshold
                : !shelter.waterOk;

            const isRationsLow =
              typeof shelter.rationsUnitsRemaining === 'number'
                ? shelter.rationsUnitsRemaining < shelter.rationsThreshold
                : !shelter.rationsOk;

            return (
              <div
                key={shelter.id}
                className={`p-3.5 hover:bg-[#F6F4EF] transition-colors cursor-pointer space-y-2 ${
                  shelter.status === 'RED' ? 'bg-[#B23A2E]/5' : ''
                }`}
                onClick={() => onSelectShelter && onSelectShelter(shelter)}
              >
                {/* Name, Status & Distance */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold uppercase ${statusColor}`}>
                        {shelter.status}
                      </span>
                      <h4 className="font-display font-semibold text-xs sm:text-sm text-[#14231F]">
                        {shelter.name}
                      </h4>
                    </div>
                    <p className="text-[11px] text-[#14231F]/70 line-clamp-1 mt-0.5">{shelter.address}</p>
                  </div>

                  {shelter.distanceKm !== Infinity && (
                    <div className="flex items-center gap-1 font-mono text-xs text-[#14231F] bg-[#EFECE4] px-1.5 py-0.5 rounded border border-[#D8D3C7] flex-shrink-0">
                      <Navigation className="w-3 h-3 text-[#2E6E4E]" />
                      <span className="tabular-nums font-semibold">{shelter.distanceKm} km</span>
                    </div>
                  )}
                </div>

                {/* 5-Resource Compact Readiness Bar */}
                <div className="grid grid-cols-5 gap-1 pt-1 font-mono text-[10px]">
                  {/* Beds */}
                  <div
                    className={`p-1 rounded text-center border ${
                      occupancyPct >= 90
                        ? 'bg-[#B23A2E]/10 border-[#B23A2E] text-[#B23A2E]'
                        : 'bg-[#EFECE4] border-[#D8D3C7] text-[#14231F]'
                    }`}
                  >
                    <div className="font-bold">{availableBeds}</div>
                    <div className="text-[9px] opacity-70">Beds</div>
                  </div>

                  {/* Water */}
                  <div
                    className={`p-1 rounded text-center border ${
                      isWaterLow
                        ? 'bg-[#B23A2E]/10 border-[#B23A2E] text-[#B23A2E]'
                        : 'bg-[#2E6E4E]/10 border-[#2E6E4E] text-[#2E6E4E]'
                    }`}
                  >
                    <div className="font-bold">
                      {isWaterLow ? 'LOW' : 'OK'}
                    </div>
                    <div className="text-[9px] opacity-70">
                      {isOperator && shelter.waterLitersRemaining !== null
                        ? `${shelter.waterLitersRemaining}L`
                        : 'Water'}
                    </div>
                  </div>

                  {/* Rations */}
                  <div
                    className={`p-1 rounded text-center border ${
                      isRationsLow
                        ? 'bg-[#B23A2E]/10 border-[#B23A2E] text-[#B23A2E]'
                        : 'bg-[#2E6E4E]/10 border-[#2E6E4E] text-[#2E6E4E]'
                    }`}
                  >
                    <div className="font-bold">
                      {isRationsLow ? 'LOW' : 'OK'}
                    </div>
                    <div className="text-[9px] opacity-70">
                      {isOperator && shelter.rationsUnitsRemaining !== null
                        ? `${shelter.rationsUnitsRemaining}u`
                        : 'Food'}
                    </div>
                  </div>

                  {/* Restrooms */}
                  <div
                    className={`p-1 rounded text-center border ${
                      shelter.restroomsOk
                        ? 'bg-[#2E6E4E]/10 border-[#2E6E4E] text-[#2E6E4E]'
                        : 'bg-[#B23A2E]/10 border-[#B23A2E] text-[#B23A2E]'
                    }`}
                  >
                    <div className="font-bold">{shelter.restroomsOk ? 'OK' : 'ISSUE'}</div>
                    <div className="text-[9px] opacity-70">Sanitation</div>
                  </div>

                  {/* Power */}
                  <div
                    className={`p-1 rounded text-center border ${
                      shelter.powerOk
                        ? 'bg-[#2E6E4E]/10 border-[#2E6E4E] text-[#2E6E4E]'
                        : 'bg-[#B23A2E]/10 border-[#B23A2E] text-[#B23A2E]'
                    }`}
                  >
                    <div className="font-bold">{shelter.powerOk ? 'OK' : 'OUT'}</div>
                    <div className="text-[9px] opacity-70">Power</div>
                  </div>
                </div>

                {/* Capacity breakdown & Actions */}
                {(() => {
                  let capacityLabel = 'Open floor space';
                  let capacityBadgeClass = 'text-[#2E6E4E] bg-[#2E6E4E]/10 border-[#2E6E4E]/30';
                  if (occupancyPct >= 90) {
                    capacityLabel = 'Full – divert arrivals';
                    capacityBadgeClass = 'text-[#B23A2E] bg-[#B23A2E]/10 border-[#B23A2E]/30 font-bold animate-pulse';
                  } else if (occupancyPct >= 70) {
                    capacityLabel = 'Packed – seating only';
                    capacityBadgeClass = 'text-[#C97A2B] bg-[#C97A2B]/10 border-[#C97A2B]/30';
                  }

                  return (
                    <div className="flex items-center justify-between text-[11px] font-mono pt-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[#14231F]/80">
                          {shelter.currentOccupancy}/{shelter.capacity} ({occupancyPct}%)
                        </span>
                        <span className={`px-1.5 py-0.2 rounded border text-[9px] font-bold uppercase ${capacityBadgeClass}`}>
                          {capacityLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingSuppliesShelter(shelter);
                          }}
                          className="px-2 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] text-[#14231F] rounded border border-[#D8D3C7] flex items-center gap-1 text-[10px]"
                          title="Manage relief supplies and shipments"
                        >
                          <Package className="w-3 h-3 text-[#2E6E4E]" />
                          <span>Supplies</span>
                        </button>

                        {isOperator && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => handleOpenEvents(e, shelter)}
                              className="px-2 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] text-[#14231F] rounded border border-[#D8D3C7] flex items-center gap-1 text-[10px]"
                              title="Commutative Flow & Delta Log"
                            >
                              <ArrowUpDown className="w-3 h-3 text-[#2E6E4E]" />
                              <span>Flow / Deltas</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => handleOpenAudit(e, shelter)}
                              className="px-2 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] text-[#14231F] rounded border border-[#D8D3C7] flex items-center gap-1 text-[10px]"
                              title="Audit readiness & inventory"
                            >
                              <Sliders className="w-3 h-3 text-[#C97A2B]" />
                              <span>Audit</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })
        )}
      </div>

      {/* Operator Audit Modal with Numeric Inputs (Decision 0.4) */}
      {auditingShelter && auditForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-[#D8D3C7] max-w-lg w-full p-4 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-display font-bold text-sm text-[#14231F] flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-[#C97A2B]" />
                Audit Readiness // {auditingShelter.name}
              </h3>
              <button onClick={() => setAuditingShelter(null)} className="text-gray-400 hover:text-black">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAudit} className="mt-3 space-y-3 font-mono text-xs">
              {/* Occupancy Adjustment */}
              <div>
                <label className="block uppercase text-[#14231F]/80 mb-1">
                  Current Occupancy ({auditForm.currentOccupancy} / {auditForm.capacity} beds)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAuditForm({ ...auditForm, currentOccupancy: Math.max(0, auditForm.currentOccupancy - 20) })
                    }
                    className="px-3 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] rounded border border-[#D8D3C7] font-bold"
                  >
                    -20
                  </button>
                  <input
                    type="range"
                    min="0"
                    max={auditForm.capacity}
                    value={auditForm.currentOccupancy}
                    onChange={(e) => setAuditForm({ ...auditForm, currentOccupancy: parseInt(e.target.value) })}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setAuditForm({
                        ...auditForm,
                        currentOccupancy: Math.min(auditForm.capacity, auditForm.currentOccupancy + 20),
                      })
                    }
                    className="px-3 py-1 bg-[#14231F] text-white hover:bg-black rounded font-bold"
                  >
                    +20
                  </button>
                </div>
                <div className="text-[10px] text-[#14231F]/60 mt-1">
                  Notice: crossing 90% ({Math.round(auditForm.capacity * 0.9)} beds) flips shelter status to RED.
                </div>
              </div>

              {/* Numeric Inventory Thresholds (Decision 0.4) */}
              <div className="space-y-2 pt-2 border-t border-[#D8D3C7]">
                <div className="text-[11px] font-bold uppercase text-[#14231F] flex items-center justify-between">
                  <span>Numeric Inventory Levels</span>
                  <span className="text-[9px] text-[#C97A2B]">Threshold breach auto-flags RED & alerts units</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-[#F6F4EF] rounded border border-[#D8D3C7] space-y-1">
                    <label className="block text-[10px] font-bold text-[#14231F] flex items-center gap-1">
                      <Droplets className="w-3 h-3 text-[#2E6E4E]" /> Water Remaining (Liters)
                    </label>
                    <input
                      type="number"
                      value={auditForm.waterLitersRemaining ?? ''}
                      onChange={(e) =>
                        setAuditForm({
                          ...auditForm,
                          waterLitersRemaining: e.target.value === '' ? null : parseInt(e.target.value),
                        })
                      }
                      className="w-full p-1 bg-white border border-[#D8D3C7] rounded text-xs font-bold"
                      placeholder="e.g. 1200"
                    />
                    <div className="text-[9px] text-[#14231F]/60 flex justify-between">
                      <span>Threshold:</span>
                      <span className="font-bold">{auditForm.waterThreshold}L</span>
                    </div>
                  </div>

                  <div className="p-2 bg-[#F6F4EF] rounded border border-[#D8D3C7] space-y-1">
                    <label className="block text-[10px] font-bold text-[#14231F] flex items-center gap-1">
                      <Utensils className="w-3 h-3 text-[#C97A2B]" /> Rations Remaining (Units)
                    </label>
                    <input
                      type="number"
                      value={auditForm.rationsUnitsRemaining ?? ''}
                      onChange={(e) =>
                        setAuditForm({
                          ...auditForm,
                          rationsUnitsRemaining: e.target.value === '' ? null : parseInt(e.target.value),
                        })
                      }
                      className="w-full p-1 bg-white border border-[#D8D3C7] rounded text-xs font-bold"
                      placeholder="e.g. 300"
                    />
                    <div className="text-[9px] text-[#14231F]/60 flex justify-between">
                      <span>Threshold:</span>
                      <span className="font-bold">{auditForm.rationsThreshold} units</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4 Critical Resource Quick Toggles */}
              <div className="space-y-1.5 pt-2 border-t border-[#D8D3C7]">
                <div className="text-[11px] font-bold uppercase text-[#14231F]">Resource Availability Toggles</div>

                {[
                  { key: 'waterOk', label: 'Potable Drinking Water Functional', critical: true },
                  { key: 'rationsOk', label: 'Food Rations & Stockpiles Functional', critical: true },
                  { key: 'restroomsOk', label: 'Functional Sanitation / Restrooms', critical: false },
                  { key: 'powerOk', label: 'Electricity / Generator Operational', critical: false },
                ].map(({ key, label, critical }) => {
                  const isOk = auditForm[key];
                  return (
                    <div
                      key={key}
                      onClick={() => setAuditForm({ ...auditForm, [key]: !isOk })}
                      className={`p-1.5 rounded border cursor-pointer flex items-center justify-between transition-colors ${
                        isOk ? 'bg-[#2E6E4E]/10 border-[#2E6E4E] text-[#2E6E4E]' : 'bg-[#B23A2E]/10 border-[#B23A2E] text-[#B23A2E]'
                      }`}
                    >
                      <span className="font-semibold text-[10px] flex items-center gap-1">
                        {isOk ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        {label} {critical && <span className="text-[9px] uppercase font-bold">(Critical)</span>}
                      </span>
                      <span className="font-bold uppercase text-[9px]">{isOk ? 'FUNCTIONAL' : 'DEPLETED'}</span>
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#D8D3C7]">
                <button
                  type="button"
                  onClick={() => setAuditingShelter(null)}
                  className="px-3 py-1 text-xs text-[#14231F]/70"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAudit}
                  className="px-4 py-1.5 bg-[#14231F] hover:bg-black text-white font-display font-bold text-xs rounded"
                >
                  {submittingAudit ? 'Saving...' : 'APPLY GROUND AUDIT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Commutative Flow & Delta Log Modal (Step 2 - Eliminating LWW conflict) */}
      {eventShelter && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-[#D8D3C7] max-w-xl w-full p-5 max-h-[90vh] overflow-y-auto shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-display font-bold text-sm text-[#14231F] flex items-center gap-1.5 uppercase">
                  <ArrowUpDown className="w-4 h-4 text-[#2E6E4E]" />
                  Commutative Delta Flow // {eventShelter.name}
                </h3>
                <p className="text-[10px] font-mono text-[#14231F]/70 mt-0.5">
                  Multi-operator commutative sync: records delta increments/decrements (+/-) rather than absolute overwrites.
                </p>
              </div>
              <button
                onClick={() => setEventShelter(null)}
                className="text-gray-400 hover:text-black font-mono text-xs px-2 py-1 bg-[#EFECE4] rounded"
              >
                ✕ ESC
              </button>
            </div>

            {/* Current Shelter State Banner */}
            <div className="p-3 bg-[#F6F4EF] rounded border border-[#D8D3C7] grid grid-cols-3 gap-2 text-center font-mono text-xs">
              <div>
                <div className="text-[10px] text-[#14231F]/60 uppercase">Current Beds</div>
                <div className="font-bold text-sm text-[#14231F]">
                  {eventShelter.currentOccupancy} / {eventShelter.capacity}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#14231F]/60 uppercase">Water Level</div>
                <div className="font-bold text-sm text-[#14231F]">
                  {eventShelter.waterLitersRemaining !== null ? `${eventShelter.waterLitersRemaining}L` : 'Unmetered'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#14231F]/60 uppercase">Rations Stock</div>
                <div className="font-bold text-sm text-[#14231F]">
                  {eventShelter.rationsUnitsRemaining !== null ? `${eventShelter.rationsUnitsRemaining} units` : 'Unmetered'}
                </div>
              </div>
            </div>

            {deltaSuccessMsg && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded text-xs font-mono flex items-center gap-2 animate-fade-in">
                <Check className="w-4 h-4 flex-shrink-0" />
                <span>{deltaSuccessMsg}</span>
              </div>
            )}

            {/* Quick Commutative Action Buttons */}
            <div>
              <label className="block text-[11px] font-mono uppercase font-bold text-[#14231F]/80 mb-1.5">
                Quick Commutative Dispatch (Single Click)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs">
                <button
                  type="button"
                  disabled={submittingDelta}
                  onClick={() => handleQuickDelta(10, 0, 0, '10 civilian arrivals logged')}
                  className="p-2 bg-[#EFECE4] hover:bg-[#D8D3C7] border border-[#D8D3C7] rounded font-bold flex items-center justify-center gap-1 text-[#14231F]"
                >
                  <Plus className="w-3.5 h-3.5 text-[#2E6E4E]" /> +10 Arrivals
                </button>
                <button
                  type="button"
                  disabled={submittingDelta}
                  onClick={() => handleQuickDelta(25, 0, 0, 'Bus evacuation arrival (+25)')}
                  className="p-2 bg-[#EFECE4] hover:bg-[#D8D3C7] border border-[#D8D3C7] rounded font-bold flex items-center justify-center gap-1 text-[#14231F]"
                >
                  <Plus className="w-3.5 h-3.5 text-[#2E6E4E]" /> +25 Bus Drop
                </button>
                <button
                  type="button"
                  disabled={submittingDelta}
                  onClick={() => handleQuickDelta(-10, 0, 0, '10 evacuees departed/transferred')}
                  className="p-2 bg-[#EFECE4] hover:bg-[#D8D3C7] border border-[#D8D3C7] rounded font-bold flex items-center justify-center gap-1 text-[#14231F]"
                >
                  <Minus className="w-3.5 h-3.5 text-[#B23A2E]" /> -10 Departed
                </button>
                <button
                  type="button"
                  disabled={submittingDelta}
                  onClick={() => handleQuickDelta(0, 200, 0, 'Water tanker replenishment (+200L)')}
                  className="p-2 bg-[#EFECE4] hover:bg-[#D8D3C7] border border-[#D8D3C7] rounded font-bold flex items-center justify-center gap-1 text-[#14231F]"
                >
                  <Droplets className="w-3.5 h-3.5 text-blue-600" /> +200L Water
                </button>
                <button
                  type="button"
                  disabled={submittingDelta}
                  onClick={() => handleQuickDelta(0, 0, 50, 'Emergency ration shipment (+50u)')}
                  className="p-2 bg-[#EFECE4] hover:bg-[#D8D3C7] border border-[#D8D3C7] rounded font-bold flex items-center justify-center gap-1 text-[#14231F]"
                >
                  <Utensils className="w-3.5 h-3.5 text-amber-600" /> +50 Rations
                </button>
                <button
                  type="button"
                  disabled={submittingDelta}
                  onClick={() => handleQuickDelta(-20, 0, 0, 'Evacuee medical transfer (-20)')}
                  className="p-2 bg-[#EFECE4] hover:bg-[#D8D3C7] border border-[#D8D3C7] rounded font-bold flex items-center justify-center gap-1 text-[#14231F]"
                >
                  <Minus className="w-3.5 h-3.5 text-[#B23A2E]" /> -20 Transfer
                </button>
              </div>
            </div>

            {/* Custom Delta Form */}
            <form onSubmit={handleCustomDeltaSubmit} className="pt-3 border-t border-[#D8D3C7] space-y-2 font-mono text-xs">
              <label className="block text-[11px] uppercase font-bold text-[#14231F]/80">
                Custom Delta Entry
              </label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-[#14231F]/70 block mb-0.5">Δ Occupancy (+/-)</label>
                  <input
                    type="number"
                    value={deltaOccupancy}
                    onChange={(e) => setDeltaOccupancy(e.target.value)}
                    placeholder="e.g. +15 or -8"
                    className="w-full p-1.5 bg-[#F6F4EF] border border-[#D8D3C7] rounded text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#14231F]/70 block mb-0.5">Δ Water Liters (+/-)</label>
                  <input
                    type="number"
                    value={deltaWater}
                    onChange={(e) => setDeltaWater(e.target.value)}
                    placeholder="e.g. +300"
                    className="w-full p-1.5 bg-[#F6F4EF] border border-[#D8D3C7] rounded text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#14231F]/70 block mb-0.5">Δ Rations Units (+/-)</label>
                  <input
                    type="number"
                    value={deltaRations}
                    onChange={(e) => setDeltaRations(e.target.value)}
                    placeholder="e.g. +100"
                    className="w-full p-1.5 bg-[#F6F4EF] border border-[#D8D3C7] rounded text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-[#14231F]/70 block mb-0.5">Reason / Operational Log</label>
                <input
                  type="text"
                  value={eventReason}
                  onChange={(e) => setEventReason(e.target.value)}
                  placeholder="e.g. Sector 9 relief convoy arrival"
                  className="w-full p-1.5 bg-[#F6F4EF] border border-[#D8D3C7] rounded text-xs"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submittingDelta}
                  className="px-4 py-1.5 bg-[#14231F] hover:bg-black text-white font-display font-bold text-xs rounded uppercase flex items-center gap-1.5"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>{submittingDelta ? 'Syncing...' : 'Record Commutative Delta'}</span>
                </button>
              </div>
            </form>

            {/* Commutative Event Log Stream */}
            <div className="pt-3 border-t border-[#D8D3C7] font-mono">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase text-[#14231F] flex items-center gap-1">
                  <History className="w-3.5 h-3.5 text-[#C97A2B]" />
                  Event History Log ({shelterEvents.length})
                </span>
                <span className="text-[10px] text-[#14231F]/60">LATEST AUDIT TRAIL</span>
              </div>

              {loadingEvents ? (
                <div className="text-center py-4 text-xs text-[#14231F]/60">Loading events...</div>
              ) : shelterEvents.length === 0 ? (
                <div className="text-center py-4 text-xs text-[#14231F]/50 bg-[#F6F4EF] rounded border border-[#D8D3C7]">
                  No delta events recorded yet for this shelter.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto divide-y divide-[#D8D3C7]/40">
                  {shelterEvents.map((evt) => (
                    <div key={evt.id} className="pt-1.5 first:pt-0 flex items-start justify-between text-[11px]">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          {evt.deltaOccupancy !== 0 && (
                            <span
                              className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${
                                evt.deltaOccupancy > 0
                                  ? 'bg-[#2E6E4E]/10 text-[#2E6E4E]'
                                  : 'bg-[#B23A2E]/10 text-[#B23A2E]'
                              }`}
                            >
                              {evt.deltaOccupancy > 0 ? `+${evt.deltaOccupancy}` : evt.deltaOccupancy} Occupancy
                            </span>
                          )}
                          {evt.deltaWaterLiters !== 0 && (
                            <span className="px-1.5 py-0.2 rounded font-bold text-[10px] bg-blue-50 text-blue-800">
                              {evt.deltaWaterLiters > 0 ? `+${evt.deltaWaterLiters}` : evt.deltaWaterLiters}L Water
                            </span>
                          )}
                          {evt.deltaRations !== 0 && (
                            <span className="px-1.5 py-0.2 rounded font-bold text-[10px] bg-amber-50 text-amber-800">
                              {evt.deltaRations > 0 ? `+${evt.deltaRations}` : evt.deltaRations}u Rations
                            </span>
                          )}
                          <span className="text-[#14231F]/60 text-[10px]">&bull; {evt.operatorName}</span>
                        </div>
                        <p className="text-[10px] text-[#14231F]/80 italic">{evt.reason}</p>
                      </div>
                      <span className="text-[10px] text-[#14231F]/50 whitespace-nowrap pl-2">
                        {evt.capturedAt ? new Date(evt.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Shelter Supplies & Shipments Modal */}
      <ShelterSuppliesModal
        isOpen={Boolean(viewingSuppliesShelter)}
        onClose={() => setViewingSuppliesShelter(null)}
        shelter={viewingSuppliesShelter}
      />
    </div>
  );
}
