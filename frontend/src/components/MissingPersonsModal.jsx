import React, { useState, useEffect } from 'react';
import { UserCheck, Search, Plus, Phone, MapPin, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import api from '../services/api';

export default function MissingPersonsModal({ isOpen, onClose }) {
  const [reports, setReports] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    reportedByName: '',
    contactPhone: '',
    fullName: '',
    age: '',
    gender: 'Male',
    lastSeenLocation: '',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const loadReports = async () => {
    try {
      const res = await api.get('/missing-persons');
      setReports(res.data.reports || []);
    } catch (err) {
      console.error('Failed to load missing persons', err);
    }
  };

  useEffect(() => {
    if (isOpen) loadReports();
  }, [isOpen]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/missing-persons', form);
      setReports((prev) => [res.data.report, ...prev]);
      setShowForm(false);
      setForm({
        reportedByName: '',
        contactPhone: '',
        fullName: '',
        age: '',
        gender: 'Male',
        lastSeenLocation: '',
        description: '',
      });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to file missing person bulletin');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const filtered = reports.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.fullName.toLowerCase().includes(q) ||
      r.lastSeenLocation.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q)
    );
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
    >
      <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded max-w-2xl w-full p-5 shadow-2xl text-[#14231F] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#D8D3C7]">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-[#B23A2E]" />
            <div>
              <h2 className="font-display font-bold text-base uppercase tracking-tight">
                Missing Persons Registry & Shelter Intake Matching
              </h2>
              <p className="text-[11px] font-mono text-[#14231F]/70">
                Text/attribute matching against municipal shelter intake rosters (Per SIH PRD Scope)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 bg-[#EFECE4] rounded text-xs hover:bg-[#D8D3C7]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Actions Bar */}
        <div className="py-2.5 flex items-center justify-between gap-2 border-b border-[#D8D3C7]">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#14231F]/40" />
            <input
              type="text"
              placeholder="Search by name, last seen location, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[#F6F4EF] border border-[#D8D3C7] rounded text-xs font-mono focus:outline-none focus:border-[#14231F]"
            />
          </div>

          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#B23A2E] hover:bg-[#8e2a20] text-white rounded font-display font-bold text-xs flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showForm ? 'Cancel' : 'File Missing Report'}</span>
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <form onSubmit={handleCreate} className="p-3.5 bg-[#F6F4EF] border border-[#D8D3C7] rounded mt-2 space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-mono font-bold mb-0.5">Missing Person Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aakash Deshmukh"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-mono font-bold mb-0.5">Age</label>
                  <input
                    type="number"
                    placeholder="14"
                    value={form.age}
                    onChange={(e) => setForm({ ...form, age: e.target.value })}
                    className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold mb-0.5">Gender</label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-mono font-bold mb-0.5">Last Seen Location / Landmark</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kurla East railway bridge"
                  value={form.lastSeenLocation}
                  onChange={(e) => setForm({ ...form, lastSeenLocation: e.target.value })}
                  className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold mb-0.5">Reporting Relative & Phone</label>
                <input
                  type="text"
                  required
                  placeholder="Suresh Deshmukh (+91 98200 11998)"
                  value={form.reportedByName}
                  onChange={(e) => {
                    setForm({ ...form, reportedByName: e.target.value, contactPhone: e.target.value });
                  }}
                  className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold mb-0.5">Identifying Features / Clothing</label>
              <input
                type="text"
                placeholder="Yellow raincoat, school uniform, scar on forehead"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-1.5 bg-[#14231F] hover:bg-black text-white font-bold rounded"
            >
              {submitting ? 'Registering Bulletin...' : 'Broadcast Missing Bulletin to Responders'}
            </button>
          </form>
        )}

        {/* Bulletins List */}
        <div className="divide-y divide-[#D8D3C7] overflow-y-auto flex-1 mt-2 pr-1">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs font-mono text-[#14231F]/60">
              No missing persons reports matching search criteria.
            </div>
          ) : (
            filtered.map((person) => {
              const isSafe = person.status === 'SAFE_AT_SHELTER';
              return (
                <div key={person.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-display font-bold text-sm text-[#14231F]">{person.fullName}</h4>
                      {person.age && (
                        <span className="text-[10px] font-mono bg-[#EFECE4] px-1.5 py-0.2 rounded border border-[#D8D3C7]">
                          {person.age} yrs • {person.gender}
                        </span>
                      )}
                      <span
                        className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border ${
                          isSafe
                            ? 'bg-[#2E6E4E]/15 border-[#2E6E4E]/30 text-[#2E6E4E]'
                            : 'bg-[#B23A2E]/15 border-[#B23A2E]/30 text-[#B23A2E]'
                        }`}
                      >
                        {isSafe ? '✓ SAFE AT SHELTER' : '● ACTIVE SEARCH'}
                      </span>
                    </div>

                    <p className="text-[11px] text-[#14231F]/80">
                      <strong>Last Seen:</strong> {person.lastSeenLocation}
                    </p>

                    {person.description && (
                      <p className="text-[11px] text-[#14231F]/70 italic bg-[#F6F4EF] p-1 rounded border border-[#D8D3C7]">
                        &ldquo;{person.description}&rdquo;
                      </p>
                    )}

                    {isSafe && person.shelterName && (
                      <div className="text-[11px] font-mono text-[#2E6E4E] font-bold flex items-center gap-1 mt-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Matched to shelter roster: {person.shelterName}</span>
                      </div>
                    )}
                  </div>

                  <div className="text-right text-[10px] font-mono text-[#14231F]/60 flex flex-col items-end gap-1 flex-shrink-0">
                    <div>Contact: {person.contactPhone}</div>
                    <a
                      href={`tel:${person.contactPhone}`}
                      className="px-2 py-0.5 bg-[#14231F] hover:bg-black text-white rounded text-[10px] flex items-center gap-1 font-mono"
                    >
                      <Phone className="w-3 h-3" /> Contact Family
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
