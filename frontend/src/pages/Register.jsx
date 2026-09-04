import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';

export default function Register({ onSwitchToLogin }) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('CITIZEN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register({
        name,
        email,
        password,
        phone,
        role,
        lat: 19.0760,
        lng: 72.8777,
      });
    } catch (err) {
      console.error('Registration failed', err);
      setError(err.response?.data?.error || 'Registration failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-60px)] flex items-center justify-center p-4 bg-[#F6F4EF]">
      <div className="max-w-md w-full bg-[#FFFFFF] border border-[#D8D3C7] rounded p-6 sm:p-8 shadow-xs">
        <div className="text-center mb-6">
          <div className="w-10 h-10 bg-[#14231F] text-[#F6F4EF] rounded flex items-center justify-center mx-auto mb-3">
            <Shield className="w-5 h-5 text-[#F6F4EF]" />
          </div>
          <h1 className="font-display font-bold text-xl sm:text-2xl text-[#14231F] tracking-tight">
            REGISTER IDENTIFIER
          </h1>
          <p className="text-xs font-mono text-[#14231F]/60 mt-1">
            Enroll citizen or volunteer profile into emergency network
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[#B23A2E]/10 border border-[#B23A2E]/30 text-[#B23A2E] text-xs rounded flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2.5 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-sm text-[#14231F] focus:outline-none focus:border-[#14231F]"
              placeholder="e.g. Aarav Mehta"
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2.5 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-sm text-[#14231F] focus:outline-none focus:border-[#14231F]"
              placeholder="e.g. aarav@gmail.com"
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1">Phone Number</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full p-2.5 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-sm text-[#14231F] focus:outline-none focus:border-[#14231F]"
              placeholder="+91 98200 00000"
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1">Role Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole('CITIZEN')}
                className={`py-2 px-3 text-xs font-mono font-bold rounded border ${
                  role === 'CITIZEN'
                    ? 'bg-[#14231F] text-[#F6F4EF] border-[#14231F]'
                    : 'bg-[#EFECE4] text-[#14231F] border-[#D8D3C7]'
                }`}
              >
                Citizen
              </button>
              <button
                type="button"
                onClick={() => setRole('VOLUNTEER')}
                className={`py-2 px-3 text-xs font-mono font-bold rounded border ${
                  role === 'VOLUNTEER'
                    ? 'bg-[#14231F] text-[#F6F4EF] border-[#14231F]'
                    : 'bg-[#EFECE4] text-[#14231F] border-[#D8D3C7]'
                }`}
              >
                Volunteer
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono uppercase text-[#14231F]/80 mb-1">Security Password</label>
            <input
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
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[#14231F] hover:bg-black text-[#F6F4EF] font-display font-semibold text-sm rounded transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>COMPLETE REGISTRATION</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-[#D8D3C7] text-center">
          <p className="text-xs text-[#14231F]/70">
            Already registered?{' '}
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="font-semibold underline text-[#14231F] hover:text-[#2E6E4E]"
            >
              Log in to console
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
