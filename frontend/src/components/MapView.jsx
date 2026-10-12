import { DISPATCHED_STATUSES, ACTION_LABELS } from '../services/sosWorkflow';
import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SOI_NORTHERN_BOUNDARY } from '../data/soiBoundary';
import { Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isManualOffline } from '../services/offlineQueue';
import { mapScope, validMapPoint, saveMapReference, readMapReference, clearMapReference, offlineReadiness } from '../services/offlineMap';

// Fix for default Leaflet icon paths in bundlers
delete L.Icon.Default.prototype._getIconUrl;

// Custom SVG Icons matching Field-Ops Design System
const createCustomIcon = (bgColor, textColor, symbol, isPulsing = false) => {
  const pulseClass = isPulsing ? 'animate-emergency' : '';
  const html = `
    <div class="${pulseClass}" style="
      background-color: ${bgColor};
      color: ${textColor};
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #FFFFFF;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 700;
      font-size: 13px;
    ">
      ${symbol}
    </div>
  `;
  return L.divIcon({
    html,
    className: 'custom-leaflet-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
};

const sosPendingIcon = createCustomIcon('#B23A2E', '#FFFFFF', '!', true);
const sosProgressIcon = createCustomIcon('#C97A2B', '#FFFFFF', '⏱');
const sosResolvedIcon = createCustomIcon('#2E6E4E', '#FFFFFF', '✓');
const userLocationIcon = createCustomIcon('#2E6E4E', '#FFFFFF', '●');

// Hazard Report Tier Icons (Decision 0.2)
const hazardGreyIcon = createCustomIcon('#9A968C', '#FFFFFF', '?');
const hazardAmberIcon = createCustomIcon('#C97A2B', '#FFFFFF', '⚠');
const hazardRedIcon = createCustomIcon('#B23A2E', '#FFFFFF', '⚡', true);

// Disputed: hatched/striped pattern over grey dot (Decision 0.2)
const createHatchedDisputeIcon = () => {
  const html = `
    <div style="
      background: repeating-linear-gradient(45deg, #9A968C, #9A968C 4px, #4A4843 4px, #4A4843 8px);
      color: #FFFFFF;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px dashed #FFFFFF;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 800;
      font-size: 13px;
    ">
      ✕
    </div>
  `;
  return L.divIcon({
    html,
    className: 'custom-leaflet-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
};

// Resolved: muted/faded pin with checkmark, kept visible (Decision 0.2)
const createResolvedHazardIcon = () => {
  const html = `
    <div style="
      background-color: #6B7F76;
      color: #FFFFFF;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #D8D3C7;
      box-shadow: 0 1px 4px rgba(0,0,0,0.2);
      opacity: 0.85;
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 700;
      font-size: 12px;
    ">
      ✓
    </div>
  `;
  return L.divIcon({
    html,
    className: 'custom-leaflet-marker',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
};

const hazardDisputedIcon = createHatchedDisputeIcon();
const hazardResolvedIcon = createResolvedHazardIcon();

// Shelter Status Icons
const shelterGreenIcon = createCustomIcon('#2E6E4E', '#F6F4EF', '⌂');
const shelterYellowIcon = createCustomIcon('#C97A2B', '#F6F4EF', '⌂');
const shelterRedIcon = createCustomIcon('#B23A2E', '#F6F4EF', '⌂');

// Helper to center/fly map when focus changes
function MapFocusController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && validMapPoint({lat:center[0],lng:center[1]})) {
      map.flyTo(center, zoom || 13, { duration: 1.2 });
    }
  }, [center, zoom, map]);
  return null;
}

// Bounds helper to fit all incidents dynamically on the map
function MapBoundsController({ triggerFit, incidents = [], autoFit = true }) {
  const map = useMap();
  const initialFittedRef = React.useRef(false);

  // Auto-fit on initial load once incidents arrive
  useEffect(() => {
    if (autoFit && incidents.length > 0 && !initialFittedRef.current) {
      const points = incidents
        .filter((i) => i && typeof i.lat === 'number' && typeof i.lng === 'number')
        .map((i) => [i.lat, i.lng]);

      if (points.length > 0) {
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 11, duration: 1.0 });
        initialFittedRef.current = true;
      }
    }
  }, [incidents, map, autoFit]);

  // Explicit trigger (e.g. FIT ALL INCIDENTS button)
  useEffect(() => {
    if (!triggerFit) return;
    const points = incidents
      .filter((i) => i && typeof i.lat === 'number' && typeof i.lng === 'number')
      .map((i) => [i.lat, i.lng]);

    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12, duration: 1.0 });
    }
  }, [triggerFit, incidents, map]);
  return null;
}

function MapViewTracker({ onChange }) {
  const map = useMap();
  useEffect(() => {
    const track = () => { const center = map.getCenter(); onChange({center:{lat:center.lat,lng:center.lng},zoom:map.getZoom()}); };
    track(); map.on('moveend zoomend',track); return () => {map.off('moveend zoomend',track);};
  }, [map,onChange]);
  return null;
}

function CoordinateGrid() {
  const map = useMap();
  useEffect(() => {
    const Grid = L.GridLayer.extend({ createTile(coords) {
      const tile = document.createElement('div');
      const center = map.unproject(L.point((coords.x + 0.5) * 256,(coords.y + 0.5) * 256),coords.z);
      tile.style.cssText = 'background:#F6F4EF;border:1px solid #D8D3C7;display:flex;align-items:center;justify-content:center;font:11px monospace;color:#797469';
      tile.textContent = `${center.lat.toFixed(3)}, ${center.lng.toFixed(3)}`; return tile;
    }});
    const grid = new Grid({ attribution:'Coordinate reference grid — no road imagery' }); grid.addTo(map);
    return () => {map.removeLayer(grid);};
  }, [map]);
  return null;
}

const REGION_COORDINATES = {
  uttarakhand: [30.3165, 78.0322],
  chamoli: [30.4074, 79.3248],
  mumbai: [19.0760, 72.8777],
  delhi: [28.6139, 77.2090],
  chennai: [13.0827, 80.2707],
  kutch: [23.2420, 69.6669],
  kolkata: [22.5726, 88.3639],
  kerala: [11.6854, 76.1320],
};


const MAP_LAYERS = {
  voyager: {
    id: 'voyager',
    name: 'Tactical Street Map',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
    subdomains: 'abcd',
    maxZoom: 19,
  },
  topo: {
    id: 'topo',
    name: 'Topographic Relief',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; OpenStreetMap, SRTM | Map style: &copy; OpenTopoMap',
    subdomains: 'abc',
    maxZoom: 17,
  },
  satellite: {
    id: 'satellite',
    name: 'Satellite Aerial',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Satellite Imagery',
    maxZoom: 20,
  },
  osm: {
    id: 'osm',
    name: 'Standard OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
};

export default function MapView({
  alerts: liveAlerts = [],
  sosRequests = [],
  shelters: liveShelters = [],
  hazardReports: liveHazards = [],
  userCoords,
  focusCoords,
  onAssignSOS,
  canClaimSOS = true,
  actionsBusy = false,
  onResolveSOS,
  currentUserId,
  onConfirmHazard,
  onViewSupplies,
  userRole,
  mode = 'authenticated', // 'authenticated' | 'public'
}) {
  const { user } = useAuth();
  const scope = mapScope(user,mode);
  const [reference,setReference] = React.useState(() => readMapReference(localStorage,scope));
  const [mapNotice,setMapNotice] = React.useState(''), [readiness,setReadiness] = React.useState(null);
  const viewport = React.useRef(null);
  const trackView = React.useCallback(view => {viewport.current=view;},[]);
  const [fitTrigger, setFitTrigger] = React.useState(0);
  const [selectedLayer, setSelectedLayer] = React.useState(!navigator.onLine || isManualOffline() ? 'grid' : 'voyager');
  const [selectedRegionJump, setSelectedRegionJump] = React.useState('');
  const [activeCenter, setActiveCenter] = React.useState(null);
  const [isOffline, setIsOffline] = React.useState(!navigator.onLine || isManualOffline());
  const usingReference = isOffline && Boolean(reference);
  const alerts = (usingReference ? reference.alerts : liveAlerts).filter(validMapPoint);
  const shelters = (usingReference ? reference.shelters : liveShelters).filter(validMapPoint);
  const hazardReports = (usingReference ? reference.hazardReports : liveHazards).filter(validMapPoint);
  React.useEffect(() => {setReference(readMapReference(localStorage,scope));},[scope]);
  React.useEffect(() => {if(isOffline)setSelectedLayer('grid');},[isOffline]);
  const checkReadiness = async () => {try {setReadiness(await offlineReadiness());}catch {setReadiness({shell:false,tiles:0,reason:'Browser storage could not be inspected'});} };
  const saveReference = () => {
    try {setReference(saveMapReference(localStorage,scope,{alerts:liveAlerts,shelters:liveShelters,hazardReports:mode==='public'?[]:liveHazards},viewport.current));setMapNotice('Map reference saved. Capacity and hazards will become stale during an outage.');checkReadiness();}
    catch {setMapNotice('Map could not be saved. Free browser storage and retry.');}
  };

  React.useEffect(() => {
    const handleOnline = () => setIsOffline(!navigator.onLine || isManualOffline());
    const handleOffline = handleOnline;
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sih:connectivity-changed',handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sih:connectivity-changed',handleOnline);
    };
  }, []);

  // Dynamic initial center: focusCoords -> userCoords -> first active alert/shelter -> national fallback [20.5937, 78.9629]
  const defaultCenter = React.useMemo(() => {
    if (usingReference) return [reference.view.center.lat,reference.view.center.lng];
    if (focusCoords && validMapPoint({lat:focusCoords[0],lng:focusCoords[1]})) {
      return focusCoords;
    }
    if (validMapPoint(userCoords)) {
      return [userCoords.lat, userCoords.lng];
    }
    if (alerts.length > 0 && typeof alerts[0].lat === 'number') {
      return [alerts[0].lat, alerts[0].lng];
    }
    if (shelters.length > 0 && typeof shelters[0].lat === 'number') {
      return [shelters[0].lat, shelters[0].lng];
    }
    return [30.3165, 78.0322]; // Default: Uttarakhand Disaster Operations Center
  }, [focusCoords, userCoords, alerts, shelters, usingReference, reference]);

  const allIncidents = React.useMemo(() => {
    if (mode === 'public') {
      return [...alerts.filter((a) => a.active !== false), ...shelters];
    }
    return [...alerts.filter((a) => a.active !== false), ...sosRequests, ...shelters, ...hazardReports];
  }, [alerts, sosRequests, shelters, hazardReports, mode]);

  const handleRegionJump = (key) => {
    setSelectedRegionJump(key);
    if (REGION_COORDINATES[key]) {
      setActiveCenter(REGION_COORDINATES[key]);
    }
  };

  const handleFitAll = () => {
    setFitTrigger((prev) => prev + 1);
  };

  const handleLocateMe = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setActiveCenter([pos.coords.latitude, pos.coords.longitude]);
        },
        () => setMapNotice('Could not get GPS. Allow location access or use the saved markers and coordinates.'),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setMapNotice('GPS is unavailable in this browser. Use the saved markers and coordinates.');
    }
  };

  return (
    <div className="w-full h-full min-h-[420px] rounded border border-[#D8D3C7] overflow-hidden relative shadow-xs isolate">
      {/* Tactical Map Toolbar (Region Jump, Fit All Incidents & Live GPS) */}
      <div className="absolute top-2 right-2 left-12 sm:left-auto z-[450] flex flex-wrap items-center gap-1.5 bg-[#FFFFFF]/95 backdrop-blur-xs border border-[#D8D3C7] rounded p-1.5 shadow-md font-mono text-xs">
        <button
          type="button"
          onClick={handleLocateMe}
          className="px-2.5 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] text-[#14231F] border border-[#D8D3C7] rounded text-[11px] font-bold flex items-center gap-1 transition-transform active:scale-95"
          title="Recenter to my live browser GPS position"
        >
          <span>My location</span>
        </button>

        <button
          type="button"
          onClick={handleFitAll}
          className="px-2.5 py-1 bg-[#14231F] text-white hover:bg-black rounded text-[11px] font-bold flex items-center gap-1 transition-transform active:scale-95"
          title="Zoom to fit all active alerts, shelters, and incidents"
        >
          <span>Show all</span>
        </button>

<details className="relative"><summary className="cursor-pointer px-2 py-1 text-xs">Map options</summary><div className="absolute right-0 top-full mt-2 rounded-lg bg-white p-3 shadow-md border space-y-2 min-w-[220px]">        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[#14231F]/70 font-semibold">Map style</span>
          <select
            aria-label="Map style"
            value={selectedLayer}
            onChange={(e) => setSelectedLayer(e.target.value)}
            className="bg-[#F6F4EF] border border-[#D8D3C7] rounded px-1.5 py-1 text-[11px] text-[#14231F] font-mono focus:outline-none focus:border-[#14231F]"
          >
            <option value="voyager">Street map</option>
            <option value="topo">🏔️ Topographic Relief</option>
            <option value="satellite">🛰️ Satellite Aerial</option>
            <option value="osm">OpenStreetMap streets</option>
            <option value="grid">Offline coordinate grid</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[#14231F]/70 font-semibold">Region</span>
          <select
            aria-label="Map region"
            value={selectedRegionJump}
            onChange={(e) => handleRegionJump(e.target.value)}
            className="bg-[#F6F4EF] border border-[#D8D3C7] rounded px-1.5 py-1 text-[11px] text-[#14231F] font-mono focus:outline-none focus:border-[#14231F]"
          >
            <option value="">Quick Region...</option>
            <option value="uttarakhand">Uttarakhand / Dehradun</option>
            <option value="chamoli">Chamoli / Joshimath</option>
            <option value="mumbai">Mumbai Metro</option>
            <option value="delhi">Delhi NCR</option>
            <option value="chennai">Chennai Sector</option>
            <option value="kutch">Kutch / Gujarat</option>
            <option value="kolkata">Kolkata / Sundarbans</option>
            <option value="kerala">Kerala / Wayanad</option>
          </select>
        </div>
        <div className="border-t pt-2 space-y-2 text-xs"><button type="button" disabled={isOffline} onClick={saveReference} className="rounded border px-2 py-1 disabled:opacity-50">Save map reference</button><button type="button" onClick={checkReadiness} className="rounded border px-2 py-1">Check offline readiness</button>
          <p>Saved shelter locations and hazard markers work on the offline coordinate grid. Previously viewed street tiles may be cached; other imagery requires internet.</p>
          {reference && <><p>Saved: {new Date(reference.savedAt).toLocaleString()}</p><button type="button" onClick={() => {clearMapReference(localStorage,scope);setReference(null);setMapNotice('Saved map reference removed from this account.');}} className="underline">Remove saved map reference</button></>}
          {readiness && <p role="status">App shell: {readiness.shell && readiness.controlled ? 'ready for offline reload' : 'not ready'} · {readiness.assets || 0} app assets cached · {readiness.tiles} viewed tiles cached. {readiness.missing ? `${readiness.missing} app assets missing.` : ''} {readiness.reason || ''}</p>}
        </div></div></details>
      </div>

      {mapNotice&&<div role="status" className="absolute bottom-24 left-2 right-2 z-[451] rounded-lg border border-[#D8D3C7] bg-white p-3 shadow-md text-sm flex flex-wrap justify-between gap-2"><p>{mapNotice}</p><button type="button" className="underline" onClick={()=>setMapNotice('')}>Dismiss</button></div>}
      {/* Offline Tile Notice (Labeled Limitation) */}
      {isOffline && (
        <div className="absolute bottom-2 left-2 right-2 z-[450] bg-[#14231F]/90 text-[#F6F4EF] border border-[#D8D3C7] rounded px-3 py-1.5 text-xs font-mono flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold">⚠️ OFFLINE MODE:</span>
            <span>{usingReference ? `Saved reference from ${new Date(reference.savedAt).toLocaleString()}.` : 'Last loaded markers; no saved reference.'} Capacity and hazards are stale.</span>
          </div>
        </div>
      )}

      {/* Reference boundary legend */}
      <div className={`absolute ${isOffline ? 'bottom-20' : 'bottom-2'} left-2 z-[450] bg-[#FFFFFF]/95 backdrop-blur-xs border border-[#D8D3C7] rounded px-2.5 py-1 text-[10px] font-mono text-[#14231F] shadow-xs flex items-center gap-1.5 pointer-events-none`}>
        <span className="inline-block w-2 h-2 rounded-full bg-[#2E6E4E] animate-pulse"></span>
        <span className="font-bold text-[#14231F]">Reference boundary overlay</span>
      </div>

      <MapContainer
        center={defaultCenter}
        zoom={usingReference ? reference.view.zoom : 9}
        minZoom={5}
        maxBounds={[[6.0, 68.0], [37.6, 97.5]]}
        maxBoundsViscosity={0.85}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        {selectedLayer === 'grid' ? <CoordinateGrid/> : <TileLayer
          key={selectedLayer}
          attribution={MAP_LAYERS[selectedLayer].attribution}
          url={MAP_LAYERS[selectedLayer].url}
          subdomains={MAP_LAYERS[selectedLayer].subdomains || 'abc'}
          maxZoom={MAP_LAYERS[selectedLayer].maxZoom || 19}
        />}

        {/* Reference Northern Boundary */}
        <Polyline
          positions={SOI_NORTHERN_BOUNDARY}
          pathOptions={{
            color: '#14231F',
            weight: 3.5,
            opacity: 0.85,
            dashArray: '8, 6',
          }}
        />

        <MapViewTracker onChange={trackView}/>
        <MapFocusController center={activeCenter || focusCoords || (usingReference ? defaultCenter : null)} zoom={usingReference ? reference.view.zoom : undefined}/>
        <MapBoundsController triggerFit={fitTrigger} incidents={allIncidents} autoFit={!usingReference}/>

        {/* User Location Marker */}
        {userCoords && (
          <Marker position={[userCoords.lat, userCoords.lng]} icon={userLocationIcon}>
            <Popup>
              <div className="text-xs font-mono p-1">
                <strong>YOUR SAVED / LAST KNOWN LOCATION</strong>
                <div>{userCoords.lat.toFixed(4)}° N, {userCoords.lng.toFixed(4)}° E</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Active Hazard Radii & Circles (Leaflet circle radius = radiusKm * 1000 meters) */}
        {alerts.filter((alert) => alert.active !== false).map((alert) => {
          const isCritical = alert.severity === 'CRITICAL';
          const color = isCritical ? '#B23A2E' : '#C97A2B';
          const radiusKm = alert.radiusKm !== undefined && alert.radiusKm !== null ? Number(alert.radiusKm) : 5.0;
          const radiusMeters = radiusKm * 1000;

          return (
            <React.Fragment key={`alert-${alert.id}`}>
              <Circle
                center={[alert.lat, alert.lng]}
                radius={radiusMeters}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.18,
                  weight: 2,
                  dashArray: isCritical ? '6, 6' : undefined,
                }}
              />
              <Marker
                position={[alert.lat, alert.lng]}
                icon={createCustomIcon(color, '#FFFFFF', isCritical ? '⚠' : 'ℹ')}
              >
                <Popup>
                  <div className="text-xs p-1 max-w-xs">
                    <div className="font-mono font-bold uppercase text-[10px] px-1.5 py-0.5 rounded text-white inline-block mb-1" style={{ backgroundColor: color }}>
                      {alert.severity} // {alert.hazardType}
                    </div>
                    <div className="font-bold text-sm text-[#14231F]">{alert.region}</div>
                    <div className="text-[11px] font-mono text-[#B23A2E] font-bold mt-0.5">
                      Hazard Radius: {radiusKm} km ({radiusMeters.toLocaleString()}m perimeter)
                    </div>
                    <div className="text-[#14231F]/80 my-1">{alert.message}</div>
                    <div className="text-[10px] font-mono text-[#14231F]/60">
                      Coordinates: {alert.lat.toFixed(4)}, {alert.lng.toFixed(4)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}

        {/* Crowdsourced Hazard Reports with Confidence Tiers (Decision 0.2 & Item 2.5 - Authenticated Only) */}
        {mode !== 'public' && hazardReports.map((report) => {
          let icon = hazardGreyIcon;
          let tierColor = '#9A968C';
          if (report.confidenceTier === 'AMBER') {
            icon = hazardAmberIcon;
            tierColor = '#C97A2B';
          } else if (report.confidenceTier === 'RED') {
            icon = hazardRedIcon;
            tierColor = '#B23A2E';
          } else if (report.confidenceTier === 'DISPUTED') {
            icon = hazardDisputedIcon;
            tierColor = '#66635C';
          } else if (report.confidenceTier === 'RESOLVED') {
            icon = hazardResolvedIcon;
            tierColor = '#6B7F76';
          }

          // Route Obstruction Rendering (Item 2.5) for WAIST or SUBMERGED reports
          const isObstruction =
            (report.severityBenchmark === 'WAIST' || report.severityBenchmark === 'SUBMERGED') &&
            report.confidenceTier !== 'RESOLVED' &&
            report.confidenceTier !== 'DISPUTED';

          const obstructionRadius = report.severityBenchmark === 'SUBMERGED' ? 250 : 150;
          const obstructionColor = report.severityBenchmark === 'SUBMERGED' ? '#B23A2E' : '#C97A2B';

          return (
            <React.Fragment key={`hazard-report-${report.id}`}>
              {/* Route Obstruction Perimeter Ring */}
              {isObstruction && (
                <Circle
                  center={[report.lat, report.lng]}
                  radius={obstructionRadius}
                  pathOptions={{
                    color: obstructionColor,
                    fillColor: obstructionColor,
                    fillOpacity: 0.2,
                    weight: 2.5,
                    dashArray: '6, 6',
                  }}
                />
              )}

              <Marker position={[report.lat, report.lng]} icon={icon}>
                <Popup>
                  <div className="text-xs p-1 max-w-xs space-y-2">
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <span
                        className="font-mono font-bold uppercase text-[10px] px-1.5 py-0.5 rounded text-white"
                        style={{ backgroundColor: tierColor }}
                      >
                        TIER: {report.confidenceTier} ({report.confirmationsCount} Confirms)
                      </span>
                      <span className="text-[10px] font-mono text-[#14231F]/60">
                        {new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Depth Benchmark & Route Blockage Notice */}
                    {report.severityBenchmark && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-bold text-[10px] uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-200">
                          DEPTH: {report.severityBenchmark}
                        </span>
                        {isObstruction && (
                          <span className="font-mono font-bold text-[10px] uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200">
                            ROAD IMPASSABLE
                          </span>
                        )}
                      </div>
                    )}

                    {isObstruction && (
                      <div className="p-1.5 bg-red-50 border border-red-300 rounded text-[10px] font-mono text-red-900">
                        <strong>⚠️ ROUTE OBSTRUCTION:</strong> Reported depth ({report.severityBenchmark}) may block vehicle access. Verify a safe route before travel.
                      </div>
                    )}

                    {report.confidenceTier === 'DISPUTED' && (
                      <div className="p-1.5 bg-gray-100 border border-gray-400 rounded text-[10px] font-mono text-gray-800">
                        <strong>⊘ DISPUTED / QUARANTINED:</strong> Ground consensus marked this report false. Excluded from active emergency dispatch.
                      </div>
                    )}

                    {report.confidenceTier === 'RESOLVED' && (
                      <div className="p-1.5 bg-emerald-50 border border-emerald-300 rounded text-[10px] font-mono text-emerald-900">
                        <strong>✓ HAZARD RESOLVED:</strong> Water has receded and route verified clear.
                      </div>
                    )}

                    {report.photoUrl && (
                      <div className="rounded border border-[#D8D3C7] overflow-hidden max-h-36">
                        <img src={report.photoUrl} alt="Hazard photo" className="w-full h-28 object-cover" />
                      </div>
                    )}

                    <div className="text-sm font-display font-semibold text-[#14231F]">
                      &ldquo;{report.hazardNote}&rdquo;
                    </div>

                    <div className="text-[11px] font-mono text-[#14231F]/70">
                      Reported by: <strong>{report.userName}</strong>
                    </div>

                    {!isOffline && report.confidenceTier !== 'RED' && report.confidenceTier !== 'RESOLVED' && onConfirmHazard && (
                      <div className="pt-2 border-t border-[#D8D3C7]">
                        <button
                          type="button"
                          onClick={() => onConfirmHazard(report.id)}
                          className="w-full py-1 bg-[#2E6E4E] hover:bg-[#23583e] text-white font-display font-bold text-xs rounded transition-colors flex items-center justify-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>CONFIRM REPORT ACCURACY</span>
                        </button>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}

        {/* SOS Distress Calls (Authenticated Responders Only) */}
        {mode !== 'public' && sosRequests.map((sos) => {
          let icon = sosPendingIcon;
          if (DISPATCHED_STATUSES.includes(sos.status)) icon = sosProgressIcon;
          if (sos.status === 'RESOLVED') icon = sosResolvedIcon;

          const isUrgent = sos.priority === 'URGENT' || (sos.vulnerabilityTags && sos.vulnerabilityTags.length > 0);

          return (
            <Marker key={`sos-${sos.id}`} position={[sos.lat, sos.lng]} icon={icon}>
              <Popup>
                <div className="text-xs p-1 max-w-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold uppercase text-[10px] px-1.5 py-0.5 rounded bg-[#B23A2E] text-white">
                      SOS // {sos.hazardType}
                    </span>
                    {isUrgent && (
                      <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-[#B23A2E]/15 text-[#B23A2E]">
                        URGENT
                      </span>
                    )}
                  </div>

                  <div className="font-bold text-sm text-[#14231F]">{sos.userName}</div>
                  {sos.userPhone && (
                    <div className="text-[11px] font-mono text-[#14231F]/80">
                      Phone: <a href={`tel:${sos.userPhone}`} className="underline font-bold">{sos.userPhone}</a>
                    </div>
                  )}
                  <p className="text-[#14231F] italic bg-[#F6F4EF] p-1.5 rounded border border-[#D8D3C7]">
                    &ldquo;{sos.message}&rdquo;
                  </p>

                  {/* Vulnerability tags */}
                  {sos.vulnerabilityTags && sos.vulnerabilityTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {sos.vulnerabilityTags.map((tag) => (
                        <span key={tag} className="px-1.5 py-0.2 rounded border border-[#14231F] text-[10px] font-mono uppercase bg-[#EFECE4]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Responders Action Controls */}
                  {!isOffline && (userRole === 'VOLUNTEER' || userRole === 'ADMIN') && (
                    <div className="pt-2 border-t border-[#D8D3C7] flex gap-2">
                      {(sos.status === 'VERIFIED' || (sos.status === 'PENDING' && userRole === 'ADMIN')) && onAssignSOS && (
                        <button
                          disabled={actionsBusy || !canClaimSOS}
                          onClick={() => onAssignSOS(sos.id)}
                          className="w-full py-1 bg-[#14231F] text-[#F6F4EF] font-display font-semibold text-xs rounded hover:bg-black"
                        >
                          ACCEPT DISPATCH
                        </button>
                      )}
                      {DISPATCHED_STATUSES.includes(sos.status) && (userRole === 'ADMIN' || sos.assignedVolunteerId === currentUserId) && onResolveSOS && (
                        <button
                          disabled={actionsBusy}
                          onClick={() => onResolveSOS(sos.id)}
                          className="w-full py-1 bg-[#2E6E4E] text-white font-display font-semibold text-xs rounded hover:bg-[#24583e]"
                        >
                          {ACTION_LABELS[sos.status]}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Emergency Shelters */}
        {shelters.map((shelter) => {
          let sIcon = shelterGreenIcon;
          if (shelter.status === 'YELLOW') sIcon = shelterYellowIcon;
          if (shelter.status === 'RED') sIcon = shelterRedIcon;

          return (
            <Marker
              key={`shelter-${shelter.id}`}
              position={[shelter.lat, shelter.lng]}
              icon={sIcon}
            >
              <Popup>
                <div className="text-xs p-1 max-w-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-[#2E6E4E] font-bold uppercase">
                      EMERGENCY SHELTER
                    </span>
                    <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold uppercase ${
                      shelter.status === 'RED' ? 'bg-[#B23A2E] text-white' : shelter.status === 'YELLOW' ? 'bg-[#C97A2B] text-white' : 'bg-[#2E6E4E] text-white'
                    }`}>
                      {shelter.status}
                    </span>
                  </div>

                  <div className="font-bold text-sm text-[#14231F]">{shelter.name}</div>
                  {isOffline && <p className="font-semibold text-amber-800">Saved reference — bed availability is unconfirmed.</p>}
                  <div className="text-[#14231F]/70 text-[11px]">{shelter.address}</div>
                  <div className="font-mono text-xs pt-1">
                    Capacity: <strong>{shelter.currentOccupancy} / {shelter.capacity}</strong>
                    {shelter.currentOccupancy >= shelter.capacity ? (
                      <span className="text-[#B23A2E] font-bold ml-1">(FULL)</span>
                    ) : (
                      <span className="text-[#2E6E4E] font-bold ml-1">
                        ({shelter.capacity - shelter.currentOccupancy} free)
                      </span>
                    )}
                  </div>
                  {shelter.contact && (
                    <div className="text-[11px] font-mono text-[#14231F]/80">
                      Contact: <a href={`tel:${shelter.contact}`} className="underline">{shelter.contact}</a>
                    </div>
                  )}
                  {mode === 'public' && !isOffline ? (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${shelter.lat},${shelter.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-center mt-2 py-1 bg-[#14231F] hover:bg-black text-white text-[10px] font-mono font-bold rounded transition-colors"
                    >
                      🧭 GET GPS DIRECTIONS ↗
                    </a>
                  ) : (
                    !isOffline && onViewSupplies && (
                      <button
                        type="button"
                        onClick={() => onViewSupplies(shelter)}
                        className="w-full mt-2 py-1 bg-[#14231F] hover:bg-black text-white text-[10px] font-mono font-bold rounded"
                      >
                        📦 VIEW SUPPLIES & SHIPMENTS
                      </button>
                    )
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
