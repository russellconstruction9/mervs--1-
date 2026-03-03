
import React, { useState, useEffect } from 'react';
import { UserProfile, JobOption, TimeEntry, Task, TaskStatus, TaskPriority, ChatMessage } from '../types';
import { Trash, Plus, CheckCircle, User, Briefcase, MapPin, DollarSign, X, Clock, Sparkles, LayoutList, Calendar, Lock, ShieldCheck, AlertTriangle, MessageCircle } from './Icons';
import { saveUser, deleteUser, saveJob, deleteJob, saveTask, deleteTask } from '../services/sheetService';
import ChatView from './ChatView';

interface Props {
    users: UserProfile[];
    jobs: JobOption[];
    timeEntries: TimeEntry[];
    tasks: Task[];
    messages: ChatMessage[];
    currentUserName: string;
    currentUserId: string;
    orgId?: string;
    orgSlug?: string;
    onRefresh: () => void;
    onClose: () => void;
    onLogout: () => void;
}

const LiveTimer = ({ startTime }: { startTime: number }) => {
    const [elapsed, setElapsed] = useState(Date.now() - startTime);
    useEffect(() => {
        const interval = setInterval(() => setElapsed(Date.now() - startTime), 1000);
        return () => clearInterval(interval);
    }, [startTime]);

    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    return <span className="font-mono">{hours}h {minutes}m {seconds}s</span>;
};

const AdminView: React.FC<Props> = ({ users, jobs, timeEntries, tasks: globalTasks, messages, currentUserName, currentUserId, orgId, orgSlug, onRefresh, onClose, onLogout }) => {
    const [activeTab, setActiveTab] = useState<'live' | 'users' | 'jobs' | 'tasks' | 'chat'>('live');

    // Local state for Optimistic Updates
    const [localUsers, setLocalUsers] = useState<UserProfile[]>(users);
    const [localJobs, setLocalJobs] = useState<JobOption[]>(jobs);
    const [localTasks, setLocalTasks] = useState<Task[]>(globalTasks);

    useEffect(() => { setLocalUsers(users); }, [users]);
    useEffect(() => { setLocalJobs(jobs); }, [jobs]);
    useEffect(() => { setLocalTasks(globalTasks); }, [globalTasks]);

    // Forms
    const [newUser, setNewUser] = useState({ name: '', rate: '', pin: '' });
    const [newJob, setNewJob] = useState({ name: '', address: '' });
    const [newTask, setNewTask] = useState({ title: '', assignedTo: '', dueDate: '', jobName: '' });

    const activeWorkers = timeEntries.filter(t => t.status === 'active');
    const completedToday = globalTasks.filter(t => t.status === TaskStatus.COMPLETED).length;
    const pendingTasks = globalTasks.filter(t => t.status !== TaskStatus.COMPLETED).length;

    const handleAddUser = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUser.name) return;
        if (!newUser.pin || newUser.pin.length < 4) {
            alert('Please enter a 4-digit PIN for this employee.');
            return;
        }
        const user: UserProfile = {
            id: crypto.randomUUID(),
            name: newUser.name,
            rate: newUser.rate || '0',
            role: 'user',
            pin: newUser.pin || undefined
        };
        setLocalUsers(prev => [...prev, user]);
        setNewUser({ name: '', rate: '', pin: '' });
        saveUser(user, true, orgId, orgSlug)
            .then(() => onRefresh())
            .catch(err => {
                alert(`Failed to create employee: ${err.message}`);
                setLocalUsers(prev => prev.filter(u => u.id !== user.id));
            });
    };

    const handleDeleteUser = (id: string) => {
        if (id === currentUserId) {
            alert('You cannot delete your own account.');
            return;
        }
        if (window.confirm("Delete this team member? This cannot be undone.")) {
            setLocalUsers(prev => prev.filter(u => u.id !== id));
            deleteUser(id)
                .then(() => onRefresh())
                .catch(err => {
                    alert(`Failed to delete employee: ${err.message}`);
                    onRefresh(); // re-sync to restore the user
                });
        }
    };

    const handleAddJob = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newJob.name) return;
        const job: JobOption = {
            id: crypto.randomUUID(),
            name: newJob.name,
            address: newJob.address,
            active: true
        };
        setLocalJobs(prev => [...prev, job]);
        setNewJob({ name: '', address: '' });
        saveJob(job, true, orgId)
            .then(() => onRefresh())
            .catch(err => {
                alert(`Failed to save job: ${err.message}`);
                setLocalJobs(prev => prev.filter(j => j.id !== job.id));
            });
    };

    const handleDeleteJob = (id: string) => {
        if (window.confirm("Delete this job?")) {
            setLocalJobs(prev => prev.filter(j => j.id !== id));
            deleteJob(id)
                .then(() => onRefresh())
                .catch(err => {
                    alert(`Failed to delete job: ${err.message}`);
                    onRefresh();
                });
        }
    };

    const handleAddTask = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTask.title) return;

        const task: Task = {
            id: crypto.randomUUID(),
            title: newTask.title,
            assignedTo: newTask.assignedTo,
            dueDate: newTask.dueDate || new Date().toISOString().split('T')[0],
            jobName: newTask.jobName,
            status: TaskStatus.PENDING,
            priority: TaskPriority.MEDIUM,
            createdAt: Date.now(),
            description: '',
            location: '',
            image: ''
        };

        setLocalTasks(prev => [task, ...prev]);
        setNewTask({ title: '', assignedTo: '', dueDate: '', jobName: '' });
        saveTask(task, true, orgId)
            .then(() => onRefresh())
            .catch(err => {
                alert(`Failed to save task: ${err.message}`);
                setLocalTasks(prev => prev.filter(t => t.id !== task.id));
            });
    };

    const handleDeleteTask = (id: string) => {
        if (window.confirm("Delete this task?")) {
            setLocalTasks(prev => prev.filter(t => t.id !== id));
            deleteTask(id)
                .then(() => onRefresh())
                .catch(err => {
                    alert(`Failed to delete task: ${err.message}`);
                    onRefresh();
                });
        }
    };

    const tabItems = [
        { id: 'live' as const, Icon: Sparkles, label: 'Live Activity' },
        { id: 'users' as const, Icon: User, label: 'Team' },
        { id: 'jobs' as const, Icon: Briefcase, label: 'Jobs' },
        { id: 'tasks' as const, Icon: LayoutList, label: 'Tasks' },
        { id: 'chat' as const, Icon: MessageCircle, label: 'Chat' },
    ];

    return (
        <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-10 px-4 h-16 flex items-center justify-between" style={{ boxShadow: '0 1px 12px rgba(15,23,42,0.08), 0 0.5px 0 rgba(234,88,12,0.15)' }}>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span className="bg-orange-600 text-white px-2.5 py-0.5 rounded-lg text-sm font-extrabold tracking-wide">ADMIN</span>
                    <span className="hidden sm:inline">Dashboard</span>
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onRefresh}
                        className="text-xs font-bold text-slate-500 border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition"
                    >
                        ↻ Refresh
                    </button>
                    <button
                        onClick={onLogout}
                        className="text-xs font-bold text-orange-600 border border-orange-200 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg transition"
                    >
                        Log Out
                    </button>
                    <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition">
                        <X size={20} />
                    </button>
                </div>
            </div>

            <div className="max-w-3xl mx-auto p-4 pb-20">

                {/* Tabs */}
                <div className="flex gap-1.5 mb-6 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                    {tabItems.map(({ id, Icon, label }) => (
                        <button
                            key={id}
                            onClick={() => setActiveTab(id)}
                            className={`flex-1 py-2.5 px-3 whitespace-nowrap rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === id
                                ? 'bg-slate-900 text-white shadow-md'
                                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                                }`}
                        >
                            <Icon size={16} /> <span className="hidden sm:inline">{label}</span>
                        </button>
                    ))}
                </div>

                {/* ═══════════ LIVE ACTIVITY TAB ═══════════ */}
                {activeTab === 'live' && (
                    <div className="space-y-6">
                        {/* Stats Row */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Clocked In</div>
                                <div className="text-3xl font-extrabold text-emerald-600 mt-1">{activeWorkers.length}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">active now</div>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Team Size</div>
                                <div className="text-3xl font-extrabold text-slate-900 mt-1">{users.length}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">employees</div>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Open Tasks</div>
                                <div className="text-3xl font-extrabold text-orange-600 mt-1">{pendingTasks}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">{completedToday} done</div>
                            </div>
                        </div>

                        {/* Active Workers */}
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
                                    Who's Working Now
                                </h3>
                            </div>
                            {activeWorkers.length === 0 ? (
                                <div className="bg-white rounded-xl p-8 text-center border border-slate-200 shadow-sm">
                                    <div className="text-slate-300 mb-2"><Clock size={32} className="mx-auto" /></div>
                                    <p className="text-slate-400 font-medium text-sm">No one is clocked in right now.</p>
                                    <p className="text-slate-300 text-xs mt-1">Active workers will appear here in real-time.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {activeWorkers.map(entry => {
                                        const jobDetails = jobs.find(j => j.name === entry.jobName);
                                        const userDetails = users.find(u => u.name === entry.userId);
                                        return (
                                            <div key={entry.id} className="bg-white p-4 rounded-xl shadow-md border-l-4 border-l-emerald-500 relative overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(16,185,129,0.08)' }}>
                                                <div className="absolute top-3 right-3 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-start gap-3">
                                                        <div className="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md flex-shrink-0">
                                                            {entry.userId.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-lg text-slate-900">{entry.userId}</div>
                                                            {entry.jobName && (
                                                                <div className="text-sm text-slate-600 mt-0.5 flex items-center gap-1.5 font-medium">
                                                                    <Briefcase size={13} className="text-orange-500" />{entry.jobName}
                                                                </div>
                                                            )}
                                                            {jobDetails?.address && (
                                                                <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                                                    <MapPin size={11} /> {jobDetails.address}
                                                                </div>
                                                            )}
                                                            {userDetails?.rate && (
                                                                <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1 font-semibold">
                                                                    <DollarSign size={11} /> ${userDetails.rate}/hr
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="text-right flex-shrink-0 ml-3">
                                                        <div className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg font-bold text-sm flex items-center gap-2 border border-emerald-100">
                                                            <Clock size={14} /><LiveTimer startTime={entry.startTime} />
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 mt-1.5 font-medium">
                                                            Since {new Date(entry.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Idle Team Members */}
                        {users.length > 0 && (
                            <div>
                                <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-slate-300 rounded-full"></span>
                                    Not Clocked In
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {users
                                        .filter(u => !activeWorkers.some(w => w.userId === u.name))
                                        .map(u => (
                                            <div key={u.id} className="bg-white px-3 py-2 rounded-lg border border-slate-200 flex items-center gap-2 shadow-sm">
                                                <div className="w-7 h-7 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center font-bold text-xs">{u.name.charAt(0)}</div>
                                                <div>
                                                    <div className="text-sm font-bold text-slate-600">{u.name}</div>
                                                    <div className="text-[10px] text-slate-400">${u.rate || '0'}/hr</div>
                                                </div>
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════ TASKS TAB ═══════════ */}
                {activeTab === 'tasks' && (
                    <div className="space-y-6">
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="font-bold text-sm text-slate-500 uppercase mb-3 flex items-center gap-2"><LayoutList size={14} /> Quick Add Task</h3>
                            <form onSubmit={handleAddTask} className="space-y-3">
                                <input type="text" placeholder="Task Title (e.g. Roof Inspection)" value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" required />
                                <div className="flex gap-2">
                                    <select value={newTask.assignedTo} onChange={e => setNewTask({ ...newTask, assignedTo: e.target.value })} className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500">
                                        <option value="">Unassigned</option>
                                        {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                                    </select>
                                    <select value={newTask.jobName} onChange={e => setNewTask({ ...newTask, jobName: e.target.value })} className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500">
                                        <option value="">No Job</option>
                                        {jobs.map(j => <option key={j.id} value={j.name}>{j.name}</option>)}
                                    </select>
                                </div>
                                <input type="date" value={newTask.dueDate} onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500" />
                                <button type="submit" className="w-full py-2.5 bg-slate-900 text-white font-bold rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-2 active:scale-[0.98] shadow-sm"><Plus size={16} /> Add Task</button>
                            </form>
                        </div>
                        <div className="space-y-2">
                            {localTasks.length === 0 ? (
                                <div className="bg-white rounded-xl p-8 text-center border border-slate-200 shadow-sm">
                                    <p className="text-slate-400 font-medium text-sm">No tasks yet. Add your first task above.</p>
                                </div>
                            ) : localTasks.map(task => (
                                <div key={task.id} className={`bg-white p-3.5 rounded-xl border flex justify-between items-center shadow-sm transition-all hover:shadow-md ${task.status === TaskStatus.COMPLETED ? 'border-slate-100 opacity-60' : 'border-slate-200 border-l-4 border-l-orange-500'}`}>
                                    <div className="flex-1 min-w-0">
                                        <div className={`font-bold text-sm ${task.status === TaskStatus.COMPLETED ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.title}</div>
                                        <div className="text-xs text-slate-400 flex gap-2 mt-1 flex-wrap">
                                            {task.assignedTo && <span className="bg-slate-100 px-1.5 py-0.5 rounded font-medium">{task.assignedTo}</span>}
                                            {task.jobName && <span className="bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded font-medium">{task.jobName}</span>}
                                            {task.dueDate && <span className="flex items-center gap-1"><Calendar size={10} /> {task.dueDate}</span>}
                                        </div>
                                    </div>
                                    <button onClick={() => handleDeleteTask(task.id)} className="text-slate-300 hover:text-red-500 p-2 transition flex-shrink-0"><Trash size={18} /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ═══════════ TEAM / USERS TAB ═══════════ */}
                {activeTab === 'users' && (
                    <div className="space-y-6">
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="font-bold text-sm text-slate-500 uppercase mb-4 flex items-center gap-2"><User size={14} /> Add Team Member</h3>
                            <form onSubmit={handleAddUser} className="space-y-3">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Full Name</label>
                                    <input type="text" placeholder="e.g. John Smith" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" required />
                                </div>
                                <div className="flex gap-3">
                                    <div className="flex-1">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1"><DollarSign size={10} /> Hourly Rate</label>
                                        <input type="number" step="0.01" placeholder="25.00" value={newUser.rate} onChange={e => setNewUser({ ...newUser, rate: e.target.value })} className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                                    </div>
                                    <div className="w-32">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1"><Lock size={10} /> Login PIN <span className="text-red-500">*</span></label>
                                        <input type="text" inputMode="numeric" maxLength={4} placeholder="e.g. 1234" required value={newUser.pin} onChange={e => setNewUser({ ...newUser, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-center tracking-[0.3em] focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                                        <p className="text-[10px] text-slate-400 mt-1">Employee uses this to log in</p>
                                    </div>
                                </div>
                                <button type="submit" className="w-full py-2.5 bg-slate-900 text-white font-bold rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-2 active:scale-[0.98] shadow-sm"><Plus size={16} /> Add Employee</button>
                            </form>
                        </div>

                        {/* Employee List */}
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-bold text-slate-700 text-sm">{localUsers.length} Team Member{localUsers.length !== 1 ? 's' : ''}</h3>
                            </div>
                            <div className="space-y-2">
                                {localUsers.length === 0 ? (
                                    <div className="bg-white rounded-xl p-8 text-center border border-slate-200 shadow-sm">
                                        <div className="text-slate-300 mb-2"><User size={32} className="mx-auto" /></div>
                                        <p className="text-slate-400 font-medium text-sm">No employees yet.</p>
                                        <p className="text-slate-300 text-xs mt-1">Add your first team member above.</p>
                                    </div>
                                ) :
                                    localUsers.map(user => {
                                        const isActive = activeWorkers.some(w => w.userId === user.name);
                                        return (
                                            <div key={user.id} className={`bg-white p-3.5 rounded-xl border flex justify-between items-center shadow-sm transition-all hover:shadow-md ${isActive ? 'border-l-4 border-l-emerald-500 border-emerald-100' : 'border-slate-200'}`}>
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm ${isActive ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                                        {user.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-800 flex items-center gap-2">
                                                            {user.name}
                                                            {isActive && <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide">Active</span>}
                                                        </div>
                                                        <div className="flex items-center gap-3 mt-0.5">
                                                            <span className="text-xs text-emerald-600 font-bold flex items-center gap-0.5">
                                                                <DollarSign size={11} />{user.rate || '0'}/hr
                                                            </span>
                                                            {user.pin && (
                                                                <span className="text-xs text-slate-400 flex items-center gap-0.5">
                                                                    <Lock size={10} /> PIN: ••••
                                                                </span>
                                                            )}
                                                            {user.role === 'admin' && (
                                                                <span className="text-[9px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full uppercase">Admin</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleDeleteUser(user.id)} className="text-slate-300 hover:text-red-500 p-2 transition"><Trash size={18} /></button>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════════ JOBS TAB ═══════════ */}
                {activeTab === 'jobs' && (
                    <div className="space-y-6">
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="font-bold text-sm text-slate-500 uppercase mb-4 flex items-center gap-2"><Briefcase size={14} /> Add Active Job</h3>
                            <form onSubmit={handleAddJob} className="space-y-3">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Job Name / Customer</label>
                                    <input type="text" placeholder="e.g. Smith Residence" value={newJob.name} onChange={e => setNewJob({ ...newJob, name: e.target.value })} className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" required />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1"><MapPin size={10} /> Address / Location</label>
                                    <input type="text" placeholder="123 Main St, City, State" value={newJob.address} onChange={e => setNewJob({ ...newJob, address: e.target.value })} className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                                </div>
                                <button type="submit" className="w-full py-2.5 bg-slate-900 text-white font-bold rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-2 active:scale-[0.98] shadow-sm"><Plus size={16} /> Add Job</button>
                            </form>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-bold text-slate-700 text-sm">{localJobs.length} Active Job{localJobs.length !== 1 ? 's' : ''}</h3>
                            </div>
                            <div className="space-y-2">
                                {localJobs.length === 0 ? (
                                    <div className="bg-white rounded-xl p-8 text-center border border-slate-200 shadow-sm">
                                        <div className="text-slate-300 mb-2"><Briefcase size={32} className="mx-auto" /></div>
                                        <p className="text-slate-400 font-medium text-sm">No active jobs.</p>
                                        <p className="text-slate-300 text-xs mt-1">Add a job to assign to employees and tasks.</p>
                                    </div>
                                ) :
                                    localJobs.map(job => {
                                        const workersOnJob = activeWorkers.filter(w => w.jobName === job.name);
                                        return (
                                            <div key={job.id} className={`bg-white p-3.5 rounded-xl border flex justify-between items-center shadow-sm transition-all hover:shadow-md ${workersOnJob.length > 0 ? 'border-l-4 border-l-orange-500 border-orange-100' : 'border-slate-200'}`}>
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-sm ${workersOnJob.length > 0 ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-400'}`}>
                                                        <Briefcase size={18} />
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-800 flex items-center gap-2">
                                                            {job.name}
                                                            {workersOnJob.length > 0 && <span className="text-[9px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full uppercase tracking-wide">{workersOnJob.length} crew</span>}
                                                        </div>
                                                        <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><MapPin size={10} /> {job.address || 'No address'}</div>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleDeleteJob(job.id)} className="text-slate-300 hover:text-red-500 p-2 transition"><Trash size={18} /></button>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════════ CHAT TAB ═══════════ */}
                {activeTab === 'chat' && (
                    <div className="-mx-4 -mt-4">
                        <ChatView messages={messages} currentUserName={currentUserName} />
                    </div>
                )}

            </div>
        </div>
    );
};

export default AdminView;
