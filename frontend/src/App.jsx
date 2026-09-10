import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import CitizenDashboard from './pages/CitizenDashboard';
import VolunteerDashboard from './pages/VolunteerDashboard';
import AdminDashboard from './pages/AdminDashboard';
import PublicAlertRegistry from './pages/PublicAlertRegistry';
import { Shield, Loader2 } from 'lucide-react';

function MainApp() {
  const { user, role, loading } = useAuth();
  const [authView, setAuthView] = useState('login'); // 'login', 'register', or 'public-alerts'

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

  if (!user) {
    if (authView === 'public-alerts') {
      return <PublicAlertRegistry onBackToLogin={() => setAuthView('login')} />;
    }

    return authView === 'login' ? (
      <Login
        onSwitchToRegister={() => setAuthView('register')}
        onSwitchToPublicAlerts={() => setAuthView('public-alerts')}
      />
    ) : (
      <Register
        onSwitchToLogin={() => setAuthView('login')}
        onSwitchToPublicAlerts={() => setAuthView('public-alerts')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F4EF] text-[#14231F] flex flex-col selection:bg-[#B23A2E]/20">
      <Navbar />
      <main className="flex-1 flex flex-col">
        {role === 'ADMIN' && <AdminDashboard />}
        {role === 'VOLUNTEER' && <VolunteerDashboard />}
        {role === 'CITIZEN' && <CitizenDashboard />}
        {!['ADMIN', 'VOLUNTEER', 'CITIZEN'].includes(role) && <CitizenDashboard />}
      </main>

      {/* Field-Ops Hairline Footer */}
      <footer className="w-full bg-[#EFECE4] border-t border-[#D8D3C7] py-2 px-4 text-center text-[10px] font-mono text-[#14231F]/60">
        SIH26206 DISASTER RESILIENCE PLATFORM • REAL-TIME MESH NODE • LATENCY: &lt;50MS
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
