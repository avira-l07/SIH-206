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
} from 'lucide-react';
import ShelterSuppliesModal from '../components/ShelterSuppliesModal';

export default function AdminDashboard() {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [alerts, setAlerts] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [sosList, setSosList] = useState([]);
  const [hazardReports, setHazardReports] = useState([]);
  const [focusCoords, setFocusCoords] = useState(null);
  const [viewMode, setViewMode] = useState('MAP'); // 'MAP' or 'KANBAN'
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
    message: 'Water levels rising rapidly (75mm/h). Immediate evacuation ordered for ground-floor residents.',
  });
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  // Simulation Tool State
  const [simRegion, setSimRegion] = useState('Kurla East');
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const [registryStats, setRegistryStats] = useState({ totalPhones: 0, totalPushSubs: 0 });

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

        {/* Dynamic Body: Map View or Kanban View */}
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
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
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

              {/* Shelter Capacity Quick Management */}
              <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded p-4 space-y-3 flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between pb-2 border-b border-[#D8D3C7]">
                  <div className="flex items-center gap-2">
                    <Home className="w-4 h-4 text-[#14231F]" />
                    <h3 className="font-display font-bold text-sm text-[#14231F] uppercase">
                      Shelter Occupancy Ops
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-[#14231F]/60">LIVE SYNC</span>
                </div>

                <div className="divide-y divide-[#D8D3C7] overflow-y-auto flex-1 max-h-[220px]">
                  {shelters.slice(0, 5).map((s) => (
                    <div key={s.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="truncate flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1 py-0.2 rounded font-mono text-[9px] font-bold ${
                            s.status === 'RED' ? 'bg-[#B23A2E] text-white' : s.status === 'YELLOW' ? 'bg-[#C97A2B] text-white' : 'bg-[#2E6E4E] text-white'
                          }`}>
                            {s.status}
                          </span>
                          <span className="font-bold text-[#14231F] truncate">{s.name}</span>
                        </div>
                        <div className="font-mono text-[11px] text-[#14231F]/70 mt-0.5">
                          {s.currentOccupancy} / {s.capacity} beds
                        </div>
                      </div>

                      <div className="flex items-center gap-1 font-mono">
                        <button
                          type="button"
                          onClick={() => setViewingSuppliesShelter(s)}
                          className="px-2 py-0.5 bg-[#EFECE4] hover:bg-[#D8D3C7] rounded border border-[#D8D3C7] text-[10px] font-bold text-[#2E6E4E]"
                          title="Relief supplies & shipments"
                        >
                          📦 SUPPLIES
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdjustOccupancy(s.id, -10)}
                          className="px-2 py-0.5 bg-[#EFECE4] hover:bg-[#D8D3C7] rounded border border-[#D8D3C7]"
                          title="Release 10 beds"
                        >
                          -10
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdjustOccupancy(s.id, 10)}
                          className="px-2 py-0.5 bg-[#14231F] text-white hover:bg-black rounded"
                          title="Admit 10 people"
                        >
                          +10
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
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
                <div className="bg-white/10 p-1.5 rounded">
                  <div className="text-sm font-bold text-[#E5A93C]">{registryStats.totalPhones}</div>
                  <div className="text-[10px] text-white/70">Phones via SMS</div>
                </div>
                <div className="bg-white/10 p-1.5 rounded">
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
    </div>
  );
}
