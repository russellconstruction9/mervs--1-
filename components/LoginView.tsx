
import React, { useState } from 'react';
import { apiLogin, apiSignup } from '../services/sheetService';
import { UserProfile } from '../types';
import { CheckCircle, AlertTriangle, User, Lock, Plus } from './Icons';

interface Props {
  onLogin: (user: UserProfile) => void;
}

const LoginView: React.FC<Props> = ({ onLogin }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  // Login form
  const [loginData, setLoginData] = useState({ name: '', pin: '' });

  // Signup form
  const [signupData, setSignupData] = useState({ name: '', pin: '', confirmPin: '', rate: '' });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const user = await apiLogin(loginData.name, loginData.pin);
      localStorage.setItem('truchoice_user', JSON.stringify(user));
      onLogin(user);
    } catch (err: any) {
      setError(err.message || 'Invalid name or PIN. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (signupData.pin.length < 4) {
      setError('PIN must be at least 4 digits.');
      return;
    }
    if (signupData.pin !== signupData.confirmPin) {
      setError('PINs do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const user = await apiSignup(signupData.name, signupData.pin, signupData.rate || '0');
      localStorage.setItem('truchoice_user', JSON.stringify(user));
      onLogin(user);
    } catch (err: any) {
      setError(err.message || 'Could not create account. Name may already be taken.');
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (newMode: 'login' | 'signup') => {
    setMode(newMode);
    setError('');
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
        <svg viewBox="0 0 260 88" className="h-16 w-auto mb-4 drop-shadow-2xl">
          <path d="M10 28 L20 38 L40 8" fill="none" stroke="#ea580c" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <text x="50" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#ea580c">Tru</text>
          <text x="110" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#ffffff">C</text>
          <text x="136" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#ffffff">h</text>
          <path d="M136 12 L146 2 L156 12" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <text x="160" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#ffffff">o</text>
          <rect x="187" y="20" width="6" height="20" fill="#ffffff" />
          <rect x="187" y="10" width="6" height="6" fill="#ea580c" />
          <text x="198" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#ffffff">ce</text>
          <text x="110" y="62" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="11" style={{ letterSpacing: '0.1em' }} fill="#ffffff">ROOFING</text>
          <text x="110" y="78" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="11" style={{ letterSpacing: '0.08em' }} fill="#ea580c">PRODUCTION</text>
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

        {/* Tab toggle */}
        <div className="flex border-b border-slate-100">
          <button
            type="button"
            id="tab-login"
            onClick={() => switchMode('login')}
            className={`flex-1 py-3.5 text-sm font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${mode === 'login'
                ? 'text-orange-600 bg-gradient-to-b from-orange-50 to-white'
                : 'text-slate-400 hover:text-slate-600 bg-white'
              }`}
          >
            <User size={14} /> Login
          </button>
          <button
            type="button"
            id="tab-signup"
            onClick={() => switchMode('signup')}
            className={`flex-1 py-3.5 text-sm font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${mode === 'signup'
                ? 'text-orange-600 bg-gradient-to-b from-orange-50 to-white'
                : 'text-slate-400 hover:text-slate-600 bg-white'
              }`}
          >
            <Plus size={14} /> New Account
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Error message */}
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium flex items-center gap-2 border border-red-100">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          {/* ─── LOGIN FORM ─── */}
          {mode === 'login' && (
            <>
              <div className="text-center mb-1">
                <h2 className="text-xl font-black text-slate-900">Employee Login</h2>
                <p className="text-slate-500 text-xs mt-1">Enter your name and PIN provided by your manager</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Full Name</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><User size={18} /></div>
                    <input
                      id="login-name"
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
                      id="login-pin"
                      type="password"
                      inputMode="numeric"
                      required
                      value={loginData.pin}
                      onChange={e => setLoginData({ ...loginData, pin: e.target.value })}
                      className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 font-bold text-center tracking-[0.6em] text-2xl text-slate-900"
                      placeholder="••••"
                      maxLength={4}
                      autoComplete="current-password"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  id="btn-login"
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

                <p className="text-center text-xs text-slate-400 pt-1">
                  New here?{' '}
                  <button type="button" onClick={() => switchMode('signup')} className="text-orange-500 font-bold hover:underline">
                    Create an account →
                  </button>
                </p>
              </form>
            </>
          )}

          {/* ─── SIGNUP FORM ─── */}
          {mode === 'signup' && (
            <>
              <div className="text-center mb-1">
                <h2 className="text-xl font-black text-slate-900">Create Account</h2>
                <p className="text-slate-500 text-xs mt-1">Set up your employee profile to get started</p>
              </div>

              <form onSubmit={handleSignup} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Full Name</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><User size={18} /></div>
                    <input
                      id="signup-name"
                      type="text"
                      required
                      value={signupData.name}
                      onChange={e => setSignupData({ ...signupData, name: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 font-bold text-slate-900"
                      placeholder="Your full name"
                      autoComplete="name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Choose a PIN (4 digits)</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Lock size={18} /></div>
                    <input
                      id="signup-pin"
                      type="password"
                      inputMode="numeric"
                      required
                      maxLength={4}
                      value={signupData.pin}
                      onChange={e => setSignupData({ ...signupData, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 font-bold text-center tracking-[0.5em] text-xl text-slate-900"
                      placeholder="••••"
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Confirm PIN</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Lock size={18} /></div>
                    <input
                      id="signup-confirm-pin"
                      type="password"
                      inputMode="numeric"
                      required
                      maxLength={4}
                      value={signupData.confirmPin}
                      onChange={e => setSignupData({ ...signupData, confirmPin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 font-bold text-center tracking-[0.5em] text-xl text-slate-900"
                      placeholder="••••"
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  id="btn-signup"
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
                      Creating Account...
                    </span>
                  ) : (
                    <><Plus size={20} /> Create My Account</>
                  )}
                </button>

                <p className="text-center text-xs text-slate-400 pt-1">
                  Already have an account?{' '}
                  <button type="button" onClick={() => switchMode('login')} className="text-orange-500 font-bold hover:underline">
                    Log in →
                  </button>
                </p>
              </form>
            </>
          )}
        </div>
      </div>

      <p className="mt-8 text-slate-600 text-xs relative z-10">© 2024 TruChoice Roofing</p>
    </div>
  );
};

export default LoginView;
