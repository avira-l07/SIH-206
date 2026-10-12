import VolunteerAvailability from '../components/VolunteerAvailability';
import useDashboardRefresh from '../hooks/useDashboardRefresh';
import { refreshSections } from '../services/dashboardRefresh';
import DashboardTabs from '../components/DashboardTabs';
import QuickActions from '../components/QuickActions';
import useConsoleSection from '../hooks/useConsoleSection';
import ResponseWorkspace from '../components/ResponseWorkspace';
import { DISPATCHED_STATUSES, NEXT_STATUS } from '../services/sosWorkflow';
import OperationalStats from '../components/OperationalStats';
import { subscribeSocketEvents } from '../services/socketEvents';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import MapView from '../components/MapView';
import AlertBanner from '../components/AlertBanner';
import HazardConfirmationPrompt from '../components/HazardConfirmationPrompt';
import OfflineSimulationDrawer from '../components/OfflineSimulationDrawer';
import { AlertTriangle } from 'lucide-react';
import ShelterSuppliesModal from '../components/ShelterSuppliesModal';
import VolunteerShelterStore from '../components/VolunteerShelterStore';

export default function VolunteerDashboard() {
  const { user } = useAuth();
  const { socket } = useSocket();

  const refreshVersion = React.useRef(0);
  const invalidateRefresh = useCallback(() => { refreshVersion.current++; }, []);
  const [notice, setNotice] = useState('');
  const [dataError, setDataError] = useState('');
  const [dataLoading, setDataLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [sosList, setSosList] = useState([]);
  const [hazardReports, setHazardReports] = useState([]);
  const [viewMode, setViewMode] = useConsoleSection(['KANBAN','MAP','STORE'],'KANBAN');
  const [focusCoords, setFocusCoords] = useState(null);
  const liveGpsAcquired = useRef(false);
  const [volunteerCoords, setVolunteerCoords] = useState(
    typeof user?.lat === 'number' && typeof user?.lng === 'number'
      ? { lat: user.lat, lng: user.lng }
      : null
  );
  const [actionLoading, setActionLoading] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [assetSuggestions, setAssetSuggestions] = useState({});
  const [restockAlert, setRestockAlert] = useState(null);
  const [viewingSuppliesShelter, setViewingSuppliesShelter] = useState(null);

  useEffect(() => {
    if (!liveGpsAcquired.current && typeof user?.lat === 'number' && typeof user?.lng === 'number') {
      setVolunteerCoords({ lat: user.lat, lng: user.lng });
    }
  }, [user]);

  const handleUpdateLocation = () => {
    if (!navigator.geolocation) {
      setDataError('Geolocation is not supported by your browser.');
      return;
    }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        liveGpsAcquired.current = true;
        setVolunteerCoords(coords);
        try {
          await api.patch('/auth/location', coords); setNotice('Your location was saved.');
        } catch (err) {
          setDataError(err.response?.data?.error || 'Location detected but could not be saved. Please retry.');
        } finally {
          setLocLoading(false);
        }
      },
      (err) => {
        setDataError('Could not detect location: ' + err.message);
        setLocLoading(false);
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  const loadData = useCallback(async () => {
    const version = ++refreshVersion.current; setDataLoading(true);
    try {
      const result = await refreshSections([
        { label: 'Alerts', load: () => api.get('/alerts'), apply: res => setAlerts(res.data.alerts || []) },
        { label: 'Shelters', load: () => api.get('/shelters'), apply: res => setShelters(res.data.shelters || []) },
        { label: 'Requests', load: () => api.get('/sos'), apply: res => setSosList(res.data.requests || []) },
        { label: 'Hazards', load: () => api.get('/hazards'), apply: res => setHazardReports(res.data.reports || []) },
      ], () => version === refreshVersion.current);
      if (!result.applied) return;
      setDataError(result.failed.length ? 'Could not refresh: ' + result.failed.join(', ') + '. Previously loaded data may be out of date.' : '');

    } catch { if (version === refreshVersion.current) setDataError('Could not refresh the dashboard. Please retry.'); }
    finally { if (version === refreshVersion.current) setDataLoading(false); }
  }, []);

  useDashboardRefresh(socket, loadData, invalidateRefresh);

  useEffect(() => {

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          liveGpsAcquired.current = true;
          setVolunteerCoords(coords);
          api.patch('/auth/location', coords).catch(() => {});
        },
        () => console.log('Using default volunteer coordinates'),
        { timeout: 8000, enableHighAccuracy: true }
      );
    }
  }, [loadData]);

  // Track which SOS IDs we've already fetched suggestions for.
  // Prevents re-fetching on every socket status update to an existing SOS.
  const fetchedSosIds = useRef(new Set());

  // Proactively query asset suggestions for active SOS incidents (once per id)
  useEffect(() => {
    const fetchSuggestions = async () => {
      const activeCalls = sosList.filter(
        (s) =>
          (['PENDING', 'VERIFIED', ...DISPATCHED_STATUSES].includes(s.status)) &&
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
          } catch {
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
    const handlers = {};
    const on = (event, handler) => { handlers[event] = handler; };

    on('asset:changed', () => { fetchedSosIds.current.clear(); setAssetSuggestions({}); setSosList(prev => [...prev]); });
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

    on('alert:deleted', payload => { if (payload.id) setAlerts(prev => prev.filter(a => a.id !== payload.id)); });
    on('shelter:occupancy_changed', updated => setShelters(prev => [updated, ...prev.filter(s => s.id !== updated.id)]));
    on('alert:deactivated', (deactivated) => {
      setAlerts((prev) => prev.filter((a) => a.id !== deactivated.id));
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

    on('shelter:audit_updated', (updatedShelter) => {
      setShelters((prev) =>
        [updatedShelter, ...prev.filter((s) => s.id !== updatedShelter.id)]
      );
    });

    on('shelter:restock_needed', (alertData) => {
      setRestockAlert(alertData);
    });

    return subscribeSocketEvents(socket, handlers);
  }, [socket]);

  const handleAssignSOS = async (sosId) => {
    setActionLoading(true);
    try {
      const res = await api.patch(`/sos/${sosId}/assign`, {});
      setSosList((prev) =>
        prev.map((s) => (s.id === sosId ? res.data.sos : s))
      );
    } catch (err) {
      setDataError(err.response?.data?.error || 'Failed to claim SOS assignment');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveSOS = async (sosId) => {
    setActionLoading(true);
    try {
      const incident = sosList.find(s => s.id === sosId);
      const res = await api.patch(`/sos/${sosId}/status`, { status: NEXT_STATUS[incident?.status] });
      setSosList((prev) =>
        prev.map((s) => (s.id === sosId ? res.data.sos : s))
      );
    } catch (err) {
      setDataError(err.response?.data?.error || 'Failed to update rescue progress');
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
      setNotice('Hazard confirmation saved.');
    } catch (err) {
      setDataError(err.response?.data?.error || 'Failed to confirm report');
    }
  };

  return (
    <div className="flex flex-col min-w-0 w-full min-h-[calc(100vh-61px)]">
      {notice && <p role="status" className="px-4 py-3 bg-emerald-50 text-emerald-900">{notice} <button className="underline ml-2" onClick={() => setNotice('')}>Dismiss</button></p>}
      {dataLoading && <p role="status" className="px-4 py-2 text-sm">Refreshing live data…</p>}
      {dataError && <div role="alert" className="px-4 py-3 bg-red-50 text-red-800">{dataError} <button type="button" className="underline font-bold" onClick={loadData}>Retry</button></div>}
      <AlertBanner
        alerts={alerts}
        onSelectAlert={(a) => { setFocusCoords([a.lat, a.lng]); setViewMode('MAP'); }}
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

      <div className="max-w-7xl w-full mx-auto p-3 sm:p-4 pb-20 flex-1 flex flex-col gap-4">
        <header className="flex flex-wrap justify-between items-start gap-4"><div><h1 className="text-2xl font-bold">Volunteer dashboard</h1><p className="mt-1 text-sm text-[#14231F]/65">Welcome, {user?.name || 'volunteer'}. See your assignments and update rescue progress.</p></div><button type="button" disabled={locLoading} onClick={handleUpdateLocation} className="rounded-lg border px-3 py-2 text-sm">{locLoading ? 'Updating…' : 'Update location'}</button></header>
        <QuickActions user={user} tickets={sosList} loading={dataLoading} stale={Boolean(dataError)} />
        <VolunteerAvailability />
        <OperationalStats />
        <DashboardTabs tabs={[{ id: 'KANBAN', label: 'Rescue work' }, { id: 'MAP', label: 'Map' }, { id: 'STORE', label: 'Shelters & supplies' }]} value={viewMode} onChange={setViewMode} />
        {viewMode === 'KANBAN' && <ResponseWorkspace sosList={sosList} currentUser={user} userCoords={volunteerCoords} onSOSUpdated={updated => setSosList(prev => prev.map(s => s.id === updated.id ? updated : s))} onSelectCoords={coords => { setFocusCoords(coords); setViewMode('MAP'); }} assetSuggestions={assetSuggestions} />}
        {viewMode === 'MAP' && <section className="h-[540px]"><MapView alerts={alerts} sosRequests={sosList} shelters={shelters} hazardReports={hazardReports} userCoords={volunteerCoords} focusCoords={focusCoords} actionsBusy={actionLoading} onAssignSOS={handleAssignSOS} canClaimSOS={user?.onDuty !== false} onResolveSOS={handleResolveSOS} currentUserId={user?.id} onConfirmHazard={handleConfirmHazard} onViewSupplies={setViewingSuppliesShelter} userRole="VOLUNTEER" /></section>}
        {viewMode === 'STORE' && <VolunteerShelterStore shelters={shelters} currentVolunteer={user} onRequestSupplies={setViewingSuppliesShelter} onShelterUpdated={updated => setShelters(prev => prev.map(s => s.id === updated.id ? updated : s))} />}
        {hazardReports.some(r => ['GREY', 'AMBER'].includes(r.confidenceTier)) && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">Review nearby hazard reports</summary><HazardConfirmationPrompt reports={hazardReports} userCoords={volunteerCoords} onConfirmed={updated => setHazardReports(prev => prev.map(r => r.id === updated.id ? updated : r))} /></details>}
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
