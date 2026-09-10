import React, { useState, useEffect } from 'react';
import { Package, AlertCircle, CheckCircle2, Plus, ArrowUp, X, Truck, FileCheck2, Clock } from 'lucide-react';
import api from '../services/api';

export default function ShelterSuppliesModal({ isOpen, onClose, shelter }) {
  const [activeTab, setActiveTab] = useState('REQUIREMENTS'); // 'REQUIREMENTS' or 'SHIPMENTS'
  const [supplies, setSupplies] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddNeed, setShowAddNeed] = useState(false);
  const [showAddShipment, setShowAddShipment] = useState(false);
  const [selectedSupplyForShipment, setSelectedSupplyForShipment] = useState(null);

  const [needForm, setNeedForm] = useState({
    itemName: '',
    quantityNeeded: 50,
    quantityFulfilled: 0,
    unit: 'units',
  });

  const [shipmentForm, setShipmentForm] = useState({
    supplyRequestId: '',
    itemName: '',
    quantityClaimed: 50,
    quantityVerified: 50,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const supplyUrl = shelter ? `/supplies?shelterId=${shelter.id}` : '/supplies';
      const shipmentUrl = shelter ? `/supply-shipments?shelterId=${shelter.id}` : '/supply-shipments';

      const [supplyRes, shipmentRes] = await Promise.all([
        api.get(supplyUrl),
        api.get(shipmentUrl).catch(() => ({ data: { shipments: [] } })),
      ]);

      setSupplies(supplyRes.data.supplies || []);
      setShipments(shipmentRes.data.shipments || []);
    } catch (err) {
      console.error('Failed to load supplies or shipments', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setShowAddNeed(false);
      setShowAddShipment(false);
    }
  }, [isOpen, shelter]);

  const handleCreateNeed = async (e) => {
    e.preventDefault();
    if (!shelter) return;
    try {
      const res = await api.post('/supplies', {
        shelterId: shelter.id,
        itemName: needForm.itemName,
        quantityNeeded: parseInt(needForm.quantityNeeded),
        quantityFulfilled: parseInt(needForm.quantityFulfilled || 0),
        unit: needForm.unit,
      });

      const newSupply = {
        ...res.data.supply,
        deficit: Math.max(0, res.data.supply.quantityNeeded - res.data.supply.quantityFulfilled),
        remainingDeficit: Math.max(0, res.data.supply.quantityNeeded - res.data.supply.quantityFulfilled),
      };

      setSupplies((prev) => [newSupply, ...prev]);
      setShowAddNeed(false);
      setNeedForm({ itemName: '', quantityNeeded: 50, quantityFulfilled: 0, unit: 'units' });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add supply request');
    }
  };

  const handleOpenShipmentModal = (supplyItem) => {
    setSelectedSupplyForShipment(supplyItem || null);
    setShipmentForm({
      supplyRequestId: supplyItem ? supplyItem.id : '',
      itemName: supplyItem ? supplyItem.itemName : '',
      quantityClaimed: supplyItem ? (supplyItem.remainingDeficit || supplyItem.deficit || 50) : 50,
      quantityVerified: supplyItem ? (supplyItem.remainingDeficit || supplyItem.deficit || 50) : 50,
    });
    setShowAddShipment(true);
  };

  const handleLogShipment = async (e) => {
    e.preventDefault();
    if (!shelter) return;
    try {
      const payload = {
        shelterId: shelter.id,
        supplyRequestId: shipmentForm.supplyRequestId ? parseInt(shipmentForm.supplyRequestId) : undefined,
        itemName: shipmentForm.itemName.trim(),
        quantityClaimed: parseInt(shipmentForm.quantityClaimed),
        quantityVerified: parseInt(shipmentForm.quantityVerified),
      };

      const res = await api.post('/supply-shipments', payload);
      
      // Update local state: add shipment to list and update target supply item fulfillment
      if (res.data.shipment) {
        setShipments((prev) => [res.data.shipment, ...prev]);
      }

      if (res.data.updatedSupplyRequest) {
        setSupplies((prev) =>
          prev.map((s) =>
            s.id === res.data.updatedSupplyRequest.id
              ? {
                  ...s,
                  ...res.data.updatedSupplyRequest,
                  remainingDeficit: res.data.remainingDeficit,
                  deficit: res.data.remainingDeficit,
                }
              : s
          )
        );
      } else {
        // Reload all to be sure
        loadData();
      }

      setShowAddShipment(false);
      setSelectedSupplyForShipment(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to record verified shipment');
    }
  };

  const handleQuickFulfill = async (item, amount) => {
    try {
      const payload = {
        shelterId: shelter.id,
        supplyRequestId: item.id,
        itemName: item.itemName,
        quantityClaimed: amount,
        quantityVerified: amount,
      };
      const res = await api.post('/supply-shipments', payload);
      
      if (res.data.shipment) {
        setShipments((prev) => [res.data.shipment, ...prev]);
      }

      setSupplies((prev) =>
        prev.map((s) =>
          s.id === item.id
            ? {
                ...s,
                quantityFulfilled: s.quantityFulfilled + amount,
                remainingDeficit: Math.max(0, s.quantityNeeded - (s.quantityFulfilled + amount)),
                deficit: Math.max(0, s.quantityNeeded - (s.quantityFulfilled + amount)),
              }
            : s
        )
      );
    } catch (err) {
      console.error('Failed to quick-fulfill supply item', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
    >
      <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded max-w-3xl w-full p-5 shadow-2xl text-[#14231F] flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#D8D3C7]">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-[#2E6E4E]" />
            <div>
              <h2 className="font-display font-bold text-base uppercase tracking-tight">
                Relief Supply-Demand Gap & Shipment Manifest
              </h2>
              <p className="text-[11px] font-mono text-[#14231F]/70">
                {shelter ? `Target Facility: ${shelter.name}` : 'Multi-Shelter Relief Pipeline'}
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

        {/* View Mode Navigation & Actions */}
        <div className="py-2.5 flex items-center justify-between border-b border-[#D8D3C7] flex-wrap gap-2">
          <div className="flex items-center bg-[#EFECE4] p-0.5 border border-[#D8D3C7] rounded text-xs font-mono">
            <button
              type="button"
              onClick={() => setActiveTab('REQUIREMENTS')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
                activeTab === 'REQUIREMENTS'
                  ? 'bg-[#14231F] text-white font-bold'
                  : 'text-[#14231F]/70 hover:text-[#14231F]'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>SUPPLY GAPS ({supplies.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('SHIPMENTS')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
                activeTab === 'SHIPMENTS'
                  ? 'bg-[#14231F] text-white font-bold'
                  : 'text-[#14231F]/70 hover:text-[#14231F]'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>VERIFIED SHIPMENTS ({shipments.length})</span>
            </button>
          </div>

          {shelter && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowAddNeed(!showAddNeed);
                  setShowAddShipment(false);
                }}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] text-[#14231F] border border-[#D8D3C7] rounded font-mono font-bold text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showAddNeed ? 'Cancel' : 'Request Relief Need'}</span>
              </button>
              <button
                onClick={() => handleOpenShipmentModal(null)}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#2E6E4E] hover:bg-[#23583e] text-white rounded font-display font-bold text-xs"
              >
                <Truck className="w-3.5 h-3.5" />
                <span>Log Verified Shipment</span>
              </button>
            </div>
          )}
        </div>

        {/* Add Supply Need Form */}
        {showAddNeed && shelter && (
          <form onSubmit={handleCreateNeed} className="p-3 bg-[#F6F4EF] border border-[#D8D3C7] rounded mt-2 space-y-2 text-xs">
            <div className="font-display font-bold text-xs text-[#14231F] uppercase">
              Register New Relief Need for {shelter.name}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-mono font-bold mb-0.5">Item Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Baby Formula / Insulin"
                  value={needForm.itemName}
                  onChange={(e) => setNeedForm({ ...needForm, itemName: e.target.value })}
                  className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold mb-0.5">Quantity Needed</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={needForm.quantityNeeded}
                  onChange={(e) => setNeedForm({ ...needForm, quantityNeeded: e.target.value })}
                  className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold mb-0.5">Unit (tins, vials, crates)</label>
                <input
                  type="text"
                  value={needForm.unit}
                  onChange={(e) => setNeedForm({ ...needForm, unit: e.target.value })}
                  className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddNeed(false)}
                className="px-3 py-1 bg-white border border-[#D8D3C7] rounded text-xs font-mono"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 bg-[#14231F] text-white font-display font-bold rounded text-xs"
              >
                Save Relief Need
              </button>
            </div>
          </form>
        )}

        {/* Add Shipment Modal Form */}
        {showAddShipment && shelter && (
          <form onSubmit={handleLogShipment} className="p-3 bg-[#EFECE4] border border-[#D8D3C7] rounded mt-2 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="font-display font-bold text-xs text-[#14231F] uppercase flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-[#2E6E4E]" />
                Log Verified Inbound Shipment
              </div>
              <button
                type="button"
                onClick={() => setShowAddShipment(false)}
                className="text-[#14231F]/60 hover:text-black font-mono text-xs"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-mono font-bold mb-0.5">Item Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Drinking Water Cans"
                  value={shipmentForm.itemName}
                  onChange={(e) => setShipmentForm({ ...shipmentForm, itemName: e.target.value })}
                  className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold mb-0.5">Quantity Claimed</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={shipmentForm.quantityClaimed}
                  onChange={(e) => setShipmentForm({ ...shipmentForm, quantityClaimed: e.target.value })}
                  className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold mb-0.5">Quantity Verified</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={shipmentForm.quantityVerified}
                  onChange={(e) => setShipmentForm({ ...shipmentForm, quantityVerified: e.target.value })}
                  className="w-full p-1.5 bg-white border border-[#D8D3C7] rounded text-xs"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <p className="text-[10px] font-mono text-[#14231F]/70">
                Verified goods will immediately increment fulfilled stock and reduce deficit.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddShipment(false)}
                  className="px-3 py-1 bg-white border border-[#D8D3C7] rounded text-xs font-mono"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 bg-[#2E6E4E] hover:bg-[#23583e] text-white font-display font-bold rounded text-xs"
                >
                  Verify & Log Receipt
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Content Area */}
        <div className="overflow-y-auto flex-1 mt-3">
          {activeTab === 'REQUIREMENTS' ? (
            supplies.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-[#14231F]/60">
                No relief requirements currently registered for this facility.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#EFECE4] text-[10px] uppercase text-[#14231F]/70 border-b border-[#D8D3C7]">
                  <tr>
                    <th className="p-2">Item</th>
                    <th className="p-2">Needed</th>
                    <th className="p-2">Fulfilled</th>
                    <th className="p-2">Remaining Deficit</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Inbound Delivery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D8D3C7]">
                  {supplies.map((item) => {
                    const remainingDeficit = typeof item.remainingDeficit === 'number'
                      ? item.remainingDeficit
                      : Math.max(0, item.quantityNeeded - item.quantityFulfilled);
                    const isCritical = item.quantityFulfilled === 0 && item.quantityNeeded > 0;
                    const isLow = remainingDeficit > 0;

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
                        <td className="p-2 tabular-nums font-bold text-[#2E6E4E]">
                          {item.quantityFulfilled} {item.unit}
                        </td>
                        <td className="p-2 tabular-nums">
                          {remainingDeficit > 0 ? (
                            <span className="font-bold text-[#B23A2E]">-{remainingDeficit} {item.unit}</span>
                          ) : (
                            <span className="text-[#2E6E4E] font-semibold">Fulfilled</span>
                          )}
                        </td>
                        <td className="p-2">
                          <span
                            className={`px-1.5 py-0.5 rounded font-mono text-[9px] font-bold uppercase border ${
                              isCritical
                                ? 'bg-[#B23A2E]/15 border-[#B23A2E]/30 text-[#B23A2E]'
                                : isLow
                                ? 'bg-[#C97A2B]/15 border-[#C97A2B]/30 text-[#C97A2B]'
                                : 'bg-[#2E6E4E]/15 border-[#2E6E4E]/30 text-[#2E6E4E]'
                            }`}
                          >
                            {isCritical ? 'CRITICAL SHORTAGE' : isLow ? 'DEFICIT' : 'SUFFICIENT'}
                          </span>
                        </td>
                        <td className="p-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {shelter && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleQuickFulfill(item, 10)}
                                  className="px-2 py-0.5 bg-[#EFECE4] hover:bg-[#D8D3C7] rounded border border-[#D8D3C7] text-[10px]"
                                  title="Quick-verify 10 units"
                                >
                                  +10
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenShipmentModal(item)}
                                  className="px-2.5 py-0.5 bg-[#14231F] hover:bg-black text-white rounded text-[10px] font-display font-semibold flex items-center gap-1"
                                >
                                  <Truck className="w-3 h-3" />
                                  Log Delivery
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : (
            shipments.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-[#14231F]/60">
                No verified supply shipments logged yet for this facility.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#EFECE4] text-[10px] uppercase text-[#14231F]/70 border-b border-[#D8D3C7]">
                  <tr>
                    <th className="p-2">Receipt Date</th>
                    <th className="p-2">Item Delivered</th>
                    <th className="p-2">Claimed</th>
                    <th className="p-2">Verified Count</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D8D3C7]">
                  {shipments.map((s) => (
                    <tr key={s.id}>
                      <td className="p-2 text-[11px] text-[#14231F]/70">
                        {new Date(s.receivedAt).toLocaleDateString()} {new Date(s.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-2 font-display font-bold text-[#14231F]">
                        {s.itemName}
                        {s.supplyRequest && (
                          <div className="text-[10px] font-mono font-normal text-[#14231F]/60">
                            Target need: {s.supplyRequest.quantityNeeded} {s.supplyRequest.unit}
                          </div>
                        )}
                      </td>
                      <td className="p-2 tabular-nums">{s.quantityClaimed}</td>
                      <td className="p-2 tabular-nums font-bold text-[#2E6E4E]">
                        {s.quantityVerified}
                      </td>
                      <td className="p-2">
                        <span className="px-1.5 py-0.5 rounded font-mono text-[9px] font-bold uppercase bg-[#2E6E4E]/15 border border-[#2E6E4E]/30 text-[#2E6E4E] flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> VERIFIED RECEIPT
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>
    </div>
  );
}
