import React, { useState } from 'react';
import { Home, Package, Droplets, Utensils, HeartPulse, Bed, ShieldAlert, Clock, ArrowUpRight, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import api from '../services/api';

/**
 * Field Shelter Store & Inventory module for Volunteers (Issue 2)
 *
 * Color tokens strictly adhere to design system:
 * - Normal/OK: --earth (#EFECE4 / neutral text, no green emphasis)
 * - Low/Warning: --signal-amber (#C97A2B)
 * - Critical Shortage: --alert-red (#B23A2E)
 */
export default function VolunteerShelterStore({
  shelters = [],
  currentVolunteer,
  onShelterUpdated,
}) {
  const [selectedShelterId, setSelectedShelterId] = useState(
    shelters[0]?.id || 101
  );
  const [updatingField, setUpdatingField] = useState(null);

  const activeShelter = shelters.find((s) => s.id === Number(selectedShelterId)) || shelters[0];

  if (!activeShelter) {
    return (
      <div className="bg-white border border-[#D8D3C7] rounded p-6 text-center font-mono text-xs text-[#14231F]/60">
        No shelters loaded in tactical grid.
      </div>
    );
  }

  const freeBeds = Math.max(0, activeShelter.capacity - activeShelter.currentOccupancy);
  const occupancyPct = Math.min(100, Math.round((activeShelter.currentOccupancy / activeShelter.capacity) * 100));

  // Determine supply statuses
  const waterRemaining = activeShelter.waterLitersRemaining ?? 0;
  const waterThreshold = activeShelter.waterThreshold ?? 200;
  const waterStatus = waterRemaining < waterThreshold ? 'CRITICAL' : waterRemaining < waterThreshold * 1.5 ? 'LOW' : 'OK';

  const rationsRemaining = activeShelter.rationsUnitsRemaining ?? 0;
  const rationsThreshold = activeShelter.rationsThreshold ?? 50;
  const rationsStatus = rationsRemaining < rationsThreshold ? 'CRITICAL' : rationsRemaining < rationsThreshold * 1.5 ? 'LOW' : 'OK';

  const medicalRemaining = activeShelter.medicalKitsRemaining ?? 25;
  const medicalThreshold = activeShelter.medicalThreshold ?? 10;
  const medicalStatus = medicalRemaining < medicalThreshold ? 'CRITICAL' : medicalRemaining < medicalThreshold * 1.5 ? 'LOW' : 'OK';

  const blanketsRemaining = activeShelter.blanketsRemaining ?? 120;
  const blanketsThreshold = activeShelter.blanketsThreshold ?? 30;
  const blanketsStatus = blanketsRemaining < blanketsThreshold ? 'CRITICAL' : blanketsRemaining < blanketsThreshold * 1.5 ? 'LOW' : 'OK';

  // "What's Lacking" Deficit items
  const deficits = [];
  if (waterStatus === 'CRITICAL') deficits.push({ item: 'Water', status: 'CRITICAL', note: `${waterRemaining}L remaining (min ${waterThreshold}L)` });
  else if (waterStatus === 'LOW') deficits.push({ item: 'Water', status: 'LOW', note: `${waterRemaining}L remaining` });

  if (rationsStatus === 'CRITICAL') deficits.push({ item: 'Rations', status: 'CRITICAL', note: `${rationsRemaining} units (min ${rationsThreshold})` });
  else if (rationsStatus === 'LOW') deficits.push({ item: 'Rations', status: 'LOW', note: `${rationsRemaining} units` });

  if (medicalStatus === 'CRITICAL') deficits.push({ item: 'Medical Kits', status: 'CRITICAL', note: `${medicalRemaining} kits (min ${medicalThreshold})` });
  else if (medicalStatus === 'LOW') deficits.push({ item: 'Medical Kits', status: 'LOW', note: `${medicalRemaining} kits` });

  if (blanketsStatus === 'CRITICAL') deficits.push({ item: 'Blankets', status: 'CRITICAL', note: `${blanketsRemaining} pcs (min ${blanketsThreshold})` });
  else if (blanketsStatus === 'LOW') deficits.push({ item: 'Blankets', status: 'LOW', note: `${blanketsRemaining} pcs` });

  if (freeBeds === 0) deficits.push({ item: 'Bed Capacity', status: 'CRITICAL', note: 'Shelter is 100% at capacity' });
  else if (occupancyPct >= 85) deficits.push({ item: 'Bed Capacity', status: 'LOW', note: `Only ${freeBeds} beds remaining` });

  // Format last updated
  const lastAudited = activeShelter.lastAuditedAt ? new Date(activeShelter.lastAuditedAt) : null;
  const timeAgoStr = lastAudited
    ? `${Math.max(1, Math.round((Date.now() - lastAudited.getTime()) / 60000))}m ago`
    : 'Recently';

  // 1-Tap Delta Adjustment Handler
  const handleDelta = async (deltaPayload, fieldKey) => {
    setUpdatingField(fieldKey);
    try {
      const res = await api.post(`/shelters/${activeShelter.id}/events`, {
        ...deltaPayload,
        reason: 'Volunteer field store update',
        operatorName: currentVolunteer?.name || 'Field Volunteer',
      });

      if (res.data.shelter && onShelterUpdated) {
        onShelterUpdated(res.data.shelter);
      }
    } catch (err) {
      console.error('Failed to update shelter inventory:', err);
      alert(err.response?.data?.error || 'Failed to apply inventory delta.');
    } finally {
      setUpdatingField(null);
    }
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded p-4 space-y-4 shadow-xs">
      {/* Module Header & Shelter Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#D8D3C7]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-[#14231F] text-[#F6F4EF] flex items-center justify-center font-mono font-bold">
            <Package className="w-4 h-4 text-[#F6F4EF]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-sm sm:text-base text-[#14231F] uppercase tracking-tight">
                Field Shelter Store & Inventory
              </h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#EFECE4] border border-[#D8D3C7] text-[#14231F]/80 rounded font-semibold">
                1-TAP LOGISTICS
              </span>
            </div>
            <p className="text-[11px] text-[#14231F]/60 font-mono mt-0.5">
              Field-level stock management • Audit verified {timeAgoStr}
            </p>
          </div>
        </div>

        {/* Assigned Shelter Switcher */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <label className="text-[#14231F]/70 text-[11px] uppercase font-semibold">Assigned Shelter:</label>
          <select
            id="volunteer-assigned-shelter-select"
            value={selectedShelterId}
            onChange={(e) => setSelectedShelterId(Number(e.target.value))}
            className="p-1.5 bg-[#EFECE4] border border-[#D8D3C7] rounded text-xs font-semibold text-[#14231F] focus:outline-none"
          >
            {shelters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.address.split(',')[0]})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* "What's Lacking" Deficit Banner */}
      <div className="p-3 bg-[#EFECE4] border border-[#D8D3C7] rounded space-y-1.5 font-mono text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold uppercase text-[11px] text-[#14231F]">
            <AlertTriangle className="w-3.5 h-3.5 text-[#C97A2B]" />
            <span>What's Lacking / Critical Shortage Alert:</span>
          </div>
          <span className="text-[10px] text-[#14231F]/60">
            {deficits.length === 0 ? 'All reserves verified adequate' : `${deficits.length} deficit flags`}
          </span>
        </div>

        {deficits.length === 0 ? (
          <div className="text-[11px] text-[#14231F]/80 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#14231F]/60" />
            <span>All essential relief categories (Water, Rations, Medical, Bedding) meet reserve standards.</span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {deficits.map((d, i) => (
              <span
                key={i}
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase inline-flex items-center gap-1 ${
                  d.status === 'CRITICAL'
                    ? 'bg-[#B23A2E] text-white'
                    : 'bg-[#C97A2B] text-white'
                }`}
              >
                <span>{d.item}:</span>
                <span className="font-normal opacity-90">{d.note}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Interactive 1-Tap Inventory Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 font-mono">
        {/* 1. Bed Capacity Card */}
        <div className="bg-[#FFFFFF] border border-[#D8D3C7] p-3 rounded flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#14231F]/70">
              <span className="font-bold flex items-center gap-1">
                <Bed className="w-3.5 h-3.5" /> BEDS
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                freeBeds === 0 ? 'bg-[#B23A2E] text-white' : occupancyPct >= 85 ? 'bg-[#C97A2B] text-white' : 'bg-[#EFECE4] text-[#14231F]'
              }`}>
                {freeBeds} FREE
              </span>
            </div>
            <div className="text-xl font-bold text-[#14231F] mt-1 tabular-nums">
              {activeShelter.currentOccupancy} <span className="text-xs font-normal text-[#14231F]/60">/ {activeShelter.capacity}</span>
            </div>
            <div className="w-full bg-[#EFECE4] h-1.5 rounded-full overflow-hidden mt-1.5">
              <div
                className={`h-full transition-all ${occupancyPct >= 90 ? 'bg-[#B23A2E]' : occupancyPct >= 70 ? 'bg-[#C97A2B]' : 'bg-[#14231F]'}`}
                style={{ width: `${occupancyPct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 mt-3 pt-2 border-t border-[#D8D3C7]/60">
            <button
              type="button"
              id="shelter-beds-minus-btn"
              disabled={updatingField === 'beds' || activeShelter.currentOccupancy <= 0}
              onClick={() => handleDelta({ deltaOccupancy: -10 }, 'beds')}
              className="px-2 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] text-xs font-bold rounded text-center transition-colors disabled:opacity-40"
            >
              -10
            </button>
            <button
              type="button"
              id="shelter-beds-plus-btn"
              disabled={updatingField === 'beds' || freeBeds <= 0}
              onClick={() => handleDelta({ deltaOccupancy: 10 }, 'beds')}
              className="px-2 py-1 bg-[#14231F] hover:bg-black text-[#F6F4EF] text-xs font-bold rounded text-center transition-colors disabled:opacity-40"
            >
              +10
            </button>
          </div>
        </div>

        {/* 2. Water Reserves Card */}
        <div className="bg-[#FFFFFF] border border-[#D8D3C7] p-3 rounded flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#14231F]/70">
              <span className="font-bold flex items-center gap-1">
                <Droplets className="w-3.5 h-3.5 text-[#14231F]" /> WATER
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                waterStatus === 'CRITICAL' ? 'bg-[#B23A2E] text-white' : waterStatus === 'LOW' ? 'bg-[#C97A2B] text-white' : 'bg-[#EFECE4] text-[#14231F]'
              }`}>
                {waterStatus}
              </span>
            </div>
            <div className="text-xl font-bold text-[#14231F] mt-1 tabular-nums">
              {waterRemaining} <span className="text-xs font-normal text-[#14231F]/60">L (min {waterThreshold}L)</span>
            </div>
            <div className="text-[10px] text-[#14231F]/60 mt-1">Potable tanker tank reserve</div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 mt-3 pt-2 border-t border-[#D8D3C7]/60">
            <button
              type="button"
              id="shelter-water-minus-btn"
              disabled={updatingField === 'water' || waterRemaining <= 0}
              onClick={() => handleDelta({ deltaWaterLiters: -100 }, 'water')}
              className="px-2 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] text-xs font-bold rounded text-center transition-colors disabled:opacity-40"
            >
              -100L
            </button>
            <button
              type="button"
              id="shelter-water-plus-btn"
              disabled={updatingField === 'water'}
              onClick={() => handleDelta({ deltaWaterLiters: 100 }, 'water')}
              className="px-2 py-1 bg-[#14231F] hover:bg-black text-[#F6F4EF] text-xs font-bold rounded text-center transition-colors disabled:opacity-40"
            >
              +100L
            </button>
          </div>
        </div>

        {/* 3. Food Rations Card */}
        <div className="bg-[#FFFFFF] border border-[#D8D3C7] p-3 rounded flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#14231F]/70">
              <span className="font-bold flex items-center gap-1">
                <Utensils className="w-3.5 h-3.5 text-[#14231F]" /> RATIONS
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                rationsStatus === 'CRITICAL' ? 'bg-[#B23A2E] text-white' : rationsStatus === 'LOW' ? 'bg-[#C97A2B] text-white' : 'bg-[#EFECE4] text-[#14231F]'
              }`}>
                {rationsStatus}
              </span>
            </div>
            <div className="text-xl font-bold text-[#14231F] mt-1 tabular-nums">
              {rationsRemaining} <span className="text-xs font-normal text-[#14231F]/60">units (min {rationsThreshold})</span>
            </div>
            <div className="text-[10px] text-[#14231F]/60 mt-1">Ready-to-eat dry ration boxes</div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 mt-3 pt-2 border-t border-[#D8D3C7]/60">
            <button
              type="button"
              id="shelter-rations-minus-btn"
              disabled={updatingField === 'rations' || rationsRemaining <= 0}
              onClick={() => handleDelta({ deltaRations: -20 }, 'rations')}
              className="px-2 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] text-xs font-bold rounded text-center transition-colors disabled:opacity-40"
            >
              -20
            </button>
            <button
              type="button"
              id="shelter-rations-plus-btn"
              disabled={updatingField === 'rations'}
              onClick={() => handleDelta({ deltaRations: 20 }, 'rations')}
              className="px-2 py-1 bg-[#14231F] hover:bg-black text-[#F6F4EF] text-xs font-bold rounded text-center transition-colors disabled:opacity-40"
            >
              +20
            </button>
          </div>
        </div>

        {/* 4. Medical Kits Card */}
        <div className="bg-[#FFFFFF] border border-[#D8D3C7] p-3 rounded flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#14231F]/70">
              <span className="font-bold flex items-center gap-1">
                <HeartPulse className="w-3.5 h-3.5 text-[#14231F]" /> MEDICAL
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                medicalStatus === 'CRITICAL' ? 'bg-[#B23A2E] text-white' : medicalStatus === 'LOW' ? 'bg-[#C97A2B] text-white' : 'bg-[#EFECE4] text-[#14231F]'
              }`}>
                {medicalStatus}
              </span>
            </div>
            <div className="text-xl font-bold text-[#14231F] mt-1 tabular-nums">
              {medicalRemaining} <span className="text-xs font-normal text-[#14231F]/60">kits (min {medicalThreshold})</span>
            </div>
            <div className="text-[10px] text-[#14231F]/60 mt-1">First-aid & trauma care kits</div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 mt-3 pt-2 border-t border-[#D8D3C7]/60">
            <button
              type="button"
              id="shelter-medical-minus-btn"
              disabled={updatingField === 'medical' || medicalRemaining <= 0}
              onClick={() => handleDelta({ deltaMedicalKits: -5 }, 'medical')}
              className="px-2 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] text-xs font-bold rounded text-center transition-colors disabled:opacity-40"
            >
              -5
            </button>
            <button
              type="button"
              id="shelter-medical-plus-btn"
              disabled={updatingField === 'medical'}
              onClick={() => handleDelta({ deltaMedicalKits: 5 }, 'medical')}
              className="px-2 py-1 bg-[#14231F] hover:bg-black text-[#F6F4EF] text-xs font-bold rounded text-center transition-colors disabled:opacity-40"
            >
              +5
            </button>
          </div>
        </div>

        {/* 5. Blankets & Bedding Card */}
        <div className="bg-[#FFFFFF] border border-[#D8D3C7] p-3 rounded flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#14231F]/70">
              <span className="font-bold flex items-center gap-1">
                <Package className="w-3.5 h-3.5 text-[#14231F]" /> BLANKETS
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                blanketsStatus === 'CRITICAL' ? 'bg-[#B23A2E] text-white' : blanketsStatus === 'LOW' ? 'bg-[#C97A2B] text-white' : 'bg-[#EFECE4] text-[#14231F]'
              }`}>
                {blanketsStatus}
              </span>
            </div>
            <div className="text-xl font-bold text-[#14231F] mt-1 tabular-nums">
              {blanketsRemaining} <span className="text-xs font-normal text-[#14231F]/60">pcs (min {blanketsThreshold})</span>
            </div>
            <div className="text-[10px] text-[#14231F]/60 mt-1">Thermal blankets & sleeping pads</div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 mt-3 pt-2 border-t border-[#D8D3C7]/60">
            <button
              type="button"
              id="shelter-blankets-minus-btn"
              disabled={updatingField === 'blankets' || blanketsRemaining <= 0}
              onClick={() => handleDelta({ deltaBlankets: -15 }, 'blankets')}
              className="px-2 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] text-xs font-bold rounded text-center transition-colors disabled:opacity-40"
            >
              -15
            </button>
            <button
              type="button"
              id="shelter-blankets-plus-btn"
              disabled={updatingField === 'blankets'}
              onClick={() => handleDelta({ deltaBlankets: 15 }, 'blankets')}
              className="px-2 py-1 bg-[#14231F] hover:bg-black text-[#F6F4EF] text-xs font-bold rounded text-center transition-colors disabled:opacity-40"
            >
              +15
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
