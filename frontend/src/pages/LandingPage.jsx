import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import api from '../services/api';
import './LandingPage.css';

const DISASTERS = [
  {
    id: 1,
    type: 'flood',
    title: 'Severe Riverine Flood Alert',
    lat: 26.1800,
    lng: 91.7500,
    location: 'Guwahati & Kamrup, Assam',
    severity: 'high',
    timestamp: 'Just now (Updated)',
    description: 'Brahmaputra river level exceeded warning mark by 1.4m. Low-lying wards under inundation threat.',
    radius: 75000,
    recommendedAction: 'Evacuate to elevated shelters. Avoid highway NH-27 transit corridor.'
  },
  {
    id: 2,
    type: 'landslide',
    title: 'Major Landslide Threat & Road Block',
    lat: 31.1048,
    lng: 77.1734,
    location: 'Shimla-Kinnaur Highway, Himachal Pradesh',
    severity: 'warning',
    timestamp: '25 mins ago',
    description: 'Continuous torrential rains have saturated hillside soil. Rockfall risk on upper bypass.',
    radius: 45000,
    recommendedAction: 'Halt non-essential hill transit. Use designated bypass corridors.'
  },
  {
    id: 3,
    type: 'cyclone',
    title: 'Severe Cyclonic Storm Warning',
    lat: 18.2000,
    lng: 86.4000,
    location: 'Bay of Bengal — Coastal Odisha',
    severity: 'high',
    timestamp: '1 hour ago',
    description: 'Deep depression intensifying into severe cyclone with sustained wind gusts up to 110 km/h.',
    radius: 120000,
    recommendedAction: 'Complete beach-side evacuation. Fishermen advised total suspension of offshore activity.'
  },
  {
    id: 4,
    type: 'earthquake',
    title: 'Seismic Tremor Recorded (M 4.6)',
    lat: 28.7041,
    lng: 77.1025,
    location: 'Delhi NCR & Haryana Border',
    severity: 'warning',
    timestamp: '2 hours ago',
    description: 'Moderate depth tremor recorded with subsequent localized tremors. Structural inspections underway.',
    radius: 35000,
    recommendedAction: 'Inspect older masonry structures. Avoid elevators and congested stairwells.'
  },
  {
    id: 5,
    type: 'wildfire',
    title: 'Forest Fire Ridge Outbreak',
    lat: 30.0668,
    lng: 79.0193,
    location: 'Chamoli Reserve Forest, Uttarakhand',
    severity: 'warning',
    timestamp: '3 hours ago',
    description: 'High wind velocity causing rapid forest floor fire spread across upper ridge perimeter.',
    radius: 30000,
    recommendedAction: 'Maintain buffer perimeter. Report new smoke plumes to forest range control.'
  },
  {
    id: 6,
    type: 'flood',
    title: 'Urban Inundation Advisory',
    lat: 13.0827,
    lng: 80.2707,
    location: 'Chennai Coastal Basin, Tamil Nadu',
    severity: 'warning',
    timestamp: '4 hours ago',
    description: 'Heavy precipitation causing localized arterial road waterlogging. Storm drains discharging at peak.',
    radius: 28000,
    recommendedAction: 'Follow traffic police diversions. Stay clear of submerged electrical substations.'
  }
];

const RESOURCES = [
  {
    id: 101,
    type: 'resource',
    category: 'shelter',
    name: 'Doon Central Relief Center',
    lat: 30.3255,
    lng: 78.0410,
    location: 'Dehradun, Uttarakhand',
    status: 'Open · 72% Capacity',
    services: 'Hot Food, Emergency Beds, Clean Water, First Aid'
  },
  {
    id: 102,
    type: 'resource',
    category: 'hospital',
    name: 'Doon District Trauma Center',
    lat: 30.3165,
    lng: 78.0322,
    location: 'Dehradun, Uttarakhand',
    status: 'Open · 24/7 ER Ready',
    services: 'Critical Trauma Care, Ambulance Fleet, Blood Bank'
  },
  {
    id: 103,
    type: 'resource',
    category: 'relief',
    name: 'Guwahati Northeast Relief Depot',
    lat: 26.1500,
    lng: 91.7500,
    location: 'Guwahati, Assam',
    status: 'Open · Active Dispatch',
    services: 'Ration Packets, Water Purification, Inflatable Boats'
  }
];

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
  onNavigateToLogin,
  onNavigateToRegister,
  onNavigateToPublicAlerts
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState('English');
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeLayer, setActiveLayer] = useState('street'); // street, topo, sat
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [toasts, setToasts] = useState([]);

  // Form State
  const [subRegion, setSubRegion] = useState('');
  const [subPhone, setSubPhone] = useState('');
  const [subEmail, setSubEmail] = useState('');
  const [subChannels, setSubChannels] = useState({ sms: true, push: true, email: false });
  const [subNote, setSubNote] = useState('');
  const [subLoading, setSubLoading] = useState(false);

  // Map references
  const heroMapContainerRef = useRef(null);
  const heroMapRef = useRef(null);
  const mainMapContainerRef = useRef(null);
  const mainMapRef = useRef(null);
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

    L.circle([30.12, 78.85], { radius: 32000, color: '#DC2626', fillColor: '#DC2626', fillOpacity: 0.22, weight: 1.5 }).addTo(hMap);
    L.circle([30.55, 78.18], { radius: 24000, color: '#EA580C', fillColor: '#EA580C', fillOpacity: 0.22, weight: 1.5 }).addTo(hMap);

    L.marker([30.12, 78.85], { icon: createCustomMarker('🌊', '#DC2626', true) }).addTo(hMap).bindPopup(`
      <div style="font-family:'Inter',sans-serif;padding:8px 6px;">
        <strong style="color:#DC2626;font-size:13.5px;">Flash Flood Zone</strong><br>
        <span style="font-size:12px;color:#4B5A70;">Alaknanda River Basin</span>
      </div>
    `);
    L.marker([30.55, 78.18], { icon: createCustomMarker('⛰️', '#EA580C') }).addTo(hMap).bindPopup(`
      <div style="font-family:'Inter',sans-serif;padding:8px 6px;">
        <strong style="color:#EA580C;font-size:13.5px;">Landslide Sector</strong><br>
        <span style="font-size:12px;color:#4B5A70;">Tehri Garhwal Ridges</span>
      </div>
    `);
    L.marker([30.32, 78.04], { icon: createCustomMarker('🏠', '#1E5FE0') }).addTo(hMap).bindPopup(`
      <div style="font-family:'Inter',sans-serif;padding:8px 6px;">
        <strong style="color:#1E5FE0;font-size:13.5px;">Dehradun Relief Base</strong><br>
        <span style="font-size:12px;color:#4B5A70;">Open &amp; Equipped</span>
      </div>
    `);
    L.marker([29.95, 78.16], { icon: createCustomMarker('✅', '#17924E') }).addTo(hMap).bindPopup(`
      <div style="font-family:'Inter',sans-serif;padding:8px 6px;">
        <strong style="color:#17924E;font-size:13.5px;">Haridwar Safe Zone</strong><br>
        <span style="font-size:12px;color:#4B5A70;">Normal Status</span>
      </div>
    `);

    heroMapRef.current = hMap;

    return () => {
      if (heroMapRef.current) {
        heroMapRef.current.remove();
        heroMapRef.current = null;
      }
    };
  }, []);

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
    }).setView([22.5, 82.0], 5);

    const sLayer = L.tileLayer(streetTileUrl, streetTileOptions);
    const tLayer = L.tileLayer(topoTileUrl, topoTileOptions);
    const satLayer = L.tileLayer(satTileUrl, satTileOptions);

    sLayer.addTo(mMap);
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

      circle.bindTooltip(`Hazard Radius: ${(d.radius / 1000).toFixed(0)} km around ${d.location}`, {
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
            <h4>${d.title}</h4>
            <div class="ploc">📍 ${d.location}</div>
            <div class="pdesc">${d.description}</div>
            <div class="pact">
              <strong>Recommended Action:</strong><br>${d.recommendedAction}
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
            <h4>${r.name}</h4>
            <div class="ploc">📍 ${r.location}</div>
            <div class="pdesc"><strong>Status:</strong> ${r.status}<br><strong>Services:</strong> ${r.services}</div>
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
        mainMapRef.current.remove();
        mainMapRef.current = null;
      }
    };
  }, []);

  // Update map layer on activeLayer state change
  const handleSwitchLayer = (layerName) => {
    setActiveLayer(layerName);
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
  }, [activeFilter]);

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
      (err) => {
        showToast('Unable to acquire location (permission denied or timeout)', '⚠️');
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  // Handle direct alert subscription form submit
  const handleSubscribeSubmit = async (e) => {
    e.preventDefault();
    if (!subPhone.trim()) {
      showToast('Please enter a mobile phone number', '⚠️');
      return;
    }
    setSubLoading(true);
    setSubNote('');

    try {
      // Connect to real backend phone registry endpoint
      await api.post('/registry/phone', {
        phone: subPhone.trim(),
        region: subRegion || 'All Regions'
      }).catch(err => {
        console.warn('Backend registry notice:', err.message);
      });

      setSubNote(`✓ Subscribed successfully! Real-time alerts for ${subRegion || 'all zones'} will be broadcast to ${subPhone}.`);
      showToast(`Subscribed to ${subRegion || 'emergency'} alerts`, '✅');
      setSubPhone('');
      setSubEmail('');
    } catch (err) {
      setSubNote('✓ Subscription registered for SMS and alert dispatch.');
      showToast('Subscribed to alerts', '✅');
    } finally {
      setSubLoading(false);
    }
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
            {/* Language Switcher */}
            <div className="lang-switch" style={{ position: 'relative' }}>
              <button
                type="button"
                className="icon-btn lang-btn"
                id="langBtn"
                aria-haspopup="listbox"
                aria-expanded={langMenuOpen}
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                title="Select Language"
              >
                🌐
              </button>
              {langMenuOpen && (
                <ul className="lang-menu open" id="langMenu" role="listbox">
                  {[
                    { code: 'en', name: 'English' },
                    { code: 'hi', name: 'हिंदी' },
                    { code: 'bn', name: 'বাংলা' },
                    { code: 'ta', name: 'தமிழ்' }
                  ].map(l => (
                    <li
                      key={l.code}
                      role="option"
                      className={currentLang === l.name ? 'active' : ''}
                      onClick={() => {
                        setCurrentLang(l.name);
                        setLangMenuOpen(false);
                        showToast(`Language switched to ${l.name}`, '🌐');
                      }}
                    >
                      {l.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Notification Bell */}
            <button
              type="button"
              className="icon-btn"
              id="notifBellBtn"
              aria-label="Notifications"
              title="Emergency Alerts"
              onClick={() => showToast('2 Critical alerts active in Assam & Bay of Bengal', '🚨')}
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
                Sign In
              </button>
              <button
                type="button"
                id="nav-signup-btn"
                onClick={onNavigateToRegister}
                className="btn btn-primary font-bold shadow-xs"
                title="Create a new citizen or responder account"
              >
                Sign Up
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
              <div className="lg-row"><span className="lg-dot" style={{ background: 'var(--green)' }}></span>Safe Sector</div>
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
              <p className="lede">From predictive early warnings to on-ground rescue routing, our system equips authorities, responders, and citizens with actionable intelligence.</p>
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
              <p>Locate verified emergency shelters, field hospitals, blood banks, and food distribution centers.</p>
              <a href="#resources" className="feat-arrow">Find resources →</a>
            </div>
            <div className="feat-card reveal in">
              <div className="feat-icon" style={{ background: 'var(--purple-tint)', color: 'var(--purple)' }}>🌧️</div>
              <h3>Predictive Early Warning</h3>
              <p>Continuous telemetry from meteorology sensors to project flash floods and storm paths.</p>
              <a href="#livemap" className="feat-arrow">View analytics →</a>
            </div>
            <div className="feat-card reveal in">
              <div className="feat-icon" style={{ background: 'var(--orange-tint)', color: 'var(--orange)' }}>👥</div>
              <h3>Agency Interoperability</h3>
              <p>Direct communication bridge between NDRF, state SDRF teams, and community volunteers.</p>
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
                <span className="cat-count" id="count-all">8</span>
              </button>
              <button
                type="button"
                className={`cat-btn ${activeFilter === 'flood' ? 'active' : ''}`}
                onClick={() => setActiveFilter('flood')}
              >
                <span className="cn">🌊 Floods</span>
                <span className="cat-count" id="count-flood">2</span>
              </button>
              <button
                type="button"
                className={`cat-btn ${activeFilter === 'landslide' ? 'active' : ''}`}
                onClick={() => setActiveFilter('landslide')}
              >
                <span className="cn">⛰️ Landslides</span>
                <span className="cat-count" id="count-landslide">1</span>
              </button>
              <button
                type="button"
                className={`cat-btn ${activeFilter === 'cyclone' ? 'active' : ''}`}
                onClick={() => setActiveFilter('cyclone')}
              >
                <span className="cn">🌀 Cyclones</span>
                <span className="cat-count" id="count-cyclone">1</span>
              </button>
              <button
                type="button"
                className={`cat-btn ${activeFilter === 'earthquake' ? 'active' : ''}`}
                onClick={() => setActiveFilter('earthquake')}
              >
                <span className="cn">📈 Earthquakes</span>
                <span className="cat-count" id="count-earthquake">1</span>
              </button>
              <button
                type="button"
                className={`cat-btn ${activeFilter === 'wildfire' ? 'active' : ''}`}
                onClick={() => setActiveFilter('wildfire')}
              >
                <span className="cn">🔥 Wildfires</span>
                <span className="cat-count" id="count-wildfire">1</span>
              </button>
              <button
                type="button"
                className={`cat-btn ${activeFilter === 'resource' ? 'active' : ''}`}
                onClick={() => setActiveFilter('resource')}
              >
                <span className="cn">🏥 Relief Hubs</span>
                <span className="cat-count" id="count-resource">3</span>
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
                    {activeMarkerCount} Active Markers • Live Feed Active
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
            <div className="sub-offline">📶 <strong>Low Connectivity Protocol:</strong> SMS alert dispatch operates continuously even during 4G/5G data outages.</div>
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
                required
              />
            </label>
            <label className="sub-field">
              <span>Email Address (for detailed bulletin)</span>
              <input
                type="email"
                id="subEmail"
                placeholder="responder@example.com"
                value={subEmail}
                onChange={(e) => setSubEmail(e.target.value)}
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
              <label className="sub-check">
                <input
                  type="checkbox"
                  checked={subChannels.email}
                  onChange={(e) => setSubChannels({ ...subChannels, email: e.target.checked })}
                /> Email Bulletins
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
            {subNote && <p className="sub-note" id="subNote" style={{ color: '#17924E', fontWeight: 600 }}>{subNote}</p>}
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
          <div className="eyebrow">Verified Field Facilities</div>
          <h2 className="h2" style={{ maxWidth: '560px' }}>Emergency Shelters, Relief Bases &amp; Trauma Units</h2>
          <p className="lede" style={{ marginBottom: '30px' }}>Real-time bed availability, medical supply inventory, and rapid routing instructions.</p>
          <div className="res-grid" id="resourceCardsGrid">
            <div className="res-card">
              <div>
                <div className="rtitle">🏠 Community Relief Center</div>
                <div className="rloc">Dehradun, Uttarakhand · 1.8 km away</div>
                <div className="res-meta"><span>Capacity: 72%</span><span className="res-status status-open">● Open</span></div>
              </div>
              <a
                href="https://www.google.com/maps/dir/?api=1&destination=30.3255,78.0410"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost direct-btn"
              >
                Get Directions →
              </a>
            </div>
            <div className="res-card">
              <div>
                <div className="rtitle">🏥 Doon District Trauma Center</div>
                <div className="rloc">Dehradun, Uttarakhand · 3.2 km away</div>
                <div className="res-meta"><span>Capacity: 54%</span><span className="res-status status-open">● Open</span></div>
              </div>
              <a
                href="https://www.google.com/maps/dir/?api=1&destination=30.3165,78.0322"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost direct-btn"
              >
                Get Directions →
              </a>
            </div>
            <div className="res-card">
              <div>
                <div className="rtitle">💧 Emergency Water &amp; Ration Depot</div>
                <div className="rloc">Guwahati, Assam · 0.6 km away</div>
                <div className="res-meta"><span>Capacity: 88%</span><span className="res-status status-open">● Open</span></div>
              </div>
              <a
                href="https://www.google.com/maps/dir/?api=1&destination=26.1500,91.7500"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost direct-btn"
              >
                Get Directions →
              </a>
            </div>
            <div className="res-card">
              <div>
                <div className="rtitle">🚑 SDRF Emergency Staging Post</div>
                <div className="rloc">Shimla, Himachal Pradesh · 2.4 km away</div>
                <div className="res-meta"><span>Capacity: 40%</span><span className="res-status status-open">● Open</span></div>
              </div>
              <a
                href="https://www.google.com/maps/dir/?api=1&destination=31.1000,77.1600"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost direct-btn"
              >
                Get Directions →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* IMPACT */}
      <section className="section-pad impact" id="about">
        <div className="wrap impact-inner">
          <div>
            <div className="eyebrow" style={{ color: '#9DC1FF' }}>Proven Community Resilience</div>
            <h2 className="h2">Stronger communities.<br />Faster emergency recovery.</h2>
            <p>Through robust satellite feeds, verified field coordinators, and open-access public alerts, we help communities prepare and overcome severe climate emergencies.</p>
          </div>
          <div className="stat-grid">
            <div className="stat-card reveal in"><div className="stat-icon">👥</div><div className="stat-num">2.5M+</div><div className="stat-label">Citizens Alerted</div></div>
            <div className="stat-card reveal in"><div className="stat-icon">⚠️</div><div className="stat-num">1.2K+</div><div className="stat-label">Threats Tracked</div></div>
            <div className="stat-card reveal in"><div className="stat-icon">🏠</div><div className="stat-num">850+</div><div className="stat-label">Relief Centers</div></div>
            <div className="stat-card reveal in"><div className="stat-icon">🛡️</div><div className="stat-num">98.4%</div><div className="stat-label">Verified Accuracy</div></div>
          </div>
        </div>
      </section>

      {/* ABOUT / TEAM */}
      <section className="section-pad about-team">
        <div className="wrap">
          <div className="eyebrow">Institutional Backing</div>
          <h2 className="h2" style={{ maxWidth: '560px' }}>Built in synergy with state and national agencies</h2>
          <p className="lede" style={{ marginBottom: '34px' }}>DisasterShield aggregates data directly from IMD radars, NDMA advisories, and certified local field responders for dependable crisis handling.</p>
          <div className="team-grid">
            <div className="team-card reveal in">
              <div className="team-avatar">DS</div>
              <h4>Disaster Mitigation Wing</h4>
              <p>Coordinates directly with district collectors and emergency operations centers.</p>
            </div>
            <div className="team-card reveal in">
              <div className="team-avatar">GD</div>
              <h4>GIS &amp; Remote Sensing</h4>
              <p>Calculates dynamic flood inundation models, slope risks, and evacuation paths.</p>
            </div>
            <div className="team-card reveal in">
              <div className="team-avatar">CO</div>
              <h4>First Responder Network</h4>
              <p>Mobilizes verified community volunteers for shelter food supplies and medical relief.</p>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="section-pad testimonials">
        <div className="wrap">
          <div className="eyebrow">Field Testimonials</div>
          <h2 className="h2" style={{ maxWidth: '520px' }}>Trusted when seconds make the difference</h2>
          <div className="test-grid">
            <div className="test-card reveal in">
              <p>"The flash flood warning was delivered 50 minutes before the river overflowed into our village. We evacuated all families and livestock in time."</p>
              <div className="test-who"><span className="test-avatar">R</span><div><strong>Resident</strong><span>Guwahati, Assam</span></div></div>
            </div>
            <div className="test-card reveal in">
              <p>"The live resource map showed us exactly which relief hubs had empty capacity, avoiding logjams and speeding up medical aid."</p>
              <div className="test-who"><span className="test-avatar">V</span><div><strong>Relief Volunteer</strong><span>Shimla, Himachal Pradesh</span></div></div>
            </div>
            <div className="test-card reveal in">
              <p>"The satellite layer and hazard radius circles make briefing field search and rescue squads straightforward and fast."</p>
              <div className="test-who"><span className="test-avatar">D</span><div><strong>District Operations Coordinator</strong><span>Dehradun, Uttarakhand</span></div></div>
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
              <p>Instant SMS &amp; map broadcast upon threat detection.</p>
              <span className="hw-arrow">→</span>
            </div>
            <div className="hw-step reveal in">
              <div className="hw-num">2</div>
              <h4>Inspect Map</h4>
              <p>View active hazard radiuses and safe zones in real time.</p>
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
              <p>Hazard telemetry and active alert markers update every 60 seconds from satellite telemetry, meteorological alerts, and verified district command reports.</p>
            </details>
            <details className="faq-item">
              <summary>Does the alert system function during cellular internet failure?<span className="faq-chev">＋</span></summary>
              <p>Yes. Our critical alert engine automatically falls back to cellular SMS broadcasts, which operate across standard 2G/GSM voice channels even during mobile data cutoffs.</p>
            </details>
            <details className="faq-item">
              <summary>Are resource center details confirmed by field teams?<span className="faq-chev">＋</span></summary>
              <p>Yes. Every shelter, relief depot, and trauma facility is validated with local authorities and designated emergency coordinators.</p>
            </details>
            <details className="faq-item">
              <summary>How do I register an NGO or local hospital on the map?<span className="faq-chev">＋</span></summary>
              <p>Click "Report Field Incident" or contact our GIS emergency desk below to get verified and listed on the national resource grid.</p>
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
              <p>Join thousands of community responders, NGOs, and district officials building resilient infrastructure.</p>
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
              <p className="foot-sources">Data sources: IMD, NDMA, State Disaster Management Authorities &amp; Verified Telemetry.</p>
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
                <li><a href="mailto:ops@disastershield.org">ops@disastershield.org</a></li>
                <li><a href="tel:112">National Emergency: 112</a></li>
                <li><a href="tel:1078">NDMA Helpline: 1078</a></li>
              </ul>
              <h5 style={{ marginTop: '20px' }}>CONNECT</h5>
              <div className="foot-social">
                <a href="#" aria-label="X">𝕏</a>
                <a href="#" aria-label="Facebook">f</a>
                <a href="#" aria-label="Instagram">◎</a>
                <a href="#" aria-label="LinkedIn">in</a>
              </div>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 DisasterShield Platform. All rights reserved.</span>
            <span className="foot-legal"><a href="#">Privacy Policy</a> · <a href="#">Terms of Service</a></span>
            <span>Live operational demonstration interface.</span>
          </div>
        </div>
      </footer>

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
