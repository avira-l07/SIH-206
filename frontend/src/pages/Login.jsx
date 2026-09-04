import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, AlertTriangle, User, LifeBuoy, ArrowRight, Loader2 } from 'lucide-react';

export default function Login({ onSwitchToRegister }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('citizen@sih.gov.in');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      console.error('Login error', err);
      setError(err.response?.data?.error || 'Authentication failed. Verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoCreds = (demoEmail) => {
    setEmail(demoEmail);
    setPassword('password123');
  };

  return (
    <div className="min-h-[calc(100vh-60px)] flex items-center justify-center p-4 bg-[#F6F4EF]">
      <div className="max-w-md w-full bg-[#FFFFFF] border border-[#D8D3C7] rounded p-6 sm:p-8 shadow-xs">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-10 h-10 bg-[#14231F] text-[#F6F4EF] rounded flex items-center justify-center mx-auto mb-3">
            <Shield className="w-5 h-5 text-[#F6F4EF]" />
          </div>
          <h1 className="font-display font-bold text-xl sm:text-2xl text-[#14231F] tracking-tight">
            DISASTER OPS LOGIN
          </h1>
          <p className="text-xs font-mono text-[#14231F]/60 mt-1">
            Access secure emergency coordination console
          </p>
        </div>

        {/* Demo Fast Fill Buttons for Hackathon Presentation */}
        <div className="mb-6 p-3 bg-[#EFECE4] border border-[#D8D3C7] rounded space-y-2">
          <div className="text-[10px] font-mono uppercase text-[#14231F]/70 font-semibold">
            QUICK DEMO ACCOUNTS (1-CLICK FILL):
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              id="quick-login-citizen"
              onClick={() => fillDemoCreds('citizen@sih.gov.in')}
              className="px-2 py-1.5 text-[11px] font-mono bg-[#FFFFFF] hover:bg-[#D8D3C7] text-[#14231F] border border-[#D8D3C7] rounded font-semibold text-center"
            >
              Citizen
            </button>
            <button
              type="button"
              id="quick-login-volunteer"
              onClick={() => fillDemoCreds('volunteer@sih.gov.in')}
              className="px-2 py-1.5 text-[11px] font-mono bg-[#FFFFFF] hover:bg-[#D8D3C7] text-[#14231F] border border-[#D8D3C7] rounded font-semibold text-center"
            >
              Volunteer
            </button>
            <button
              type="button"
              id="quick-login-admin"
              onClick={() => fillDemoCreds('admin@sih.gov.in')}
              className="px-2 py-1.5 text-[11px] font-mono bg-[#FFFFFF] hover:bg-[#D8D3C7] text-[#14231F] border border-[#D8D3C7] rounded font-semibold text-center"
            >
              NDMA Admin
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[#B23A2E]/10 border border-[#B23A2E]/30 text-[#B23A2E] text-xs rounded flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1" htmlFor="email-input">
              Registered Email
            </label>
            <input
              id="email-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2.5 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-sm text-[#14231F] focus:outline-none focus:border-[#14231F]"
              placeholder="e.g. citizen@sih.gov.in"
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1" htmlFor="password-input">
              Password
            </label>
            <input
              id="password-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2.5 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-sm text-[#14231F] focus:outline-none focus:border-[#14231F]"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            id="login-submit-btn"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[#14231F] hover:bg-black text-[#F6F4EF] font-display font-semibold text-sm rounded transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>ENTER CONSOLE</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-[#D8D3C7] text-center">
          <p className="text-xs text-[#14231F]/70">
            Need a new account?{' '}
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="font-semibold underline text-[#14231F] hover:text-[#2E6E4E]"
            >
              Register as Citizen or Volunteer
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
