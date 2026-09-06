import React, { useState } from 'react';
import { sortSheltersByDistance } from '../services/haversine';
import { Home, Phone, Navigation, Search, AlertTriangle, ShieldCheck, Check, X, Sliders, ArrowRight, Package } from 'lucide-react';
import ShelterSuppliesModal from './ShelterSuppliesModal';
import api from '../services/api';

export default function ShelterList({
  shelters = [],
  userCoords,
  onSelectShelter,
  onShelterUpdated,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [auditingShelter, setAuditingShelter] = useState(null);
  const [auditForm, setAuditForm] = useState(null);
  const [submittingAudit, setSubmittingAudit] = useState(false);
  const [viewingSuppliesShelter, setViewingSuppliesShelter] = useState(null);

  const sorted = sortSheltersByDistance(
    shelters,
    userCoords?.lat ?? 19.0760,
    userCoords?.lng ?? 72.8777
  );

  const filtered = sorted.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Auto-Redirect Calculation:
  // If nearest shelter is RED (depleted or full), find next nearest viable GREEN/YELLOW shelter
  const nearestShelter = sorted[0];
  const isNearestCritical = nearestShelter && nearestShelter.status === 'RED';
  const nextViableShelter = isNearestCritical
    ? sorted.find((s) => s.id !== nearestShelter.id && s.status !== 'RED')
    : null;

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
            const isFull = shelter.currentOccupancy >= shelter.capacity;
            const availableBeds = Math.max(0, shelter.capacity - shelter.currentOccupancy);
            const occupancyPct = Math.round((shelter.currentOccupancy / shelter.capacity) * 100);
            const statusColor =
              shelter.status === 'RED'
                ? 'bg-[#B23A2E] text-white'
                : shelter.status === 'YELLOW'
                ? 'bg-[#C97A2B] text-white'
                : 'bg-[#2E6E4E] text-white';

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

                {/* 5-Resource Compact Readiness Bar per design.md */}
                <div className="grid grid-cols-5 gap-1 pt-1 font-mono text-[10px]">
                  {/* Beds */}
                  <div className={`p-1 rounded text-center border ${
                    occupancyPct >= 90 ? 'bg-[#B23A2E]/10 border-[#B23A2E] text-[#B23A2E]' : 'bg-[#EFECE4] border-[#D8D3C7] text-[#14231F]'
                  }`}>
                    <div className="font-bold">{availableBeds}</div>
                    <div className="text-[9px] opacity-70">Beds</div>
                  </div>

                  {/* Water */}
                  <div className={`p-1 rounded text-center border ${
                    shelter.waterOk ? 'bg-[#2E6E4E]/10 border-[#2E6E4E] text-[#2E6E4E]' : 'bg-[#B23A2E]/10 border-[#B23A2E] text-[#B23A2E]'
                  }`}>
                    <div className="font-bold">{shelter.waterOk ? 'OK' : 'DEPLETED'}</div>
                    <div className="text-[9px] opacity-70">Water</div>
                  </div>

                  {/* Rations */}
                  <div className={`p-1 rounded text-center border ${
                    shelter.rationsOk ? 'bg-[#2E6E4E]/10 border-[#2E6E4E] text-[#2E6E4E]' : 'bg-[#B23A2E]/10 border-[#B23A2E] text-[#B23A2E]'
                  }`}>
                    <div className="font-bold">{shelter.rationsOk ? 'OK' : 'LOW'}</div>
                    <div className="text-[9px] opacity-70">Food</div>
                  </div>

                  {/* Restrooms */}
                  <div className={`p-1 rounded text-center border ${
                    shelter.restroomsOk ? 'bg-[#2E6E4E]/10 border-[#2E6E4E] text-[#2E6E4E]' : 'bg-[#B23A2E]/10 border-[#B23A2E] text-[#B23A2E]'
                  }`}>
                    <div className="font-bold">{shelter.restroomsOk ? 'OK' : 'ISSUE'}</div>
                    <div className="text-[9px] opacity-70">Sanitation</div>
                  </div>

                  {/* Power */}
                  <div className={`p-1 rounded text-center border ${
                    shelter.powerOk ? 'bg-[#2E6E4E]/10 border-[#2E6E4E] text-[#2E6E4E]' : 'bg-[#B23A2E]/10 border-[#B23A2E] text-[#B23A2E]'
                  }`}>
                    <div className="font-bold">{shelter.powerOk ? 'OK' : 'OUT'}</div>
                    <div className="text-[9px] opacity-70">Power</div>
                  </div>
                </div>

                {/* Capacity breakdown & Actions per Item 1.5 */}
                {(() => {
                  let capacityLabel = 'Open floor space';
                  let capacityBadgeClass = 'text-[#2E6E4E] bg-[#2E6E4E]/10 border-[#2E6E4E]/30';
                  if (occupancyPct >= 90) {
                    capacityLabel = 'Full – divert arrivals';
                    capacityBadgeClass = 'text-[#B23A2E] bg-[#B23A2E]/10 border-[#B23A2E]/30 font-bold animate-pulse';
                  } else if (occupancyPct >= 70) {
                    capacityLabel = 'Packed – seating only';
                    capacityBadgeClass = 'text-[#C97A2B] bg-[#C97A2B]/10 border-[#C97A2B]/30 font-semibold';
                  }

                  return (
                    <div className="flex items-center justify-between gap-2 text-xs pt-1 border-t border-[#D8D3C7]/40 flex-wrap">
                      <div className="font-mono tabular-nums text-[11px] text-[#14231F]/80 flex items-center gap-1.5">
                        <span>{shelter.currentOccupancy} / {shelter.capacity} ({occupancyPct}%)</span>
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] ${capacityBadgeClass}`}>
                          {capacityLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {shelter.contact && (
                          <a
                            href={`tel:${shelter.contact}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-[11px] font-mono text-[#14231F] hover:underline"
                          >
                            <Phone className="w-3 h-3 text-[#14231F]/60" />
                            <span>{shelter.contact}</span>
                          </a>
                        )}

                        <button
                          type="button"
                          id={`supplies-shelter-btn-${shelter.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingSuppliesShelter(shelter);
                          }}
                          className="px-2 py-0.5 bg-[#EFECE4] hover:bg-[#D8D3C7] text-[#14231F] border border-[#D8D3C7] rounded font-mono text-[10px] flex items-center gap-1"
                          title="View relief supply-demand gap"
                        >
                          <Package className="w-3 h-3 text-[#2E6E4E]" /> Supplies
                        </button>

                        <button
                          type="button"
                          id={`audit-shelter-btn-${shelter.id}`}
                          onClick={(e) => handleOpenAudit(e, shelter)}
                          className="px-2 py-0.5 bg-[#EFECE4] hover:bg-[#D8D3C7] text-[#14231F] border border-[#D8D3C7] rounded font-mono text-[10px] flex items-center gap-1"
                        >
                          <Sliders className="w-3 h-3" /> Audit
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })
        )}
      </div>

      {/* Shelter Audit Modal */}
      {auditingShelter && auditForm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded max-w-md w-full p-5 shadow-xl text-[#14231F]">
            <div className="flex items-center justify-between pb-2 border-b border-[#D8D3C7]">
              <div>
                <h3 className="font-display font-bold text-sm uppercase">
                  Shelter Readiness Audit // {auditingShelter.name}
                </h3>
                <p className="text-[11px] font-mono text-[#14231F]/60">Ground-truth toggle & capacity adjustments</p>
              </div>
              <button
                type="button"
                onClick={() => setAuditingShelter(null)}
                className="p-1 bg-[#EFECE4] rounded text-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAudit} className="mt-4 space-y-3 font-mono text-xs">
              {/* Occupancy Adjustment */}
              <div>
                <label className="block uppercase text-[#14231F]/80 mb-1">
                  Current Occupancy ({auditForm.currentOccupancy} / {auditForm.capacity} beds)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAuditForm({ ...auditForm, currentOccupancy: Math.max(0, auditForm.currentOccupancy - 20) })}
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
                    onClick={() => setAuditForm({ ...auditForm, currentOccupancy: Math.min(auditForm.capacity, auditForm.currentOccupancy + 20) })}
                    className="px-3 py-1 bg-[#14231F] text-white hover:bg-black rounded font-bold"
                  >
                    +20
                  </button>
                </div>
                <div className="text-[10px] text-[#14231F]/60 mt-1">
                  Notice: crossing 90% ({Math.round(auditForm.capacity * 0.9)} beds) flips shelter to RED.
                </div>
              </div>

              {/* 4 Critical Resource Toggles */}
              <div className="space-y-2 pt-2 border-t border-[#D8D3C7]">
                <div className="text-[11px] font-bold uppercase text-[#14231F]">Resource Availability</div>

                {[
                  { key: 'waterOk', label: 'Potable Drinking Water Available', critical: true },
                  { key: 'rationsOk', label: 'Food Rations & Supplies Available', critical: true },
                  { key: 'restroomsOk', label: 'Functional Sanitation / Restrooms', critical: false },
                  { key: 'powerOk', label: 'Electricity / Backup Generator', critical: false },
                ].map(({ key, label, critical }) => {
                  const isOk = auditForm[key];
                  return (
                    <div
                      key={key}
                      onClick={() => setAuditForm({ ...auditForm, [key]: !isOk })}
                      className={`p-2 rounded border cursor-pointer flex items-center justify-between transition-colors ${
                        isOk
                          ? 'bg-[#2E6E4E]/10 border-[#2E6E4E] text-[#2E6E4E]'
                          : 'bg-[#B23A2E]/10 border-[#B23A2E] text-[#B23A2E]'
                      }`}
                    >
                      <span className="font-semibold text-[11px] flex items-center gap-1.5">
                        {isOk ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        {label} {critical && <span className="text-[9px] uppercase font-bold">(Critical)</span>}
                      </span>
                      <span className="font-bold uppercase text-[10px]">
                        {isOk ? 'FUNCTIONAL' : 'DEPLETED'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#D8D3C7]">
                <button
                  type="button"
                  onClick={() => setAuditingShelter(null)}
                  className="px-3 py-1.5 text-xs text-[#14231F]/70"
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

      {/* Shelter Supplies Modal */}
      <ShelterSuppliesModal
        isOpen={Boolean(viewingSuppliesShelter)}
        onClose={() => setViewingSuppliesShelter(null)}
        shelter={viewingSuppliesShelter}
      />
    </div>
  );
}
