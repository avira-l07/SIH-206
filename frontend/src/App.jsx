import { resolveRoute, VIEW_PATHS } from './services/navigation';
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Navbar from './components/Navbar';
const LandingPage=lazy(()=>import('./pages/LandingPage'));
const SecurityDialog=lazy(()=>import('./components/SecurityDialog'));
import Login from './pages/Login';
import Register from './pages/Register';
const CitizenDashboard = lazy(() => import('./pages/CitizenDashboard'));
const VolunteerDashboard = lazy(() => import('./pages/VolunteerDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const PublicAlertRegistry = lazy(() => import('./pages/PublicAlertRegistry'));
import { Loader2 } from 'lucide-react';

function MainApp() {
  const { user, role, loading, logout, refreshUser } = useAuth();
  const [route, setRoute] = useState(() => resolveRoute(window.location.pathname, window.location.hash));
  const [authView, updateAuthView] = useState(() => { const view = resolveRoute(window.location.pathname, window.location.hash).view; return view === 'dashboard' ? 'login' : view; });
  const setAuthView = view => { window.history.pushState({}, '', VIEW_PATHS[view]); setRoute({ view }); updateAuthView(view); };
  const navigate = view => { window.history.pushState({}, '', VIEW_PATHS[view]); setRoute({ view }); setLoggedInView(view); }; // 'landing', 'login', 'register', or 'public-alerts'
  const [securityEnrollment,setSecurityEnrollment]=useState(null);
  useEffect(()=>{if(user?.securitySetupRequired)setSecurityEnrollment(user.id);},[user?.id,user?.securitySetupRequired]);
  const [checkingApproval, setCheckingApproval] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState('');
  const [loggedInView, setLoggedInView] = useState(() => {
    const view = resolveRoute(window.location.pathname, window.location.hash).view;
    return ['landing', 'public-alerts'].includes(view) ? view : 'dashboard';
  });

  useEffect(() => {
    const syncRoute = () => {
      const next = resolveRoute(window.location.pathname, window.location.hash); setRoute(next);
      updateAuthView(next.view === 'dashboard' ? 'login' : next.view);
      setLoggedInView(['landing', 'public-alerts'].includes(next.view) ? next.view : 'dashboard');
    };
    window.addEventListener('hashchange', syncRoute); window.addEventListener('popstate', syncRoute);
    return () => { window.removeEventListener('hashchange', syncRoute); window.removeEventListener('popstate', syncRoute); };
  }, []);

  const handleLogout = async () => {
    await logout();
    setAuthView('landing');
    setLoggedInView('landing');
  };

  const handleNavigateToLanding = () => {
    navigate('landing');
  };

  const handleNavigateToDashboard = () => {
    navigate('dashboard');
  };

  useEffect(() => {
    if (user && ['login', 'register'].includes(route.view)) {
      window.history.replaceState({}, '', '/console'); setRoute({ view: 'dashboard' }); setLoggedInView('dashboard');
    }
  }, [user, route.view]);

  const checkApproval = async () => {
    setCheckingApproval(true);
    setApprovalMessage('');
    try {
      const account = await refreshUser();
      if (!account.trusted) setApprovalMessage('Approval is still pending.');
    } catch {
      setApprovalMessage('Could not check approval. Check your connection and try again.');
    } finally {
      setCheckingApproval(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F6F4EF] text-[#14231F] font-mono gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#14231F]" />
        <div className="text-xs uppercase tracking-widest font-semibold">
          Loading your dashboard…
        </div>
      </div>
    );
  }

  if (route.view === 'not-found') return <section className="p-8 text-center"><h1 className="text-2xl font-bold">Page not found</h1><button className="underline mt-4" onClick={() => setAuthView('landing')}>Go to home</button></section>;
  if (user && route.requiredRole && role !== route.requiredRole) return <section className="p-8 text-center"><h1 className="text-2xl font-bold">This console requires a different role</h1><button className="underline mt-4" onClick={handleNavigateToDashboard}>Open my console</button></section>;

  // Pre-login state
  if (!user) {
    if (authView === 'landing') {
      return (
        <LandingPage
          user={null}
          onNavigateToLogin={() => setAuthView('login')}
          onNavigateToRegister={() => setAuthView('register')}
          onNavigateToPublicAlerts={() => setAuthView('public-alerts')}
          onNavigateToDashboard={() => setAuthView('login')}
        />
      );
    }

    if (authView === 'public-alerts') {
      return (
        <PublicAlertRegistry
          onBackToLogin={() => setAuthView('login')}
          onBackToLanding={() => setAuthView('landing')}
        />
      );
    }

    return authView === 'login' ? (
      <Login
        onSwitchToRegister={() => setAuthView('register')}
        onSwitchToPublicAlerts={() => setAuthView('public-alerts')}
        onBackToLanding={() => setAuthView('landing')}
      />
    ) : (
      <Register
        onSwitchToLogin={() => setAuthView('login')}
        onSwitchToPublicAlerts={() => setAuthView('public-alerts')}
        onBackToLanding={() => setAuthView('landing')}
      />
    );
  }

  if (loggedInView === 'public-alerts') return <PublicAlertRegistry onBackToLogin={handleNavigateToDashboard} onBackToLanding={handleNavigateToLanding} />;

  // Authenticated, user chose to view Public Landing Page
  if (loggedInView === 'landing') {
    return (
      <LandingPage
        user={user}
        onNavigateToDashboard={handleNavigateToDashboard}
        onNavigateToLogin={handleNavigateToDashboard}
        onNavigateToRegister={handleNavigateToDashboard}
        onNavigateToPublicAlerts={() => navigate('public-alerts')}
      />
    );
  }

  if(user.securitySetupRequired||securityEnrollment===user.id)return <SecurityDialog required onClose={()=>{setSecurityEnrollment(null);refreshUser();}} />;

  // Authenticated Console / Dashboard view
  return (
    <div className="dashboard-shell min-h-screen bg-[#F6F4EF] text-[#14231F] flex flex-col selection:bg-[#B23A2E]/20">
      <a href="#console-content" className="skip-link">Skip to dashboard content</a>
      <Navbar
        onNavigateToLanding={handleNavigateToLanding}
        onLogout={handleLogout}
      />
      <main id="console-content" tabIndex={-1} className="flex-1 flex flex-col min-w-0">
        {role === 'ADMIN' && <AdminDashboard key={user.id} />}
        {role === 'VOLUNTEER' && (user.trusted ? <VolunteerDashboard key={user.id} /> : <section className="max-w-xl mx-auto p-8 space-y-4"><h1 className="text-xl font-bold">Your volunteer account awaits approval</h1><p>An administrator must approve field access. You can check your approval status here.</p><button type="button" disabled={checkingApproval} className="bg-[#14231F] text-white rounded px-4 py-2 disabled:opacity-50" onClick={checkApproval}>{checkingApproval ? 'Checking…' : 'Check approval status'}</button>{approvalMessage && <p role="status">{approvalMessage}</p>}</section>)}
        {role === 'CITIZEN' && <CitizenDashboard key={user.id} />}
        {!['ADMIN', 'VOLUNTEER', 'CITIZEN'].includes(role) && <CitizenDashboard />}
      </main>

      {/* Field-Ops Hairline Footer */}
      <footer className="w-full bg-[#EFECE4] border-t border-[#D8D3C7] py-2 px-4 text-center text-[10px] font-mono text-[#14231F]/60">
        DisasterShield · Prepare, respond and recover · SIH26206
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <Suspense fallback={<div role="status" className="p-6">Loading console…</div>}><MainApp /></Suspense>
      </SocketProvider>
    </AuthProvider>
  );
}
