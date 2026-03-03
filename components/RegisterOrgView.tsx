import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { createOrganization } from '../services/sheetService';
import { ShieldCheck, Building } from './Icons';

interface Props {
    onBack: () => void;
    onRegistered: (orgSlug: string) => void;
}

const slugify = (str: string) =>
    str.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const RegisterOrgView: React.FC<Props> = ({ onBack, onRegistered }) => {
    const [companyName, setCompanyName] = useState('');
    const [adminEmail, setAdminEmail] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const slug = slugify(companyName);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!companyName.trim() || !adminEmail.trim() || !adminPassword) {
            setError('All fields are required.');
            return;
        }
        if (adminPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (adminPassword.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (slug.length < 2) {
            setError('Company name must be at least 2 characters.');
            return;
        }

        setIsLoading(true);
        try {
            // 1. Sign up the admin user FIRST (without org_id - we'll add it after creating the org)
            const { data, error: signupError } = await supabase.auth.signUp({
                email: adminEmail.trim(),
                password: adminPassword,
                options: {
                    data: {
                        name: adminEmail.split('@')[0],
                        rate: 0,
                        role: 'admin',
                    },
                },
            });

            if (signupError || !data.user) throw new Error(signupError?.message || 'Registration failed');

            // 2. Create the organization record (now authenticated)
            const org = await createOrganization(companyName, slug);

            // 3. Update profile with org_id and ensure role is admin
            await supabase
                .from('profiles')
                .update({ role: 'admin', org_id: org.id })
                .eq('id', data.user.id);

            setSuccess(`Organization created! Your company code is: ${slug}`);
            setTimeout(() => onRegistered(slug), 3000);
        } catch (err: any) {
            setError(err.message || 'Registration failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
            <div className="w-full max-w-md relative">
                {/* Background glow */}
                <div className="absolute inset-0 rounded-3xl opacity-20" style={{ background: 'radial-gradient(ellipse at center, #ea580c 0%, transparent 70%)', transform: 'scale(1.2)' }} />

                <div className="relative bg-white/[0.04] backdrop-blur-2xl rounded-3xl border border-white/10 p-8 shadow-2xl">
                    {/* Logo */}
                    <div className="mb-6 flex flex-col items-center relative z-10">
                        <svg viewBox="0 0 300 88" className="h-12 w-auto mb-4 drop-shadow-2xl">
                            <path d="M10 28 L20 38 L40 8" fill="none" stroke="#ea580c" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                            <text x="50" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#ea580c">Task</text>
                            <text x="148" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#ffffff">P</text>
                            <text x="171" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#ffffff">o</text>
                            <path d="M171 12 L182 2 L193 12" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                            <rect x="197" y="20" width="6" height="20" fill="#ffffff" />
                            <rect x="197" y="10" width="6" height="6" fill="#ea580c" />
                            <text x="207" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#ffffff">nt</text>
                            <text x="148" y="62" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="11" style={{ letterSpacing: '0.1em' }} fill="#ffffff">FIELD TASK</text>
                            <text x="148" y="78" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="11" style={{ letterSpacing: '0.08em' }} fill="#ea580c">MANAGER</text>
                        </svg>
                        <div className="flex items-center gap-2 bg-orange-600/20 border border-orange-500/30 px-4 py-1.5 rounded-full">
                            <Building size={14} className="text-orange-400" />
                            <span className="text-orange-300 text-xs font-semibold tracking-wider uppercase">Register Your Company</span>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm relative z-10">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-emerald-400 text-sm relative z-10">
                            <p className="font-bold">{success}</p>
                            <p className="mt-1 text-xs opacity-80">Share this code with your employees so they can log in. Redirecting...</p>
                        </div>
                    )}

                    {!success && (
                        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
                            <div>
                                <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Company Name</label>
                                <input
                                    type="text"
                                    value={companyName}
                                    onChange={e => setCompanyName(e.target.value)}
                                    placeholder="e.g. Apex Roofing Co"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:bg-white/8 transition-all"
                                    required
                                    autoComplete="organization"
                                />
                                {slug.length >= 2 && (
                                    <p className="mt-1 text-xs text-slate-500">Company code: <span className="text-orange-400 font-mono font-bold">{slug}</span></p>
                                )}
                            </div>

                            <div>
                                <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Admin Email</label>
                                <input
                                    type="email"
                                    value={adminEmail}
                                    onChange={e => setAdminEmail(e.target.value)}
                                    placeholder="admin@yourcompany.com"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:bg-white/8 transition-all"
                                    required
                                    autoComplete="email"
                                />
                            </div>

                            <div>
                                <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Password</label>
                                <input
                                    type="password"
                                    value={adminPassword}
                                    onChange={e => setAdminPassword(e.target.value)}
                                    placeholder="Min. 8 characters"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:bg-white/8 transition-all"
                                    required
                                    autoComplete="new-password"
                                />
                            </div>

                            <div>
                                <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Confirm Password</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="Repeat password"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:bg-white/8 transition-all"
                                    required
                                    autoComplete="new-password"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-orange-900/30 mt-2"
                            >
                                {isLoading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                        Creating Organization...
                                    </span>
                                ) : 'Create Organization'}
                            </button>
                        </form>
                    )}

                    <div className="mt-6 text-center relative z-10">
                        <button onClick={onBack} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
                            ← Back to Login
                        </button>
                    </div>

                    <p className="mt-4 text-slate-600 text-xs text-center relative z-10">© 2026 TaskPoint Field Manager</p>
                </div>
            </div>
        </div>
    );
};

export default RegisterOrgView;
