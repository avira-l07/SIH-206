import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import MapView from '../components/MapView';
import AlertBanner from '../components/AlertBanner';
import SOSButton from '../components/SOSButton';
import ShelterList from '../components/ShelterList';
import { AlertTriangle, CheckCircle, Clock, ShieldCheck, PhoneCall } from 'lucide-react';

export default function CitizenDashboard() {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [alerts, setAlerts] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [mySOSList, setMySOSList] = useState([]);
  const [focusCoords, setFocusCoords] = useState(null);
  const [userCoords, setUserCoords] = useState({ lat: 19.0760, lng: 72.8777 });

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      try {
        const [alertsRes, sheltersRes, sosRes] = await Promise.all([
          api.get('/alerts'),
          api.get('/shelters'),
          api.get('/sos/my').catch(() => ({ data: { requests: [] } })),
        ]);
        setAlerts(alertsRes.data.alerts || []);
        setShelters(sheltersRes.data.shelters || []);
        setMySOSList(sosRes.data.requests || []);
      } catch (err) {
        console.error('Error loading citizen dashboard data', err);
      }
    }
    fetchData();

    // Get browser geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => console.log('Using default Mumbai coordinates')
      );
    }
  }, []);

  // Socket.io live listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('alert:new', (newAlert) => {
      setAlerts((prev) => [newAlert, ...prev.filter((a) => a.id !== newAlert.id)]);
    });

    socket.on('sos:status_changed', (updatedSOS) => {
      setMySOSList((prev) =>
        prev.map((s) => (s.id === updatedSOS.id ? updatedSOS : s))
      );
    });

    socket.on('shelter:occupancy_changed', (updatedShelter) => {
      setShelters((prev) =>
        prev.map((s) => (s.id === updatedShelter.id ? updatedShelter : s))
      );
    });

    return () => {
      socket.off('alert:new');
      socket.off('sos:status_changed');
      socket.off('shelter:occupancy_changed');
    };
  }, [socket]);

  const handleSOSCreated = (newSOS) => {
    setMySOSList((prev) => [newSOS, ...prev]);
    setFocusCoords([newSOS.lat, newSOS.lng]);
  };

  const activeSOS = mySOSList.find((s) => s.status !== 'RESOLVED');
  const recentResolved = mySOSList.find((s) => s.status === 'RESOLVED');

  return (
    <div className="flex flex-col min-h-[calc(100vh-61px)]">
      {/* Real-time Alert Banner */}
      <AlertBanner
        alerts={alerts}
        onSelectAlert={(alert) => setFocusCoords([alert.lat, alert.lng])}
      />

      <div className="max-w-7xl w-full mx-auto p-3 sm:p-4 flex-1 flex flex-col gap-4">
        {/* Citizen Emergency Header & SOS Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FFFFFF] border border-[#D8D3C7] p-4 rounded">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2E6E4E]"></span>
              <h1 className="font-display font-bold text-lg sm:text-xl text-[#14231F] tracking-tight">
                CITIZEN RESILIENCE & SOS CONSOLE
              </h1>
            </div>
            <p className="text-xs text-[#14231F]/70 font-mono mt-0.5">
              Welcome {user?.name || 'Citizen'}. Monitor live threats, request urgent rescue, or navigate to nearest shelters.
            </p>
          </div>

          <SOSButton onSOSCreated={handleSOSCreated} defaultCoords={userCoords} />
        </div>

        {/* Active Emergency Signal Tracker */}
        {activeSOS && (
          <div
            id="active-sos-tracker"
            className={`p-4 rounded border ${
              activeSOS.status === 'PENDING'
                ? 'bg-[#B23A2E]/10 border-[#B23A2E] text-[#B23A2E]'
                : 'bg-[#C97A2B]/10 border-[#C97A2B] text-[#C97A2B]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {activeSOS.status === 'PENDING' ? (
                  <Clock className="w-6 h-6 flex-shrink-0 animate-pulse mt-0.5" />
                ) : (
                  <ShieldCheck className="w-6 h-6 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-mono text-xs uppercase font-bold tracking-wider">
                    {activeSOS.status === 'PENDING'
                      ? '● SOS BROADCAST ACTIVE — AWAITING VOLUNTEER DISPATCH'
                      : '✓ VOLUNTEER ASSIGNED & EN ROUTE'}
                  </div>
                  <div className="text-sm font-semibold text-[#14231F] mt-1">
                    "{activeSOS.message}"
                  </div>
                  <div className="text-xs font-mono text-[#14231F]/70 mt-0.5">
                    Signal Transmitted at {new Date(activeSOS.createdAt).toLocaleTimeString()} • Coordinates: {activeSOS.lat.toFixed(4)}, {activeSOS.lng.toFixed(4)}
                  </div>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <span className="font-mono text-xs font-bold px-2 py-1 bg-white/80 border border-current rounded uppercase">
                  STATUS: {activeSOS.status}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Resolved Notification Banner (if recent) */}
        {!activeSOS && recentResolved && (
          <div className="p-3 bg-[#2E6E4E]/10 border border-[#2E6E4E] text-[#2E6E4E] rounded flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              <span>Prior distress signal at {recentResolved.lat.toFixed(3)}°N has been marked RESOLVED / SAFE by rescue teams.</span>
            </div>
          </div>
        )}

        {/* Map-First Split View (65% Map / 35% Panel) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
          {/* Map Hero (65% width) */}
          <div className="lg:col-span-8 flex flex-col min-h-[480px]">
            <div className="flex items-center justify-between mb-1 text-xs font-mono text-[#14231F]/70">
              <span>SITUATION MAP (60% VIEWPORT)</span>
              <span>RED: ACTIVE SOS • ORANGE/RED: HAZARDS • BLACK: SHELTERS</span>
            </div>
            <MapView
              alerts={alerts}
              sosRequests={mySOSList}
              shelters={shelters}
              userCoords={userCoords}
              focusCoords={focusCoords}
              userRole="CITIZEN"
            />
          </div>

          {/* Side Dock: Shelter Finder & Safety Instructions */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="flex-1">
              <ShelterList
                shelters={shelters}
                userCoords={userCoords}
                onSelectShelter={(shelter) => setFocusCoords([shelter.lat, shelter.lng])}
              />
            </div>

            {/* Quick Emergency Protocol Guidelines */}
            <div className="p-3 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-xs space-y-2">
              <h4 className="font-display font-bold uppercase text-[#14231F] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-[#C97A2B]" />
                Emergency Safety Rules
              </h4>
              <ul className="list-disc pl-4 space-y-1 text-[#14231F]/80 font-mono text-[11px]">
                <li>Avoid floodwater; 15cm of fast-flowing water can knock you down.</li>
                <li>Stay off powerlines and flooded electrical switchboards.</li>
                <li>Keep phone batteries charged and monitor live alerts.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
