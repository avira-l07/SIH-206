import React, { useState } from 'react';
import { ShieldCheck, Search, CheckCircle2, AlertCircle, HelpCircle, Loader2, Lock } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function SafetyStatusWidget() {
  const { user } = useAuth();
  const [currentStatus, setCurrentStatus] = useState(user?.safetyStatus || 'UNKNOWN');
  const [lastUpdated, setLastUpdated] = useState(user?.safetyUpdatedAt || null);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');

  // Lookup state (Decision 0.3)
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupError, setLookupError] = useState('');

  const handleUpdateStatus = async (newStatus) => {
    if (newStatus === currentStatus) return;
    setUpdating(true);
    setUpdateMsg('');
    try {
      const res = await api.patch('/auth/safety-status', { safetyStatus: newStatus });
      setCurrentStatus(res.data.user.safetyStatus);
      setLastUpdated(res.data.user.safetyUpdatedAt);
      setUpdateMsg(`Marked as ${newStatus}`);
      setTimeout(() => setUpdateMsg(''), 3000);
    } catch (err) {
      console.error('Failed to update safety status', err);
      alert(err.response?.data?.error || 'Failed to update safety status');
    } finally {
      setUpdating(false);
    }
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || searchQuery.trim().length < 3) {
      setLookupError('Please enter at least 3 characters to search');
      return;
    }

    setSearching(true);
    setLookupResult(null);
    setLookupError('');

    try {
      const res = await api.get(`/auth/safety-lookup?query=${encodeURIComponent(searchQuery.trim())}`);
      setLookupResult(res.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setLookupError('No civilian record found matching query.');
      } else if (err.response?.status === 429) {
        setLookupError('Query limit reached (20/min). Please wait a moment to prevent enumeration.');
      } else {
        setLookupError(err.response?.data?.error || 'Failed to check status');
      }
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded p-4 text-xs font-mono space-y-4 shadow-sm">
      {/* 1. My Safety Status */}
      <div>
        <div className="flex items-center justify-between pb-2 border-b border-[#D8D3C7]">
          <div className="flex items-center gap-1.5 font-bold uppercase text-[#14231F] font-display text-sm">
            <ShieldCheck className="w-4 h-4 text-[#2E6E4E]" />
            <span>Mark Myself Safe Broadcast</span>
          </div>
          {lastUpdated && (
            <span className="text-[10px] text-[#14231F]/60">
              As of {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        <p className="text-[11px] text-[#14231F]/70 mt-2 mb-2.5">
          Broadcast your safety status to verified family & responders:
        </p>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            id="mark-safe-btn"
            disabled={updating}
            onClick={() => handleUpdateStatus('SAFE')}
            className={`p-2 rounded border font-display font-bold text-xs flex flex-col items-center gap-1 transition-all ${
              currentStatus === 'SAFE'
                ? 'bg-[#2E6E4E] text-white border-[#2E6E4E] shadow-sm ring-2 ring-[#2E6E4E]/30'
                : 'bg-[#F6F4EF] hover:bg-[#EFECE4] text-[#14231F] border-[#D8D3C7]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>I AM SAFE</span>
          </button>

          <button
            type="button"
            id="mark-needs-help-btn"
            disabled={updating}
            onClick={() => handleUpdateStatus('NEEDS_HELP')}
            className={`p-2 rounded border font-display font-bold text-xs flex flex-col items-center gap-1 transition-all ${
              currentStatus === 'NEEDS_HELP'
                ? 'bg-[#B23A2E] text-white border-[#B23A2E] shadow-sm ring-2 ring-[#B23A2E]/30'
                : 'bg-[#F6F4EF] hover:bg-[#EFECE4] text-[#14231F] border-[#D8D3C7]'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            <span>NEED HELP</span>
          </button>

          <button
            type="button"
            id="mark-unknown-btn"
            disabled={updating}
            onClick={() => handleUpdateStatus('UNKNOWN')}
            className={`p-2 rounded border font-display font-bold text-xs flex flex-col items-center gap-1 transition-all ${
              currentStatus === 'UNKNOWN'
                ? 'bg-[#14231F] text-white border-[#14231F] shadow-sm ring-2 ring-[#14231F]/30'
                : 'bg-[#F6F4EF] hover:bg-[#EFECE4] text-[#14231F] border-[#D8D3C7]'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>UNKNOWN</span>
          </button>
        </div>

        {updateMsg && (
          <div className="mt-2 text-[11px] text-[#2E6E4E] font-semibold text-center animate-fade-in">
            ✓ {updateMsg}
          </div>
        )}
      </div>

      {/* 2. Relative Safety Status Lookup (Decision 0.3) */}
      <div className="pt-2 border-t border-[#D8D3C7]/60">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-display font-bold text-xs uppercase text-[#14231F] flex items-center gap-1">
            <Search className="w-3.5 h-3.5 text-[#C97A2B]" />
            Relative Safety Lookup
          </span>
          <span className="text-[10px] text-[#14231F]/60 flex items-center gap-0.5">
            <Lock className="w-2.5 h-2.5 text-[#2E6E4E]" /> Privacy-Safe
          </span>
        </div>

        <form onSubmit={handleLookup} className="flex gap-2">
          <input
            type="text"
            id="safety-lookup-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Name or phone (e.g. Rohan or +91 98201...)"
            className="flex-1 p-2 bg-[#F6F4EF] border border-[#D8D3C7] rounded text-xs focus:outline-none focus:border-[#14231F]"
          />
          <button
            type="submit"
            id="safety-lookup-submit-btn"
            disabled={searching}
            className="px-3 py-2 bg-[#14231F] hover:bg-black text-white font-display font-bold text-xs rounded transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span>CHECK</span>
          </button>
        </form>

        {lookupError && (
          <div className="mt-2 p-2 bg-red-50 text-[#B23A2E] rounded text-[11px]">
            {lookupError}
          </div>
        )}

        {lookupResult && (
          <div className="mt-2 p-3 bg-[#F6F4EF] border border-[#D8D3C7] rounded space-y-1.5 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#14231F]/70">Reported Civilian Status:</span>
              <span
                className={`px-2 py-0.5 rounded font-display font-bold text-xs ${
                  lookupResult.status === 'SAFE'
                    ? 'bg-[#2E6E4E] text-white'
                    : lookupResult.status === 'NEEDS_HELP'
                    ? 'bg-[#B23A2E] text-white'
                    : 'bg-gray-300 text-gray-800'
                }`}
              >
                {lookupResult.status === 'SAFE'
                  ? '✓ CONFIRMED SAFE'
                  : lookupResult.status === 'NEEDS_HELP'
                  ? '⚠ NEEDS IMMEDIATE HELP'
                  : 'UNKNOWN / UNREPORTED'}
              </span>
            </div>
            <div className="text-[10px] text-[#14231F]/60 flex items-center justify-between">
              <span>Last confirmed:</span>
              <span className="font-mono">
                {lookupResult.asOf ? new Date(lookupResult.asOf).toLocaleString() : 'No timestamp'}
              </span>
            </div>
            <div className="text-[9px] text-[#14231F]/50 pt-1 border-t border-[#D8D3C7]/40 flex items-center gap-1">
              <Lock className="w-2.5 h-2.5 text-emerald-600" />
              <span>Personal details and contact information remain protected and unexposed.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
