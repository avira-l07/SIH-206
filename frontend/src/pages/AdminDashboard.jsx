import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import MapView from '../components/MapView';
import AlertBanner from '../components/AlertBanner';
import {
  ShieldAlert,
  Radio,
  CloudRain,
  Home,
  Plus,
  Activity,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Users,
} from 'lucide-react';

export default function AdminDashboard() {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [alerts, setAlerts] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [sosList, setSosList] = useState([]);
  const [focusCoords, setFocusCoords] = useState(null);

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

  useEffect(() => {
    async function fetchConsoleData() {
      try {
        const [alertsRes, sheltersRes, sosRes] = await Promise.all([
          api.get('/alerts?activeOnly=false'),
          api.get('/shelters'),
          api.get('/sos'),
        ]);
        setAlerts(alertsRes.data.alerts || []);
        setShelters(sheltersRes.data.shelters || []);
        setSosList(sosRes.data.requests || []);
      } catch (err) {
        console.error('Error fetching admin data', err);
      }
    }
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

    return () => {
      socket.off('sos:created');
      socket.off('sos:status_changed');
      socket.off('alert:new');
      socket.off('shelter:occupancy_changed');
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

  // Quick Shelter Occupancy Tweak
  const handleAdjustOccupancy = async (shelterId, delta) => {
    const shelter = shelters.find((s) => s.id === shelterId);
    if (!shelter) return;
    const newOccupancy = Math.max(0, Math.min(shelter.capacity, shelter.currentOccupancy + delta));

    try {
      const res = await api.patch(`/shelters/${shelterId}/occupancy`, {
        currentOccupancy: newOccupancy,
      });
      setShelters((prev) =>
        prev.map((s) => (s.id === shelterId ? res.data.shelter : s))
      );
    } catch (err) {
      console.error('Failed to update shelter occupancy', err);
    }
  };

  const totalCapacity = shelters.reduce((sum, s) => sum + s.capacity, 0);
  const totalOccupied = shelters.reduce((sum, s) => sum + s.currentOccupancy, 0);
  const activeAlertsCount = alerts.filter((a) => a.active).length;
  const pendingSOSCount = sosList.filter((s) => s.status === 'PENDING').length;

  return (
    <div className="flex flex-col min-h-[calc(100vh-61px)]">
      <AlertBanner
        alerts={alerts}
        onSelectAlert={(a) => setFocusCoords([a.lat, a.lng])}
      />

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
            <div className="text-[11px] text-[#14231F]/70 font-semibold uppercase">Registered Shelters</div>
            <div className="text-2xl font-bold text-[#14231F] tabular-nums mt-1">{shelters.length}</div>
            <div className="text-[10px] text-[#14231F]/60 mt-0.5">Mumbai Municipal Grid</div>
          </div>
        </div>

        {/* Map-First Split View */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
          {/* Map (65% width) */}
          <div className="lg:col-span-8 flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between mb-1 text-xs font-mono text-[#14231F]/70">
              <span>REGIONAL SITUATIONAL OVERVIEW MAP</span>
              <span>SHOWING HAZARD RADII, INCIDENT LOCATIONS & SHELTERS</span>
            </div>
            <MapView
              alerts={alerts}
              sosRequests={sosList}
              shelters={shelters}
              focusCoords={focusCoords}
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
                  <option value="Mumbai">Mumbai Regional (Heavy Rain Scenario: 42mm/h)</option>
                  <option value="Bandra">Bandra West (Moderate Rain: 18mm/h)</option>
                  <option value="Chennai">Chennai Sector (High Heat Risk: 34°C)</option>
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
                      <div className="font-bold text-[#14231F] truncate">{s.name}</div>
                      <div className="font-mono text-[11px] text-[#14231F]/70">
                        {s.currentOccupancy} / {s.capacity} beds
                      </div>
                    </div>

                    <div className="flex items-center gap-1 font-mono">
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
    </div>
  );
}
