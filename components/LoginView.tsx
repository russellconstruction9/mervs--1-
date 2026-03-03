
import React, { useState } from 'react';
import { apiLogin } from '../services/sheetService';
import { UserProfile } from '../types';
import { CheckCircle, AlertTriangle, User, Lock, Building } from './Icons';

interface Props {
  onLogin: (user: UserProfile) => void;
  onAdminAccess?: () => void;
  onRegisterOrg?: () => void;
}

const LoginView: React.FC<Props> = ({ onLogin, onAdminAccess, onRegisterOrg }) => {
  const [loginData, setLoginData] = useState({ name: '', pin: '', orgSlug: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    // Sanitize PIN: digits only, max 4
    const cleanPin = loginData.pin.replace(/\D/g, '').slice(0, 4);
    if (cleanPin.length < 4) {
      setError('PIN must be 4 digits.');
      setIsLoading(false);
      return;
    }
    try {
      const user = await apiLogin(loginData.name, cleanPin, loginData.orgSlug || undefined);
      onLogin(user);
    } catch (err: any) {
      setError(err.message || 'Invalid name or PIN. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #1c0a00 100%)' }}
    >
      {/* Background grid texture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Orange ambient glow */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #ea580c 0%, transparent 70%)' }}
      />

      {/* Logo */}
      <div className="mb-8 flex flex-col items-center relative z-10">
        <svg viewBox="0 0 300 88" className="h-16 w-auto mb-4 drop-shadow-2xl">
          {/* Checkmark */}
          <path d="M10 28 L20 38 L40 8" fill="none" stroke="#ea580c" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          {/* Task — orange */}
          <text x="50" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#ea580c">Task</text>
          {/* P — white */}
          <text x="148" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#ffffff">P</text>
          {/* o — white with roof chevron above */}
          <text x="171" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#ffffff">o</text>
          <path d="M171 12 L182 2 L193 12" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          {/* i — white with orange dot */}
          <rect x="197" y="20" width="6" height="20" fill="#ffffff" />
          <rect x="197" y="10" width="6" height="6" fill="#ea580c" />
          {/* nt — white */}
          <text x="207" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#ffffff">nt</text>
          {/* Subtitle */}
          <text x="148" y="62" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="11" style={{ letterSpacing: '0.1em' }} fill="#ffffff">FIELD TASK</text>
          <text x="148" y="78" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="11" style={{ letterSpacing: '0.08em' }} fill="#ea580c">MANAGER</text>
        </svg>
        <p className="text-slate-400 text-sm font-medium tracking-wide">Field Task Manager</p>
      </div>

      {/* Card */}
      <div
        className="relative z-10 bg-white/95 backdrop-blur-xl w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)' }}
      >
        {/* Orange top strip */}
        <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #ea580c, #f97316)' }} />

        <div className="p-6 space-y-4">
          <div className="text-center mb-1">
            <h2 className="text-xl font-black text-slate-900">Employee Login</h2>
            <p className="text-slate-500 text-xs mt-1">Enter your name and PIN provided by your manager</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium flex items-center gap-2 border border-red-100">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Company Code</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Building size={18} /></div>
                <input
                  type="text"
                  value={loginData.orgSlug}
                  onChange={e => setLoginData({ ...loginData, orgSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 font-bold text-slate-900 font-mono"
                  placeholder="your-company-code"
                  autoComplete="organization"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1 ml-1">Ask your manager for your company code</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Full Name</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><User size={18} /></div>
                <input
                  type="text"
                  required
                  value={loginData.name}
                  onChange={e => setLoginData({ ...loginData, name: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 font-bold text-slate-900"
                  placeholder="Enter your name"
                  autoComplete="name"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">PIN</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Lock size={18} /></div>
                <input
                  type="password"
                  inputMode="numeric"
                  required
                  value={loginData.pin}
                  onChange={e => setLoginData({ ...loginData, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 font-bold text-center tracking-[0.6em] text-2xl text-slate-900"
                  placeholder="••••"
                  maxLength={4}
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-70 active:scale-[0.98]"
              style={{ background: isLoading ? '#1e293b' : 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #ea580c 200%)' }}
              onMouseEnter={e => { if (!isLoading) (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, #ea580c, #c2410c)'; }}
              onMouseLeave={e => { if (!isLoading) (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #ea580c 200%)'; }}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Logging In...
                </span>
              ) : (
                <><CheckCircle size={20} /> Access App</>
              )}
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-2 relative z-10">
        {onAdminAccess && (
          <button
            type="button"
            onClick={onAdminAccess}
            className="text-slate-500 text-xs hover:text-slate-300 transition-colors underline underline-offset-2"
          >
            Admin Login
          </button>
        )}
        {onRegisterOrg && (
          <button
            type="button"
            onClick={onRegisterOrg}
            className="text-orange-600 text-xs hover:text-orange-400 transition-colors underline underline-offset-2"
          >
            Register your company →
          </button>
        )}
      </div>

      <p className="mt-4 text-slate-600 text-xs relative z-10">© 2026 TaskPoint Field Manager</p>
    </div>
  );
};

export default LoginView;
