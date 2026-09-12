import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import MapView from '../components/MapView';
import AlertBanner from '../components/AlertBanner';
import TriageKanban from '../components/TriageKanban';
import OfflineSimulationDrawer from '../components/OfflineSimulationDrawer';
import {
  ShieldAlert,
  Radio,
  CloudRain,
  Home,
  Activity,
  AlertTriangle,
  Loader2,
  Map,
  Kanban,
  Phone,
  Users,
  Search,
  X,
} from 'lucide-react';
import ShelterSuppliesModal from '../components/ShelterSuppliesModal';
import AdminShelterRollup from '../components/AdminShelterRollup';

export default function AdminDashboard() {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [alerts, setAlerts] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [sosList, setSosList] = useState([]);
  const [hazardReports, setHazardReports] = useState([]);
  const [focusCoords, setFocusCoords] = useState(null);
  const [viewMode, setViewMode] = useState('MAP'); // 'MAP', 'KANBAN', 'SHELTERS', or 'BROADCASTS'
  const [viewingSuppliesShelter, setViewingSuppliesShelter] = useState(null);
  const [restockAlert, setRestockAlert] = useState(null);

  // Broadcast Modal State
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [alertForm, setAlertForm] = useState({
    hazardType: 'FLOOD',
    severity: 'CRITICAL',
    region: 'Kurla East - Mithi Basin',
    lat: 19.0726,
    lng: 72.8845,
    radiusKm: 5.0,
    message: 'Water levels rising rapidly (75mm/h). Immediate evacuation ordered for ground-floor residents.',
  });
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  // Simulation Tool State
  const [simRegion, setSimRegion] = useState('Kurla East');
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const [registryStats, setRegistryStats] = useState({ totalPhones: 0, totalPushSubs: 0 });

  // Subscriber Directory Modal State
  const [subscribersModalOpen, setSubscribersModalOpen] = useState(false);
  const [subscribersData, setSubscribersData] = useState({ phoneRegistrations: [], citizenUsers: [], pushSubscriptionsCount: 0 });
  const [subscribersLoading, setSubscribersLoading] = useState(false);
  const [subscriberSearch, setSubscriberSearch] = useState('');
  const [subscriberTab, setSubscriberTab] = useState('phones');

  const openSubscribersModal = async () => {
    setSubscribersModalOpen(true);
    setSubscribersLoading(true);
    try {
      const res = await api.get('/registry/subscribers');
      if (res.data?.success) {
        setSubscribersData(res.data);
      }
    } catch (err) {
      console.error('Failed to load registered subscribers:', err);
    } finally {
      setSubscribersLoading(false);
    }
  };

  const fetchConsoleData = async () => {
    try {
      const [alertsRes, sheltersRes, sosRes, hazardsRes, statsRes] = await Promise.all([
        api.get('/alerts?activeOnly=false'),
        api.get('/shelters'),
        api.get('/sos'),
        api.get('/hazards').catch(() => ({ data: { reports: [] } })),
        api.get('/registry/stats').catch(() => ({ data: { totalPhones: 0, totalPushSubs: 0 } })),
      ]);
      setAlerts(alertsRes.data.alerts || []);
      setShelters(sheltersRes.data.shelters || []);
      setSosList(sosRes.data.requests || []);
      setHazardReports(hazardsRes.data.reports || []);
      setRegistryStats(statsRes.data || { totalPhones: 0, totalPushSubs: 0 });
    } catch (err) {
      console.error('Error fetching admin data', err);
    }
  };

  useEffect(() => {
    fetchConsoleData();
  }, []);

  // Socket.io sync
  useEffect(() => {
    if (!socket) return;

    socket.on('sos:created', (newSOS) => {
      setSosList((prev) => [newSOS, ...prev.filter((s) => s.id !== newSOS.id)]);
    });

    socket.on('sos:status_changed', (updatedSOS) => {
      setSosList((prev) =>
        prev.map((s) => (s.id === updatedSOS.id ? updatedSOS : s))
      );
    });

    socket.on('alert:new', (newAlert) => {
      setAlerts((prev) => [newAlert, ...prev.filter((a) => a.id !== newAlert.id)]);
    });

    socket.on('shelter:occupancy_changed', (updatedShelter) => {
      setShelters((prev) =>
        prev.map((s) => (s.id === updatedShelter.id ? updatedShelter : s))
      );
    });

    socket.on('shelter:audit_updated', (updatedShelter) => {
      setShelters((prev) =>
        prev.map((s) => (s.id === updatedShelter.id ? updatedShelter : s))
      );
    });

    socket.on('hazard:new', (newReport) => {
      setHazardReports((prev) => [newReport, ...prev.filter((r) => r.id !== newReport.id)]);
    });

    socket.on('hazard:confirmed', (updatedReport) => {
      setHazardReports((prev) =>
        prev.map((r) => (r.id === updatedReport.id ? updatedReport : r))
      );
    });

    socket.on('hazard:tier_changed', (updatedReport) => {
      setHazardReports((prev) =>
        prev.map((r) => (r.id === updatedReport.id ? updatedReport : r))
      );
    });

    socket.on('shelter:restock_needed', (alertData) => {
      setRestockAlert(alertData);
    });

    return () => {
      socket.off('sos:created');
      socket.off('sos:status_changed');
      socket.off('alert:new');
      socket.off('shelter:occupancy_changed');
      socket.off('shelter:audit_updated');
      socket.off('shelter:restock_needed');
      socket.off('hazard:new');
      socket.off('hazard:confirmed');
      socket.off('hazard:tier_changed');
    };
  }, [socket]);

  // Handle Broadcast Alert
  const handleBroadcastAlert = async (e) => {
    e.preventDefault();
    setBroadcastLoading(true);
    try {
      const res = await api.post('/alerts', {
        ...alertForm,
        lat: parseFloat(alertForm.lat),
        lng: parseFloat(alertForm.lng),
        radiusKm: parseFloat(alertForm.radiusKm) || 5.0,
      });
      setAlerts((prev) => [res.data.alert, ...prev]);
      setFocusCoords([res.data.alert.lat, res.data.alert.lng]);
      setBroadcastOpen(false);
    } catch (err) {
      console.error('Broadcast failed', err);
      alert(err.response?.data?.error || 'Failed to broadcast alert');
    } finally {
      setBroadcastLoading(false);
    }
  };

  // 1-tap Deactivate Alert (PATCH /alerts/:id/deactivate)
  const handleDeactivateAlert = async (alertId) => {
    try {
      const res = await api.patch(`/alerts/${alertId}/deactivate`);
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, active: false } : a))
      );
    } catch (err) {
      console.error('Failed to deactivate alert', err);
      alert(err.response?.data?.error || 'Failed to deactivate alert');
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
        setAlerts((prev) => [res.data.alert, ...prev]);
        setFocusCoords([res.data.alert.lat, res.data.alert.lng]);
      }
    } catch (err) {
      console.error('Simulation error', err);
      alert(err.response?.data?.error || 'Simulation trigger failed');
    } finally {
      setSimLoading(false);
    }
  };

  // Quick Shelter Occupancy Delta (Commutative Event Flow)
  const handleAdjustOccupancy = async (shelterId, delta) => {
    try {
      const res = await api.post(`/shelters/${shelterId}/events`, {
        deltaOccupancy: delta,
        reason: delta > 0 ? 'Admin quick admit (+10)' : 'Admin quick release (-10)',
      });
      setShelters((prev) =>
        prev.map((s) => (s.id === shelterId ? res.data.shelter : s))
      );
    } catch (err) {
      console.error('Failed to apply shelter delta event', err);
    }
  };

  const handleConfirmHazard = async (reportId) => {
    try {
      const res = await api.post(`/hazards/${reportId}/confirm`);
      setHazardReports((prev) =>
        prev.map((r) => (r.id === reportId ? res.data.report : r))
      );
      alert(`Report confirmed by authority! Current tier: ${res.data.report.confidenceTier}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to confirm report');
    }
  };

  const totalCapacity = shelters.reduce((sum, s) => sum + s.capacity, 0);
  const totalOccupied = shelters.reduce((sum, s) => sum + s.currentOccupancy, 0);
  const activeAlertsCount = alerts.filter((a) => a.active).length;
  const pendingSOSCount = sosList.filter((s) => s.status === 'PENDING' || s.status === 'VERIFIED').length;
  const verifiedHazardsCount = hazardReports.filter((r) => r.confidenceTier === 'RED').length;

  return (
    <div className="flex flex-col min-h-[calc(100vh-61px)]">
      <AlertBanner
        alerts={alerts}
        onSelectAlert={(a) => setFocusCoords([a.lat, a.lng])}
      />

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

      <div className="max-w-7xl w-full mx-auto p-3 sm:p-4 flex-1 flex flex-col gap-4">
        {/* Command Top Strip */}
        <div className="bg-[#FFFFFF] border border-[#D8D3C7] p-4 rounded flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-[#B23A2E]" />
              <h1 className="font-display font-bold text-lg sm:text-xl text-[#14231F] tracking-tight">
                NDMA SITUATIONAL COMMAND CENTER
              </h1>
            </div>
            <p className="text-xs text-[#14231F]/70 font-mono mt-0.5">
              Authority ID: {user?.name || 'Director-General'} • System Status: NORMAL_DISPATCH_LEVEL
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-[#EFECE4] p-0.5 border border-[#D8D3C7] rounded text-xs font-mono">
              <button
                type="button"
                id="admin-view-map-btn"
                onClick={() => setViewMode('MAP')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded transition-colors ${
                  viewMode === 'MAP' ? 'bg-[#14231F] text-white font-bold' : 'text-[#14231F]/70 hover:text-[#14231F]'
                }`}
              >
                <Map className="w-3.5 h-3.5" />
                <span>INCIDENT MAP</span>
              </button>
              <button
                type="button"
                id="admin-view-kanban-btn"
                onClick={() => setViewMode('KANBAN')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded transition-colors ${
                  viewMode === 'KANBAN' ? 'bg-[#14231F] text-white font-bold' : 'text-[#14231F]/70 hover:text-[#14231F]'
                }`}
              >
                <Kanban className="w-3.5 h-3.5" />
                <span>TRIAGE KANBAN</span>
              </button>
              <button
                type="button"
                id="admin-view-shelters-btn"
                onClick={() => setViewMode('SHELTERS')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded transition-colors ${
                  viewMode === 'SHELTERS' ? 'bg-[#14231F] text-white font-bold' : 'text-[#14231F]/70 hover:text-[#14231F]'
                }`}
              >
                <Home className="w-3.5 h-3.5" />
                <span>SHELTER ROLLUP</span>
              </button>
              <button
                type="button"
                id="admin-view-broadcasts-btn"
                onClick={() => setViewMode('BROADCASTS')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded transition-colors ${
                  viewMode === 'BROADCASTS' ? 'bg-[#14231F] text-white font-bold' : 'text-[#14231F]/70 hover:text-[#14231F]'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>BROADCASTS ({activeAlertsCount})</span>
              </button>
            </div>

            <button
              id="open-broadcast-modal-btn"
              onClick={() => setBroadcastOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#B23A2E] hover:bg-[#992c21] text-white font-display font-bold text-xs rounded transition-colors"
            >
              <Radio className="w-4 h-4" />
              <span>BROADCAST OFFICIAL ALERT</span>
            </button>
          </div>
        </div>

        {/* Tactical Key Metrics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
          <div className="bg-[#FFFFFF] border border-[#D8D3C7] p-3 rounded">
            <div className="text-[11px] text-[#14231F]/70 font-semibold uppercase">Active Hazard Alerts</div>
            <div className="text-2xl font-bold text-[#B23A2E] tabular-nums mt-1">{activeAlertsCount}</div>
            <div className="text-[10px] text-[#14231F]/60 mt-0.5">Real-time broadcast live</div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#D8D3C7] p-3 rounded">
            <div className="text-[11px] text-[#14231F]/70 font-semibold uppercase">Pending Citizen SOS</div>
            <div className="text-2xl font-bold text-[#B23A2E] tabular-nums mt-1">{pendingSOSCount}</div>
            <div className="text-[10px] text-[#14231F]/60 mt-0.5">Awaiting field rescue</div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#D8D3C7] p-3 rounded">
            <div className="text-[11px] text-[#14231F]/70 font-semibold uppercase">Shelter Occupancy</div>
            <div className="text-2xl font-bold text-[#14231F] tabular-nums mt-1">
              {totalOccupied} / {totalCapacity}
            </div>
            <div className="text-[10px] text-[#2E6E4E] font-semibold mt-0.5">
              {totalCapacity - totalOccupied} beds free
            </div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#D8D3C7] p-3 rounded">
            <div className="text-[11px] text-[#14231F]/70 font-semibold uppercase">Verified Hazard Ground Truth</div>
            <div className="text-2xl font-bold text-[#2E6E4E] tabular-nums mt-1">{verifiedHazardsCount}</div>
            <div className="text-[10px] text-[#14231F]/60 mt-0.5">{hazardReports.length} total reports tracked</div>
          </div>
        </div>

        {/* Dynamic Body: Map View, Kanban, Shelters, or Broadcasts */}
        {viewMode === 'KANBAN' ? (
          <TriageKanban
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
            <AdminShelterRollup
              shelters={shelters}
              onSelectShelterCoords={(coords) => {
                setFocusCoords(coords);
                setViewMode('MAP');
              }}
            />
          </div>
        ) : viewMode === 'BROADCASTS' ? (
          <div className="space-y-4 flex-1">
            {/* Full View: Active Disaster Broadcasts Management Table */}
            <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded p-4 space-y-3 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#D8D3C7]">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-[#B23A2E]" />
                  <h3 className="font-display font-bold text-sm text-[#14231F] uppercase tracking-wide">
                    Active Disaster Broadcasts Management Table
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-[#B23A2E] text-white rounded font-bold">
                    {activeAlertsCount} ACTIVE
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setBroadcastOpen(true)}
                  className="px-3 py-1.5 bg-[#B23A2E] hover:bg-[#992c21] text-white font-bold text-xs rounded transition-colors font-mono"
                >
                  + NEW BROADCAST
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="bg-[#FAF8F5] border-b border-[#D8D3C7] text-[#14231F]/70 text-[11px] uppercase">
                      <th className="p-2.5">ID / Severity</th>
                      <th className="p-2.5">Hazard Type</th>
                      <th className="p-2.5">Target Region & Radius</th>
                      <th className="p-2.5">Center Coordinates</th>
                      <th className="p-2.5">Advisory Message</th>
                      <th className="p-2.5">Created At</th>
                      <th className="p-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D8D3C7]">
                    {alerts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-[#14231F]/50">
                          No disaster alerts registered in system.
                        </td>
                      </tr>
                    ) : (
                      alerts.map((alert) => {
                        const isActive = alert.active;
                        const isCritical = alert.severity === 'CRITICAL';
                        return (
                          <tr
                            key={alert.id}
                            className={`hover:bg-[#FAF8F5]/80 transition-colors ${
                              !isActive ? 'opacity-50 bg-[#F6F4EF]/40' : ''
                            }`}
                          >
                            <td className="p-2.5">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    isCritical
                                      ? 'bg-[#B23A2E] text-white'
                                      : 'bg-[#C97A2B] text-white'
                                  }`}
                                >
                                  {alert.severity}
                                </span>
                                <span className="text-[#14231F]/60 text-[10px]">#{alert.id}</span>
                              </div>
                            </td>
                            <td className="p-2.5 font-bold text-[#14231F]">
                              {alert.hazardType}
                            </td>
                            <td className="p-2.5">
                              <div className="font-semibold text-[#14231F]">{alert.region}</div>
                              <div className="text-[11px] text-[#14231F]/70">
                                Radius: <span className="font-bold text-[#14231F]">{alert.radiusKm || 5.0} km</span>
                              </div>
                            </td>
                            <td className="p-2.5 text-[#14231F]/80">
                              {typeof alert.lat === 'number' ? alert.lat.toFixed(4) : alert.lat},{' '}
                              {typeof alert.lng === 'number' ? alert.lng.toFixed(4) : alert.lng}
                            </td>
                            <td className="p-2.5 max-w-sm truncate text-[#14231F]/80" title={alert.message}>
                              {alert.message}
                            </td>
                            <td className="p-2.5 text-[#14231F]/60 text-[11px]">
                              {new Date(alert.createdAt).toLocaleString()}
                            </td>
                            <td className="p-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFocusCoords([alert.lat, alert.lng]);
                                    setViewMode('MAP');
                                  }}
                                  className="px-2 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] rounded text-[11px] text-[#14231F] font-semibold transition-colors"
                                  title="Focus Incident Map"
                                >
                                  Map
                                </button>
                                {isActive ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDeactivateAlert(alert.id)}
                                    className="px-2.5 py-1 bg-[#B23A2E] hover:bg-[#972E24] text-white font-bold rounded text-[11px] transition-colors shadow-xs"
                                    title="Deactivate broadcast and stand down warnings"
                                  >
                                    Deactivate
                                  </button>
                                ) : (
                                  <span className="px-2 py-1 bg-[#EFECE4] text-[#14231F]/50 rounded text-[10px] font-semibold">
                                    STANDBY
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Map (65% width) */}
              <div className="lg:col-span-8 flex flex-col min-h-[500px]">
                <div className="flex items-center justify-between mb-1 text-xs font-mono text-[#14231F]/70">
                  <span>REGIONAL SITUATIONAL OVERVIEW MAP</span>
                  <span>HAZARD RADII, SOS DISTRESS, VERIFIED HAZARD PINS & SHELTERS</span>
                </div>
                <MapView
                  alerts={alerts}
                  sosRequests={sosList}
                  shelters={shelters}
                  hazardReports={hazardReports}
                  focusCoords={focusCoords}
                  onConfirmHazard={handleConfirmHazard}
                  onViewSupplies={(s) => setViewingSuppliesShelter(s)}
                  userRole="ADMIN"
                />
              </div>

              {/* Admin Tools Side Panel (35% width) */}
              <div className="lg:col-span-4 flex flex-col gap-4">
                {/* AI/IoT Risk Engine Simulator Card */}
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
                          Risk Score: {simResult.assessment?.score}/100
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

                {/* Shelter Capacity Quick Rollup Summary Card (Replacing per-item editing) */}
                <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded p-4 space-y-3 flex-1 overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between pb-2 border-b border-[#D8D3C7]">
                    <div className="flex items-center gap-2">
                      <Home className="w-4 h-4 text-[#14231F]" />
                      <h3 className="font-display font-bold text-sm text-[#14231F] uppercase">
                        Shelter Capacity Rollup
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setViewMode('SHELTERS')}
                      className="text-[10px] font-mono text-[#14231F] font-bold hover:underline"
                    >
                      FULL MATRIX →
                    </button>
                  </div>

                  <div className="divide-y divide-[#D8D3C7] overflow-y-auto flex-1 max-h-[220px]">
                    {shelters.map((s) => {
                      const free = Math.max(0, s.capacity - s.currentOccupancy);
                      const pct = s.capacity > 0 ? Math.min(100, Math.round((s.currentOccupancy / s.capacity) * 100)) : 0;
                      return (
                        <div key={s.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                          <div className="truncate flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold ${
                                  s.status === 'RED'
                                    ? 'bg-[#B23A2E] text-white'
                                    : s.status === 'YELLOW'
                                    ? 'bg-[#C97A2B] text-white'
                                    : 'bg-[#EFECE4] text-[#14231F] border border-[#D8D3C7]'
                                }`}
                              >
                                {s.status}
                              </span>
                              <span className="font-bold text-[#14231F] truncate">{s.name}</span>
                            </div>
                            <div className="font-mono text-[11px] text-[#14231F]/70 mt-0.5 flex items-center gap-2">
                              <span>{s.currentOccupancy}/{s.capacity} beds ({pct}%)</span>
                              <span className="text-[#14231F]/50">• {free} free</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 font-mono">
                            <button
                              type="button"
                              onClick={() => setViewingSuppliesShelter(s)}
                              className="px-2 py-0.5 bg-[#EFECE4] hover:bg-[#D8D3C7] rounded border border-[#D8D3C7] text-[10px] font-bold text-[#14231F]"
                              title="Relief supplies & shipments"
                            >
                              📦 SUPPLIES
                            </button>
                            <button
                              type="button"
                              onClick={() => setFocusCoords([s.lat, s.lng])}
                              className="px-2 py-0.5 bg-[#14231F] text-white hover:bg-black rounded text-[10px]"
                              title="Locate on map"
                            >
                              LOCATE
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Active Disaster Broadcasts Management Table (Accessible directly on main page) */}
            <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded p-4 space-y-3 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#D8D3C7]">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-[#B23A2E]" />
                  <h3 className="font-display font-bold text-sm text-[#14231F] uppercase tracking-wide">
                    Active Disaster Broadcasts Management Table
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-[#B23A2E] text-white rounded font-bold">
                    {activeAlertsCount} ACTIVE
                  </span>
                </div>
                <span className="text-xs font-mono text-[#14231F]/60">
                  Real-time broadcast siren, SMS & Web Push dispatch
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="bg-[#FAF8F5] border-b border-[#D8D3C7] text-[#14231F]/70 text-[11px] uppercase">
                      <th className="p-2.5">ID / Severity</th>
                      <th className="p-2.5">Hazard Type</th>
                      <th className="p-2.5">Target Region & Radius</th>
                      <th className="p-2.5">Center Coordinates</th>
                      <th className="p-2.5">Advisory Message</th>
                      <th className="p-2.5">Created At</th>
                      <th className="p-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D8D3C7]">
                    {alerts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-[#14231F]/50">
                          No disaster alerts registered in system.
                        </td>
                      </tr>
                    ) : (
                      alerts.map((alert) => {
                        const isActive = alert.active;
                        const isCritical = alert.severity === 'CRITICAL';
                        return (
                          <tr
                            key={alert.id}
                            className={`hover:bg-[#FAF8F5]/80 transition-colors ${
                              !isActive ? 'opacity-50 bg-[#F6F4EF]/40' : ''
                            }`}
                          >
                            <td className="p-2.5">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    isCritical
                                      ? 'bg-[#B23A2E] text-white'
                                      : 'bg-[#C97A2B] text-white'
                                  }`}
                                >
                                  {alert.severity}
                                </span>
                                <span className="text-[#14231F]/60 text-[10px]">#{alert.id}</span>
                              </div>
                            </td>
                            <td className="p-2.5 font-bold text-[#14231F]">
                              {alert.hazardType}
                            </td>
                            <td className="p-2.5">
                              <div className="font-semibold text-[#14231F]">{alert.region}</div>
                              <div className="text-[11px] text-[#14231F]/70">
                                Radius: <span className="font-bold text-[#14231F]">{alert.radiusKm || 5.0} km</span>
                              </div>
                            </td>
                            <td className="p-2.5 text-[#14231F]/80">
                              {typeof alert.lat === 'number' ? alert.lat.toFixed(4) : alert.lat},{' '}
                              {typeof alert.lng === 'number' ? alert.lng.toFixed(4) : alert.lng}
                            </td>
                            <td className="p-2.5 max-w-sm truncate text-[#14231F]/80" title={alert.message}>
                              {alert.message}
                            </td>
                            <td className="p-2.5 text-[#14231F]/60 text-[11px]">
                              {new Date(alert.createdAt).toLocaleString()}
                            </td>
                            <td className="p-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFocusCoords([alert.lat, alert.lng]);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  className="px-2 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] rounded text-[11px] text-[#14231F] font-semibold transition-colors"
                                  title="Focus Incident Map"
                                >
                                  Map
                                </button>
                                {isActive ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDeactivateAlert(alert.id)}
                                    className="px-2.5 py-1 bg-[#B23A2E] hover:bg-[#972E24] text-white font-bold rounded text-[11px] transition-colors shadow-xs"
                                    title="Deactivate broadcast and stand down warnings"
                                  >
                                    Deactivate
                                  </button>
                                ) : (
                                  <span className="px-2 py-1 bg-[#EFECE4] text-[#14231F]/50 rounded text-[10px] font-semibold">
                                    STANDBY
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Aggregate Shelter Rollup Matrix */}
            <AdminShelterRollup
              shelters={shelters}
              onSelectShelterCoords={(coords) => {
                setFocusCoords(coords);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        )}
      </div>

      {/* Broadcast Alert Modal */}
      {broadcastOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded max-w-lg w-full p-6 shadow-xl text-[#14231F]">
            <div className="flex items-center justify-between pb-3 border-b border-[#D8D3C7]">
              <div className="flex items-center gap-2 text-[#B23A2E]">
                <Radio className="w-5 h-5" />
                <h2 className="font-display font-bold text-lg uppercase tracking-tight">
                  Broadcast Disaster Alert
                </h2>
              </div>
              <button
                onClick={() => setBroadcastOpen(false)}
                className="text-xs font-mono px-2 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] rounded text-[#14231F]"
              >
                ESC / CANCEL
              </button>
            </div>

            {/* Public Reach Multi-Channel Telemetry */}
            <div className="mt-3 p-2.5 bg-[#14231F] text-[#F6F4EF] rounded space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/70 uppercase">Target Audience:</span>
                <span className="text-[#4ADE80] font-bold text-[10px]">3 DELIVERY CHANNELS ARMED</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <button
                  type="button"
                  onClick={openSubscribersModal}
                  className="bg-white/10 hover:bg-white/20 transition-all p-1.5 rounded cursor-pointer text-center group border border-transparent hover:border-[#E5A93C]/40"
                  title="Click to view all registered phone numbers"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-sm font-bold text-[#E5A93C] group-hover:scale-105 transition-transform">
                      {registryStats.totalPhones}
                    </span>
                    <span className="text-[9px] text-[#E5A93C] opacity-75 group-hover:opacity-100">👁️</span>
                  </div>
                  <div className="text-[10px] text-white/70 group-hover:text-white">Phones via SMS</div>
                  <div className="text-[8px] text-[#E5A93C]/80 mt-0.5 font-mono">View List →</div>
                </button>
                <div className="bg-white/10 p-1.5 rounded flex flex-col justify-center">
                  <div className="text-sm font-bold text-[#4ADE80]">{registryStats.totalPushSubs}</div>
                  <div className="text-[10px] text-white/70">Web Push Subscribers</div>
                </div>
              </div>
              <div className="text-[10px] text-white/60 text-center">
                + Instant WebSocket push to all logged-in field units & citizens
              </div>
            </div>

            <form onSubmit={handleBroadcastAlert} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1">
                    Hazard Type
                  </label>
                  <select
                    value={alertForm.hazardType}
                    onChange={(e) => setAlertForm({ ...alertForm, hazardType: e.target.value })}
                    className="w-full p-2 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-xs font-mono"
                  >
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
                    value={alertForm.severity}
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
                  value={alertForm.region}
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
                    value={alertForm.lat}
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
                    value={alertForm.lng}
                    onChange={(e) => setAlertForm({ ...alertForm, lng: e.target.value })}
                    className="w-full p-2 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-xs font-mono"
                  />
                </div>
              </div>

              {/* Radius Selector (Issue 3 / Spec) */}
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
                  value={alertForm.message}
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
          </div>
        </div>
      )}

      {/* Offline & SMS Simulation Drawer */}
      <OfflineSimulationDrawer onDataChanged={fetchConsoleData} />

      {/* Shelter Supplies & Shipments Modal */}
      <ShelterSuppliesModal
        isOpen={Boolean(viewingSuppliesShelter)}
        onClose={() => setViewingSuppliesShelter(null)}
        shelter={viewingSuppliesShelter}
      />

      {/* Registered Phone Numbers & Subscribers Modal */}
      {subscribersModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded-lg shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
            {/* Header */}
            <div className="bg-[#14231F] text-[#F6F4EF] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#E5A93C]/20 text-[#E5A93C] rounded">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-sm tracking-wide">
                    REGISTERED SUBSCRIBERS & CITIZEN DIRECTORY
                  </h2>
                  <p className="text-[11px] text-white/60 font-mono">
                    Emergency Alert Dispatch Recipient Registry
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSubscribersModalOpen(false)}
                className="text-white/60 hover:text-white p-1 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Info notice about SMS reception */}
            <div className="bg-[#FAF8F5] border-b border-[#D8D3C7] px-5 py-2.5 text-xs text-[#14231F]/80 flex items-start gap-2">
              <span className="text-[#E5A93C] text-sm leading-none mt-0.5">ℹ️</span>
              <p className="text-[11px] leading-relaxed">
                <strong>Where are SMS received?</strong> Broadcasts sent to these numbers go via <strong>Twilio</strong> to recipient mobile phones (when credentials are in <code>.env</code>) or appear in the <strong>backend server console logs</strong> in simulated/dev mode.
              </p>
            </div>

            {/* Tabs & Search */}
            <div className="p-4 border-b border-[#D8D3C7] bg-[#F6F4EF]/50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-1 bg-[#D8D3C7]/40 p-1 rounded-md w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setSubscriberTab('phones')}
                  className={`px-3 py-1.5 rounded text-xs font-mono font-bold transition-all ${
                    subscriberTab === 'phones'
                      ? 'bg-[#14231F] text-white shadow-sm'
                      : 'text-[#14231F]/70 hover:text-[#14231F]'
                  }`}
                >
                  Public SMS Subscriptions ({subscribersData.phoneRegistrations?.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setSubscriberTab('citizens')}
                  className={`px-3 py-1.5 rounded text-xs font-mono font-bold transition-all ${
                    subscriberTab === 'citizens'
                      ? 'bg-[#14231F] text-white shadow-sm'
                      : 'text-[#14231F]/70 hover:text-[#14231F]'
                  }`}
                >
                  Citizen Accounts ({subscribersData.citizenUsers?.length || 0})
                </button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#14231F]/40" />
                <input
                  type="text"
                  placeholder="Filter by phone, name, region..."
                  value={subscriberSearch}
                  onChange={(e) => setSubscriberSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#D8D3C7] rounded text-xs focus:outline-none focus:border-[#14231F]"
                />
              </div>
            </div>

            {/* List Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {subscribersLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-[#14231F]/50 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#14231F]" />
                  <span className="text-xs font-mono">Loading registered subscriber records...</span>
                </div>
              ) : subscriberTab === 'phones' ? (
                // Public SMS Phone Registrations
                subscribersData.phoneRegistrations?.filter((r) => {
                  const q = subscriberSearch.toLowerCase();
                  return (
                    r.phoneNumber?.toLowerCase().includes(q) ||
                    (r.region && r.region.toLowerCase().includes(q))
                  );
                }).length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#14231F]/60 font-mono">
                    No phone registrations match "{subscriberSearch}"
                  </div>
                ) : (
                  <div className="divide-y divide-[#D8D3C7] border border-[#D8D3C7] rounded-md overflow-hidden bg-white">
                    <div className="grid grid-cols-12 bg-[#FAF8F5] px-3 py-2 text-[10px] font-mono text-[#14231F]/70 uppercase font-bold border-b border-[#D8D3C7]">
                      <span className="col-span-5">Phone Number</span>
                      <span className="col-span-4">Subscribed Region</span>
                      <span className="col-span-3 text-right">Registered On</span>
                    </div>
                    {subscribersData.phoneRegistrations
                      ?.filter((r) => {
                        const q = subscriberSearch.toLowerCase();
                        return (
                          r.phoneNumber?.toLowerCase().includes(q) ||
                          (r.region && r.region.toLowerCase().includes(q))
                        );
                      })
                      .map((sub) => (
                        <div
                          key={sub.id}
                          className="grid grid-cols-12 items-center px-3 py-2.5 text-xs hover:bg-[#FAF8F5]/80 transition-colors"
                        >
                          <div className="col-span-5 font-mono font-bold text-[#14231F] flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#4ADE80]" />
                            {sub.phoneNumber}
                          </div>
                          <div className="col-span-4 font-mono text-[#14231F]/80">
                            {sub.region ? (
                              <span className="bg-[#14231F]/5 px-2 py-0.5 rounded text-[11px] font-bold">
                                {sub.region}
                              </span>
                            ) : (
                              <span className="text-[#14231F]/40 italic">All Regions</span>
                            )}
                          </div>
                          <div className="col-span-3 text-right text-[11px] font-mono text-[#14231F]/60">
                            {new Date(sub.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                  </div>
                )
              ) : (
                // Citizen Accounts
                subscribersData.citizenUsers?.filter((u) => {
                  const q = subscriberSearch.toLowerCase();
                  return (
                    u.name?.toLowerCase().includes(q) ||
                    u.phone?.toLowerCase().includes(q) ||
                    u.email?.toLowerCase().includes(q)
                  );
                }).length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#14231F]/60 font-mono">
                    No citizen users match "{subscriberSearch}"
                  </div>
                ) : (
                  <div className="divide-y divide-[#D8D3C7] border border-[#D8D3C7] rounded-md overflow-hidden bg-white">
                    <div className="grid grid-cols-12 bg-[#FAF8F5] px-3 py-2 text-[10px] font-mono text-[#14231F]/70 uppercase font-bold border-b border-[#D8D3C7]">
                      <span className="col-span-4">Citizen Name</span>
                      <span className="col-span-4">Phone Number</span>
                      <span className="col-span-4 text-right">Account Email</span>
                    </div>
                    {subscribersData.citizenUsers
                      ?.filter((u) => {
                        const q = subscriberSearch.toLowerCase();
                        return (
                          u.name?.toLowerCase().includes(q) ||
                          u.phone?.toLowerCase().includes(q) ||
                          u.email?.toLowerCase().includes(q)
                        );
                      })
                      .map((cit) => (
                        <div
                          key={cit.id}
                          className="grid grid-cols-12 items-center px-3 py-2.5 text-xs hover:bg-[#FAF8F5]/80 transition-colors"
                        >
                          <div className="col-span-4 font-semibold text-[#14231F] flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#3B82F6]" />
                            {cit.name}
                          </div>
                          <div className="col-span-4 font-mono font-bold text-[#E5A93C]">
                            {cit.phone || 'N/A'}
                          </div>
                          <div className="col-span-4 text-right text-[11px] font-mono text-[#14231F]/60 truncate">
                            {cit.email}
                          </div>
                        </div>
                      ))}
                  </div>
                )
              )}
            </div>

            {/* Footer */}
            <div className="bg-[#FAF8F5] border-t border-[#D8D3C7] px-5 py-3 flex items-center justify-between">
              <span className="text-[11px] font-mono text-[#14231F]/60">
                Total Enrolled Recipients: {(subscribersData.phoneRegistrations?.length || 0) + (subscribersData.citizenUsers?.length || 0)}
              </span>
              <button
                type="button"
                onClick={() => setSubscribersModalOpen(false)}
                className="px-4 py-1.5 bg-[#14231F] hover:bg-[#14231F]/90 text-white font-mono text-xs rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
