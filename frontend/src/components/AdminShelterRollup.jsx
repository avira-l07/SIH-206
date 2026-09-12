import React, { useState } from 'react';
import { Home, Bed, Droplets, Utensils, HeartPulse, Package, AlertTriangle, CheckCircle2, Clock, Search, Filter } from 'lucide-react';

/**
 * Admin Aggregate Shelter Rollup Matrix (Issue 2)
 *
 * Summary view for allocation decisions across all zones.
 * Displays bed capacity (total, occupied, free), supplies status rollup,
 * what's lacking indicators, and last-updated staleness.
 *
 * Color tokens strictly adhere to design system:
 * - Normal/OK: --earth (#EFECE4 / neutral text, no green emphasis)
 * - Low/Warning: --signal-amber (#C97A2B)
 * - Critical Shortage: --alert-red (#B23A2E)
 */
export default function AdminShelterRollup({
  shelters = [],
  onSelectShelterCoords,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, CRITICAL, WARNING, ADEQUATE

  const filteredShelters = shelters.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.address.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'CRITICAL') return s.status === 'RED';
    if (statusFilter === 'WARNING') return s.status === 'YELLOW';
    if (statusFilter === 'ADEQUATE') return s.status === 'GREEN';
    return true;
  });

  const totalCapacity = shelters.reduce((acc, s) => acc + s.capacity, 0);
  const totalOccupied = shelters.reduce((acc, s) => acc + s.currentOccupancy, 0);
  const totalFree = Math.max(0, totalCapacity - totalOccupied);
  const totalCriticalShelters = shelters.filter((s) => s.status === 'RED').length;

  return (
    <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded p-4 space-y-4 shadow-xs">
      {/* Header & Aggregate Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#D8D3C7]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display font-bold text-base text-[#14231F] uppercase tracking-tight">
              Aggregate Shelter Rollup Matrix
            </h2>
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#EFECE4] border border-[#D8D3C7] text-[#14231F]/80 rounded font-semibold">
              TACTICAL SUMMARY
            </span>
          </div>
          <p className="text-xs text-[#14231F]/60 font-mono mt-0.5">
            Zone-wide capacity allocation & essential supplies monitoring across {shelters.length} field shelters
          </p>
        </div>

        {/* Quick Search & Filter */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#14231F]/40" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search shelters/zones..."
              className="pl-8 pr-2.5 py-1.5 bg-[#F6F4EF] border border-[#D8D3C7] rounded text-xs text-[#14231F] focus:outline-none focus:border-[#14231F] w-44"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="p-1.5 bg-[#F6F4EF] border border-[#D8D3C7] rounded text-xs font-mono text-[#14231F]"
          >
            <option value="ALL">All States ({shelters.length})</option>
            <option value="CRITICAL">Critical Shortage ({totalCriticalShelters})</option>
            <option value="WARNING">Near Threshold</option>
            <option value="ADEQUATE">Adequate Reserves</option>
          </select>
        </div>
      </div>

      {/* Aggregate Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
        <div className="p-2.5 bg-[#F6F4EF] border border-[#D8D3C7] rounded">
          <div className="text-[10px] text-[#14231F]/60 uppercase font-semibold">Total Bed Capacity</div>
          <div className="text-lg font-bold text-[#14231F] mt-0.5 tabular-nums">
            {totalOccupied} / {totalCapacity}
          </div>
          <div className="text-[10px] text-[#14231F]/70 font-semibold">{totalFree} beds free across network</div>
        </div>

        <div className="p-2.5 bg-[#F6F4EF] border border-[#D8D3C7] rounded">
          <div className="text-[10px] text-[#14231F]/60 uppercase font-semibold">Shelters at Capacity</div>
          <div className="text-lg font-bold text-[#B23A2E] mt-0.5 tabular-nums">
            {shelters.filter((s) => s.currentOccupancy >= s.capacity).length}
          </div>
          <div className="text-[10px] text-[#14231F]/70">Zero bed surplus remaining</div>
        </div>

        <div className="p-2.5 bg-[#F6F4EF] border border-[#D8D3C7] rounded">
          <div className="text-[10px] text-[#14231F]/60 uppercase font-semibold">Critical Deficit Shelters</div>
          <div className="text-lg font-bold text-[#B23A2E] mt-0.5 tabular-nums">
            {totalCriticalShelters}
          </div>
          <div className="text-[10px] text-[#14231F]/70">Supplies or space breached</div>
        </div>

        <div className="p-2.5 bg-[#F6F4EF] border border-[#D8D3C7] rounded">
          <div className="text-[10px] text-[#14231F]/60 uppercase font-semibold">Adequate Reserves</div>
          <div className="text-lg font-bold text-[#14231F] mt-0.5 tabular-nums">
            {shelters.filter((s) => s.status === 'GREEN').length} / {shelters.length}
          </div>
          <div className="text-[10px] text-[#14231F]/70">All thresholds satisfied</div>
        </div>
      </div>

      {/* Aggregate Rollup Table */}
      <div className="overflow-x-auto border border-[#D8D3C7] rounded">
        <table className="w-full text-left font-mono text-xs divide-y divide-[#D8D3C7]">
          <thead className="bg-[#EFECE4] text-[#14231F]/80 text-[11px] uppercase font-bold tracking-wider">
            <tr>
              <th className="py-2.5 px-3">Shelter & Zone</th>
              <th className="py-2.5 px-3">Bed Capacity</th>
              <th className="py-2.5 px-3">Key Supplies Status</th>
              <th className="py-2.5 px-3">What's Lacking</th>
              <th className="py-2.5 px-3">Last Audited</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D8D3C7] bg-[#FFFFFF]">
            {filteredShelters.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[#14231F]/60">
                  No shelters matched current filter criteria.
                </td>
              </tr>
            ) : (
              filteredShelters.map((s) => {
                const free = Math.max(0, s.capacity - s.currentOccupancy);
                const pct = Math.min(100, Math.round((s.currentOccupancy / s.capacity) * 100));

                const water = s.waterLitersRemaining ?? 0;
                const waterThresh = s.waterThreshold ?? 200;
                const waterStatus = water < waterThresh ? 'CRITICAL' : water < waterThresh * 1.5 ? 'LOW' : 'OK';

                const rations = s.rationsUnitsRemaining ?? 0;
                const rationsThresh = s.rationsThreshold ?? 50;
                const rationsStatus = rations < rationsThresh ? 'CRITICAL' : rations < rationsThresh * 1.5 ? 'LOW' : 'OK';

                const medical = s.medicalKitsRemaining ?? 25;
                const medicalThresh = s.medicalThreshold ?? 10;
                const medicalStatus = medical < medicalThresh ? 'CRITICAL' : medical < medicalThresh * 1.5 ? 'LOW' : 'OK';

                const blankets = s.blanketsRemaining ?? 120;
                const blanketsThresh = s.blanketsThreshold ?? 30;
                const blanketsStatus = blankets < blanketsThresh ? 'CRITICAL' : blankets < blanketsThresh * 1.5 ? 'LOW' : 'OK';

                // Deficit items
                const lacks = [];
                if (waterStatus === 'CRITICAL') lacks.push({ item: 'Water', status: 'CRITICAL' });
                else if (waterStatus === 'LOW') lacks.push({ item: 'Water', status: 'LOW' });

                if (rationsStatus === 'CRITICAL') lacks.push({ item: 'Rations', status: 'CRITICAL' });
                else if (rationsStatus === 'LOW') lacks.push({ item: 'Rations', status: 'LOW' });

                if (medicalStatus === 'CRITICAL') lacks.push({ item: 'Medical', status: 'CRITICAL' });
                else if (medicalStatus === 'LOW') lacks.push({ item: 'Medical', status: 'LOW' });

                if (blanketsStatus === 'CRITICAL') lacks.push({ item: 'Blankets', status: 'CRITICAL' });
                else if (blanketsStatus === 'LOW') lacks.push({ item: 'Blankets', status: 'LOW' });

                if (free === 0) lacks.push({ item: 'Beds Full', status: 'CRITICAL' });

                // Timestamp & staleness
                const auditedDate = s.lastAuditedAt ? new Date(s.lastAuditedAt) : null;
                const hoursElapsed = auditedDate
                  ? (Date.now() - auditedDate.getTime()) / (1000 * 60 * 60)
                  : 0;
                const isStale = hoursElapsed > 6;

                return (
                  <tr
                    key={s.id}
                    className="hover:bg-[#F6F4EF] transition-colors cursor-pointer"
                    onClick={() => onSelectShelterCoords && onSelectShelterCoords([s.lat, s.lng])}
                    title="Click to focus shelter on incident map"
                  >
                    {/* Shelter Name & Address */}
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-[#14231F] text-xs flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          s.status === 'RED' ? 'bg-[#B23A2E]' : s.status === 'YELLOW' ? 'bg-[#C97A2B]' : 'bg-[#14231F]/60'
                        }`} />
                        <span>{s.name}</span>
                      </div>
                      <div className="text-[10px] text-[#14231F]/60 truncate max-w-xs mt-0.5">
                        {s.address}
                      </div>
                    </td>

                    {/* Bed Capacity with Progress */}
                    <td className="py-2.5 px-3 min-w-[140px]">
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span>{s.currentOccupancy} / {s.capacity}</span>
                        <span className={`text-[10px] ${free === 0 ? 'text-[#B23A2E]' : 'text-[#14231F]/70'}`}>
                          {free} free
                        </span>
                      </div>
                      <div className="w-full bg-[#EFECE4] h-1.5 rounded-full overflow-hidden mt-1">
                        <div
                          className={`h-full ${pct >= 90 ? 'bg-[#B23A2E]' : pct >= 70 ? 'bg-[#C97A2B]' : 'bg-[#14231F]'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>

                    {/* Supplies Rollup Badges */}
                    <td className="py-2.5 px-3">
                      <div className="grid grid-cols-2 gap-1 text-[10px]">
                        <span className={`px-1.5 py-0.5 rounded truncate ${
                          waterStatus === 'CRITICAL' ? 'bg-[#B23A2E] text-white font-bold' : waterStatus === 'LOW' ? 'bg-[#C97A2B] text-white font-bold' : 'bg-[#EFECE4] text-[#14231F]'
                        }`}>
                          💧 {water}L
                        </span>
                        <span className={`px-1.5 py-0.5 rounded truncate ${
                          rationsStatus === 'CRITICAL' ? 'bg-[#B23A2E] text-white font-bold' : rationsStatus === 'LOW' ? 'bg-[#C97A2B] text-white font-bold' : 'bg-[#EFECE4] text-[#14231F]'
                        }`}>
                          📦 {rations}u
                        </span>
                        <span className={`px-1.5 py-0.5 rounded truncate ${
                          medicalStatus === 'CRITICAL' ? 'bg-[#B23A2E] text-white font-bold' : medicalStatus === 'LOW' ? 'bg-[#C97A2B] text-white font-bold' : 'bg-[#EFECE4] text-[#14231F]'
                        }`}>
                          🩹 {medical}k
                        </span>
                        <span className={`px-1.5 py-0.5 rounded truncate ${
                          blanketsStatus === 'CRITICAL' ? 'bg-[#B23A2E] text-white font-bold' : blanketsStatus === 'LOW' ? 'bg-[#C97A2B] text-white font-bold' : 'bg-[#EFECE4] text-[#14231F]'
                        }`}>
                          🛏️ {blankets}p
                        </span>
                      </div>
                    </td>

                    {/* "What's Lacking" Indicators */}
                    <td className="py-2.5 px-3 min-w-[130px]">
                      {lacks.length === 0 ? (
                        <span className="px-1.5 py-0.5 bg-[#EFECE4] text-[#14231F]/80 rounded text-[10px]">
                          Adequate
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {lacks.map((l, idx) => (
                            <span
                              key={idx}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                l.status === 'CRITICAL'
                                  ? 'bg-[#B23A2E] text-white'
                                  : 'bg-[#C97A2B] text-white'
                              }`}
                            >
                              {l.item}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Last Audited & Staleness */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-[11px]">
                        <Clock className="w-3 h-3 text-[#14231F]/50" />
                        <span>
                          {auditedDate
                            ? auditedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : 'Unrecorded'}
                        </span>
                      </div>
                      {isStale && (
                        <span className="text-[9px] font-bold text-[#C97A2B] flex items-center gap-0.5 mt-0.5">
                          ⚠️ &gt;6h stale
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
