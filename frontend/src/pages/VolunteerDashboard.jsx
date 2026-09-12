import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import MapView from '../components/MapView';
import AlertBanner from '../components/AlertBanner';
import TriageKanban from '../components/TriageKanban';
import HazardConfirmationPrompt from '../components/HazardConfirmationPrompt';
import OfflineSimulationDrawer from '../components/OfflineSimulationDrawer';
import { LifeBuoy, MapPin, Phone, Shield, ArrowUpRight, Kanban, Map, Lock, Package, AlertTriangle } from 'lucide-react';
import ShelterSuppliesModal from '../components/ShelterSuppliesModal';
import VolunteerShelterStore from '../components/VolunteerShelterStore';
import { calculateDistanceKm } from '../services/haversine';

export default function VolunteerDashboard() {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [alerts, setAlerts] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [sosList, setSosList] = useState([]);
  const [hazardReports, setHazardReports] = useState([]);
  const [activeTab, setActiveTab] = useState('PENDING'); // PENDING, IN_PROGRESS, RESOLVED
  const [viewMode, setViewMode] = useState('MAP'); // 'MAP', 'KANBAN', 'STORE'
  const [focusCoords, setFocusCoords] = useState(null);
  const [volunteerCoords, setVolunteerCoords] = useState({
    lat: typeof user?.lat === 'number' ? user.lat : 19.0596,
    lng: typeof user?.lng === 'number' ? user.lng : 72.8295,
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [assetSuggestions, setAssetSuggestions] = useState({});
  const [restockAlert, setRestockAlert] = useState(null);
  const [viewingSuppliesShelter, setViewingSuppliesShelter] = useState(null);

  useEffect(() => {
    if (typeof user?.lat === 'number' && typeof user?.lng === 'number') {
      setVolunteerCoords({ lat: user.lat, lng: user.lng });
    }
  }, [user]);

  const handleUpdateLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setVolunteerCoords(coords);
        try {
          await api.patch('/auth/location', coords);
        } catch (err) {
          console.warn('Failed to persist location update:', err);
        } finally {
          setLocLoading(false);
        }
      },
      (err) => {
        alert('Could not detect location: ' + err.message);
        setLocLoading(false);
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  const loadData = async () => {
    try {
      const [alertsRes, sheltersRes, sosRes, hazardsRes] = await Promise.all([
        api.get('/alerts'),
        api.get('/shelters'),
        api.get('/sos'),
        api.get('/hazards').catch(() => ({ data: { reports: [] } })),
      ]);
      setAlerts(alertsRes.data.alerts || []);
      setShelters(sheltersRes.data.shelters || []);
      setSosList(sosRes.data.requests || []);
      setHazardReports(hazardsRes.data.reports || []);
    } catch (err) {
      console.error('Error fetching volunteer console data', err);
    }
  };

  useEffect(() => {
    loadData();

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setVolunteerCoords(coords);
          api.patch('/auth/location', coords).catch(() => {});
        },
        () => console.log('Using default volunteer coordinates'),
        { timeout: 8000, enableHighAccuracy: true }
      );
    }
  }, []);

  // Track which SOS IDs we've already fetched suggestions for.
  // Prevents re-fetching on every socket status update to an existing SOS.
  const fetchedSosIds = useRef(new Set());

  // Proactively query asset suggestions for active SOS incidents (once per id)
  useEffect(() => {
    const fetchSuggestions = async () => {
      const activeCalls = sosList.filter(
        (s) =>
          (s.status === 'PENDING' || s.status === 'VERIFIED' || s.status === 'EN_ROUTE' || s.status === 'IN_PROGRESS') &&
          !fetchedSosIds.current.has(s.id)  // skip already-fetched ids
      );
      if (activeCalls.length === 0) return;

      const suggestionsMap = {};
      await Promise.all(
        activeCalls.map(async (sos) => {
          fetchedSosIds.current.add(sos.id); // mark before request to prevent concurrent duplicates
          try {
            const res = await api.get(
              `/assets/suggestions?lat=${sos.lat}&lng=${sos.lng}&hazardType=${sos.hazardType}`
            );
            if (res.data.suggestions && res.data.suggestions.length > 0) {
              suggestionsMap[sos.id] = res.data.suggestions[0];
            }
          } catch (err) {
            // on failure, remove from cache so it retries next cycle
            fetchedSosIds.current.delete(sos.id);
          }
        })
      );
      if (Object.keys(suggestionsMap).length > 0) {
        setAssetSuggestions((prev) => ({ ...prev, ...suggestionsMap }));
      }
    };

    if (sosList.length > 0) {
      fetchSuggestions();
    }
  }, [sosList]);

  // Real-time socket listeners
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

    socket.on('shelter:audit_updated', (updatedShelter) => {
      setShelters((prev) =>
        prev.map((s) => (s.id === updatedShelter.id ? updatedShelter : s))
      );
    });

    socket.on('shelter:restock_needed', (alertData) => {
      setRestockAlert(alertData);
    });

    return () => {
      socket.off('sos:created');
      socket.off('sos:status_changed');
      socket.off('alert:new');
      socket.off('hazard:new');
      socket.off('hazard:confirmed');
      socket.off('hazard:tier_changed');
      socket.off('shelter:audit_updated');
      socket.off('shelter:restock_needed');
    };
  }, [socket]);

  const handleAssignSOS = async (sosId) => {
    setActionLoading(true);
    try {
      const res = await api.patch(`/sos/${sosId}/assign`);
      setSosList((prev) =>
        prev.map((s) => (s.id === sosId ? res.data.sos : s))
      );
    } catch (err) {
      console.error('Failed to assign SOS', err);
      alert(err.response?.data?.error || 'Failed to claim SOS assignment');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveSOS = async (sosId) => {
    setActionLoading(true);
    try {
      const res = await api.patch(`/sos/${sosId}/resolve`);
      setSosList((prev) =>
        prev.map((s) => (s.id === sosId ? res.data.sos : s))
      );
    } catch (err) {
      console.error('Failed to resolve SOS', err);
      alert(err.response?.data?.error || 'Failed to resolve SOS');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmHazard = async (reportId) => {
    try {
      const res = await api.post(`/hazards/${reportId}/confirm`);
      setHazardReports((prev) =>
        prev.map((r) => (r.id === reportId ? res.data.report : r))
      );
      alert(`Report confirmed! Current confidence tier: ${res.data.report.confidenceTier}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to confirm report');
    }
  };

  const pendingCalls = sosList.filter((s) => s.status === 'PENDING' || s.status === 'VERIFIED');
  const inProgressCalls = sosList.filter((s) => s.status === 'IN_PROGRESS');
  const resolvedCalls = sosList.filter((s) => s.status === 'RESOLVED');

  const displayedCalls =
    activeTab === 'PENDING'
      ? pendingCalls
      : activeTab === 'IN_PROGRESS'
      ? inProgressCalls
      : resolvedCalls;

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
              Log Relief Shipment
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
        {/* Header Stats Strip */}
        <div className="bg-[#FFFFFF] border border-[#D8D3C7] p-4 rounded flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <LifeBuoy className="w-5 h-5 text-[#2E6E4E]" />
              <h1 className="font-display font-bold text-lg sm:text-xl text-[#14231F] tracking-tight">
                FIELD DISPATCH CONSOLE // RESCUE VOLUNTEER
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-[#14231F]/70 font-mono mt-0.5">
                Responder ID: {user?.name || 'Field Unit'} • GPS: {volunteerCoords.lat.toFixed(4)}°N, {volunteerCoords.lng.toFixed(4)}°E
              </p>
              <button
                type="button"
                id="update-volunteer-location-btn"
                disabled={locLoading}
                onClick={handleUpdateLocation}
                className="px-2 py-0.5 bg-[#EFECE4] hover:bg-[#D8D3C7] border border-[#D8D3C7] text-[#14231F] text-[10px] font-mono rounded font-semibold transition-colors disabled:opacity-50"
                title="Detect and persist real GPS location"
              >
                {locLoading ? 'Detecting...' : '📍 Update My GPS'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Supplies & Shipments Trigger Button */}
            <button
              type="button"
              id="view-shelter-supplies-btn"
              onClick={() => setViewingSuppliesShelter(shelters[0] || { id: 101, name: 'Kurla Relief Camp' })}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#EFECE4] hover:bg-[#D8D3C7] border border-[#D8D3C7] text-[#14231F] rounded text-xs font-mono font-bold transition-colors"
            >
              <Package className="w-3.5 h-3.5 text-[#2E6E4E]" />
              <span>SUPPLIES & SHIPMENTS</span>
            </button>

            {/* View Mode Switcher */}
            <div className="flex items-center bg-[#EFECE4] p-0.5 border border-[#D8D3C7] rounded text-xs font-mono">
              <button
                type="button"
                id="view-mode-map-btn"
                onClick={() => setViewMode('MAP')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded transition-colors ${
                  viewMode === 'MAP' ? 'bg-[#14231F] text-white font-bold' : 'text-[#14231F]/70 hover:text-[#14231F]'
                }`}
              >
                <Map className="w-3.5 h-3.5" />
                <span>MAP & QUEUE</span>
              </button>
              <button
                type="button"
                id="view-mode-kanban-btn"
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
                id="view-mode-store-btn"
                onClick={() => setViewMode('STORE')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded transition-colors ${
                  viewMode === 'STORE' ? 'bg-[#14231F] text-white font-bold' : 'text-[#14231F]/70 hover:text-[#14231F]'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>SHELTER STORE</span>
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-2 font-mono text-xs">
              <div className="px-3 py-1.5 bg-[#B23A2E]/10 border border-[#B23A2E]/30 rounded text-[#B23A2E] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#B23A2E] animate-ping"></span>
                <span className="font-bold tabular-nums">{pendingCalls.length}</span> PENDING
              </div>
              <div className="px-3 py-1.5 bg-[#C97A2B]/10 border border-[#C97A2B]/30 rounded text-[#C97A2B]">
                <span className="font-bold tabular-nums">{inProgressCalls.length}</span> DISPATCHED
              </div>
              <div className="px-3 py-1.5 bg-[#2E6E4E]/10 border border-[#2E6E4E]/30 rounded text-[#2E6E4E]">
                <span className="font-bold tabular-nums">{resolvedCalls.length}</span> RESCUED
              </div>
            </div>
          </div>
        </div>

        {/* Nearby Peer-Confirmation Prompt */}
        <HazardConfirmationPrompt
          reports={hazardReports}
          userCoords={volunteerCoords}
          onConfirmed={(updated) =>
            setHazardReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
          }
        />

        {/* Dynamic Main Body: Map View, Kanban View, or Shelter Store */}
        {viewMode === 'KANBAN' ? (
          <TriageKanban
            sosList={sosList}
            userCoords={volunteerCoords}
            currentUser={user}
            onSOSUpdated={(updated) =>
              setSosList((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
            }
            onSelectCoords={(coords) => {
              setFocusCoords(coords);
              setViewMode('MAP');
            }}
          />
        ) : viewMode === 'STORE' ? (
          <VolunteerShelterStore
            shelters={shelters}
            currentVolunteer={user}
            onShelterUpdated={(updated) =>
              setShelters((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
            {/* Map (65% width) */}
            <div className="lg:col-span-8 flex flex-col min-h-[500px]">
              <div className="flex items-center justify-between mb-1 text-xs font-mono text-[#14231F]/70">
                <span>ACTIVE SITUATIONAL INCIDENT MAP</span>
                <span>RED: SOS & HAZARDS • AMBER/GREY: REPORTS • BLACK: SHELTERS</span>
              </div>
              <MapView
                alerts={alerts}
                sosRequests={sosList}
                shelters={shelters}
                hazardReports={hazardReports}
                userCoords={volunteerCoords}
                focusCoords={focusCoords}
                onAssignSOS={handleAssignSOS}
                onResolveSOS={handleResolveSOS}
                onConfirmHazard={handleConfirmHazard}
                onViewSupplies={(s) => setViewingSuppliesShelter(s)}
                userRole="VOLUNTEER"
              />
            </div>

            {/* Dispatch Side Panel (35% width) */}
            <div className="lg:col-span-4 flex flex-col bg-[#FFFFFF] border border-[#D8D3C7] rounded overflow-hidden h-[600px] lg:h-auto">
              {/* Tabs */}
              <div className="grid grid-cols-3 border-b border-[#D8D3C7] bg-[#EFECE4] text-xs font-mono">
                <button
                  id="tab-pending"
                  onClick={() => setActiveTab('PENDING')}
                  className={`py-2.5 text-center font-bold transition-colors ${
                    activeTab === 'PENDING'
                      ? 'bg-[#FFFFFF] text-[#B23A2E] border-b-2 border-[#B23A2E]'
                      : 'text-[#14231F]/70 hover:text-[#14231F]'
                  }`}
                >
                  UNASSIGNED ({pendingCalls.length})
                </button>
                <button
                  id="tab-in-progress"
                  onClick={() => setActiveTab('IN_PROGRESS')}
                  className={`py-2.5 text-center font-bold transition-colors ${
                    activeTab === 'IN_PROGRESS'
                      ? 'bg-[#FFFFFF] text-[#C97A2B] border-b-2 border-[#C97A2B]'
                      : 'text-[#14231F]/70 hover:text-[#14231F]'
                  }`}
                >
                  DISPATCHED ({inProgressCalls.length})
                </button>
                <button
                  id="tab-resolved"
                  onClick={() => setActiveTab('RESOLVED')}
                  className={`py-2.5 text-center font-bold transition-colors ${
                    activeTab === 'RESOLVED'
                      ? 'bg-[#FFFFFF] text-[#2E6E4E] border-b-2 border-[#2E6E4E]'
                      : 'text-[#14231F]/70 hover:text-[#14231F]'
                  }`}
                >
                  RESOLVED ({resolvedCalls.length})
                </button>
              </div>

              {/* List of Calls */}
              <div className="flex-1 overflow-y-auto divide-y divide-[#D8D3C7]">
                {displayedCalls.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#14231F]/60 font-mono">
                    No {activeTab.toLowerCase()} incidents in current queue.
                  </div>
                ) : (
                  displayedCalls.map((sos) => {
                    const dist = calculateDistanceKm(
                      volunteerCoords.lat,
                      volunteerCoords.lng,
                      sos.lat,
                      sos.lng
                    );
                    const isReopened = sos.message?.includes('[REOPENED BY CITIZEN');
                    const isCriticalBattery = sos.batteryLevel !== null && sos.batteryLevel <= 15;
                    const isUrgent = sos.priority === 'URGENT' || isCriticalBattery || isReopened || (sos.vulnerabilityTags && sos.vulnerabilityTags.length > 0);
                    const isAssignedToOther =
                      sos.status === 'IN_PROGRESS' &&
                      sos.assignedVolunteerId &&
                      user &&
                      sos.assignedVolunteerId !== user.id;

                    return (
                      <div
                        key={sos.id}
                        className={`p-3.5 hover:bg-[#F6F4EF] transition-colors space-y-2 cursor-pointer ${
                          isReopened
                            ? 'border-2 border-[#B23A2E] bg-red-50/70 shadow-md ring-2 ring-[#B23A2E]/20'
                            : isUrgent
                            ? 'border-l-4 border-l-[#B23A2E]'
                            : ''
                        }`}
                        onClick={() => setFocusCoords([sos.lat, sos.lng])}
                      >
                        {/* Reopened Banner (Item 1.3) */}
                        {isReopened && (
                          <div className="bg-[#B23A2E] text-white px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 uppercase tracking-wide animate-pulse">
                            <AlertTriangle className="w-3 h-3" /> CITIZEN REOPENED // RESCUE INCOMPLETE
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#B23A2E] text-white">
                              {sos.hazardType}
                            </span>
                            {/* Battery badge (Decision 0.1 & Item 1.4) */}
                            {sos.batteryLevel !== null && (
                              <span
                                className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                                  isCriticalBattery
                                    ? 'bg-[#B23A2E] text-white animate-pulse'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                }`}
                              >
                                ⚡ {sos.batteryLevel}% {isCriticalBattery ? 'CRITICAL' : ''}
                              </span>
                            )}
                            {isUrgent && (
                              <span className="font-mono text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#B23A2E]/15 text-[#B23A2E]">
                                URGENT
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs font-mono text-[#14231F]/80">
                            <MapPin className="w-3 h-3 text-[#2E6E4E]" />
                            <span className="tabular-nums font-semibold">{dist} km away</span>
                          </div>
                        </div>

                        {/* Proxy Details (Item 2.1) */}
                        {sos.reportedByProxy && (
                          <div className="p-1.5 bg-amber-50 border border-amber-300 rounded text-[10px] font-mono text-amber-900 space-y-0.5">
                            <div className="font-bold flex items-center gap-1 uppercase">
                              <span>PROXY SOS (Reported for another person)</span>
                            </div>
                            {sos.subjectDescription && (
                              <div className="italic text-[10px] text-amber-800 font-semibold">
                                &bull; {sos.subjectDescription}
                              </div>
                            )}
                          </div>
                        )}

                        <div>
                          <h4 className="font-display font-bold text-sm text-[#14231F] flex items-center justify-between">
                            <span>{sos.userName}</span>
                            <span className="text-[10px] font-mono font-normal text-[#14231F]/60">
                              {new Date(sos.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </h4>
                          <p className="text-xs text-[#14231F]/85 italic bg-[#EFECE4]/60 p-1.5 rounded border border-[#D8D3C7] mt-1">
                            &ldquo;{sos.message}&rdquo;
                          </p>
                        </div>

                        {/* Vulnerability Chips */}
                        {sos.vulnerabilityTags && sos.vulnerabilityTags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {sos.vulnerabilityTags.map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.2 rounded border border-[#14231F] text-[#14231F] font-mono text-[10px] uppercase font-semibold bg-[#EFECE4]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {sos.userPhone && (
                          <div className="text-[11px] font-mono text-[#14231F]/70 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-[#14231F]/50" />
                            <a href={`tel:${sos.userPhone}`} className="hover:underline font-semibold">
                              {sos.userPhone}
                            </a>
                          </div>
                        )}

                        {/* Suggested Asset Matching Mobilization */}
                        {assetSuggestions[sos.id] && (
                          <div className="p-2 bg-emerald-50 border border-emerald-300 rounded text-[11px] font-mono flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-emerald-950">
                              <Shield className="w-3.5 h-3.5 text-[#2E6E4E] shrink-0" />
                              <div>
                                <span className="font-bold text-[#2E6E4E] uppercase">
                                  {assetSuggestions[sos.id].isMatch ? '★ Priority Asset Match:' : 'Nearest Asset:'}
                                </span>{' '}
                                <span className="font-semibold">{assetSuggestions[sos.id].title}</span>{' '}
                                <span className="text-[9px] px-1 py-0.2 bg-emerald-100 text-emerald-800 rounded font-bold uppercase">
                                  {assetSuggestions[sos.id].assetType || assetSuggestions[sos.id].type}
                                </span>
                                {assetSuggestions[sos.id].distanceKm !== null && (
                                  <span className="text-[#14231F]/70 ml-1">
                                    • {assetSuggestions[sos.id].distanceKm}km away
                                  </span>
                                )}
                              </div>
                            </div>
                            {assetSuggestions[sos.id].contact && (
                              <a
                                href={`tel:${assetSuggestions[sos.id].contact}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-[#2E6E4E] hover:underline font-bold text-[10px] shrink-0 uppercase bg-white px-1.5 py-0.5 border border-emerald-300 rounded"
                              >
                                Mobilize ({assetSuggestions[sos.id].ownerName})
                              </a>
                            )}
                          </div>
                        )}

                        {isAssignedToOther && (
                          <div className="text-[10px] font-mono text-[#C97A2B] bg-[#C97A2B]/10 p-1 rounded flex items-center gap-1 border border-[#C97A2B]/30">
                            <Lock className="w-3 h-3" /> Locked to another volunteer
                          </div>
                        )}

                        {/* Dispatch Action Button */}
                        <div className="pt-1 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFocusCoords([sos.lat, sos.lng]);
                            }}
                            className="text-[11px] font-mono underline text-[#14231F]/70 hover:text-[#14231F] flex items-center gap-0.5"
                          >
                            View on map <ArrowUpRight className="w-3 h-3" />
                          </button>

                          {(sos.status === 'PENDING' || sos.status === 'VERIFIED') && (
                            <button
                              type="button"
                              id={`accept-sos-${sos.id}`}
                              disabled={actionLoading}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAssignSOS(sos.id);
                              }}
                              className="px-3 py-1.5 bg-[#14231F] hover:bg-black text-white font-display font-semibold text-xs rounded transition-colors"
                            >
                              ACCEPT DISPATCH
                            </button>
                          )}

                          {sos.status === 'IN_PROGRESS' && (
                            <button
                              type="button"
                              id={`resolve-sos-${sos.id}`}
                              disabled={actionLoading || isAssignedToOther}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResolveSOS(sos.id);
                              }}
                              className="px-3 py-1.5 bg-[#2E6E4E] hover:bg-[#23583e] text-white font-display font-semibold text-xs rounded transition-colors disabled:opacity-40"
                            >
                              MARK RESOLVED
                            </button>
                          )}

                          {sos.status === 'RESOLVED' && (
                            <div className="font-mono text-[10px] font-bold">
                              {sos.citizenConfirmedResolved ? (
                                <span className="text-[#2E6E4E] flex items-center gap-1">
                                  ✓ CITIZEN CONFIRMED SAFE
                                </span>
                              ) : (
                                <span className="text-[#C97A2B] bg-amber-50 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                                  ⏳ AWAITING CITIZEN CONFIRM
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Offline & SMS Simulation Drawer */}
      <OfflineSimulationDrawer onDataChanged={loadData} />

      {/* Shelter Supplies & Shipments Modal */}
      <ShelterSuppliesModal
        isOpen={Boolean(viewingSuppliesShelter)}
        onClose={() => setViewingSuppliesShelter(null)}
        shelter={viewingSuppliesShelter}
      />
    </div>
  );
}
