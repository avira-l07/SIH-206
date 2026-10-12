import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import { subscribePush } from '../services/push';
import { calculateDistanceKm } from '../services/haversine';
import './LandingPage.css';

const TYPE_EMOJI = {
  flood: '🌊',
  landslide: '⛰️',
  cyclone: '🌀',
  earthquake: '📈',
  wildfire: '🔥',
  resource: '🏥',
  shelter: '🏠',
  hospital: '🏥',
  relief: '📦'
};

const SEV_COLOR = {
  high: '#DC2626',
  warning: '#EA580C',
  resource: '#1E5FE0',
  safe: '#17924E'
};

const streetTileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const streetTileOptions = {
  subdomains: 'abcd',
  maxZoom: 19,
  attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap'
};

const topoTileUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
const topoTileOptions = {
  subdomains: 'abc',
  maxZoom: 17,
  attribution: 'Map data: &copy; OpenStreetMap, SRTM | Map style: &copy; OpenTopoMap'
};

const satTileUrl = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
const satTileOptions = {
  maxZoom: 20,
  attribution: '&copy; Google Satellite Imagery'
};

function createCustomMarker(emoji, color, isPulse = false) {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div class="marker-pin ${isPulse ? 'pulse' : ''}" style="background:${color};">
        ${emoji}
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -20]
  });
}

export default function LandingPage({
  user,
  onNavigateToLogin,
  onNavigateToRegister,
  onNavigateToPublicAlerts
}) {
  const { socket } = useSocket();
  const [DISASTERS, setDisasters] = useState([]);
  const [RESOURCES, setResources] = useState([]);
  const [feedError, setFeedError] = useState('');
  const [feedLoading, setFeedLoading] = useState(true);
  const [locatedCoords, setLocatedCoords] = useState(null);
  const [legalView, setLegalView] = useState(null);
  const loadLiveData = async () => {
    const results = await Promise.allSettled([api.get('/alerts'), api.get('/shelters')]);
    const [alerts, shelters] = results;
    if (alerts.status === 'fulfilled') setDisasters((alerts.value.data.alerts || []).map(alert => ({
      id: alert.id, type: alert.hazardType === 'FIRE' ? 'wildfire' : alert.hazardType.toLowerCase(),
      title: alert.hazardType + ' ' + alert.severity, lat: alert.lat, lng: alert.lng,
      location: alert.region, severity: alert.severity === 'CRITICAL' ? 'high' : 'warning',
      timestamp: new Date(alert.createdAt).toLocaleString(), description: alert.message,
      radius: alert.radiusKm * 1000, recommendedAction: alert.message
    })));
    if (shelters.status === 'fulfilled') setResources((shelters.value.data.shelters || []).map(shelter => ({
      ...shelter, type: 'resource', category: 'shelter', location: shelter.address,
      status: shelter.status, services: [shelter.waterLitersRemaining == null ? 'Water quantity unaudited' : shelter.waterOk ? 'Reported water available' : 'Water shortage', shelter.rationsUnitsRemaining == null ? 'Rations quantity unaudited' : shelter.rationsOk ? 'Reported rations available' : 'Rations shortage'].join(', ')
    })));
    setFeedError(results.some(result => result.status === 'rejected') ? 'Some live data is unavailable. Retry before relying on the map.' : '');
    setFeedLoading(false);
  };
  useEffect(() => {
    loadLiveData();
    const timer = setInterval(loadLiveData, 30000);
    const events = ['alert:new', 'alert:deactivated', 'alert:deleted', 'shelter:audit_updated', 'shelter:occupancy_changed'];
    events.forEach(event => socket?.on(event, loadLiveData));
    return () => { clearInterval(timer); events.forEach(event => socket?.off(event, loadLiveData)); };
  }, [socket]);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeLayer, setActiveLayer] = useState('street'); // street, topo, sat
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [toasts, setToasts] = useState([]);

  // Form State
  const [subRegion, setSubRegion] = useState('');
  const [subPhone, setSubPhone] = useState('');
  const [subChannels, setSubChannels] = useState({ sms: true, push: false });
  const [subNote, setSubNote] = useState('');
  const [subLoading, setSubLoading] = useState(false);

  // Map references
  const heroMapContainerRef = useRef(null);
  const heroMapRef = useRef(null);
  const mainMapContainerRef = useRef(null);
  const mainMapRef = useRef(null);
  const viewportRef = useRef({ center: [22.5, 82.0], zoom: 5 });
  const baseLayerRef = useRef('street');
  const mainLayersRef = useRef({});
  const mapItemsRef = useRef([]);
  const userLocMarkerRef = useRef(null);
  const userLocCircleRef = useRef(null);

  // Toast helper
  const showToast = (message, icon = 'ℹ️') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, icon }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  };

  // Sticky nav scroll handler
  useEffect(() => {
    const handleScroll = () => {
      const siteNav = document.getElementById('siteNav');
      if (siteNav) {
        siteNav.classList.toggle('scrolled', window.scrollY > 12);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Initialize Hero Map
  useEffect(() => {
    if (!heroMapContainerRef.current) return;
    if (heroMapRef.current) {
      heroMapRef.current.remove();
      heroMapRef.current = null;
    }

    const hMap = L.map(heroMapContainerRef.current, {
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: false,
      dragging: true
    }).setView([30.22, 78.35], 8);

    L.tileLayer(streetTileUrl, streetTileOptions).addTo(hMap);

    DISASTERS.forEach(d => {
      const color = d.severity === 'high' ? SEV_COLOR.high : SEV_COLOR.warning;
      L.circle([d.lat, d.lng], { radius: d.radius, color, fillOpacity: 0.15 }).addTo(hMap);
      L.marker([d.lat, d.lng], { icon: createCustomMarker(TYPE_EMOJI[d.type] || '⚠️', color) }).addTo(hMap).bindPopup(escapeHTML(d.title));
    });
    RESOURCES.forEach(r => L.marker([r.lat, r.lng], { icon: createCustomMarker('🏠', SEV_COLOR.resource) }).addTo(hMap).bindPopup(escapeHTML(r.name)));
    heroMapRef.current = hMap;

    return () => {
      if (heroMapRef.current) {
        heroMapRef.current.remove();
        heroMapRef.current = null;
      }
    };
  }, [DISASTERS, RESOURCES]);

  // Initialize Main Map
  useEffect(() => {
    if (!mainMapContainerRef.current) return;
    if (mainMapRef.current) {
      mainMapRef.current.remove();
      mainMapRef.current = null;
    }

    const mMap = L.map(mainMapContainerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
      smoothWheelZoom: true,
      wheelDebounceTime: 40
    }).setView(viewportRef.current.center, viewportRef.current.zoom);

    const sLayer = L.tileLayer(streetTileUrl, streetTileOptions);
    const tLayer = L.tileLayer(topoTileUrl, topoTileOptions);
    const satLayer = L.tileLayer(satTileUrl, satTileOptions);

    ({ street: sLayer, topo: tLayer, sat: satLayer }[baseLayerRef.current] || sLayer).addTo(mMap);
    mainLayersRef.current = { street: sLayer, topo: tLayer, sat: satLayer };

    mMap.on('click', () => {
      mMap.scrollWheelZoom.enable();
    });
    if (mMap.getContainer()) {
      mMap.getContainer().addEventListener('mouseleave', () => {
        mMap.scrollWheelZoom.disable();
      });
    }

    const items = [];

    // Disaster Markers & Circles
    DISASTERS.forEach(d => {
      const isCritical = d.severity === 'high';
      const color = isCritical ? SEV_COLOR.high : SEV_COLOR.warning;
      const emoji = TYPE_EMOJI[d.type] || '⚠️';

      const circle = L.circle([d.lat, d.lng], {
        radius: d.radius,
        color: color,
        fillColor: color,
        fillOpacity: isCritical ? 0.18 : 0.14,
        weight: 1.5,
        dashArray: isCritical ? '6, 6' : null
      }).addTo(mMap);

      circle.bindTooltip(`Hazard Radius: ${(d.radius / 1000).toFixed(0)} km around ${escapeHTML(d.location)}`, {
        sticky: true
      });

      const marker = L.marker([d.lat, d.lng], {
        icon: createCustomMarker(emoji, color, isCritical)
      }).addTo(mMap);

      marker.bindPopup(`
        <div class="ds-popup">
          <div class="popup-header ${d.severity}">
            <div class="popup-type">${emoji} ${d.type.toUpperCase()} HAZARD</div>
            <span class="popup-badge">${d.severity === 'high' ? 'CRITICAL' : 'WARNING'}</span>
          </div>
          <div class="popup-body">
            <h4>${escapeHTML(d.title)}</h4>
            <div class="ploc">📍 ${escapeHTML(d.location)}</div>
            <div class="pdesc">${escapeHTML(d.description)}</div>
            <div class="pact">
              <strong>Recommended Action:</strong><br>${escapeHTML(d.recommendedAction)}
            </div>
            <div style="display:flex;gap:8px;margin-top:10px;">
              <a href="https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lng}" target="_blank" rel="noopener" class="popup-btn" style="background:#0B1F3D;">
                Open in Google Maps ↗
              </a>
              <a href="#alerts" class="popup-btn">
                Get SMS Alerts
              </a>
            </div>
          </div>
        </div>
      `, { maxWidth: 320 });

      items.push({
        id: d.id,
        type: d.type,
        marker,
        circle,
        data: d,
        isResource: false
      });
    });

    // Resource Markers
    RESOURCES.forEach(r => {
      const marker = L.marker([r.lat, r.lng], {
        icon: createCustomMarker(TYPE_EMOJI[r.category] || '🏥', SEV_COLOR.resource)
      }).addTo(mMap);

      marker.bindPopup(`
        <div class="ds-popup">
          <div class="popup-header resource">
            <div class="popup-type">🏥 RELIEF RESOURCE</div>
            <span class="popup-badge">ACTIVE</span>
          </div>
          <div class="popup-body">
            <h4>${escapeHTML(r.name)}</h4>
            <div class="ploc">📍 ${escapeHTML(r.location)}</div>
            <div class="pdesc"><strong>Status:</strong> ${escapeHTML(r.status)}<br><strong>Services:</strong> ${escapeHTML(r.services)}</div>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}" target="_blank" rel="noopener" class="popup-btn">
              Navigate with GPS Directions →
            </a>
          </div>
        </div>
      `, { maxWidth: 320 });

      items.push({
        id: 'res_' + r.id,
        type: 'resource',
        marker,
        circle: null,
        data: r,
        isResource: true
      });
    });

    mapItemsRef.current = items;
    mainMapRef.current = mMap;

    const t1 = setTimeout(() => {
      mMap.invalidateSize();
      if (heroMapRef.current) heroMapRef.current.invalidateSize();
    }, 300);

    return () => {
      clearTimeout(t1);
      if (mainMapRef.current) {
        viewportRef.current = { center: mainMapRef.current.getCenter(), zoom: mainMapRef.current.getZoom() };
        userLocMarkerRef.current = null; userLocCircleRef.current = null;
        mainMapRef.current.remove();
        mainMapRef.current = null;
      }
    };
  }, [DISASTERS, RESOURCES]);

  // Update map layer on activeLayer state change
  const handleSwitchLayer = (layerName) => {
    setActiveLayer(layerName);
    baseLayerRef.current = layerName;
    const mMap = mainMapRef.current;
    if (!mMap || !mainLayersRef.current) return;
    const { street, topo, sat } = mainLayersRef.current;
    [street, topo, sat].forEach(l => {
      if (l && mMap.hasLayer(l)) mMap.removeLayer(l);
    });
    if (layerName === 'street' && street) street.addTo(mMap);
    if (layerName === 'topo' && topo) topo.addTo(mMap);
    if (layerName === 'sat' && sat) sat.addTo(mMap);

    const labels = {
      street: 'Switched to Street & Humanitarian Map',
      topo: 'Switched to Topographic Relief Map',
      sat: 'Switched to Satellite Imagery'
    };
    showToast(labels[layerName] || 'Map layer changed', '🗺️');
  };

  // Filter markers on activeFilter change
  useEffect(() => {
    const mMap = mainMapRef.current;
    if (!mMap || !mapItemsRef.current.length) return;

    mapItemsRef.current.forEach(item => {
      const shouldShow = activeFilter === 'all'
        ? true
        : (activeFilter === 'resource' ? item.isResource : item.type === activeFilter);

      if (shouldShow) {
        if (!mMap.hasLayer(item.marker)) item.marker.addTo(mMap);
        if (item.circle && !mMap.hasLayer(item.circle)) item.circle.addTo(mMap);
      } else {
        if (mMap.hasLayer(item.marker)) mMap.removeLayer(item.marker);
        if (item.circle && mMap.hasLayer(item.circle)) mMap.removeLayer(item.circle);
      }
    });
  }, [activeFilter, DISASTERS, RESOURCES]);

  // Click on alert in sidebar
  const handleAlertClick = (d) => {
    setSelectedAlertId(d.id);
    const mMap = mainMapRef.current;
    if (!mMap) return;

    const item = mapItemsRef.current.find(i => i.id === d.id);
    if (item && !mMap.hasLayer(item.marker)) {
      item.marker.addTo(mMap);
      if (item.circle) item.circle.addTo(mMap);
    }

    mMap.flyTo([d.lat, d.lng], 8, {
      duration: 1.1,
      easeLinearity: 0.25
    });

    setTimeout(() => {
      if (item && item.marker) {
        item.marker.openPopup();
      }
    }, 750);
  };

  // Map controls
  const handleFitAll = () => {
    const mMap = mainMapRef.current;
    if (!mMap) return;
    const visibleMarkers = mapItemsRef.current
      .filter(i => mMap.hasLayer(i.marker))
      .map(i => i.marker);

    if (visibleMarkers.length > 0) {
      const group = L.featureGroup(visibleMarkers);
      mMap.fitBounds(group.getBounds().pad(0.18), { duration: 0.9 });
    } else {
      mMap.setView([22.5, 82.0], 5);
    }
    showToast('Fitted all active disaster pins on screen', '🔍');
  };

  const handleResetView = () => {
    const mMap = mainMapRef.current;
    if (!mMap) return;
    mMap.flyTo([22.5, 82.0], 5, { duration: 1.0 });
    showToast('Reset map to all-India overview', '⟲');
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser', '⚠️');
      return;
    }
    showToast('Locating your GPS position...', '📍');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLocatedCoords({ lat, lng });
        const mMap = mainMapRef.current;
        if (!mMap) return;

        if (userLocMarkerRef.current) mMap.removeLayer(userLocMarkerRef.current);
        if (userLocCircleRef.current) mMap.removeLayer(userLocCircleRef.current);

        userLocCircleRef.current = L.circle([lat, lng], {
          radius: pos.coords.accuracy || 1000,
          color: '#1E5FE0',
          fillColor: '#1E5FE0',
          fillOpacity: 0.15,
          weight: 1
        }).addTo(mMap);

        userLocMarkerRef.current = L.marker([lat, lng], {
          icon: createCustomMarker('👤', '#1E5FE0', true)
        }).addTo(mMap).bindPopup(`
          <div style="font-family:'Inter',sans-serif;padding:8px 6px;">
            <strong style="color:#1E5FE0;">You Are Here</strong><br>
            <span style="font-size:12px;color:#4B5A70;">GPS Accuracy: ±${Math.round(pos.coords.accuracy || 50)}m</span>
          </div>
        `).openPopup();

        mMap.flyTo([lat, lng], 9, { duration: 1.2 });
        showToast('Position acquired!', '✅');
      },
      () => {
        showToast('Unable to acquire location (permission denied or timeout)', '⚠️');
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  // Handle direct alert subscription form submit
  const handleSubscribeSubmit = async (e) => {
    e.preventDefault();
    if (!subChannels.sms && !subChannels.push) { setSubNote('Select at least one delivery channel'); return; }
    setSubLoading(true); setSubNote('');
    const operations = [];
    if (subChannels.sms) operations.push({ name: 'SMS', run: () => api.post('/registry/phone', { phoneNumber: subPhone.trim(), region: subRegion || null }) });
    if (subChannels.push) operations.push({ name: 'Browser push', run: () => subscribePush(subRegion || null) });
    const notes = [];
    for (const operation of operations) {
      try { await operation.run(); notes.push(operation.name + ' registration saved.'); }
      catch (error) { notes.push(operation.name + ': ' + (error.response?.data?.error || error.message)); }
    }
    setSubNote(notes.join(' ')); setSubLoading(false);
  };

  // Filtered lists for sidebar
  const filteredDisasters = activeFilter === 'all'
    ? DISASTERS
    : DISASTERS.filter(d => activeFilter === 'resource' ? false : d.type === activeFilter);

  const activeMarkerCount = activeFilter === 'all'
    ? (DISASTERS.length + RESOURCES.length)
    : (activeFilter === 'resource' ? RESOURCES.length : DISASTERS.filter(d => d.type === activeFilter).length);

  return (
    <div className="landing-page-root">
      {(feedLoading || feedError) && <div role="status" style={{ padding: 12, background: '#fff3cd' }}>{feedLoading ? 'Loading current alerts and shelters…' : feedError} {feedError && <button type="button" onClick={loadLiveData}>Retry live feed</button>}</div>}
      {/* NAVBAR */}
      <header className="nav" id="siteNav">
        <div className="nav-inner">
          <a href="#home" className="brand">
            <svg className="brand-mark" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M24 3L41 10V22C41 33.5 34 41.8 24 45C14 41.8 7 33.5 7 22V10L24 3Z" fill="#1E5FE0"/>
              <path d="M24 8L36 13V22.5C36 31 30.5 37.2 24 39.7C17.5 37.2 12 31 12 22.5V13L24 8Z" fill="#0B1F3D" fillOpacity="0.18"/>
              <path d="M17.5 24.5L21.7 28.7L30.5 19.5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="brand-text">
              <span className="brand-name">DisasterShield</span>
              <span className="brand-tag">Prepare · Respond · Rebuild</span>
            </span>
          </a>

          <nav aria-label="Primary">
            <ul className="nav-links">
              <li><a href="#home" className="active">Home</a></li>
              <li><a href="#livemap">Live Map</a></li>
              <li><a href="#alerts">Alerts</a></li>
              <li><a href="#resources">Resources</a></li>
              <li><a href="#about">About</a></li>
              <li><a href="#faq">FAQ</a></li>
            </ul>
          </nav>

          <div className="nav-right">
            <button type="button" className="btn btn-ghost" onClick={onNavigateToPublicAlerts}>Alert settings</button>

            {/* Notification Bell */}
            <button
              type="button"
              className="icon-btn"
              id="notifBellBtn"
              aria-label="Notifications"
              title="Emergency Alerts"
              onClick={() => { document.getElementById('livemap')?.scrollIntoView({ behavior: 'smooth' }); showToast(DISASTERS.filter(d => d.severity === 'high').length + ' critical alerts in the current feed', '🚨'); }}
            >
              🔔<span className="dot"></span>
            </button>

            {/* Nav Auth Buttons: SIGN IN & SIGN UP */}
            <div className="nav-auth flex items-center gap-2">
              <button
                type="button"
                id="nav-signin-btn"
                onClick={onNavigateToLogin}
                className="btn btn-ghost font-semibold"
                title="Sign in to your account"
              >
                {user ? 'Open Console' : 'Sign In'}
              </button>
              <button
                type="button"
                id="nav-signup-btn"
                onClick={onNavigateToRegister}
                className="btn btn-primary font-bold shadow-xs"
                title="Create a new citizen or responder account"
              >
                {user ? 'My Dashboard' : 'Sign Up'}
              </button>
            </div>

            {/* Hamburger Button for Mobile */}
            <button
              type="button"
              className="hamburger"
              id="hamburgerBtn"
              aria-label="Open menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        <div id="mobileMenu" className={mobileMenuOpen ? 'open' : ''}>
          <a href="#home" onClick={() => setMobileMenuOpen(false)}>Home</a>
          <a href="#livemap" onClick={() => setMobileMenuOpen(false)}>Live Map</a>
          <a href="#alerts" onClick={() => setMobileMenuOpen(false)}>Alerts</a>
          <a href="#resources" onClick={() => setMobileMenuOpen(false)}>Resources</a>
          <a href="#about" onClick={() => setMobileMenuOpen(false)}>About</a>
          <a href="#faq" onClick={() => setMobileMenuOpen(false)}>FAQ</a>

          <div className="mm-auth flex flex-col gap-2 pt-2">
            <button
              type="button"
              id="mm-signin-btn"
              onClick={() => { setMobileMenuOpen(false); onNavigateToLogin(); }}
              className="btn btn-ghost w-full justify-center font-bold"
            >
              Sign In
            </button>
            <button
              type="button"
              id="mm-signup-btn"
              onClick={() => { setMobileMenuOpen(false); onNavigateToRegister(); }}
              className="btn btn-primary w-full justify-center font-bold"
            >
              Sign Up (Register)
            </button>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="hero" id="home">
        <div className="hero-inner">
          <div>
            <div className="hero-label">REAL-TIME DISASTER MANAGEMENT &amp; RESPONSE</div>
            <h1>
              Real-Time Information.<br />
              Faster Response.<br />
              <span className="accent">Safer Communities.</span>
            </h1>
            <p>
              Get real-time alerts, track active disasters, explore live hazard zones, and access nearby emergency resources across India — all in one unified, responsive platform.
            </p>

            <div className="hero-ctas flex flex-wrap items-center gap-3">
              <a href="#livemap" className="btn btn-primary">Explore Live Map →</a>
              <a href="#alerts" className="btn btn-outline" id="watchDemoBtn">🔔 Subscribe to Alerts</a>
              <button
                type="button"
                id="hero-signin-action"
                onClick={onNavigateToLogin}
                className="btn btn-ghost font-bold text-xs"
                title="Responder and Citizen Console Login"
              >
                🔐 Sign In / Login →
              </button>
              <button
                type="button"
                id="hero-signup-action"
                onClick={onNavigateToRegister}
                className="btn btn-ghost font-bold text-xs"
                title="Create Account"
              >
                ✨ Sign Up
              </button>
            </div>
          </div>

          <div className="hero-map-card">
            <div
              id="heroMap"
              ref={heroMapContainerRef}
              role="region"
              aria-label="Preview map of Uttarakhand disaster hotspots and relief facilities"
            ></div>
            <div className="map-legend">
              <div className="lg-row"><span className="lg-dot" style={{ background: 'var(--red)' }}></span>Critical Alert</div>
              <div className="lg-row"><span className="lg-dot" style={{ background: 'var(--orange)' }}></span>Warning Zone</div>

              <div className="lg-row"><span className="lg-dot" style={{ background: 'var(--blue)' }}></span>Relief Depot</div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section className="section-pad features" id="features">
        <div className="wrap">
          <div className="feat-head">
            <div>
              <div className="eyebrow">Key Capabilities</div>
              <h2 className="h2" style={{ marginBottom: '6px', maxWidth: '540px' }}>Unified disaster mitigation and emergency coordination</h2>
              <p className="lede">Coordinate published alerts, community incident reports, rescue progress and shelter inventory.</p>
            </div>
            <a href="#livemap" className="btn btn-primary">View Hazard Dashboard →</a>
          </div>
          <div className="feat-grid">
            <div className="feat-card reveal in">
              <div className="feat-icon" style={{ background: 'var(--red-tint)', color: 'var(--red)' }}>⚠️</div>
              <h3>Live Hazard Alerts</h3>
              <p>Instant push and SMS warnings for floods, landslides, cyclones, and seismic activity.</p>
              <a href="#alerts" className="feat-arrow">Explore alerts →</a>
            </div>
            <div className="feat-card reveal in">
              <div className="feat-icon" style={{ background: 'var(--blue-tint)', color: 'var(--blue)' }}>🗺️</div>
              <h3>Interactive GIS Mapping</h3>
              <p>High-resolution satellite imagery, topographic overlays, and dynamic impact buffers.</p>
              <a href="#livemap" className="feat-arrow">Open GIS layers →</a>
            </div>
            <div className="feat-card reveal in">
              <div className="feat-icon" style={{ background: 'var(--green-tint)', color: 'var(--green)' }}>📍</div>
              <h3>Resource Allocation</h3>
              <p>Locate registered shelters and inspect reported relief supply availability.</p>
              <a href="#resources" className="feat-arrow">Find resources →</a>
            </div>
            <div className="feat-card reveal in">
              <div className="feat-icon" style={{ background: 'var(--purple-tint)', color: 'var(--purple)' }}>🌧️</div>
              <h3>Predictive Early Warning</h3>
              <p>Operators can assess weather readings using threshold rules. Demo simulations are not live predictions.</p>
              <a href="#livemap" className="feat-arrow">View analytics →</a>
            </div>
            <div className="feat-card reveal in">
              <div className="feat-icon" style={{ background: 'var(--orange-tint)', color: 'var(--orange)' }}>👥</div>
              <h3>Responder Coordination</h3>
              <p>Role-based consoles connect administrators, approved volunteers and citizens.</p>
              <button type="button" onClick={onNavigateToLogin} className="feat-arrow" style={{ background: 'none', border: 'none', padding: 0 }}>Field response login →</button>
            </div>
            <div className="feat-card reveal in">
              <div className="feat-icon" style={{ background: 'var(--teal-tint)', color: 'var(--teal)' }}>📊</div>
              <h3>Disaster Telemetry &amp; Stats</h3>
              <p>Real-time situation reports and post-disaster assessment feeds for rapid rehabilitation.</p>
              <a href="#about" className="feat-arrow">Incident reports →</a>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE DISASTER MAP SECTION */}
      <section className="section-pad live-map-section" id="livemap">
        <div className="wrap">
          <div className="lm-head">
            <div className="eyebrow">Real-Time GIS Operations</div>
            <h2 className="h2">Interactive Disaster &amp; Hazard Radar</h2>
            <p className="lede">Track active emergencies, hazard radiuses, and live relief facilities across India with instant satellite and terrain switching.</p>
          </div>

          <div className="lm-layout">
            {/* FILTER PANEL */}
            <div className="lm-panel" id="filterPanel">
              <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--navy)', fontWeight: 700 }}>Filter Incidents</h4>
              <button
                type="button"
                className={`cat-btn ${activeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setActiveFilter('all')}
              >
                <span className="cn">🧭 All Categories</span>
                <span className="cat-count" id="count-all">{DISASTERS.length + RESOURCES.length}</span>
              </button>
              <button
                type="button"
                className={`cat-btn ${activeFilter === 'flood' ? 'active' : ''}`}
                onClick={() => setActiveFilter('flood')}
              >
                <span className="cn">🌊 Floods</span>
                <span className="cat-count" id="count-flood">{DISASTERS.filter(d => d.type === 'flood').length}</span>
              </button>
              <button
                type="button"
                className={`cat-btn ${activeFilter === 'landslide' ? 'active' : ''}`}
                onClick={() => setActiveFilter('landslide')}
              >
                <span className="cn">⛰️ Landslides</span>
                <span className="cat-count" id="count-landslide">{DISASTERS.filter(d => d.type === 'landslide').length}</span>
              </button>
              <button
                type="button"
                className={`cat-btn ${activeFilter === 'cyclone' ? 'active' : ''}`}
                onClick={() => setActiveFilter('cyclone')}
              >
                <span className="cn">🌀 Cyclones</span>
                <span className="cat-count" id="count-cyclone">{DISASTERS.filter(d => d.type === 'cyclone').length}</span>
              </button>
              <button
                type="button"
                className={`cat-btn ${activeFilter === 'earthquake' ? 'active' : ''}`}
                onClick={() => setActiveFilter('earthquake')}
              >
                <span className="cn">📈 Earthquakes</span>
                <span className="cat-count" id="count-earthquake">{DISASTERS.filter(d => d.type === 'earthquake').length}</span>
              </button>
              <button
                type="button"
                className={`cat-btn ${activeFilter === 'wildfire' ? 'active' : ''}`}
                onClick={() => setActiveFilter('wildfire')}
              >
                <span className="cn">🔥 Wildfires</span>
                <span className="cat-count" id="count-wildfire">{DISASTERS.filter(d => d.type === 'wildfire').length}</span>
              </button>
              <button
                type="button"
                className={`cat-btn ${activeFilter === 'resource' ? 'active' : ''}`}
                onClick={() => setActiveFilter('resource')}
              >
                <span className="cn">🏥 Relief Hubs</span>
                <span className="cat-count" id="count-resource">{RESOURCES.length}</span>
              </button>

              <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  id="resetViewBtn"
                  onClick={handleResetView}
                  style={{ width: '100%', justifyContent: 'center', fontSize: '13px' }}
                >
                  ⟲ Center India View
                </button>
              </div>
            </div>

            {/* MAIN MAP CARD */}
            <div id="mainMapCard">
              <div className="map-card-header">
                <div className="map-layers">
                  <button
                    type="button"
                    id="toggleStreet"
                    className={activeLayer === 'street' ? 'active' : ''}
                    onClick={() => handleSwitchLayer('street')}
                    title="High-Contrast Humanitarian &amp; Road Map"
                  >
                    🗺️ Street
                  </button>
                  <button
                    type="button"
                    id="toggleTopo"
                    className={activeLayer === 'topo' ? 'active' : ''}
                    onClick={() => handleSwitchLayer('topo')}
                    title="Topographic Elevation &amp; Relief Shading"
                  >
                    ⛰️ Topo Relief
                  </button>
                  <button
                    type="button"
                    id="toggleSat"
                    className={activeLayer === 'sat' ? 'active' : ''}
                    onClick={() => handleSwitchLayer('sat')}
                    title="High-Res Satellite Photography"
                  >
                    🛰️ Satellite
                  </button>
                </div>
                <div className="map-actions">
                  <button
                    type="button"
                    className="map-action-btn"
                    id="locateMeBtn"
                    onClick={handleLocateMe}
                    title="Zoom to your current GPS position"
                  >
                    📍 My Location
                  </button>
                  <button
                    type="button"
                    className="map-action-btn"
                    id="fitBoundsBtn"
                    onClick={handleFitAll}
                    title="Fit all active incident markers"
                  >
                    🔍 Fit All
                  </button>
                </div>
              </div>

              {/* LEAFLET MAP CANVAS */}
              <div className="map-canvas-wrap">
                <div
                  id="mainMap"
                  ref={mainMapContainerRef}
                  role="region"
                  aria-label="Interactive nationwide disaster map"
                ></div>

                {/* LIVE STATUS PILL */}
                <div className="map-status-pill">
                  <span className="live-indicator"></span>
                  <span id="mapStatusText">
                    {activeMarkerCount} Current Markers • {feedError ? 'Feed unavailable' : socket?.connected ? 'Connected' : 'Updates every 30s'}
                  </span>
                </div>
              </div>
            </div>

            {/* LATEST ALERTS SIDEBAR */}
            <div className="lm-panel" id="alertsPanel">
              <div className="alerts-head">
                <h3>Active Advisories</h3>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--blue)' }} id="activeAlertCount">
                  {filteredDisasters.length} Incident{filteredDisasters.length === 1 ? '' : 's'}
                </span>
              </div>
              <div id="alertsList">
                {filteredDisasters.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '13.5px' }}>
                    No active incidents reported for this category.
                  </div>
                ) : (
                  filteredDisasters.map(d => {
                    const isCritical = d.severity === 'high';
                    const color = isCritical ? SEV_COLOR.high : SEV_COLOR.warning;
                    const emoji = TYPE_EMOJI[d.type] || '⚠️';
                    const isSelected = selectedAlertId === d.id;

                    return (
                      <div
                        key={d.id}
                        className={`alert-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleAlertClick(d)}
                      >
                        <div className="alert-dot" style={{ background: `${color}18`, color: color }}>
                          {emoji}
                        </div>
                        <div className="alert-body">
                          <strong>{d.title}</strong>
                          <span>{d.location} · {d.timestamp}</span>
                          <span className={`sev-tag ${isCritical ? 'sev-critical' : 'sev-warning'}`}>
                            {isCritical ? 'Critical Warning' : 'Advisory'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ALERT SUBSCRIPTION */}
      <section className="section-pad subscribe" id="alerts">
        <div className="wrap sub-inner">
          <div>
            <div className="eyebrow">Direct Citizen Alerts</div>
            <h2 className="h2" style={{ maxWidth: '480px' }}>Receive early warnings straight to your phone</h2>
            <p className="lede">Select your district to receive critical weather advisories, flood warnings, and evacuation routes via SMS and push notifications.</p>
            <div className="sub-offline">📶 <strong>Low Connectivity Protocol:</strong> SMS requires cellular service and a configured delivery provider.</div>
          </div>
          <form className="sub-form" id="subscribeForm" onSubmit={handleSubscribeSubmit}>
            <label className="sub-field">
              <span>Target District / Region</span>
              <select
                required
                id="subRegion"
                value={subRegion}
                onChange={(e) => setSubRegion(e.target.value)}
              >
                <option value="">Select your district</option>
                <option>Dehradun &amp; Rishikesh, Uttarakhand</option>
                <option>Guwahati &amp; Brahmaputra Valley, Assam</option>
                <option>Shimla &amp; Kullu, Himachal Pradesh</option>
                <option>Coastal Odisha &amp; Andhra Pradesh</option>
                <option>Chennai &amp; Coastal Tamil Nadu</option>
                <option>Delhi NCR &amp; Northern Plains</option>
                <option>Mumbai &amp; Konkan Coast</option>
              </select>
            </label>
            <label className="sub-field">
              <span>Mobile Number (for SMS &amp; Flash Broadcast)</span>
              <input
                type="tel"
                id="subPhone"
                placeholder="+91 98765 43210"
                value={subPhone}
                onChange={(e) => setSubPhone(e.target.value)}
                required={subChannels.sms}
              />
            </label>
            <div className="sub-channels">
              <label className="sub-check">
                <input
                  type="checkbox"
                  checked={subChannels.sms}
                  onChange={(e) => setSubChannels({ ...subChannels, sms: e.target.checked })}
                /> Instant SMS
              </label>
              <label className="sub-check">
                <input
                  type="checkbox"
                  checked={subChannels.push}
                  onChange={(e) => setSubChannels({ ...subChannels, push: e.target.checked })}
                /> Mobile Push
              </label>

            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={subLoading}
              style={{ justifyContent: 'center', fontSize: '15px' }}
            >
              {subLoading ? 'Subscribing...' : 'Subscribe to Emergency Feeds →'}
            </button>
            {subNote && <p className="sub-note" id="subNote" role="status" style={{ color: '#0B1F3D', fontWeight: 600 }}>{subNote}</p>}
          </form>
        </div>
      </section>

      {/* EMERGENCY STRIP */}
      <section className="emergency">
        <div className="wrap em-inner">
          <div>
            <h3>Facing an immediate emergency?</h3>
            <p>Direct lines to verified national disaster helplines and quick response stations.</p>
            <div className="em-numbers">
              <a href="tel:112" className="em-num"><span className="em-num-val">112</span><span className="em-num-label">National Emergency</span></a>
              <a href="tel:1078" className="em-num"><span className="em-num-val">1078</span><span className="em-num-label">NDMA Disaster Line</span></a>
              <a href="tel:108" className="em-num"><span className="em-num-val">108</span><span className="em-num-label">Medical Ambulance</span></a>
            </div>
          </div>
          <div className="em-btns">
            <a href="#resources" className="btn btn-red">🚨 Locate Nearby Shelter</a>
            <button
              type="button"
              className="btn btn-ghost"
              id="reportIncidentBtn"
              onClick={() => {
                showToast('Emergency reporting portal initiated. Dial 112 for urgent rescue.', '📝');
                onNavigateToLogin();
              }}
            >
              📝 Report Field Incident
            </button>
            <a href="tel:112" className="btn btn-ghost">📞 Speed Dial 112</a>
          </div>
        </div>
      </section>

      {/* RESOURCES */}
      <section className="section-pad resources" id="resources">
        <div className="wrap">
          <div className="eyebrow">Reported Shelter Facilities</div>
          <h2 className="h2" style={{ maxWidth: '560px' }}>Emergency Shelters &amp; Relief Supplies</h2>
          <p className="lede" style={{ marginBottom: '30px' }}>Reported bed availability, supply inventory, and directions to registered shelters.</p>
          <button type="button" className="btn btn-ghost" onClick={handleLocateMe}>Sort shelters near my location</button>
          <div className="res-grid" id="resourceCardsGrid">
            {RESOURCES.length === 0 && <p>{feedLoading ? 'Loading shelters…' : feedError ? 'Shelter data is unavailable.' : 'No active shelters reported.'}</p>}
            {[...RESOURCES].sort((a, b) => locatedCoords ? calculateDistanceKm(locatedCoords.lat, locatedCoords.lng, a.lat, a.lng) - calculateDistanceKm(locatedCoords.lat, locatedCoords.lng, b.lat, b.lng) : 0).map(resource => <div className="res-card" key={resource.id}>
              <div><div className="rtitle">🏠 {resource.name}</div><div className="rloc">{resource.address}{locatedCoords && ' · ' + calculateDistanceKm(locatedCoords.lat, locatedCoords.lng, resource.lat, resource.lng).toFixed(1) + ' km away'}</div>
                <div className="res-meta"><span>{Math.max(0, resource.capacity - resource.currentOccupancy)} / {resource.capacity} beds available</span><span className="res-status" style={{ color: resource.status === 'RED' ? '#B23A2E' : resource.status === 'YELLOW' ? '#C97A2B' : '#17924E' }}>{resource.status}</span></div>
                <p>{resource.services}</p>
              </div>
              <a href={'https://www.google.com/maps/dir/?api=1&destination=' + resource.lat + ',' + resource.lng} target="_blank" rel="noopener noreferrer" className="btn btn-ghost direct-btn">Get Directions →</a>
            </div>)}
          </div>
        </div>
      </section>

      {/* IMPACT */}
      <section className="section-pad impact" id="about">
        <div className="wrap impact-inner">
          <div>
            <div className="eyebrow" style={{ color: '#9DC1FF' }}>Current Response Data</div>
            <h2 className="h2">Stronger communities.<br />Faster emergency recovery.</h2>
            <p>View published alerts and shelter reports from this deployment. Availability depends on the latest reports from its operators.</p>
          </div>
          <div className="stat-grid">
            <div className="stat-card reveal in"><div className="stat-icon">👥</div><div className="stat-num">{DISASTERS.length}</div><div className="stat-label">Active Alerts</div></div>
            <div className="stat-card reveal in"><div className="stat-icon">⚠️</div><div className="stat-num">{DISASTERS.filter(a => a.severity === 'high').length}</div><div className="stat-label">Critical Alerts</div></div>
            <div className="stat-card reveal in"><div className="stat-icon">🏠</div><div className="stat-num">{RESOURCES.length}</div><div className="stat-label">Active Shelters</div></div>
            <div className="stat-card reveal in"><div className="stat-icon">🛡️</div><div className="stat-num">{RESOURCES.reduce((sum, r) => sum + Math.max(0, r.capacity - r.currentOccupancy), 0)}</div><div className="stat-label">Reported Free Beds</div></div>
          </div>
        </div>
      </section>

      {/* ABOUT / TEAM */}
      <section className="section-pad about-team">
        <div className="wrap">
          <div className="eyebrow">Response Coordination</div>
          <h2 className="h2" style={{ maxWidth: '560px' }}>Tools for citizens, volunteers and control rooms</h2>
          <p className="lede" style={{ marginBottom: '34px' }}>This prototype combines operator-published alerts, community reports and shelter inventory. Official agency and satellite feeds are not integrated.</p>
          <div className="team-grid">
            <div className="team-card reveal in">
              <div className="team-avatar">DS</div>
              <h4>Disaster Mitigation Wing</h4>
              <p>Control-room users review distress calls and publish response alerts.</p>
            </div>
            <div className="team-card reveal in">
              <div className="team-avatar">GD</div>
              <h4>GIS &amp; Remote Sensing</h4>
              <p>Displays reported hazard areas and shelter locations on selectable map layers.</p>
            </div>
            <div className="team-card reveal in">
              <div className="team-avatar">CO</div>
              <h4>First Responder Network</h4>
              <p>Approved volunteers update rescue progress and shelter supplies.</p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section-pad howworks">
        <div className="wrap">
          <div className="eyebrow">Operational Sequence</div>
          <h2 className="h2">Stay protected in 4 simple steps</h2>
          <div className="hw-grid">
            <div className="hw-step reveal in">
              <div className="hw-num">1</div>
              <h4>Receive Alert</h4>
              <p>Receive published map alerts; SMS and push require configured delivery.</p>
              <span className="hw-arrow">→</span>
            </div>
            <div className="hw-step reveal in">
              <div className="hw-num">2</div>
              <h4>Inspect Map</h4>
              <p>View published hazard areas and reported shelters.</p>
              <span className="hw-arrow">→</span>
            </div>
            <div className="hw-step reveal in">
              <div className="hw-num">3</div>
              <h4>Locate Resources</h4>
              <p>Navigate to nearest open shelter or medical station.</p>
              <span className="hw-arrow">→</span>
            </div>
            <div className="hw-step reveal in">
              <div className="hw-num">4</div>
              <h4>Stay Secure</h4>
              <p>Follow automated safety updates until the hazard passes.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-pad faq" id="faq">
        <div className="wrap">
          <div className="eyebrow">Clarifications</div>
          <h2 className="h2" style={{ maxWidth: '480px' }}>Frequently Asked Questions</h2>
          <div className="faq-list">
            <details className="faq-item" open>
              <summary>How frequently are map hazard markers updated?<span className="faq-chev">＋</span></summary>
              <p>The page refreshes published alerts and shelter reports every 30 seconds and when connected live events arrive. An unavailable-data message appears if the API cannot be reached.</p>
            </details>
            <details className="faq-item">
              <summary>Does the alert system function during cellular internet failure?<span className="faq-chev">＋</span></summary>
              <p>Registered phones can receive SMS when an operator publishes an alert and an SMS provider is configured. SMS requires cellular service. Reports saved offline on this device synchronize after internet access returns; they have not been dispatched until then.</p>
            </details>
            <details className="faq-item">
              <summary>Are resource center details confirmed by field teams?<span className="faq-chev">＋</span></summary>
              <p>Shelter reports are entered by administrators and approved volunteers. Check the latest report and contact the shelter before travelling.</p>
            </details>
            <details className="faq-item">
              <summary>How do I register an NGO or local hospital on the map?<span className="faq-chev">＋</span></summary>
              <p>Ask the administrator of this deployment to add the facility. Field incident reporting creates a hazard report, not a shelter.</p>
            </details>
          </div>
        </div>
      </section>

      {/* MISSION CTA */}
      <section className="section-pad mission" id="contact">
        <div className="wrap">
          <div className="mission-card">
            <div>
              <h2>Disasters cannot be prevented, but loss of life can.</h2>
              <p>Register to report hazards, request help or apply to join the responder network.</p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  id="mission-signup-btn"
                  onClick={onNavigateToRegister}
                  className="btn btn-white font-bold"
                >
                  Join Citizen Network (Sign Up) →
                </button>
                <button
                  type="button"
                  id="mission-signin-btn"
                  onClick={onNavigateToLogin}
                  className="btn btn-ghost text-white font-bold"
                  style={{ border: '1px solid rgba(255,255,255,0.4)' }}
                >
                  Responder Login
                </button>
              </div>
            </div>
            <div className="mission-photo">
              <img src="https://images.unsplash.com/photo-1593113598332-cd288d649433?q=80&w=900&auto=format&fit=crop" alt="Emergency responders coordinating field assistance" />
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="wrap">
          <div className="foot-top">
            <div>
              <div className="foot-brand">
                <svg width="30" height="30" viewBox="0 0 48 48" fill="none">
                  <path d="M24 3L41 10V22C41 33.5 34 41.8 24 45C14 41.8 7 33.5 7 22V10L24 3Z" fill="#1E5FE0"/>
                  <path d="M17.5 24.5L21.7 28.7L30.5 19.5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="brand-name">DisasterShield</span>
              </div>
              <p>Real-Time Disaster Mitigation, Early Warning &amp; Citizen Relief Network.</p>
              <p className="foot-sources">Data sources: reports published in this deployment; configured weather provider or labelled simulation.</p>
            </div>
            <div>
              <h5>NAVIGATION</h5>
              <ul className="foot-links">
                <li><a href="#home">Home Overview</a></li>
                <li><a href="#livemap">Live GIS Radar</a></li>
                <li><a href="#alerts">Citizen Alerts</a></li>
                <li><a href="#resources">Shelters &amp; Resources</a></li>
                <li><a href="#about">About System</a></li>
                <li><a href="#faq">Operational FAQ</a></li>
              </ul>
            </div>
            <div>
              <h5>24/7 HELPLINE</h5>
              <ul className="foot-links">

                <li><a href="tel:112">National Emergency: 112</a></li>
                <li><a href="tel:1078">NDMA Helpline: 1078</a></li>
              </ul>
              <h5 style={{ marginTop: '20px' }}>CONNECT</h5>
              <div className="foot-social">
              </div>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 DisasterShield Platform. All rights reserved.</span>
            <span className="foot-legal"><button type="button" onClick={() => setLegalView('Privacy')}>Privacy</button> · <button type="button" onClick={() => setLegalView('Usage')}>Usage information</button></span>
            <span>Live operational demonstration interface.</span>
          </div>
        </div>
      </footer>
      {legalView && <div role="dialog" aria-modal="true" aria-label={legalView} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#0009', display: 'grid', placeItems: 'center', padding: 20 }}><div style={{ background: 'white', padding: 24, maxWidth: 550, borderRadius: 12 }}><h2>{legalView}</h2><p>{legalView === 'Privacy' ? 'This platform stores account details, emergency reports, shelter records, and your chosen alert subscriptions. SOS details are shared with approved responders and the reporting account. Browser permissions control location, camera and notifications. Offline actions remain in your browser until synchronized. Contact the deployment operator for account and subscription removal.' : 'This project is a disaster response prototype. Alerts and shelters reflect records entered into this deployment. SMS delivery requires a configured provider; browser notifications require permission. For immediate assistance contact the emergency services shown on this page.'}</p><button type="button" className="btn btn-primary" onClick={() => setLegalView(null)}>Close</button></div></div>}

      {/* TOAST CONTAINER */}
      <div id="toastContainer">
        {toasts.map(t => (
          <div key={t.id} className="toast" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>{t.icon}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
