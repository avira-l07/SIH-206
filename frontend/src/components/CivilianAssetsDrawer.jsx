import React, { useState, useEffect } from 'react';
import { Truck, Anchor, Zap, Stethoscope, Radio, Phone, Plus, CheckCircle, X, MapPin } from 'lucide-react';
import api from '../services/api';

const TYPE_ICONS = {
  BOAT: Anchor,
  VEHICLE_4X4: Truck,
  GENERATOR: Zap,
  MEDICAL: Stethoscope,
  HAM_RADIO: Radio,
};

export default function CivilianAssetsDrawer({ isOpen, onClose, onSelectLocation }) {
  const [assets, setAssets] = useState([]);
  const [filterType, setFilterType] = useState('ALL');
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({
    ownerName: '',
    contact: '',
    type: 'BOAT',
    title: '',
    description: '',
    lat: 19.0760,
    lng: 72.8777,
  });
  const [submitting, setSubmitting] = useState(false);

  const loadAssets = async () => {
    try {
      const res = await api.get('/assets');
      setAssets(res.data.assets || []);
    } catch (err) {
      console.error('Failed to load civilian assets', err);
    }
  };

  useEffect(() => {
    if (isOpen) loadAssets();
  }, [isOpen]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/assets', {
        ...form,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
      });
      setAssets((prev) => [res.data.asset, ...prev]);
      setShowAddForm(false);
      setForm({
        ownerName: '',
        contact: '',
        type: 'BOAT',
        title: '',
        description: '',
        lat: 19.0760,
        lng: 72.8777,
      });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to register civilian resource');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const filtered = assets.filter((a) => (filterType === 'ALL' ? true : a.type === filterType));

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
            <Truck className="w-5 h-5 text-[#2E6E4E]" />
            <div>
              <h2 className="font-display font-bold text-base uppercase tracking-tight">
                Civilian Asset & Skill Mobilization (&ldquo;I Have / I Can&rdquo;)
              </h2>
              <p className="text-[11px] font-mono text-[#14231F]/70">
                Community-provided 4x4s, inflatable boats, generators, and field trauma medics
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

        {/* Filters & Add Button */}
        <div className="py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-[#D8D3C7] text-xs font-mono">
          <div className="flex flex-wrap gap-1">
            {['ALL', 'BOAT', 'VEHICLE_4X4', 'GENERATOR', 'MEDICAL', 'HAM_RADIO'].map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-2 py-0.5 rounded uppercase text-[10px] border transition-colors ${
                  filterType === t
                    ? 'bg-[#14231F] text-[#F6F4EF] border-[#14231F] font-bold'
                    : 'bg-[#EFECE4] text-[#14231F] border-[#D8D3C7] hover:bg-[#D8D3C7]'
                }`}
              >
                {t.replace('_', ' ')}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#2E6E4E] hover:bg-[#23583e] text-white rounded font-display font-bold text-[11px]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showAddForm ? 'Cancel' : 'Offer Asset / Skill'}</span>
          </button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <form onSubmit={handleCreate} className="p-3 bg-[#F6F4EF] border border-[#D8D3C7] rounded mt-2 space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-mono font-bold mb-0.5">Owner Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Capt. Rajesh"
                  value={form.ownerName}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                  className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold mb-0.5">Contact Phone</label>
                <input
                  type="text"
                  required
                  placeholder="+91 98200 00000"
                  value={form.contact}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-mono font-bold mb-0.5">Category</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                >
                  <option value="BOAT">Inflatable Boat / Raft</option>
                  <option value="VEHICLE_4X4">4x4 High-Clearance Vehicle</option>
                  <option value="GENERATOR">Generator (Portable / Diesel)</option>
                  <option value="MEDICAL">Medical Professional / Medic</option>
                  <option value="HAM_RADIO">HAM Radio Operator</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold mb-0.5">Asset Title / Make</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mahindra Thar 4x4 Winch"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold mb-0.5">Capabilities / Details</label>
              <input
                type="text"
                placeholder="Can tow waterlogged ambulances, carry up to 4 injured"
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
              {submitting ? 'Registering...' : 'Register Asset in Live Mobilization Grid'}
            </button>
          </form>
        )}

        {/* Asset Cards List */}
        <div className="divide-y divide-[#D8D3C7] overflow-y-auto flex-1 mt-2 pr-1">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs font-mono text-[#14231F]/60">
              No registered community assets matching this category.
            </div>
          ) : (
            filtered.map((asset) => {
              const IconComponent = TYPE_ICONS[asset.type] || Truck;
              return (
                <div key={asset.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded bg-[#EFECE4] border border-[#D8D3C7] text-[#14231F] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <IconComponent className="w-4 h-4 text-[#2E6E4E]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[9px] font-bold uppercase px-1.5 py-0.2 bg-[#14231F] text-white rounded">
                          {asset.type.replace('_', ' ')}
                        </span>
                        <h4 className="font-display font-bold text-sm text-[#14231F]">{asset.title}</h4>
                      </div>
                      <p className="text-[11px] text-[#14231F]/80 mt-0.5">{asset.description}</p>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-[#14231F]/60 mt-1">
                        <span>Owner: <strong>{asset.ownerName}</strong></span>
                        <span>•</span>
                        <span>GPS: {asset.lat.toFixed(3)}°N, {asset.lng.toFixed(3)}°E</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#2E6E4E]/15 text-[#2E6E4E] border border-[#2E6E4E]/30">
                      ● READY TO MOBILIZE
                    </span>
                    <div className="flex items-center gap-1">
                      {onSelectLocation && (
                        <button
                          onClick={() => {
                            onSelectLocation([asset.lat, asset.lng]);
                            onClose();
                          }}
                          className="px-2 py-0.5 bg-[#EFECE4] hover:bg-[#D8D3C7] rounded text-[10px] font-mono flex items-center gap-0.5"
                        >
                          <MapPin className="w-3 h-3" /> Map
                        </button>
                      )}
                      <a
                        href={`tel:${asset.contact}`}
                        className="px-2 py-0.5 bg-[#14231F] hover:bg-black text-white rounded text-[10px] font-mono flex items-center gap-1"
                      >
                        <Phone className="w-3 h-3" /> Call
                      </a>
                    </div>
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
