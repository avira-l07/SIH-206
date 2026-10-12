import ModalDialog from '../components/ModalDialog';
import useDashboardRefresh from '../hooks/useDashboardRefresh';
import { refreshSections } from '../services/dashboardRefresh';
import DashboardTabs from '../components/DashboardTabs';
import QuickActions from '../components/QuickActions';
import useConsoleSection from '../hooks/useConsoleSection';
import ResponseWorkspace from '../components/ResponseWorkspace';
import CreateShelter from '../components/CreateShelter';
import OperationalStats from '../components/OperationalStats';
import { subscribeSocketEvents } from '../services/socketEvents';
import AdminUserApproval from '../components/AdminUserApproval';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import MapView from '../components/MapView';
import OfflineSimulationDrawer from '../components/OfflineSimulationDrawer';
import { Radio, CloudRain, Activity, AlertTriangle, Loader2 } from 'lucide-react';
import ShelterSuppliesModal from '../components/ShelterSuppliesModal';
import AdminShelterRollup from '../components/AdminShelterRollup';

export default function AdminDashboard() {
  const { user } = useAuth();
  const { socket } = useSocket();

  const refreshVersion = React.useRef(0);
  const invalidateRefresh = useCallback(() => { refreshVersion.current++; }, []);
  const [notice, setNotice] = useState('');
  const [dataError, setDataError] = useState('');
  const [broadcastError, setBroadcastError] = useState('');
  const [dataLoading, setDataLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [sosList, setSosList] = useState([]);
  const [hazardReports, setHazardReports] = useState([]);
  const [focusCoords, setFocusCoords] = useState(null);
  const [viewMode, setViewMode] = useConsoleSection(['KANBAN','MAP','SHELTERS','BROADCASTS','TEAM'],'KANBAN');
  const [viewingSuppliesShelter, setViewingSuppliesShelter] = useState(null);
  const [restockAlert, setRestockAlert] = useState(null);

  const [adminCoords, setAdminCoords] = useState(null);

  // Broadcast Modal State
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastMode, setBroadcastMode] = useState('area'); // 'area' | 'geospatial'
  const [alertForm, setAlertForm] = useState({
    hazardType: 'ADVISORY',
    severity: 'WATCH',
    region: '',
    lat: user?.lat ?? '',
    lng: user?.lng ?? '',
    radiusKm: 15.0,
    message: '',
  });
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, label } or null

  // Simulation Tool State
  const [simRegion, setSimRegion] = useState('Chamoli');
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const [registryStats, setRegistryStats] = useState({ totalPhones: 0, totalPushSubs: 0 });

  // Dedicated Area Public Broadcast State (Decision 0.3)
  const [areaBroadcastRegion, setAreaBroadcastRegion] = useState('All Regions (National/Statewide)');
  const [areaBroadcastMessage, setAreaBroadcastMessage] = useState('');
  const [areaBroadcastLoading, setAreaBroadcastLoading] = useState(false);
  const [areaBroadcastResult, setAreaBroadcastResult] = useState(null);

  const handleSendAreaBroadcast = async (e) => {
    if (e) e.preventDefault();
    if (!areaBroadcastMessage.trim()) return;

    setAreaBroadcastLoading(true);
    setAreaBroadcastResult(null);

    try {
      await api.post('/alerts', {
        region: areaBroadcastRegion,
        message: areaBroadcastMessage.trim(),
        hazardType: 'ADVISORY',
        severity: 'WATCH',
        radiusKm: 25.0,
      });

      setAreaBroadcastResult({
        success: true,
        message: `Alert published for ${areaBroadcastRegion}. SMS and push delivery depend on configured providers.`,
      });
      setAreaBroadcastMessage('');
      } catch (err) {
      console.error('Failed to send area broadcast:', err);
      setAreaBroadcastResult({
        success: false,
        message: err.response?.data?.error || 'Failed to dispatch area broadcast',
      });
    } finally {
      setAreaBroadcastLoading(false);
    }
  };

  const fetchConsoleData = useCallback(async () => {
    const version = ++refreshVersion.current; setDataLoading(true);
    try {
      const result = await refreshSections([
        { label: 'Alerts', load: () => api.get('/alerts?activeOnly=false'), apply: res => setAlerts(res.data.alerts || []) },
        { label: 'Shelters', load: () => api.get('/shelters'), apply: res => setShelters(res.data.shelters || []) },
        { label: 'Requests', load: () => api.get('/sos'), apply: res => setSosList(res.data.requests || []) },
        { label: 'Hazards', load: () => api.get('/hazards'), apply: res => setHazardReports(res.data.reports || []) },
        { label: 'Registry statistics', load: () => api.get('/registry/stats'), apply: res => setRegistryStats(res.data) },
      ], () => version === refreshVersion.current);
      if (!result.applied) return;
      setDataError(result.failed.length ? 'Could not refresh: ' + result.failed.join(', ') + '. Previously loaded data may be out of date.' : '');

    } catch { if (version === refreshVersion.current) setDataError('Could not refresh the dashboard. Please retry.'); }
    finally { if (version === refreshVersion.current) setDataLoading(false); }
  }, []);

  useDashboardRefresh(socket, fetchConsoleData, invalidateRefresh);

  useEffect(() => {

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setAdminCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, [fetchConsoleData]);

  // Socket.io sync
  useEffect(() => {
    if (!socket) return;
    const handlers = {};
    const on = (event, handler) => { handlers[event] = handler; };

    on('sos:created', (newSOS) => {
      setSosList((prev) => [newSOS, ...prev.filter((s) => s.id !== newSOS.id)]);
    });

    on('sos:status_changed', (updatedSOS) => {
      setSosList((prev) =>
        prev.map((s) => (s.id === updatedSOS.id ? updatedSOS : s))
      );
    });

    on('alert:new', (newAlert) => {
      setAlerts((prev) => [newAlert, ...prev.filter((a) => a.id !== newAlert.id)]);
    });

    on('alert:deactivated', (deactivated) => {
      setAlerts((prev) =>
        prev.map((a) => (a.id === deactivated.id ? { ...a, active: false } : a))
      );
    });

    on('alert:deleted', (payload) => {
      // Single delete or bulk: remove from local state by id(s)
      if (payload.bulk) {
        setAlerts((prev) => prev.filter((a) => a.active)); // keep only active ones
      } else if (payload.id) {
        setAlerts((prev) => prev.filter((a) => a.id !== payload.id));
      }
    });

    on('shelter:occupancy_changed', (updatedShelter) => {
      setShelters((prev) =>
        [updatedShelter, ...prev.filter((s) => s.id !== updatedShelter.id)]
      );
    });

    on('shelter:audit_updated', (updatedShelter) => {
      setShelters((prev) =>
        [updatedShelter, ...prev.filter((s) => s.id !== updatedShelter.id)]
      );
    });

    on('hazard:new', (newReport) => {
      setHazardReports((prev) => [newReport, ...prev.filter((r) => r.id !== newReport.id)]);
    });

    on('hazard:confirmed', (updatedReport) => {
      setHazardReports((prev) =>
        prev.map((r) => (r.id === updatedReport.id ? updatedReport : r))
      );
    });

    on('hazard:tier_changed', (updatedReport) => {
      setHazardReports((prev) =>
        prev.map((r) => (r.id === updatedReport.id ? updatedReport : r))
      );
    });

    on('shelter:restock_needed', (alertData) => {
      setRestockAlert(alertData);
    });

    return subscribeSocketEvents(socket, handlers);
  }, [socket]);

  // Handle Broadcast Alert
  const handleBroadcastAlert = async (e) => {
    e.preventDefault();
    setBroadcastLoading(true);
    setBroadcastError('');
    try {
      const res = await api.post('/alerts', {
        ...alertForm,
        lat: parseFloat(alertForm.lat),
        lng: parseFloat(alertForm.lng),
        radiusKm: parseFloat(alertForm.radiusKm) || 5.0,
      });
      setAlerts((prev) => [res.data.alert, ...prev.filter(a => a.id !== res.data.alert.id)]);
      setFocusCoords([res.data.alert.lat, res.data.alert.lng]);
      setBroadcastOpen(false);
      setBroadcastSuccess(`Alert #${res.data.alert.id} (${res.data.alert.severity} ${res.data.alert.hazardType}) published to the live feed. External delivery depends on configured providers.`);
      setTimeout(() => setBroadcastSuccess(null), 6000);
    } catch (err) {
      setBroadcastError(err.response?.data?.error || 'Failed to broadcast alert');
    } finally {
      setBroadcastLoading(false);
    }
  };

  // 1-tap Deactivate Alert (PATCH /alerts/:id/deactivate)
  const handleDeactivateAlert = async (alertId) => {
    try {
      await api.patch(`/alerts/${alertId}/deactivate`, {});
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, active: false } : a))
      );
    } catch (err) {
      setDataError(err.response?.data?.error || 'Failed to deactivate alert');
    }
  };

  // Soft-delete a resolved alert (only allowed when active=false)
  const handleDeleteAlert = async (alertId) => {
    try {
      await api.delete(`/alerts/${alertId}`);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      setBroadcastSuccess(`Alert #${alertId} permanently removed from log.`);
      setTimeout(() => setBroadcastSuccess(null), 5000);
    } catch (err) {
      setDataError(err.response?.data?.error || 'Failed to delete alert');
    } finally {
      setConfirmDelete(null);
    }
  };

  // Bulk soft-delete all resolved/deactivated alerts
  const handleBulkDeleteResolved = async () => {
    try {
      const res = await api.post('/alerts/bulk-delete-resolved');
      const { count } = res.data;
      setAlerts((prev) => prev.filter((a) => a.active));
      setBroadcastSuccess(res.data.message || `${count} resolved alerts cleared.`);
      setTimeout(() => setBroadcastSuccess(null), 5000);
    } catch (err) {
      setDataError(err.response?.data?.error || 'Bulk delete failed');
    }
  };

  // Handle Weather / IoT Risk Simulation
  const handleRunSimulation = async () => {
    setSimLoading(true);
    setSimResult(null);
    try {
      const res = await api.post('/alerts/simulate', { region: simRegion });
      setSimResult(res.data);
      if (res.data.alert) {
        setAlerts((prev) => [res.data.alert, ...prev.filter(a => a.id !== res.data.alert.id)]);
        setFocusCoords([res.data.alert.lat, res.data.alert.lng]);
        setBroadcastSuccess(`Simulation triggered ${res.data.alert.severity} alert for ${res.data.alert.region}.`);
        setTimeout(() => setBroadcastSuccess(null), 6000);
      }
    } catch (err) {
      setDataError(err.response?.data?.error || 'Simulation trigger failed');
    } finally {
      setSimLoading(false);
    }
  };

  // Quick Shelter Occupancy Delta (Commutative Event Flow)

  const handleConfirmHazard = async (reportId) => {
    try {
      const res = await api.post(`/hazards/${reportId}/confirm`);
      setHazardReports((prev) =>
        prev.map((r) => (r.id === reportId ? res.data.report : r))
      );
      setNotice('Hazard confirmation saved.');
    } catch (err) {
      setDataError(err.response?.data?.error || 'Failed to confirm report');
    }
  };


  return (
    <div className="flex flex-col min-w-0 w-full min-h-[calc(100vh-61px)]">
      {notice && <p role="status" className="px-4 py-3 bg-emerald-50 text-emerald-900">{notice} <button className="underline ml-2" onClick={() => setNotice('')}>Dismiss</button></p>}
      {dataLoading && <p role="status" className="px-4 py-2 text-sm">Refreshing live data…</p>}
      {dataError && <div role="alert" className="px-4 py-3 bg-red-50 text-red-800">{dataError} <button type="button" className="underline font-bold" onClick={fetchConsoleData}>Retry</button></div>}
      {/* Broadcast Success Notification */}
      {broadcastSuccess && (
        <div className="bg-[#2E6E4E] text-white p-3 rounded mx-4 mt-2 flex items-center justify-between gap-3 shadow-md font-mono text-xs">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-300 shrink-0 animate-pulse" />
            <div>
              <span className="font-bold uppercase tracking-wider">OFFICIAL BROADCAST TRANSMITTED:</span>{' '}
              {broadcastSuccess}
            </div>
          </div>
          <button
            onClick={() => setBroadcastSuccess(null)}
            className="px-2 py-1 text-white/80 hover:text-white text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Critical Restock Alert Banner */}
      {restockAlert && (
        <div className="bg-[#B23A2E] text-white p-3 rounded mx-4 mt-2 flex items-center justify-between gap-3 shadow-md font-mono text-xs animate-pulse">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0" />
            <div>
              <span className="font-bold uppercase tracking-wider">CRITICAL SHELTER INVENTORY DEPLETION:</span>{' '}
              {restockAlert.message || `Shelter #${restockAlert.shelterId} inventory depleted below reserve threshold!`}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                const target = shelters.find((s) => s.id === restockAlert.shelterId) || { id: restockAlert.shelterId, name: `Shelter #${restockAlert.shelterId}` };
                setViewingSuppliesShelter(target);
              }}
              className="px-3 py-1 bg-white text-[#B23A2E] font-bold rounded hover:bg-amber-100 text-xs uppercase"
            >
              Authorize Relief Shipment
            </button>
            <button
              onClick={() => setRestockAlert(null)}
              className="px-2 py-1 text-white/80 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl w-full mx-auto p-3 sm:p-4 pb-20 flex-1 flex flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">Operator dashboard</h1><p className="mt-1 text-sm text-[#14231F]/65">Review requests, coordinate volunteers and publish local alerts.</p></div><button type="button" onClick={() => { setBroadcastError(''); setBroadcastMode('area'); setBroadcastOpen(true); }} className="rounded-lg bg-[#14231F] px-4 py-2.5 text-sm font-semibold text-white">Send alert</button></header>
        <QuickActions user={user} tickets={sosList} loading={dataLoading} stale={Boolean(dataError)} />
        <OperationalStats />
        <DashboardTabs tabs={[{ id: 'KANBAN', label: 'Requests' }, { id: 'MAP', label: 'Map' }, { id: 'SHELTERS', label: 'Shelters & supplies' }, { id: 'BROADCASTS', label: 'Alerts' }, { id: 'TEAM', label: 'Volunteer team' }]} value={viewMode} onChange={setViewMode} />
        {/* Dynamic Body: Map View, Kanban, Shelters, or Broadcasts */}
        {viewMode === 'KANBAN' ? (
          <ResponseWorkspace
            sosList={sosList}
            currentUser={user}
            onSOSUpdated={(updated) =>
              setSosList((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
            }
            onSelectCoords={(coords) => {
              setFocusCoords(coords);
              setViewMode('MAP');
            }}
          />
        ) : viewMode === 'SHELTERS' ? (
          <div className="space-y-4 flex-1">
            <CreateShelter onCreated={shelter => setShelters(prev => [shelter, ...prev.filter(s => s.id !== shelter.id)])} />
            <AdminShelterRollup onViewSupplies={setViewingSuppliesShelter}
              shelters={shelters}
              onSelectShelterCoords={(coords) => {
                setFocusCoords(coords);
                setViewMode('MAP');
              }}
            />
          </div>
        ) : viewMode === 'BROADCASTS' ? (
          <section className="space-y-4"><h2 className="text-lg font-bold">Published alerts</h2>{alerts.length === 0 && <p className="rounded-lg border bg-white p-6 text-sm">No alerts published yet.</p>}<div className="grid grid-cols-1 md:grid-cols-2 gap-4">{alerts.map(item => <article key={item.id} className="rounded-xl border border-[#D8D3C7] bg-white p-5 space-y-3"><div className="flex justify-between gap-3"><h3 className="font-semibold">{item.region}</h3><span className={item.active ? 'text-red-700 text-xs font-semibold' : 'text-xs text-[#14231F]/50'}>{item.active ? item.severity === 'CRITICAL' ? 'Critical' : 'Advisory' : 'Ended'}</span></div><p className="text-sm">{item.message}</p><p className="text-xs opacity-60">{new Date(item.createdAt).toLocaleString()}</p><div className="flex gap-3 flex-wrap"><button className="text-sm underline" onClick={() => { setFocusCoords([item.lat, item.lng]); setViewMode('MAP'); }}>View on map</button>{item.active ? <button className="text-sm underline text-red-700" onClick={() => handleDeactivateAlert(item.id)}>End alert</button> : <button className="text-sm underline text-red-700" onClick={() => setConfirmDelete({ id: item.id, label: item.region })}>Delete record</button>}</div><details className="text-xs"><summary className="cursor-pointer opacity-60">Alert details</summary><p className="mt-2">{item.hazardType} · {item.radiusKm} km radius · {item.lat.toFixed(4)}, {item.lng.toFixed(4)}</p></details></article>)}</div>{alerts.some(a => !a.active) && <button className="text-sm underline" onClick={() => { if (window.confirm('Delete all ended alert records?')) handleBulkDeleteResolved(); }}>Clear ended alert records</button>}</section>
        ) : viewMode === 'TEAM' ? <AdminUserApproval /> : (
          <section className="h-[540px]">                <MapView
                  alerts={alerts.filter((a) => a.active)}
                  sosRequests={sosList}
                  shelters={shelters}
                  hazardReports={hazardReports}
                  userCoords={adminCoords}
                  focusCoords={focusCoords}
                  onConfirmHazard={handleConfirmHazard}
                  onViewSupplies={(s) => setViewingSuppliesShelter(s)}
                  userRole="ADMIN"
                /></section>
        )}
        <details className="rounded-lg border border-[#D8D3C7] p-3"><summary className="cursor-pointer text-sm text-[#14231F]/65">Demo & weather tools</summary><div className="max-w-xl mt-3">                {/* AI/IoT Risk Engine Simulator Card */}
                <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-[#D8D3C7]">
                    <div className="flex items-center gap-2">
                      <CloudRain className="w-4 h-4 text-[#2E6E4E]" />
                      <h3 className="font-display font-bold text-sm text-[#14231F] uppercase">
                        AI / IoT Risk Simulator
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono bg-[#EFECE4] px-1.5 py-0.5 rounded text-[#14231F]/80">
                      DEMO TOOL
                    </span>
                  </div>

                  <p className="text-[11px] text-[#14231F]/70 font-mono">
                    Simulates real-time telemetry from weather station & IoT sensor feeds. Drives the risk engine to auto-trigger alerts.
                  </p>

                  <div>
                    <label className="block text-[11px] font-mono text-[#14231F]/80 mb-1">
                      Target Telemetry Region:
                    </label>
                    <select
                      value={simRegion}
                      onChange={(e) => setSimRegion(e.target.value)}
                      className="w-full p-2 bg-[#F6F4EF] border border-[#D8D3C7] rounded text-xs font-mono"
                    >
                      <option value="Chamoli">Chamoli Landslide Corridor (Torrential Downpour / Landslide: 85mm/h)</option>
                      <option value="Dehradun">Dehradun Doon Valley (Continuous Downpour: 65mm/h)</option>
                      <option value="Kurla East">Kurla East (Torrential Flood Scenario: 75mm/h)</option>
                      <option value="Mumbai">Mumbai Regional (Heavy Rain Advisory: 42mm/h)</option>
                      <option value="Bandra">Bandra West (Moderate Baseline: 18mm/h)</option>
                      <option value="Chennai">Chennai Sector (Severe Wildfire & Heat: 43°C, Smoke Spike)</option>
                      <option value="Kutch">Kutch / Gujarat Rift (Seismic Sensor: 6.2M Earthquake)</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    id="trigger-simulation-btn"
                    disabled={simLoading}
                    onClick={handleRunSimulation}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-[#14231F] hover:bg-black text-[#F6F4EF] font-display font-bold text-xs rounded transition-colors disabled:opacity-50"
                  >
                    {simLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Activity className="w-3.5 h-3.5 text-[#2E6E4E]" />
                        <span>TRIGGER SENSOR RISK EVALUATION</span>
                      </>
                    )}
                  </button>

                  {simResult && (
                    <div className="p-2.5 bg-[#EFECE4] border border-[#D8D3C7] rounded text-xs space-y-1 font-mono">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#14231F]">
                          Rule severity (not probability): {simResult.assessment?.score}/100
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${
                            simResult.assessment?.severity === 'CRITICAL'
                              ? 'bg-[#B23A2E]'
                              : 'bg-[#C97A2B]'
                          }`}
                        >
                          {simResult.assessment?.severity} // {simResult.assessment?.hazardType}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#14231F]/80">{simResult.assessment?.reason}</p>
                      {simResult.alert && (
                        <div className="text-[10px] text-[#2E6E4E] font-bold pt-1 border-t border-[#D8D3C7]">
                          ✓ Broadcasted alert #{simResult.alert.id} to emergency network!
                        </div>
                      )}
                    </div>
                  )}
                </div>

</div></details>
      </div>

      {/* Confirm Delete Alert Dialog */}
      {confirmDelete && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div className="bg-white border-2 border-red-200 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <div className="font-mono text-xs uppercase text-red-500 font-bold tracking-wider">Irreversible Action</div>
                <h3 className="font-display font-bold text-[#14231F]">Delete Alert Log Entry?</h3>
              </div>
            </div>
            <p className="text-sm text-[#14231F]/80 font-mono bg-[#FAF8F5] border border-[#D8D3C7] rounded p-3">
              Alert {confirmDelete.label} will be <strong>permanently removed</strong> from the log. The broadcast was already deactivated, so no active emergency is affected. This action cannot be undone.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => handleDeleteAlert(confirmDelete.id)}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-lg transition-colors"
              >
                Delete Permanently
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 bg-[#EFECE4] hover:bg-[#D8D3C7] text-[#14231F] font-semibold text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Alert Modal */}
      {broadcastOpen && (

        <ModalDialog label={broadcastMode === 'area' ? 'Send public alert to area' : 'Geospatial incident broadcast'} onClose={() => setBroadcastOpen(false)}>
          <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded max-w-lg w-full p-6 shadow-xl text-[#14231F]">
            <div className="flex items-center justify-between pb-3 border-b border-[#D8D3C7]">
              <div className="flex items-center gap-2 text-[#B23A2E]">
                <Radio className="w-5 h-5" />
                <h2 className="font-display font-bold text-lg uppercase tracking-tight">
                  {broadcastMode === 'area' ? 'Send Public Alert to Area' : 'Geospatial Incident Broadcast'}
                </h2>
              </div>
              <button
                onClick={() => setBroadcastOpen(false)}
                className="text-xs font-mono px-2 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] rounded text-[#14231F]"
              >
                ESC / CANCEL
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex items-center gap-2 mt-3 border-b border-[#D8D3C7] pb-2 text-xs font-mono">
              <button
                type="button"
                id="tab-area-broadcast"
                onClick={() => setBroadcastMode('area')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${
                  broadcastMode === 'area'
                    ? 'bg-[#14231F] text-white font-bold'
                    : 'bg-[#FAF8F5] text-[#14231F]/70 hover:bg-[#EFECE4]'
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-[#4ADE80]" />
                <span>Send Public Alert to Area</span>
              </button>
              <button
                type="button"
                id="tab-geospatial-broadcast"
                onClick={() => setBroadcastMode('geospatial')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${
                  broadcastMode === 'geospatial'
                    ? 'bg-[#B23A2E] text-white font-bold'
                    : 'bg-[#FAF8F5] text-[#14231F]/70 hover:bg-[#EFECE4]'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Geospatial Incident Broadcast</span>
              </button>
            </div>

            {/* Public Reach Multi-Channel Telemetry (Aggregate Only — Strict Privacy) */}
            <div className="mt-3 p-2.5 bg-[#14231F] text-[#F6F4EF] rounded space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/70 uppercase">Target Audience:</span>
                <span className="text-[#4ADE80] font-bold text-[10px]">{registryStats.channelsActive?.length ?? 0} CHANNELS AVAILABLE</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="bg-white/10 p-1.5 rounded flex flex-col justify-center">
                  <div className="text-sm font-bold text-[#E5A93C]">{registryStats.totalPhones}</div>
                  <div className="text-[10px] text-white/70">Registered phones</div>
                </div>
                <div className="bg-white/10 p-1.5 rounded flex flex-col justify-center">
                  <div className="text-sm font-bold text-[#4ADE80]">{registryStats.totalPushSubs}</div>
                  <div className="text-[10px] text-white/70">Registered push devices</div>
                </div>
              </div>
              <div className="text-[10px] text-white/60 text-center">
                + Instant WebSocket push to all logged-in field units & citizens
              </div>
            </div>

            {broadcastMode === 'area' ? (
              /* DEDICATED STREAMLINED AREA BROADCAST (DECISION 0.3) */
              <form onSubmit={handleSendAreaBroadcast} className="mt-4 space-y-3.5">
                <div>
                  <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1 font-bold">
                    Target Alert Region / Zone
                  </label>
                  <select
                    aria-label="Target Alert Region / Zone" id="area-broadcast-region-select"
                    value={areaBroadcastRegion}
                    onChange={(e) => setAreaBroadcastRegion(e.target.value)}
                    className="w-full p-2 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-xs font-mono focus:outline-none focus:border-[#14231F]"
                  >
                    <option value="All Regions (National/Statewide)">All Regions (National / Statewide)</option>
                    <option value="Chamoli - Badrinath Corridor">Chamoli - Badrinath Corridor</option>
                    <option value="Dehradun - Doon Valley Catchment">Dehradun - Doon Valley Catchment</option>
                    <option value="Rishikesh - Ganga Basin">Rishikesh - Ganga Basin</option>
                    <option value="Haridwar - Silt & Flood Zone">Haridwar - Silt & Flood Zone</option>
                    <option value="Joshimath - Mountain Refuge">Joshimath - Mountain Refuge</option>
                    <option value="Rudraprayag - Valley Confluence">Rudraprayag - Valley Confluence</option>
                  </select>
                  <p className="text-[10px] text-[#14231F]/60 mt-1 font-mono">
                    Publishes to the live feed. SMS and push depend on configured providers; registered recipients are not delivery receipts.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-mono uppercase text-[#14231F]/80 font-bold">
                      Public Advisory Message
                    </label>
                    <span className="text-[10px] font-mono text-[#14231F]/60">
                      {areaBroadcastMessage.length} chars
                    </span>
                  </div>
                  <textarea
                    id="area-broadcast-message-input"
                    rows={3}
                    required
                    placeholder="Enter urgent safety instructions (e.g., Flash flood warning: Avoid riverbanks and low bridges...)"
                    value={areaBroadcastMessage}
                    onChange={(e) => setAreaBroadcastMessage(e.target.value)}
                    className="w-full p-2 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-xs focus:outline-none focus:border-[#14231F] font-mono"
                  />
                </div>

                {/* Quick Presets for Rapid Response */}
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase text-[#14231F]/60">Quick Advisory Presets:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: '🌊 Flash Flood', text: 'Flash Flood Advisory: Rising river levels observed. Avoid riverbanks, ghats, and low bridges immediately.' },
                      { label: '⛰️ Landslide Roadblock', text: 'Landslide Warning: Heavy debris flow on mountain corridor. Avoid travel and stay clear of unstable slopes.' },
                      { label: '🌧️ Cloudburst Warning', text: 'Severe Cloudburst Warning: Intense localized downpour expected. Relocate to reinforced elevated shelter.' }
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setAreaBroadcastMessage(preset.text)}
                        className="text-[10px] font-mono px-2 py-1 bg-[#FAF8F5] hover:bg-[#EFECE4] border border-[#D8D3C7] rounded text-[#14231F] transition-colors"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {areaBroadcastResult && (
                  <div
                    className={`p-2.5 rounded text-xs font-mono ${
                      areaBroadcastResult.success
                        ? 'bg-[#EBF7EE] text-[#1E6B37] border border-[#A3D9B1]'
                        : 'bg-[#FDF2F0] text-[#B23A2E] border border-[#F0A8A0]'
                    }`}
                  >
                    {areaBroadcastResult.message}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#D8D3C7]">
                  <button
                    type="button"
                    onClick={() => setBroadcastOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-[#14231F]/70"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="submit-area-broadcast-btn"
                    disabled={areaBroadcastLoading || !areaBroadcastMessage.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-[#14231F] hover:bg-[#1f3731] text-white font-display font-bold text-xs rounded transition-colors disabled:opacity-50"
                  >
                    {areaBroadcastLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Radio className="w-3.5 h-3.5 text-[#4ADE80]" />
                    )}
                    <span>DISPATCH PUBLIC ALERT TO AREA</span>
                  </button>
                </div>
              </form>
            ) : (
              /* GEOSPATIAL INCIDENT BROADCAST FORM */
              <form onSubmit={handleBroadcastAlert} className="mt-4 space-y-3.5">
                {broadcastError && <p role="alert" className="text-sm text-red-700">{broadcastError}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1">
                      Hazard Type
                    </label>
                    <select
                      aria-label="Hazard Type" value={alertForm.hazardType}
                      onChange={(e) => setAlertForm({ ...alertForm, hazardType: e.target.value })}
                      className="w-full p-2 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-xs font-mono"
                    >
                      <option value="LANDSLIDE">LANDSLIDE</option>
                      <option value="ADVISORY">General advisory</option>
                      <option value="FLOOD">FLOOD</option>
                      <option value="EARTHQUAKE">EARTHQUAKE</option>
                      <option value="FIRE">FIRE</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1">
                      Severity Tier
                    </label>
                    <select
                      aria-label="Severity Tier" value={alertForm.severity}
                      onChange={(e) => setAlertForm({ ...alertForm, severity: e.target.value })}
                      className="w-full p-2 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-xs font-mono"
                    >
                      <option value="CRITICAL">CRITICAL (Direct Emergency)</option>
                      <option value="WATCH">WATCH (Advisory Warning)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1">
                    Region / Sector Name
                  </label>
                  <input
                    type="text"
                    required
                    aria-label="Region / Sector Name" value={alertForm.region}
                    onChange={(e) => setAlertForm({ ...alertForm, region: e.target.value })}
                    className="w-full p-2 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-xs font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1">
                      Center Latitude
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      required
                      aria-label="Center Latitude" value={alertForm.lat}
                      onChange={(e) => setAlertForm({ ...alertForm, lat: e.target.value })}
                      className="w-full p-2 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1">
                      Center Longitude
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      required
                      aria-label="Center Longitude" value={alertForm.lng}
                      onChange={(e) => setAlertForm({ ...alertForm, lng: e.target.value })}
                      className="w-full p-2 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Radius Selector */}
                <div className="p-3 bg-[#FAF8F5] border border-[#D8D3C7] rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-mono uppercase text-[#14231F] font-bold">
                      Emergency Coverage Radius
                    </label>
                    <span className="text-xs font-mono font-bold text-[#B23A2E]">
                      {alertForm.radiusKm} km radius
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {[2, 5, 10, 25, 50].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAlertForm({ ...alertForm, radiusKm: preset })}
                        className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
                          Number(alertForm.radiusKm) === preset
                            ? 'bg-[#14231F] text-white border-[#14231F] font-bold shadow-xs'
                            : 'bg-white text-[#14231F] border-[#D8D3C7] hover:bg-[#EFECE4]'
                        }`}
                      >
                        {preset} km
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs font-mono text-[#14231F]/70">Custom radius:</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="500"
                      value={alertForm.radiusKm}
                      onChange={(e) => setAlertForm({ ...alertForm, radiusKm: e.target.value })}
                      className="w-24 p-1.5 bg-white border border-[#D8D3C7] rounded text-xs font-mono focus:outline-none focus:border-[#14231F]"
                    />
                    <span className="text-xs font-mono text-[#14231F]/70">km (kilometers)</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1">
                    Public Advisory Message
                  </label>
                  <textarea
                    rows={3}
                    required
                    aria-label="Public Advisory Message" value={alertForm.message}
                    onChange={(e) => setAlertForm({ ...alertForm, message: e.target.value })}
                    className="w-full p-2 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-xs focus:outline-none focus:border-[#14231F]"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#D8D3C7]">
                  <button
                    type="button"
                    onClick={() => setBroadcastOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-[#14231F]/70"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={broadcastLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-[#B23A2E] hover:bg-[#992c21] text-white font-display font-bold text-xs rounded transition-colors disabled:opacity-50"
                  >
                    {broadcastLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
                    <span>TRANSMIT OFFICIAL BROADCAST</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </ModalDialog>
      )}

      {/* Offline & SMS Simulation Drawer */}
      <OfflineSimulationDrawer onDataChanged={fetchConsoleData} />

      {/* Shelter Supplies & Shipments Modal */}
      <ShelterSuppliesModal
        isOpen={Boolean(viewingSuppliesShelter)}
        onClose={() => setViewingSuppliesShelter(null)}
        shelter={viewingSuppliesShelter}
      />
    </div>
  );
}
