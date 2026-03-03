
import React, { useState, useEffect } from 'react';
import { TimeEntry, JobOption } from '../types';
import { Clock, DollarSign, Calendar, RotateCcw, CheckCircle, AlertTriangle, Sparkles, Briefcase, FileText, Download, X } from './Icons';
import { saveTimeEntryLocal, syncPendingTimeEntries, generateReport } from '../services/sheetService';

interface Props {
    timeEntries: TimeEntry[];
    userId: string;
    userName: string;
    hourlyRate: string;
    orgId?: string;
    availableJobs: JobOption[];
    onRefresh: () => void;
    onOptimisticUpdate: (entry: TimeEntry) => void;
}

const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// Extracted Timer Component to isolate re-renders
const ActiveTimer = React.memo(({ startTime }: { startTime: number }) => {
    const [elapsed, setElapsed] = useState(Date.now() - startTime);

    useEffect(() => {
        const interval = setInterval(() => {
            setElapsed(Date.now() - startTime);
        }, 1000);
        return () => clearInterval(interval);
    }, [startTime]);

    return (
        <div className="text-5xl font-mono font-bold text-slate-900 mb-6 tracking-tighter">
            {formatDuration(elapsed)}
        </div>
    );
});

const TimeClockView: React.FC<Props> = ({ timeEntries, userId, userName, hourlyRate, orgId, availableJobs, onRefresh, onOptimisticUpdate }) => {
    const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [selectedJob, setSelectedJob] = useState('General Shop');

    // Report State
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportPeriod, setReportPeriod] = useState<'current' | 'previous'>('current');
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [reportUrl, setReportUrl] = useState<string | null>(null);

    // Filter entries for current user
    const userEntries = timeEntries
        .filter(t => t.userId === userName)
        .sort((a, b) => b.startTime - a.startTime);

    const unsyncedCount = userEntries.filter(t => t.isSynced === false).length;

    // Initialize active entry
    useEffect(() => {
        const active = userEntries.find(t => t.status === 'active');
        setActiveEntry(active || null);
        if (active && active.jobName) {
            setSelectedJob(active.jobName);
        } else if (!active) {
            setSelectedJob('General Shop');
        }
    }, [timeEntries, userName]);

    const handleToggleClock = async () => {
        try {
            let updatedEntry: TimeEntry;

            if (activeEntry) {
                // Clock Out
                const endTime = Date.now();
                let calculatedPay = 0;

                if (hourlyRate) {
                    const durationHours = (endTime - activeEntry.startTime) / (1000 * 60 * 60);
                    calculatedPay = parseFloat((durationHours * parseFloat(hourlyRate)).toFixed(2));
                }

                updatedEntry = {
                    ...activeEntry,
                    endTime: endTime,
                    status: 'completed',
                    totalPay: calculatedPay > 0 ? calculatedPay : undefined,
                    isSynced: false // Dirty
                };
                setSelectedJob('General Shop'); // Reset to default after clocking out
            } else {
                // Clock In
                if (!selectedJob) {
                    alert("Please select a job first.");
                    return;
                }
                updatedEntry = {
                    id: crypto.randomUUID(),
                    userId: userName,
                    startTime: Date.now(),
                    endTime: null,
                    status: 'active',
                    jobName: selectedJob,
                    isSynced: false // Dirty
                };
            }

            // Save locally first (Optimistic)
            await saveTimeEntryLocal(updatedEntry);
            onOptimisticUpdate(updatedEntry);

            // Force aggressive sync so Admin sees this immediately
            syncPendingTimeEntries().catch(e => console.error("Background sync failed", e));

        } catch (e) {
            alert("Error saving locally. Please check storage.");
        }
    };

    const handleManualSync = async () => {
        if (unsyncedCount === 0) return true;
        setIsSyncing(true);
        try {
            await syncPendingTimeEntries();
            onRefresh();
            return true;
        } catch (e) {
            alert("Sync failed. Check internet connection.");
            return false;
        } finally {
            setIsSyncing(false);
        }
    };

    const handleGenerateReport = async () => {
        // 1. Force Sync first
        if (unsyncedCount > 0) {
            const synced = await handleManualSync();
            if (!synced) return;
        }

        setIsGeneratingReport(true);
        // Revoke previous blob URL if any
        if (reportUrl) {
            URL.revokeObjectURL(reportUrl);
            setReportUrl(null);
        }

        // Determine Dates
        const now = new Date();
        let start = new Date();
        let end = new Date();

        if (reportPeriod === 'current') {
            // Start of week (Sunday)
            start.setDate(now.getDate() - now.getDay());
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
        } else {
            // Last week
            start.setDate(now.getDate() - now.getDay() - 7);
            start.setHours(0, 0, 0, 0);
            end = new Date(start);
            end.setDate(end.getDate() + 6);
            end.setHours(23, 59, 59, 999);
        }

        try {
            const csvText = await generateReport(
                userId,
                start.toISOString(),
                end.toISOString(),
                orgId
            );

            // Convert CSV text to a downloadable blob URL
            const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
            const blobUrl = URL.createObjectURL(blob);

            // Auto-trigger download
            const anchor = document.createElement('a');
            anchor.href = blobUrl;
            anchor.download = `pay-report-${userName}-${start.toISOString().split('T')[0]}.csv`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);

            setReportUrl(blobUrl);
        } catch (e) {
            alert("Failed to generate report. Please try again.");
        } finally {
            setIsGeneratingReport(false);
        }
    };

    const handleCloseReportModal = () => {
        if (reportUrl) URL.revokeObjectURL(reportUrl);
        setShowReportModal(false);
        setReportUrl(null);
    };

    const formatHours = (ms: number) => {
        return (ms / (1000 * 60 * 60)).toFixed(2);
    };

    // Earnings Calculation (Weekly)
    const getWeeklyStats = () => {
        const now = new Date();
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())); // Sunday
        startOfWeek.setHours(0, 0, 0, 0);

        const weeklyEntries = userEntries.filter(e => e.startTime >= startOfWeek.getTime());

        let totalMs = 0;

        // Sum pay from completed entries
        const completedPay = weeklyEntries.reduce((acc, curr) => acc + (Number(curr.totalPay) || 0), 0);

        // Calculate total hours
        weeklyEntries.forEach(e => {
            const end = e.endTime || Date.now();
            totalMs += (end - e.startTime);
        });

        // Estimate active pay
        let activePay = 0;
        const active = weeklyEntries.find(e => e.status === 'active');
        if (active && hourlyRate) {
            const durationHours = (Date.now() - active.startTime) / (1000 * 60 * 60);
            activePay = durationHours * parseFloat(hourlyRate);
        }

        // If no stored pay, estimate from hours
        let finalEarnings = completedPay + activePay;
        if (completedPay === 0 && activePay === 0 && hourlyRate && totalMs > 0) {
            const totalHours = totalMs / (1000 * 60 * 60);
            finalEarnings = totalHours * parseFloat(hourlyRate);
        }

        const hours = totalMs / (1000 * 60 * 60);

        return { hours: hours.toFixed(2), earnings: finalEarnings.toFixed(2) };
    };

    const stats = getWeeklyStats();

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">

            {/* Clock Controller */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex flex-col items-center justify-center mb-6 relative overflow-hidden">

                {/* Sync Status Badge (Top Right) */}
                <div className="absolute top-4 right-4">
                    {unsyncedCount > 0 ? (
                        <button
                            onClick={() => handleManualSync()}
                            disabled={isSyncing}
                            className="flex items-center gap-2 bg-orange-100 hover:bg-orange-200 text-orange-700 px-3 py-1.5 rounded-full text-xs font-bold transition-colors animate-pulse"
                        >
                            {isSyncing ? (
                                <RotateCcw size={14} className="animate-spin" />
                            ) : (
                                <Sparkles size={14} />
                            )}
                            {isSyncing ? 'Syncing...' : `Sync ${unsyncedCount}`}
                        </button>
                    ) : (
                        <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full text-[10px] font-bold opacity-60">
                            <CheckCircle size={12} /> Synced
                        </div>
                    )}
                </div>

                <h2 className="text-slate-400 font-bold uppercase text-xs tracking-widest mb-4">
                    {activeEntry ? 'Current Shift' : 'Ready to Work'}
                </h2>

                {/* Isolated Timer Component */}
                {activeEntry ? (
                    <ActiveTimer startTime={activeEntry.startTime} />
                ) : (
                    <div className="text-5xl font-mono font-bold text-slate-300 mb-6 tracking-tighter">
                        00:00:00
                    </div>
                )}

                {/* Job Name Input */}
                <div className="w-full max-w-xs mb-6 relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <Briefcase size={16} />
                    </div>

                    {/* Dropdown */}
                    <select
                        disabled={!!activeEntry}
                        value={selectedJob}
                        onChange={(e) => setSelectedJob(e.target.value)}
                        className={`w-full pl-9 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors appearance-none
                  ${activeEntry
                                ? 'bg-slate-50 border-transparent text-slate-600 font-bold text-center pl-4'
                                : 'bg-white border-slate-200 text-slate-900 font-bold'}`
                        }
                    >
                        <option value="" disabled>Select Job</option>
                        <option value="General Shop">General Shop</option>
                        {availableJobs.map(job => (
                            <option key={job.id} value={job.name}>{job.name} ({job.address})</option>
                        ))}
                    </select>
                </div>

                {/* Pulsing ring around clock button when active */}
                <div className="relative flex items-center justify-center mb-2">
                    {activeEntry && (
                        <span className="absolute w-48 h-48 rounded-full animate-pulse-ring pointer-events-none"
                            style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%)', border: '1px solid rgba(239,68,68,0.2)' }} />
                    )}
                    {!activeEntry && (
                        <span className="absolute w-48 h-48 rounded-full pointer-events-none"
                            style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)' }} />
                    )}
                    <button
                        onClick={handleToggleClock}
                        className={`w-40 h-40 rounded-full flex items-center justify-center border-8 transition-all active:scale-95 ${activeEntry
                                ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100 hover:border-red-300'
                                : 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100 hover:border-emerald-300'
                            }`}
                        style={{
                            boxShadow: activeEntry
                                ? '0 0 0 0 rgba(239,68,68,0), 0 8px 32px rgba(239,68,68,0.25), 0 4px 16px rgba(0,0,0,0.08)'
                                : '0 8px 32px rgba(16,185,129,0.2), 0 4px 16px rgba(0,0,0,0.06)'
                        }}
                    >
                        <div className="flex flex-col items-center">
                            <div className="mb-2">
                                {activeEntry ? <RotateCcw size={32} /> : <Clock size={32} />}
                            </div>
                            <span className="font-bold text-lg uppercase tracking-wider">
                                {activeEntry ? 'Stop' : 'Start'}
                            </span>
                        </div>
                    </button>
                </div>

                {activeEntry && (
                    <p className="mt-6 text-slate-500 text-sm font-medium animate-pulse">
                        Clocked in at {new Date(activeEntry.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
            </div>

            {/* Weekly Summary */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-white p-4 rounded-xl shadow-lg relative overflow-hidden"
                    style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
                    {/* Subtle dot pattern */}
                    <div className="absolute inset-0 opacity-[0.06]" style={{
                        backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
                        backgroundSize: '12px 12px'
                    }} />
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-2 opacity-70">
                            <Clock size={16} />
                            <span className="text-xs font-bold uppercase">This Week</span>
                        </div>
                        <div className="text-2xl font-bold">{stats.hours} <span className="text-sm font-normal opacity-60">hrs</span></div>
                    </div>

                    {/* Pay Report Button */}
                    <button
                        onClick={() => setShowReportModal(true)}
                        className="absolute top-3 right-3 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-slate-300 hover:text-white transition-colors"
                        title="Generate Pay Report"
                    >
                        <FileText size={16} />
                    </button>
                </div>

                <div className="text-white p-4 rounded-xl shadow-lg"
                    style={{ background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)', boxShadow: '0 8px 24px rgba(234,88,12,0.3)' }}>
                    <div className="flex items-center gap-2 mb-2 opacity-70">
                        <DollarSign size={16} />
                        <span className="text-xs font-bold uppercase">Earnings</span>
                    </div>
                    <div className="text-2xl font-bold">${stats.earnings}</div>
                </div>
            </div>

            {/* Recent History */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-bold text-slate-700 text-sm">Recent Activity</h3>
                    <span className="text-xs text-slate-400">Last 7 Days</span>
                </div>
                <div className="divide-y divide-slate-100">
                    {userEntries.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-sm italic">No time entries recorded yet.</div>
                    ) : (
                        userEntries.slice(0, 5).map(entry => (
                            <div key={entry.id} className="p-4 flex justify-between items-center hover:bg-slate-50 transition">
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <div className={`w-2 h-2 rounded-full ${entry.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                                        {entry.isSynced === false && (
                                            <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-orange-500 rounded-full" />
                                        )}
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-slate-800">
                                            {new Date(entry.startTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                                        </div>
                                        <div className="text-xs text-slate-500 flex flex-col">
                                            <span>
                                                {new Date(entry.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                                                {entry.endTime ? new Date(entry.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ' Now'}
                                            </span>
                                            {entry.jobName && (
                                                <span className="text-orange-600 font-semibold mt-0.5">{entry.jobName}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-mono text-sm font-bold text-slate-700">
                                        {entry.endTime ? formatHours(entry.endTime - entry.startTime) : '...'} hrs
                                    </div>
                                    {entry.totalPay ? (
                                        <div className="text-[10px] text-emerald-600 font-bold">
                                            +${Number(entry.totalPay).toFixed(2)}
                                        </div>
                                    ) : (entry.endTime && hourlyRate) ? (
                                        <div className="text-[10px] text-emerald-600 font-bold">
                                            +${(((entry.endTime - entry.startTime) / 3600000) * parseFloat(hourlyRate)).toFixed(2)}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Pay Report Modal */}
            {showReportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-lg text-slate-900">Generate Pay Report</h3>
                            <button onClick={handleCloseReportModal} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>

                        {!reportUrl ? (
                            <>
                                <div className="space-y-3 mb-6">
                                    <button
                                        onClick={() => setReportPeriod('current')}
                                        className={`w-full p-3 rounded-xl border-2 text-left font-semibold transition ${reportPeriod === 'current' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-100 text-slate-600'}`}
                                    >
                                        <div className="text-sm">Current Week</div>
                                        <div className="text-xs font-normal opacity-70">Sun - Sat</div>
                                    </button>
                                    <button
                                        onClick={() => setReportPeriod('previous')}
                                        className={`w-full p-3 rounded-xl border-2 text-left font-semibold transition ${reportPeriod === 'previous' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-100 text-slate-600'}`}
                                    >
                                        <div className="text-sm">Previous Week</div>
                                        <div className="text-xs font-normal opacity-70">Last Sun - Sat</div>
                                    </button>
                                </div>

                                {unsyncedCount > 0 && (
                                    <div className="mb-4 bg-orange-50 text-orange-800 text-xs p-3 rounded-lg flex items-center gap-2">
                                        <AlertTriangle size={16} />
                                        <span>You have {unsyncedCount} unsynced entries. They will be synced automatically before generation.</span>
                                    </div>
                                )}

                                <button
                                    onClick={handleGenerateReport}
                                    disabled={isGeneratingReport}
                                    className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-70"
                                >
                                    {isGeneratingReport ? (
                                        <>
                                            <RotateCcw size={18} className="animate-spin" />
                                            Generating Report...
                                        </>
                                    ) : (
                                        <>
                                            <FileText size={18} />
                                            Create Report
                                        </>
                                    )}
                                </button>
                            </>
                        ) : (
                            <div className="text-center">
                                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <CheckCircle size={32} />
                                </div>
                                <h4 className="font-bold text-slate-900 mb-2">Report Downloaded!</h4>
                                <p className="text-sm text-slate-500 mb-6">Your CSV pay report has been downloaded to your device.</p>

                                <a
                                    href={reportUrl ?? '#'}
                                    download={`pay-report-${userName}.csv`}
                                    className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-orange-600/20"
                                >
                                    <Download size={18} />
                                    Download CSV Again
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
};

export default TimeClockView;
