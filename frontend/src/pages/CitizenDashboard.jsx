import useDashboardRefresh from '../hooks/useDashboardRefresh';
import { refreshSections } from '../services/dashboardRefresh';
import DashboardTabs from '../components/DashboardTabs';
import QuickActions from '../components/QuickActions';
import {EvacuationNotice} from '../components/EvacuationTools';
import {nearbyAdvisories} from '../services/evacuationPlan';
import useConsoleSection from '../hooks/useConsoleSection';
import RescueProgress from '../components/RescueProgress';
import { STATUS_LABELS } from '../services/sosWorkflow';
import OperationalStats from '../components/OperationalStats';
import { subscribeSocketEvents } from '../services/socketEvents';
import useNow from '../hooks/useNow';
import React, { useState, useEffect, useCallback,lazy,Suspense } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import MapView from '../components/MapView';
import AlertBanner from '../components/AlertBanner';
import SOSButton from '../components/SOSButton';
import ShelterList from '../components/ShelterList';
import HazardReportModal from '../components/HazardReportModal';
import HazardConfirmationPrompt from '../components/HazardConfirmationPrompt';
import SafetyStatusWidget from '../components/SafetyStatusWidget';
import MyRequests from '../components/MyRequests';
import OfflineSimulationDrawer from '../components/OfflineSimulationDrawer';
const SupplyScanner=lazy(()=>import('../components/SupplyScanner'));
import { AlertTriangle, CheckCircle, Clock, ShieldCheck, Camera, AlertOctagon, Package, QrCode } from 'lucide-react';

export default function CitizenDashboard() {
  const now = useNow();
  const { user } = useAuth();
  const { socket } = useSocket();

  const refreshVersion = React.useRef(0);
  const invalidateRefresh = useCallback(() => { refreshVersion.current++; }, []);
  const [notice, setNotice] = useState('');
  const [dataError, setDataError] = useState('');
  const [verifying, setVerifying] = useState(false), [locLoading, setLocLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [activeView, setActiveView] = useConsoleSection(['SHELTERS','REQUESTS','MAP','SAFETY'],'SHELTERS');
  const [alerts, setAlerts] = useState([]);
  const [evacuationAdvisories,setEvacuationAdvisories]=useState([]);
  const [shelters, setShelters] = useState([]);
  const [hazardReports, setHazardReports] = useState([]);
  const [mySOSList, setMySOSList] = useState([]);
  const [focusCoords, setFocusCoords] = useState(null);
  const liveGpsAcquired = React.useRef(false);
  const [userCoords, setUserCoords] = useState(
    typeof user?.lat === 'number' && typeof user?.lng === 'number'
      ? { lat: user.lat, lng: user.lng }
      : null
  );
  const [hazardModalOpen, setHazardModalOpen] = useState(false);
  const [supplyScannerOpen, setSupplyScannerOpen] = useState(false);
  const [myPickups, setMyPickups] = useState([]);
  const [loadingPickups, setLoadingPickups] = useState(false);
  const [pickupError, setPickupError] = useState('');
  const showOnMap = coords => { setFocusCoords(coords); setActiveView('MAP'); };

  // Synchronize with authenticated user's saved GPS ONLY if live GPS hasn't been acquired yet
  useEffect(() => {
    if (!liveGpsAcquired.current && typeof user?.lat === 'number' && typeof user?.lng === 'number') {
      setUserCoords({ lat: user.lat, lng: user.lng });
    }
  }, [user]);

  const fetchMyPickups = useCallback(async () => {
    try {
      setLoadingPickups(true);
      const res = await api.get('/supplies/distributions/mine');
      setMyPickups(res.data.distributions || []); setPickupError('');
    } catch {
      setPickupError('Could not load pickup history.');
    } finally {
      setLoadingPickups(false);
    }
  }, []);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    const version = ++refreshVersion.current; setDataLoading(true);
    try {
      const result = await refreshSections([
        { label: 'Alerts', load: () => api.get('/alerts'), apply: res => setAlerts(res.data.alerts || []) },
        { label: 'Evacuation guidance', load: () => api.get('/field/evacuation'), apply: res => setEvacuationAdvisories(res.data.advisories || []) },
        { label: 'Shelters', load: () => api.get('/shelters'), apply: res => setShelters(res.data.shelters || []) },
        { label: 'Requests', load: () => api.get('/sos/my'), apply: res => setMySOSList(res.data.requests || []) },
        { label: 'Hazards', load: () => api.get('/hazards'), apply: res => setHazardReports(res.data.reports || []) },
      ], () => version === refreshVersion.current);
      if (!result.applied) return;
      setDataError(result.failed.length ? 'Could not refresh: ' + result.failed.join(', ') + '. Previously loaded data may be out of date.' : '');
      fetchMyPickups();
    } catch { if (version === refreshVersion.current) setDataError('Could not refresh the dashboard. Please retry.'); }
    finally { if (version === refreshVersion.current) setDataLoading(false); }
  }, [fetchMyPickups]);

  useDashboardRefresh(socket, fetchData, invalidateRefresh);

  useEffect(() => {

    // Auto-detect browser GPS on mount and prioritize over stored DB coords
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          liveGpsAcquired.current = true;
          setUserCoords(coords);
          // Persist coordinates silently so citizen receives radius alerts
          api.patch('/auth/location', coords).catch(() => {});
        },
        (err) => console.log('Browser geolocation notice:', err.message),
        { timeout: 8000, enableHighAccuracy: true }
      );
    }
  }, [fetchData]);

  // Socket.io live listeners
  useEffect(() => {
    if (!socket) return;
    const handlers = {};
    const on = (event, handler) => { handlers[event] = handler; };

    on('alert:new', (newAlert) => {
      setAlerts((prev) => [newAlert, ...prev.filter((a) => a.id !== newAlert.id)]);
    });

    on('alert:deleted', payload => { if (payload.id) setAlerts(prev => prev.filter(a => a.id !== payload.id)); });
    on('alert:deactivated', (deactivated) => {
      setAlerts((prev) => prev.filter((a) => a.id !== deactivated.id));
    });

    on('sos:created', (created) => { if (created.userId === user?.id) setMySOSList(prev => [created, ...prev.filter(s => s.id !== created.id)]); });
    on('sos:status_changed', (updatedSOS) => {
      setMySOSList((prev) =>
        prev.map((s) => (s.id === updatedSOS.id ? updatedSOS : s))
      );
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

    on('supply:distributed', (data) => {
      if (data?.distribution && data.distribution.citizenId === user?.id) {
        setMyPickups((prev) => [data.distribution, ...prev.filter((p) => p.id !== data.distribution.id)]);
      }
    });

    return subscribeSocketEvents(socket, handlers);
  }, [socket, user?.id]);

  const handleSOSCreated = (newSOS) => {
    setMySOSList((prev) => [newSOS, ...prev.filter(item => item.id !== newSOS.id)]);
    setFocusCoords([newSOS.lat, newSOS.lng]);
  };

  const handleHazardReportCreated = (newReport) => {
    setHazardReports((prev) => [newReport, ...prev.filter(item => item.id !== newReport.id)]);
    setFocusCoords([newReport.lat, newReport.lng]);
  };

  const handleConfirmHazard = async (reportId) => {
    try {
      const res = await api.post(`/hazards/${reportId}/confirm`);
      setHazardReports((prev) =>
        prev.map((r) => (r.id === reportId ? res.data.report : r))
      );
      setNotice('Hazard confirmation saved.');
    } catch (err) {
      setDataError(err.response?.data?.error || 'Failed to submit confirmation');
    }
  };

  const handleShelterUpdated = (updatedShelter) => {
    setShelters((prev) =>
      prev.map((s) => (s.id === updatedShelter.id ? updatedShelter : s))
    );
  };

  const handleCitizenVerify = async (sosId, confirmed) => {
    setVerifying(true);
    try {
      const res = await api.patch(`/sos/${sosId}/citizen-verify`, { confirmed });
      setMySOSList((prev) => prev.map((s) => (s.id === sosId ? res.data.sos : s)));
      if (confirmed) {
        setNotice('Rescue confirmed complete.');
      } else {
        setNotice('Request reopened with urgent priority. The response team has been notified.');
      }
    } catch (err) {
      setDataError(err.response?.data?.error || 'Failed to verify rescue closure');
    } finally { setVerifying(false); }
  };

  const handleUpdateLocation = () => {
    if (!navigator.geolocation) {
      setDataError('Geolocation is not supported. Enter the incident coordinates manually when requesting help.');
      return;
    }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        liveGpsAcquired.current = true;
        setUserCoords(coords);
        setFocusCoords([coords.lat, coords.lng]);
        try {
          await api.patch('/auth/location', coords);
          setNotice('Your location was saved.');
        } catch (err) {
          setDataError(err.response?.data?.error || 'Location detected but could not be saved. Please retry.');
        } finally { setLocLoading(false); }
      },
      (err) => {
        setDataError('Could not acquire your location: ' + err.message); setLocLoading(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const activeSOS = mySOSList.find((s) => !['RESOLVED', 'CANCELLED'].includes(s.status));
  // Pending citizen rescue closure loop (Item 1.3)
  const pendingVerificationSOS = mySOSList.find(
    (s) => s.status === 'RESOLVED' && s.citizenConfirmedResolved !== true
  );
  // Successfully verified closed
  const verifiedClosedSOS = mySOSList.find(
    (s) => s.status === 'RESOLVED' && s.citizenConfirmedResolved === true
  );

  return (
    <div className="flex flex-col min-w-0 w-full min-h-[calc(100vh-61px)]">
      {notice && <p role="status" className="px-4 py-3 bg-emerald-50 text-emerald-900">{notice} <button className="underline ml-2" onClick={() => setNotice('')}>Dismiss</button></p>}
      {dataLoading && <p role="status" className="px-4 py-2 text-sm">Refreshing live data…</p>}
      {dataError && <div role="alert" className="px-4 py-3 bg-red-50 text-red-800">{dataError} <button type="button" className="underline font-bold" onClick={fetchData}>Retry</button></div>}
      {/* Real-time Alert Banner */}
      <AlertBanner
        alerts={alerts}
        location={userCoords}
        onSelectAlert={(alert) => showOnMap([alert.lat, alert.lng])}
      />

      <div className="max-w-7xl w-full mx-auto p-3 sm:p-4 pb-16 flex-1 flex flex-col gap-4">
        {/* Citizen Emergency Header & SOS Status */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#FFFFFF] border border-[#D8D3C7] p-4 rounded shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2E6E4E]"></span>
              <h1 className="font-display font-bold text-lg sm:text-xl text-[#14231F] tracking-tight">
                Your safety dashboard
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <p className="text-xs sm:text-sm text-[#14231F]/70">
                {user?.name || 'Citizen'} · Request help or find a nearby shelter.
              </p>
              <button
                type="button"
                id="citizen-update-gps-btn" disabled={locLoading}
                onClick={handleUpdateLocation}
                className="px-2 py-0.5 bg-[#EFECE4] hover:bg-[#D8D3C7] border border-[#D8D3C7] text-[#14231F] text-[10px] font-mono rounded font-semibold transition-colors"
                title="Acquire current browser GPS coordinates and sync with alert radius delivery system"
              >
                {locLoading ? 'Updating…' : 'Update location'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">

            <button
              id="report-hazard-btn"
              onClick={() => setHazardModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-3 bg-[#EFECE4] hover:bg-[#D8D3C7] border border-[#D8D3C7] text-[#14231F] font-display font-bold text-xs sm:text-sm rounded transition-colors whitespace-nowrap shrink-0"
            >
              <Camera className="w-4 h-4 text-[#C97A2B]" />
              <span>Report a hazard</span>
            </button>

            <SOSButton onSOSCreated={handleSOSCreated} defaultCoords={userCoords} />
          </div>
        </div>

        <QuickActions user={user} tickets={mySOSList} loading={dataLoading} stale={Boolean(dataError)} guidance={nearbyAdvisories(evacuationAdvisories,userCoords,user.region,now)[0]} location={userCoords}/>
        <EvacuationNotice advisories={evacuationAdvisories} coords={userCoords} user={user}/>
        {/* Active Emergency Signal Tracker */}
        {activeView !== 'REQUESTS' && activeSOS && (
            <div
              id="active-sos-tracker"
              className={`p-4 rounded border ${
                activeSOS.status === 'PENDING' || activeSOS.status === 'VERIFIED'
                  ? 'bg-[#B23A2E]/10 border-[#B23A2E] text-[#B23A2E]'
                  : 'bg-[#C97A2B]/10 border-[#C97A2B] text-[#C97A2B]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {activeSOS.status === 'PENDING' || activeSOS.status === 'VERIFIED' ? (
                    <Clock className="w-6 h-6 flex-shrink-0 animate-pulse mt-0.5" />
                  ) : (
                    <ShieldCheck className="w-6 h-6 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="text-sm font-semibold">
                      {STATUS_LABELS[activeSOS.status] || activeSOS.status}
                    </div>
                    <div className="text-sm font-semibold text-[#14231F] mt-1">
                      &ldquo;{activeSOS.message}&rdquo;
                    </div>
                  <div className="text-xs font-mono text-[#14231F]/70 mt-0.5">
                    Sent at {new Date(activeSOS.createdAt).toLocaleTimeString()}
                  </div>
                  <RescueProgress ticket={activeSOS} />
                  {activeSOS.vulnerabilityTags && activeSOS.vulnerabilityTags.length > 0 && (
                    <div className="flex gap-1 mt-1.5">
                      {activeSOS.vulnerabilityTags.map((tag) => (
                        <span key={tag} className="px-1.5 py-0.2 rounded border border-current font-mono text-[10px] uppercase font-bold bg-white/70">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <span className="font-mono text-xs font-bold px-2 py-1 bg-white/80 border border-current rounded uppercase">
                  Request #{activeSOS.id}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Rescue Closure Loop: Action Required by Citizen (Item 1.3) */}
        {activeView !== 'REQUESTS' && pendingVerificationSOS && (
          <div
            id="rescue-verification-card"
            className="p-4 bg-[#C97A2B]/10 border-2 border-[#C97A2B] rounded shadow-md text-xs font-mono space-y-3 animate-fade-in"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#C97A2B] font-bold text-sm font-display uppercase tracking-wide">
                <AlertOctagon className="w-5 h-5 animate-pulse" />
                <span>Did help arrive?</span>
              </div>
              <span className="px-2 py-0.5 bg-[#C97A2B] text-white rounded text-[10px] font-bold">
                Please confirm
              </span>
            </div>

            <div>
              <p className="text-sm font-display font-semibold text-[#14231F]">
                Responders marked your emergency signal &ldquo;{pendingVerificationSOS.message}&rdquo; as RESOLVED.
              </p>
              <p className="text-xs text-[#14231F]/80 mt-0.5">
                Has emergency assistance arrived and is everyone safe? If help has not reached you, you can reopen this ticket immediately with URGENT priority.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
              <button
                type="button"
                id="verify-rescue-yes-btn" disabled={verifying}
                onClick={() => handleCitizenVerify(pendingVerificationSOS.id, true)}
                className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-[#2E6E4E] hover:bg-[#23583e] text-white font-display font-bold text-xs rounded transition-all shadow-sm"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Yes, I am safe</span>
              </button>

              <button
                type="button"
                id="verify-rescue-no-btn" disabled={verifying}
                onClick={() => handleCitizenVerify(pendingVerificationSOS.id, false)}
                className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-[#B23A2E] hover:bg-[#9E2E23] text-white font-display font-bold text-xs rounded transition-all shadow-sm"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>I still need help</span>
              </button>
            </div>
          </div>
        )}

        {/* Verified Closed Banner */}
        {activeView !== 'REQUESTS' && !activeSOS && !pendingVerificationSOS && verifiedClosedSOS && (
          <div className="p-3 bg-[#2E6E4E]/10 border border-[#2E6E4E] text-[#2E6E4E] rounded flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              <span>Your previous rescue is complete. You confirmed that you are safe.</span>
            </div>
          </div>
        )}

        <OperationalStats />
        <DashboardTabs tabs={[{ id: 'SHELTERS', label: 'Find shelter' }, { id: 'REQUESTS', label: 'My requests' }, { id: 'MAP', label: 'Map' }, { id: 'SAFETY', label: 'Safety & supplies' }]} value={activeView} onChange={setActiveView} />
        {activeView === 'REQUESTS' && <MyRequests requests={mySOSList} onUpdated={sos => setMySOSList(prev => prev.map(item => item.id === sos.id ? sos : item))} onViewLocation={showOnMap} />}
        {activeView === 'MAP' && <section className="h-[520px]">            <MapView
              alerts={alerts}
              sosRequests={mySOSList}
              shelters={shelters}
              hazardReports={hazardReports}
              userCoords={userCoords}
              focusCoords={focusCoords}
              onConfirmHazard={handleConfirmHazard}
              userRole="CITIZEN"
            /></section>}
        {activeView === 'SHELTERS' && <section className="max-w-4xl w-full"><ShelterList shelters={shelters} userCoords={userCoords} onSelectShelter={shelter => showOnMap([shelter.lat, shelter.lng])} onShelterUpdated={handleShelterUpdated} /></section>}
        {activeView === 'SAFETY' && <section className="grid grid-cols-1 md:grid-cols-2 gap-4"><SafetyStatusWidget />            {/* My Claimed Relief Supplies Log (Anti-Hoarding Personal Ledger) */}
            <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded p-3 text-xs space-y-2.5">
              <div className="flex items-center justify-between border-b border-[#D8D3C7] pb-2">
                <div className="flex items-center gap-1.5 font-display font-bold uppercase text-[#14231F]">
                  <Package className="w-4 h-4 text-[#2E6E4E]" />
                  <span>My Relief Pickups</span>
                  <span className="px-1.5 py-0.2 bg-[#EFECE4] rounded text-[10px] font-mono">
                    {myPickups.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSupplyScannerOpen(true)}
                  className="px-2 py-0.5 bg-[#14231F] hover:bg-black text-white text-[10px] font-mono rounded font-semibold flex items-center gap-1"
                >
                  <QrCode className="w-3 h-3 text-[#4ADE80]" />
                  <span>Scan QR</span>
                </button>
              </div>

              {pickupError && <p role="alert" className="text-red-700">{pickupError} <button onClick={fetchMyPickups} className="underline">Retry pickup history</button></p>}
              {loadingPickups ? (
                <div className="p-3 text-center text-[11px] font-mono text-[#14231F]/60">
                  Loading personal pickup history...
                </div>
              ) : myPickups.length === 0 ? (
                <div className="p-3 text-center text-[11px] font-mono text-[#14231F]/60 bg-[#F6F4EF] rounded border border-dashed border-[#D8D3C7]">
                  No supplies claimed yet. Scan a batch QR code at any relief shelter station.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {myPickups.map((p) => {
                    const pickupTime = new Date(p.distributedAt).getTime();
                    const hoursSince = (now - pickupTime) / (1000 * 60 * 60);
                    const isCooldownActive = hoursSince < 12;
                    const nextEligibleDate = new Date(pickupTime + 12 * 60 * 60 * 1000);
                    const minsRemaining = Math.max(1, Math.round((nextEligibleDate.getTime() - now) / 60000));
                    const remH = Math.floor(minsRemaining / 60);
                    const remM = minsRemaining % 60;
                    const remStr = remH > 0 ? `${remH}h ${remM}m` : `${remM}m`;

                    return (
                      <div
                        key={p.id}
                        className="p-2 bg-[#F6F4EF] border border-[#D8D3C7] rounded text-left space-y-1"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-display font-bold text-xs text-[#14231F]">
                            {p.itemName}
                          </span>
                          <span className="px-1.5 py-0.2 bg-[#2E6E4E]/15 text-[#2E6E4E] border border-[#2E6E4E]/30 rounded text-[9px] font-mono font-bold shrink-0">
                            +{p.quantity} {p.supplyRequest?.unit || 'unit'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-mono text-[#14231F]/70">
                          <span>{p.shelter?.name || 'Relief Camp'}</span>
                          <span>{new Date(p.distributedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>

                        <div className="pt-0.5">
                          {isCooldownActive ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#C97A2B]/10 border border-[#C97A2B]/30 text-[#C97A2B] rounded text-[9px] font-mono">
                              <Clock className="w-2.5 h-2.5" />
                              <span>12h Cooldown (Eligible in {remStr})</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#2E6E4E]/10 border border-[#2E6E4E]/30 text-[#2E6E4E] rounded text-[9px] font-mono">
                              <CheckCircle className="w-2.5 h-2.5" />
                              <span>Eligible for next pickup</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

<div className="col-span-full">        {/* Nearby Peer-Confirmation Prompt (Amber/Grey hazard verification) */}
        <HazardConfirmationPrompt
          reports={hazardReports}
          userCoords={userCoords}
          onConfirmed={(updated) =>
            setHazardReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
          }
        />

</div></section>}
      </div>

      {/* Hazard Report In-App Camera Modal */}
      <HazardReportModal
        isOpen={hazardModalOpen}
        onClose={() => setHazardModalOpen(false)}
        onReportCreated={handleHazardReportCreated}
        defaultCoords={userCoords}
      />

      {/* Supply Pickup QR Scanner Modal */}
      {supplyScannerOpen&&<Suspense fallback={<p role="status">Loading pickup scanner…</p>}><SupplyScanner
        isOpen={supplyScannerOpen}
        onClose={() => setSupplyScannerOpen(false)}
        user={user}
        onSuccess={() => {
          fetchMyPickups();
          fetchData();
        }}
      /></Suspense>}

      {/* Simulated Offline Relay & SMS Gateway Drawer */}
      <OfflineSimulationDrawer onDataChanged={fetchData} />
    </div>
  );
}
