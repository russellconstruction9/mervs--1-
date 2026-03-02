
import React, { useEffect, useState, useCallback } from 'react';
import { fetchTasks, saveTask, deleteTask, fetchTimeEntries, saveTimeEntry, fetchMessages, sendMessage, syncPendingTimeEntries, fetchUsers, fetchJobs } from './services/sheetService';
import { Task, TaskStatus, TimeEntry, ViewType, ChatMessage, UserProfile, JobOption } from './types';
import TaskModal from './components/TaskModal';
import DayModal from './components/DayModal';
import LoginView from './components/LoginView';
import AdminLoginView from './components/AdminLoginView';
import ChatView from './components/ChatView';
import TimeClockView from './components/TimeClockView';
import AdminView from './components/AdminView';
import { CalendarView } from './components/CalendarView';
import { Plus, Search, Calendar, CheckCircle, AlertTriangle, Trash, RotateCcw, Bell, LayoutList, Clock, MapPin, MessageCircle, User, Download, Briefcase, ShieldCheck } from './components/Icons';
import { parseDescription, serializeDescription } from './utils/checklist';
import { IOSInstallPrompt } from './components/IOSInstallPrompt';
import { subscribeUserToPush } from './services/pushService';

// Helper to prevent unnecessary state updates
const hasDataChanged = (prev: any[], next: any[]) => {
    if (prev.length !== next.length) return true;
    return JSON.stringify(prev) !== JSON.stringify(next);
};

const App: React.FC = () => {
    // Navigation State
    const [currentView, setCurrentView] = useState<ViewType>('tasks');

    // Data State
    const [tasks, setTasks] = useState<Task[]>([]);
    const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    // Admin Data
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [jobs, setJobs] = useState<JobOption[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [taskFilter, setTaskFilter] = useState<'active' | 'completed'>('active');
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);

    // User Authentication State
    const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
    // Admin Authentication State (separate from regular user auth)
    const [currentAdmin, setCurrentAdmin] = useState<string | null>(null);
    // Whether admin has ever completed company setup
    const [isAdminConfigured, setIsAdminConfigured] = useState<boolean>(
        () => !!localStorage.getItem('truchoice_admin_creds')
    );
    // Whether to show admin login screen over the employee login
    const [showAdminLogin, setShowAdminLogin] = useState(false);

    // Modal State
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);

    // Day View State
    const [isDayModalOpen, setIsDayModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    // Date State for new items
    const [newItemDate, setNewItemDate] = useState<string | undefined>(undefined);

    // Desktop Install State
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

    // Check for persistent login
    useEffect(() => {
        const storedUser = localStorage.getItem('truchoice_user');
        if (storedUser) {
            try {
                setCurrentUser(JSON.parse(storedUser));
            } catch (e) {
                console.error("Failed to parse stored user", e);
            }
        }
        const storedAdmin = localStorage.getItem('truchoice_admin');
        if (storedAdmin) {
            setCurrentAdmin(storedAdmin);
        }
    }, []);

    const handleAdminLogin = (username: string) => {
        localStorage.setItem('truchoice_admin', username);
        setCurrentAdmin(username);
        setIsAdminConfigured(true);
        setShowAdminLogin(false);
        // Create a synthetic admin user profile so the main app renders properly
        if (!currentUser) {
            const adminProfile: UserProfile = { id: 'admin_user', name: username, rate: '0', role: 'admin' };
            setCurrentUser(adminProfile);
            localStorage.setItem('truchoice_user', JSON.stringify(adminProfile));
        }
    };

    const handleAdminLogout = () => {
        localStorage.removeItem('truchoice_admin');
        setCurrentAdmin(null);
        setShowAdminLogin(false);
        // If the current user was the synthetic admin profile, log them out too
        if (currentUser?.id === 'admin_user') {
            localStorage.removeItem('truchoice_user');
            setCurrentUser(null);
        }
    };

    const loadData = useCallback(async (isBackground = false) => {
        if (!isBackground) setIsLoading(true);

        try {
            // Fetch core data (Tasks, TimeEntries, Users, Jobs)
            const [taskData, timeData, userData, jobData] = await Promise.all([
                fetchTasks(),
                fetchTimeEntries(),
                fetchUsers(),
                fetchJobs()
            ]);

            // Sort Tasks: Pending/In Progress first
            const sortedTasks = taskData.sort((a, b) => {
                if (a.status === TaskStatus.COMPLETED && b.status !== TaskStatus.COMPLETED) return 1;
                if (a.status !== TaskStatus.COMPLETED && b.status === TaskStatus.COMPLETED) return -1;
                return b.createdAt - a.createdAt;
            });

            // Smart State Updates (only if changed)
            setTasks(prev => hasDataChanged(prev, sortedTasks) ? sortedTasks : prev);
            setTimeEntries(prev => hasDataChanged(prev, timeData) ? timeData : prev);
            setUsers(prev => hasDataChanged(prev, userData) ? userData : prev);
            setJobs(prev => hasDataChanged(prev, jobData) ? jobData : prev);

            // Fetch Messages if in chat view (to keep it fresh)
            if (currentView === 'chat') {
                const msgs = await fetchMessages();
                setMessages(prev => hasDataChanged(prev, msgs) ? msgs : prev);
            }

            checkDueTasks(sortedTasks);
        } catch (e) {
            console.error("Failed to load data", e);
        } finally {
            if (!isBackground) setIsLoading(false);
        }
    }, [currentView]);

    useEffect(() => {
        if (!currentUser) return;

        loadData(false);
        // Polling interval
        const intervalId = setInterval(() => {
            if (document.visibilityState === 'visible') {
                if (currentView === 'chat') {
                    // Fast poll for chat
                    fetchMessages().then(msgs => {
                        setMessages(prev => hasDataChanged(prev, msgs) ? msgs : prev);
                    }).catch(console.warn);
                } else {
                    // Slow poll for other data
                    loadData(true);
                }
            }
        }, currentView === 'chat' ? 4000 : 30000); // 4s for chat, 30s for rest

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') loadData(true);
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        if ('Notification' in window && Notification.permission === 'granted') {
            setNotificationsEnabled(true);
        }

        const handleBeforeInstallPrompt = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, [loadData, currentView, currentUser]);

    const handleEnableNotifications = async () => {
        if (!currentUser) return;
        const success = await subscribeUserToPush(currentUser.name);
        if (success) {
            setNotificationsEnabled(true);
            alert("Success! You will now receive alerts for chat messages and new tasks.");
        }
    };

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setDeferredPrompt(null);
        }
    };

    const checkDueTasks = (currentTasks: Task[]) => {
        if (Notification.permission !== 'granted') return;
        const today = new Date().toISOString().split('T')[0];
        const dueToday = currentTasks.filter(t => t.dueDate === today && t.status !== TaskStatus.COMPLETED);
        const lastCount = parseInt(localStorage.getItem('last_notified_count') || '0');

        if (dueToday.length > 0 && dueToday.length !== lastCount) {
            new Notification("Tasks Due Today", {
                body: `You have ${dueToday.length} tasks due today.`,
                icon: 'https://cdn-icons-png.flaticon.com/512/2965/2965359.png'
            });
            localStorage.setItem('last_notified_count', dueToday.length.toString());
        }
    };

    // --- Task Handlers ---
    const handleSaveTask = async (task: Task) => {
        const isNew = !editingTask;
        if (isNew) setTasks(prev => [task, ...prev]);
        else setTasks(prev => prev.map(t => t.id === task.id ? task : t));
        setIsTaskModalOpen(false);
        try {
            await saveTask(task, isNew);
        } catch (error) {
            alert("Synced task locally, but failed to sync to server. Will retry next time.");
        }
    };

    const handleDeleteTask = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (window.confirm('Delete this task?')) {
            setTasks(prev => prev.filter(t => t.id !== id));
            try {
                await deleteTask(id);
            } catch (error) {
                console.error("Failed to delete remote task", error);
            }
        }
    };

    const handleToggleChecklistItem = async (e: React.MouseEvent, task: Task, indexToToggle: number) => {
        e.stopPropagation();

        const { notes, items } = parseDescription(task.description);
        if (!items[indexToToggle]) return;

        const updatedItems = items.map((item, idx) =>
            idx === indexToToggle ? { ...item, checked: !item.checked } : item
        );

        const newDescription = serializeDescription(notes, updatedItems);

        let newStatus = task.status;
        if (newStatus === TaskStatus.COMPLETED && updatedItems.some(i => !i.checked)) {
            newStatus = TaskStatus.IN_PROGRESS;
        }

        const updatedTask = { ...task, description: newDescription, status: newStatus };
        setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));

        try {
            await saveTask(updatedTask, false);
        } catch (e) {
            console.error("Failed to sync checklist item", e);
        }
    };

    const handleToggleTaskComplete = async (e: React.MouseEvent, task: Task) => {
        e.stopPropagation();
        const isCompleting = task.status !== TaskStatus.COMPLETED;
        const newStatus = isCompleting ? TaskStatus.COMPLETED : TaskStatus.IN_PROGRESS;
        let updatedDescription = task.description;
        if (isCompleting) {
            const { notes, items } = parseDescription(task.description);
            if (items.length > 0) {
                const completedItems = items.map(item => ({ ...item, checked: true }));
                updatedDescription = serializeDescription(notes, completedItems);
            }
        }
        const updatedTask = { ...task, status: newStatus, description: updatedDescription };
        setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
        try {
            await saveTask(updatedTask, false);
        } catch (e) {
            console.error("Failed to sync status update", e);
        }
    };

    // --- Time Clock Handlers ---
    const handleTimeEntryOptimisticUpdate = (updatedEntry: TimeEntry) => {
        setTimeEntries(prev => {
            const index = prev.findIndex(e => e.id === updatedEntry.id);
            let newArr;
            if (index > -1) {
                newArr = [...prev];
                newArr[index] = updatedEntry;
            } else {
                newArr = [updatedEntry, ...prev];
            }
            return newArr.sort((a, b) => b.startTime - a.startTime);
        });
        syncPendingTimeEntries().catch(console.error);
    };

    // --- Day View Handlers ---
    const handleDayClick = (date: string) => {
        setSelectedDate(date);
        setIsDayModalOpen(true);
    };

    const handleAddTaskForDate = () => {
        if (selectedDate) setNewItemDate(selectedDate);
        setIsDayModalOpen(false);
        setEditingTask(null);
        setIsTaskModalOpen(true);
    };

    const handleEditTaskFromDay = (task: Task) => {
        setIsDayModalOpen(false);
        setEditingTask(task);
        setIsTaskModalOpen(true);
    };

    // --- Filters ---
    const filteredTasks = tasks.filter(task => {
        const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            task.assignedTo.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (task.jobName || '').toLowerCase().includes(searchTerm.toLowerCase());
        const isCompleted = task.status === TaskStatus.COMPLETED;
        if (taskFilter === 'active' && isCompleted) return false;
        if (taskFilter === 'completed' && !isCompleted) return false;
        return matchesSearch;
    });

    // --- RENDER LOGIN IF NOT AUTHENTICATED ---
    if (!currentUser && !currentAdmin) {
        if (!isAdminConfigured || showAdminLogin) {
            return (
                <AdminLoginView
                    onLogin={handleAdminLogin}
                    onBack={isAdminConfigured ? () => setShowAdminLogin(false) : undefined}
                />
            );
        }
        return <LoginView onLogin={setCurrentUser} onAdminAccess={() => setShowAdminLogin(true)} />;
    }

    return (
        <div className="min-h-screen bg-slate-100 text-slate-800 font-sans pb-24">
            <IOSInstallPrompt />

            {/* Header */}
            <header className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 shadow-md safe-top" style={{ boxShadow: '0 1px 12px rgba(15,23,42,0.08), 0 0.5px 0 rgba(234,88,12,0.15)"' }}>
                <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2 select-none">
                        <div className="flex flex-col items-center">
                            <svg viewBox="0 0 260 88" className="h-12 w-auto">
                                <path d="M10 28 L20 38 L40 8" fill="none" stroke="#ea580c" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                                <text x="50" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#ea580c">Tru</text>
                                <text x="110" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#0f172a">C</text>
                                <text x="136" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#0f172a">h</text>
                                <path d="M136 12 L146 2 L156 12" fill="none" stroke="#0f172a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                                <text x="160" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#0f172a">o</text>
                                <rect x="187" y="20" width="6" height="20" fill="#0f172a" />
                                <rect x="187" y="10" width="6" height="6" fill="#ea580c" />
                                <text x="198" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#0f172a">ce</text>
                                <text x="110" y="62" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="11" style={{ letterSpacing: '0.1em' }} fill="#0f172a">ROOFING</text>
                                <text x="110" y="78" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="11" style={{ letterSpacing: '0.08em' }} fill="#ea580c">PRODUCTION</text>
                            </svg>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {deferredPrompt && (
                            <button
                                onClick={handleInstallClick}
                                className="p-2 text-white bg-slate-900 hover:bg-orange-600 rounded-lg shadow-md transition-colors mr-1"
                                title="Install App"
                            >
                                <Download size={20} />
                            </button>
                        )}

                        {/* Admin Toggle removed - Admin now has its own nav tab */}

                        <button
                            onClick={handleEnableNotifications}
                            className={`p-2 transition-colors ${notificationsEnabled ? 'text-orange-600' : 'text-slate-400 hover:text-slate-800'}`}
                        >
                            <Bell size={20} fill={notificationsEnabled ? "currentColor" : "none"} />
                        </button>

                        {/* User Avatar */}
                        <div className="w-9 h-9 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md">
                            {currentUser.name.charAt(0)}
                        </div>

                        {currentView === 'tasks' && (
                            <button onClick={() => { setEditingTask(null); setNewItemDate(undefined); setIsTaskModalOpen(true); }} className="bg-slate-900 text-white p-2 rounded-lg shadow-md">
                                <Plus size={20} />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-3xl mx-auto px-4 py-6">

                {/* VIEW: TASKS */}
                {currentView === 'tasks' && (
                    <>
                        {/* Search & Tabs */}
                        <div className="mb-6 space-y-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input type="text" placeholder="Search tasks..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:border-orange-500 focus:outline-none shadow-sm" />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setTaskFilter('active')} className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${taskFilter === 'active' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border'}`}>Active</button>
                                <button onClick={() => setTaskFilter('completed')} className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${taskFilter === 'completed' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border'}`}>Completed</button>
                            </div>
                        </div>

                        {/* List */}
                        <div className="space-y-4">
                            {filteredTasks.map(task => {
                                const { items } = parseDescription(task.description);
                                const isDone = task.status === TaskStatus.COMPLETED;
                                return (
                                    <div key={task.id} onClick={() => { setEditingTask(task); setIsTaskModalOpen(true); }}
                                        className={`bg-white rounded-xl border-0 p-4 cursor-pointer transition-all relative overflow-hidden card-hover
                               ${isDone
                                                ? 'opacity-60 shadow-sm border-l-4 border-l-slate-200'
                                                : task.priority === 'Critical'
                                                    ? 'shadow-md hover:shadow-xl border-l-4 border-l-red-500'
                                                    : 'shadow-md hover:shadow-xl border-l-4 border-l-orange-500'
                                            }`
                                        }
                                        style={isDone ? {} : { boxShadow: '0 2px 12px rgba(15,23,42,0.07)' }}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex gap-2 items-center flex-wrap">
                                                <span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full tracking-wide">{task.assignedTo || 'Unassigned'}</span>
                                                {task.jobName && (
                                                    <span className="text-[10px] font-bold uppercase bg-orange-50 text-orange-600 px-2.5 py-0.5 rounded-full flex items-center gap-1 tracking-wide">
                                                        <Briefcase size={10} /> {task.jobName}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex gap-0.5">
                                                <button onClick={(e) => handleToggleTaskComplete(e, task)} className="text-slate-300 hover:text-emerald-500 p-1.5 rounded-lg hover:bg-emerald-50">{isDone ? <RotateCcw size={15} /> : <CheckCircle size={15} />}</button>
                                                <button onClick={(e) => handleDeleteTask(e, task.id)} className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50"><Trash size={15} /></button>
                                            </div>
                                        </div>
                                        <h3 className={`font-bold mb-2 ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.title || "Untitled"}</h3>
                                        <div className="flex items-center gap-3 text-xs text-slate-400">
                                            {task.dueDate && <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-0.5 rounded-full"><Calendar size={11} /> {task.dueDate}</span>}
                                            {task.priority === 'Critical' && <span className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-0.5 rounded-full font-semibold"><AlertTriangle size={11} /> Critical</span>}
                                        </div>

                                        {items.length > 0 && (
                                            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                                                {items.slice(0, 5).map((item, idx) => (
                                                    <div
                                                        key={idx}
                                                        onClick={(e) => handleToggleChecklistItem(e, task, idx)}
                                                        className="flex items-start gap-2 cursor-pointer group"
                                                    >
                                                        <div className={`mt-0.5 w-4 h-4 rounded-md border flex-shrink-0 flex items-center justify-center transition-all ${item.checked ? 'bg-orange-500 border-orange-500 shadow-sm shadow-orange-200' : 'border-slate-300 bg-white group-hover:border-orange-400 group-hover:bg-orange-50'}`}>
                                                            {item.checked && <CheckCircle size={10} className="text-white" strokeWidth={4} />}
                                                        </div>
                                                        <span className={`text-xs leading-5 ${item.checked ? 'line-through text-slate-400' : 'text-slate-600 group-hover:text-slate-900'}`}>
                                                            {item.text}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                {/* VIEW: TIME CLOCK */}
                {currentView === 'timeclock' && (
                    <TimeClockView
                        timeEntries={timeEntries}
                        userName={currentUser.name}
                        hourlyRate={currentUser.rate}
                        availableJobs={jobs}
                        onRefresh={() => loadData(true)}
                        onOptimisticUpdate={handleTimeEntryOptimisticUpdate}
                    />
                )}

                {/* VIEW: CALENDAR */}
                {currentView === 'calendar' && (
                    <CalendarView
                        tasks={tasks}
                        onTaskClick={(t) => { setEditingTask(t); setIsTaskModalOpen(true); }}
                        onDayClick={handleDayClick}
                    />
                )}

                {/* VIEW: CHAT */}
                {currentView === 'chat' && (
                    <ChatView
                        messages={messages}
                        currentUserName={currentUser.name}
                    />
                )}

            </main>

            {/* Bottom Navigation */}
            <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-200/80 pb-safe z-40" style={{ boxShadow: '0 -4px 20px rgba(15,23,42,0.06)' }}>
                <div className="max-w-3xl mx-auto flex justify-around">
                    {(
                        [
                            { view: 'tasks' as const, Icon: LayoutList, label: 'Tasks' },
                            { view: 'timeclock' as const, Icon: Clock, label: 'Time' },
                            { view: 'chat' as const, Icon: MessageCircle, label: 'Chat' },
                            { view: 'calendar' as const, Icon: Calendar, label: 'Calendar' },
                            { view: 'admin' as const, Icon: ShieldCheck, label: 'Admin' },
                        ]
                    ).map(({ view, Icon, label }) => {
                        const isActive = currentView === view;
                        return (
                            <button key={view} onClick={() => setCurrentView(view)}
                                className={`relative flex flex-col items-center py-2.5 px-4 transition-all ${isActive
                                    ? 'text-orange-600'
                                    : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                {isActive && (
                                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full bg-orange-500" />
                                )}
                                <span className={`transition-transform duration-150 ${isActive ? 'scale-110' : 'scale-100'}`}>
                                    <Icon size={22} strokeWidth={isActive ? 2.5 : 1.75} />
                                </span>
                                <span className={`text-[10px] font-bold mt-1 transition-all ${isActive ? 'opacity-100' : 'opacity-60'}`}>{label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <TaskModal
                isOpen={isTaskModalOpen}
                onClose={() => setIsTaskModalOpen(false)}
                onSave={handleSaveTask}
                task={editingTask}
                initialDate={newItemDate}
                availableJobs={jobs}
            />

            {/* Admin View — either login or dashboard, shown as full-page overlay */}
            {currentView === 'admin' && (
                currentAdmin ? (
                    <AdminView
                        users={users}
                        jobs={jobs}
                        timeEntries={timeEntries}
                        tasks={tasks}
                        onRefresh={() => loadData(true)}
                        onClose={() => setCurrentView('tasks')}
                        onLogout={handleAdminLogout}
                    />
                ) : (
                    <AdminLoginView onLogin={handleAdminLogin} />
                )
            )}

            {isDayModalOpen && (
                <DayModal
                    date={selectedDate || ''}
                    tasks={tasks.filter(t => t.dueDate === selectedDate && t.status !== TaskStatus.COMPLETED)}
                    onClose={() => setIsDayModalOpen(false)}
                    onEditTask={handleEditTaskFromDay}
                    onAddTask={handleAddTaskForDate}
                />
            )}

            {/* Spacer for bottom nav */}
            <div className="h-16" />
        </div>
    );
};

export default App;
