import React, { useState, useEffect } from 'react';
import { Package, AlertCircle, CheckCircle2, Plus, ArrowUp, X } from 'lucide-react';
import api from '../services/api';

export default function ShelterSuppliesModal({ isOpen, onClose, shelter }) {
  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    itemName: '',
    quantityNeeded: 50,
    quantityOnHand: 0,
    unit: 'units',
  });

  const loadSupplies = async () => {
    setLoading(true);
    try {
      const url = shelter ? `/supplies?shelterId=${shelter.id}` : '/supplies';
      const res = await api.get(url);
      setSupplies(res.data.supplies || []);
    } catch (err) {
      console.error('Failed to load supplies', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadSupplies();
  }, [isOpen, shelter]);

  const handleUpdateStock = async (id, delta) => {
    const item = supplies.find((s) => s.id === id);
    if (!item) return;
    const newOnHand = Math.max(0, item.quantityOnHand + delta);

    try {
      const res = await api.patch(`/supplies/${id}`, { quantityOnHand: newOnHand });
      setSupplies((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...res.data.supply, deficit: Math.max(0, s.quantityNeeded - newOnHand) } : s))
      );
    } catch (err) {
      console.error('Failed to update stock', err);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!shelter) return;
    try {
      const res = await api.post('/supplies', {
        shelterId: shelter.id,
        ...form,
        quantityNeeded: parseInt(form.quantityNeeded),
        quantityOnHand: parseInt(form.quantityOnHand),
      });
      setSupplies((prev) => [res.data.supply, ...prev]);
      setShowAdd(false);
      setForm({ itemName: '', quantityNeeded: 50, quantityOnHand: 0, unit: 'units' });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add supply request');
    }
  };

  if (!isOpen) return null;

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
            <Package className="w-5 h-5 text-[#2E6E4E]" />
            <div>
              <h2 className="font-display font-bold text-base uppercase tracking-tight">
                Relief Supply-Demand Gap Mapping
              </h2>
              <p className="text-[11px] font-mono text-[#14231F]/70">
                {shelter ? `Target Shelter: ${shelter.name}` : 'Multi-Shelter Critical Supply Inventory'}
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

        {/* Action bar */}
        {shelter && (
          <div className="py-2.5 flex items-center justify-between border-b border-[#D8D3C7]">
            <span className="font-mono text-xs text-[#14231F]/70">
              Track essential supplies (Baby formula, insulin, drinking water, ORS)
            </span>
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#14231F] text-white rounded font-display font-bold text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showAdd ? 'Cancel' : 'Request Relief Item'}</span>
            </button>
          </div>
        )}

        {/* Add item form */}
        {showAdd && shelter && (
          <form onSubmit={handleCreate} className="p-3 bg-[#F6F4EF] border border-[#D8D3C7] rounded mt-2 space-y-2 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="block text-[10px] font-mono font-bold mb-0.5">Item Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Insulin Vials"
                  value={form.itemName}
                  onChange={(e) => setForm({ ...form, itemName: e.target.value })}
                  className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold mb-0.5">Quantity Needed</label>
                <input
                  type="number"
                  required
                  value={form.quantityNeeded}
                  onChange={(e) => setForm({ ...form, quantityNeeded: e.target.value })}
                  className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold mb-0.5">Unit (tins, vials, crates)</label>
                <input
                  type="text"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-1.5 bg-[#2E6E4E] hover:bg-[#23583e] text-white font-bold rounded"
            >
              Log Relief Supply Need
            </button>
          </form>
        )}

        {/* Supply Inventory Grid */}
        <div className="overflow-y-auto flex-1 mt-3">
          {supplies.length === 0 ? (
            <div className="p-6 text-center text-xs font-mono text-[#14231F]/60">
              No supply items registered for this shelter.
            </div>
          ) : (
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#EFECE4] text-[10px] uppercase text-[#14231F]/70 border-b border-[#D8D3C7]">
                <tr>
                  <th className="p-2">Item</th>
                  <th className="p-2">Needed</th>
                  <th className="p-2">On Hand</th>
                  <th className="p-2">Deficit (Gap)</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 text-right">Quick Restock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D8D3C7]">
                {supplies.map((item) => {
                  const isCritical = item.quantityOnHand === 0 && item.quantityNeeded > 0;
                  const isLow = item.quantityOnHand < item.quantityNeeded;
                  return (
                    <tr key={item.id} className={isCritical ? 'bg-[#B23A2E]/5' : ''}>
                      <td className="p-2 font-display font-semibold text-xs text-[#14231F]">
                        {item.itemName}
                        {item.shelter && !shelter && (
                          <div className="text-[10px] font-mono text-[#14231F]/60">
                            {item.shelter.name}
                          </div>
                        )}
                      </td>
                      <td className="p-2 tabular-nums">{item.quantityNeeded} {item.unit}</td>
                      <td className="p-2 tabular-nums font-bold">{item.quantityOnHand} {item.unit}</td>
                      <td className="p-2 tabular-nums">
                        {item.deficit > 0 ? (
                          <span className="font-bold text-[#B23A2E]">-{item.deficit} {item.unit}</span>
                        ) : (
                          <span className="text-[#2E6E4E]">Sufficient</span>
                        )}
                      </td>
                      <td className="p-2">
                        <span
                          className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold uppercase border ${
                            isCritical
                              ? 'bg-[#B23A2E]/15 border-[#B23A2E]/30 text-[#B23A2E]'
                              : isLow
                              ? 'bg-[#C97A2B]/15 border-[#C97A2B]/30 text-[#C97A2B]'
                              : 'bg-[#2E6E4E]/15 border-[#2E6E4E]/30 text-[#2E6E4E]'
                          }`}
                        >
                          {isCritical ? 'CRITICAL SHORTAGE' : isLow ? 'DEFICIT' : 'SURPLUS'}
                        </span>
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleUpdateStock(item.id, 10)}
                            className="px-2 py-0.5 bg-[#EFECE4] hover:bg-[#D8D3C7] rounded border border-[#D8D3C7] text-[10px]"
                            title="Add 10 units"
                          >
                            +10
                          </button>
                          <button
                            onClick={() => handleUpdateStock(item.id, 50)}
                            className="px-2 py-0.5 bg-[#14231F] hover:bg-black text-white rounded text-[10px]"
                            title="Add 50 units"
                          >
                            +50
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
