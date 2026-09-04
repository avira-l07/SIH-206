import React, { useState } from 'react';
import { sortSheltersByDistance } from '../services/haversine';
import { Home, Phone, Navigation, Search } from 'lucide-react';

export default function ShelterList({ shelters = [], userCoords, onSelectShelter }) {
  const [searchTerm, setSearchTerm] = useState('');

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

      {/* Filter */}
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

      {/* List */}
      <div className="divide-y divide-[#D8D3C7] overflow-y-auto flex-1 max-h-[380px]">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#14231F]/60 font-mono">
            No emergency shelters found matching query.
          </div>
        ) : (
          filtered.map((shelter) => {
            const isFull = shelter.currentOccupancy >= shelter.capacity;
            const availableBeds = Math.max(0, shelter.capacity - shelter.currentOccupancy);
            const occupancyPct = Math.round((shelter.currentOccupancy / shelter.capacity) * 100);

            return (
              <div
                key={shelter.id}
                className="p-3 hover:bg-[#F6F4EF] transition-colors cursor-pointer"
                onClick={() => onSelectShelter && onSelectShelter(shelter)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-display font-semibold text-xs sm:text-sm text-[#14231F]">
                      {shelter.name}
                    </h4>
                    <p className="text-[11px] text-[#14231F]/70 line-clamp-1">{shelter.address}</p>
                  </div>

                  {/* Distance badge */}
                  {shelter.distanceKm !== Infinity && (
                    <div className="flex items-center gap-1 font-mono text-xs text-[#14231F] bg-[#EFECE4] px-1.5 py-0.5 rounded border border-[#D8D3C7] flex-shrink-0">
                      <Navigation className="w-3 h-3 text-[#2E6E4E]" />
                      <span className="tabular-nums font-semibold">{shelter.distanceKm} km</span>
                    </div>
                  )}
                </div>

                {/* Capacity & Actions */}
                <div className="mt-2 flex items-center justify-between gap-2 text-xs pt-2 border-t border-[#D8D3C7]/40">
                  <div className="flex items-center gap-2">
                    {isFull ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#B23A2E]/10 text-[#B23A2E] border border-[#B23A2E]/30">
                        SHELTER FULL
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#2E6E4E]/10 text-[#2E6E4E] border border-[#2E6E4E]/30">
                        {availableBeds} BEDS FREE
                      </span>
                    )}

                    <span className="font-mono tabular-nums text-[11px] text-[#14231F]/60">
                      {shelter.currentOccupancy}/{shelter.capacity} ({occupancyPct}%)
                    </span>
                  </div>

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
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
