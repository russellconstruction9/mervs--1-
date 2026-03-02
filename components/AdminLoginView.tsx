
import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, User, Lock, Building } from './Icons';

const ADMIN_CREDS_KEY = 'truchoice_admin_creds';

interface AdminCreds {
    username: string;
    password: string;
    companyName: string;
}

interface Props {
    onLogin: (username: string) => void;
}

const AdminLoginView: React.FC<Props> = ({ onLogin }) => {
    const [mode, setMode] = useState<'login' | 'setup'>('login');
    const [isFirstTime, setIsFirstTime] = useState(false);

    // Form state
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [companyName, setCompanyName] = useState('');

    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(ADMIN_CREDS_KEY);
        if (!stored) {
            setIsFirstTime(true);
            setMode('setup');
        }
    }, []);

    const handleSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!companyName.trim()) {
            setError('Please enter your company name.');
            return;
        }
        if (!username.trim()) {
            setError('Please enter an admin username.');
            return;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setIsLoading(true);
        await new Promise(r => setTimeout(r, 600));

        const creds: AdminCreds = {
            username: username.trim(),
            password,
            companyName: companyName.trim(),
        };
        localStorage.setItem(ADMIN_CREDS_KEY, JSON.stringify(creds));
        localStorage.setItem('truchoice_admin', username.trim());
        onLogin(username.trim());
        setIsLoading(false);
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        await new Promise(r => setTimeout(r, 600));

        const stored = localStorage.getItem(ADMIN_CREDS_KEY);
        if (stored) {
            const creds: AdminCreds = JSON.parse(stored);
            if (
                username.trim().toLowerCase() === creds.username.toLowerCase() &&
                password === creds.password
            ) {
                localStorage.setItem('truchoice_admin', username.trim());
                onLogin(username.trim());
            } else {
                setError('Invalid username or password.');
            }
        } else {
            setError('No admin account found. Please set up first.');
        }
        setIsLoading(false);
    };

    const isSetupMode = mode === 'setup';

    return (
        <div
            className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #1c0a00 100%)' }}
        >
            {/* Background grid */}
            <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                    backgroundImage:
                        'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                }}
            />
            {/* Ambient glow — brand orange */}
            <div
                className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full opacity-15 blur-3xl pointer-events-none"
                style={{ background: 'radial-gradient(circle, #ea580c 0%, transparent 70%)' }}
            />

            {/* Logo */}
            <div className="mb-8 flex flex-col items-center relative z-10">
                <svg viewBox="0 0 260 88" className="h-14 w-auto mb-4 drop-shadow-2xl">
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
                <div className="flex items-center gap-2 bg-orange-600/20 border border-orange-500/30 px-4 py-1.5 rounded-full">
                    <ShieldCheck size={14} className="text-orange-400" />
                    <span className="text-orange-300 text-xs font-bold uppercase tracking-widest">
                        {isSetupMode ? 'Company Setup' : 'Admin Portal'}
                    </span>
                </div>
            </div>

            {/* Card */}
            <div
                className="relative z-10 bg-white/95 backdrop-blur-xl w-full max-w-sm rounded-2xl overflow-hidden"
                style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)' }}
            >
                {/* Color strip — brand orange */}
                <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #ea580c, #f97316)' }} />

                {/* Tab toggle — only show if not first-time forced setup */}
                {!isFirstTime && (
                    <div className="flex border-b border-slate-100">
                        <button
                            type="button"
                            onClick={() => { setMode('login'); setError(''); }}
                            className={`flex-1 py-3.5 text-sm font-bold uppercase tracking-wider transition-colors ${mode === 'login' ? 'text-orange-600 bg-gradient-to-b from-orange-50 to-white' : 'text-slate-400 hover:text-slate-600 bg-white'}`}
                        >
                            Login
                        </button>
                        <button
                            type="button"
                            onClick={() => { setMode('setup'); setError(''); }}
                            className={`flex-1 py-3.5 text-sm font-bold uppercase tracking-wider transition-colors ${mode === 'setup' ? 'text-orange-600 bg-gradient-to-b from-orange-50 to-white' : 'text-slate-400 hover:text-slate-600 bg-white'}`}
                        >
                            Setup
                        </button>
                    </div>
                )}

                <div className="p-6 space-y-4">
                    {isSetupMode ? (
                        // ─── COMPANY SETUP ───
                        <>
                            <div className="text-center mb-1">
                                <h2 className="text-xl font-black text-slate-900">Create Company Account</h2>
                                <p className="text-slate-500 text-xs mt-1">
                                    Set up your admin account. You'll use this to manage your team.
                                </p>
                            </div>

                            {error && (
                                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium flex items-center gap-2 border border-red-100">
                                    <AlertTriangle size={16} /> {error}
                                </div>
                            )}

                            <form onSubmit={handleSetup} className="space-y-3">
                                {/* Company Name */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Company Name</label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Building size={18} /></div>
                                        <input
                                            type="text"
                                            required
                                            value={companyName}
                                            onChange={e => setCompanyName(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 font-bold text-slate-900"
                                            placeholder="TruChoice Roofing"
                                        />
                                    </div>
                                </div>

                                {/* Username */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Admin Username</label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><User size={18} /></div>
                                        <input
                                            type="text"
                                            required
                                            value={username}
                                            onChange={e => setUsername(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 font-bold text-slate-900"
                                            placeholder="owner"
                                            autoComplete="username"
                                        />
                                    </div>
                                </div>

                                {/* Password */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Password</label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Lock size={18} /></div>
                                        <input
                                            type="password"
                                            required
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 font-bold text-slate-900"
                                            placeholder="Min 6 characters"
                                            autoComplete="new-password"
                                        />
                                    </div>
                                </div>

                                {/* Confirm Password */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Confirm Password</label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Lock size={18} /></div>
                                        <input
                                            type="password"
                                            required
                                            value={confirmPassword}
                                            onChange={e => setConfirmPassword(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 font-bold text-slate-900"
                                            placeholder="••••••••"
                                            autoComplete="new-password"
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
                                            Creating Account...
                                        </span>
                                    ) : (
                                        <><Building size={20} /> Create Company Account</>
                                    )}
                                </button>
                            </form>
                        </>
                    ) : (
                        // ─── ADMIN LOGIN ───
                        <>
                            <div className="text-center mb-1">
                                <h2 className="text-xl font-black text-slate-900">Administrator Login</h2>
                                <p className="text-slate-500 text-xs mt-1">Restricted access — authorized personnel only</p>
                            </div>

                            {error && (
                                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium flex items-center gap-2 border border-red-100">
                                    <AlertTriangle size={16} /> {error}
                                </div>
                            )}

                            <form onSubmit={handleLogin} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Username</label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><User size={18} /></div>
                                        <input
                                            type="text"
                                            required
                                            value={username}
                                            onChange={e => setUsername(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 font-bold text-slate-900"
                                            placeholder="Enter username"
                                            autoComplete="username"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Password</label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Lock size={18} /></div>
                                        <input
                                            type="password"
                                            required
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 font-bold text-slate-900"
                                            placeholder="••••••••"
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
                                            Verifying...
                                        </span>
                                    ) : (
                                        <><ShieldCheck size={20} /> Access Admin Dashboard</>
                                    )}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>

            <p className="mt-8 text-slate-600 text-xs relative z-10">© 2024 TruChoice Roofing</p>
        </div>
    );
};

export default AdminLoginView;
