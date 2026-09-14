import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import CitizenDashboard from './pages/CitizenDashboard';
import VolunteerDashboard from './pages/VolunteerDashboard';
import AdminDashboard from './pages/AdminDashboard';
import PublicAlertRegistry from './pages/PublicAlertRegistry';
import { Loader2 } from 'lucide-react';

function MainApp() {
  const { user, role, loading, logout } = useAuth();
  const [authView, setAuthView] = useState('landing'); // 'landing', 'login', 'register', or 'public-alerts'
  const [loggedInView, setLoggedInView] = useState(() => {
    return window.location.hash === '#landing' ? 'landing' : 'dashboard';
  });

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#landing') {
        setLoggedInView('landing');
      } else if (window.location.hash === '#console' || window.location.hash === '') {
        setLoggedInView('dashboard');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleLogout = () => {
    logout();
    setAuthView('landing');
    setLoggedInView('dashboard');
    window.location.hash = '';
  };

  const handleNavigateToLanding = () => {
    window.location.hash = 'landing';
    setLoggedInView('landing');
  };

  const handleNavigateToDashboard = () => {
    window.location.hash = 'console';
    setLoggedInView('dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F6F4EF] text-[#14231F] font-mono gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#14231F]" />
        <div className="text-xs uppercase tracking-widest font-semibold">
          INITIALIZING DISASTER OPS TELEMETRY...
        </div>
      </div>
    );
  }

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

  // Authenticated, user chose to view Public Landing Page
  if (loggedInView === 'landing') {
    return (
      <LandingPage
        user={user}
        onNavigateToDashboard={handleNavigateToDashboard}
        onNavigateToLogin={handleNavigateToDashboard}
        onNavigateToRegister={handleNavigateToDashboard}
        onNavigateToPublicAlerts={() => setAuthView('public-alerts')}
      />
    );
  }

  // Authenticated Console / Dashboard view
  return (
    <div className="min-h-screen bg-[#F6F4EF] text-[#14231F] flex flex-col selection:bg-[#B23A2E]/20">
      <Navbar
        onNavigateToLanding={handleNavigateToLanding}
        onLogout={handleLogout}
      />
      <main className="flex-1 flex flex-col">
        {role === 'ADMIN' && <AdminDashboard />}
        {role === 'VOLUNTEER' && <VolunteerDashboard />}
        {role === 'CITIZEN' && <CitizenDashboard />}
        {!['ADMIN', 'VOLUNTEER', 'CITIZEN'].includes(role) && <CitizenDashboard />}
      </main>

      {/* Field-Ops Hairline Footer */}
      <footer className="w-full bg-[#EFECE4] border-t border-[#D8D3C7] py-2 px-4 text-center text-[10px] font-mono text-[#14231F]/60">
        SIH26206 DISASTER RESILIENCE PLATFORM • REAL-TIME LOCAL RELAY NODE • LATENCY: &lt;50MS
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <MainApp />
      </SocketProvider>
    </AuthProvider>
  );
}
