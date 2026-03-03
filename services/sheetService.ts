
import { supabase } from './supabaseClient';
import { Task, TaskPriority, TaskStatus, TimeEntry, ChatMessage, UserProfile, JobOption } from '../types';

// --- IMAGE UTILS ---

export const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const MAX_SIZE = 800;
            if (width > height) {
                if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
            } else {
                if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            } else {
                resolve(base64Str);
            }
        };
        img.onerror = () => resolve(base64Str);
    });
};

// --- AUTH ---

export const apiLogin = async (name: string, pin: string): Promise<UserProfile> => {
    // Derive email from the name using the internal pattern
    const email = `${name.trim().toLowerCase().replace(/\s+/g, '.')}@truchoice.local`;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pin });
    if (error || !data.user) throw new Error('Invalid name or PIN. Please try again.');

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

    if (profileError || !profile) throw new Error('User profile not found.');

    return {
        id: profile.id,
        name: profile.name,
        rate: profile.rate?.toString() ?? '0',
        role: profile.role as 'admin' | 'user',
    };
};

export const apiSignup = async (name: string, pin: string, rate: string): Promise<UserProfile> => {
    const email = `${name.trim().toLowerCase().replace(/\s+/g, '.')}@truchoice.local`;

    const { data, error } = await supabase.auth.signUp({
        email,
        password: pin,
        options: {
            data: { name: name.trim(), rate: parseFloat(rate) || 0, role: 'user' }
        }
    });

    if (error || !data.user) throw new Error(error?.message || 'Signup failed');

    return {
        id: data.user.id,
        name: name.trim(),
        rate,
        role: 'user',
    };
};

export const apiAdminLogin = async (email: string, password: string): Promise<UserProfile> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new Error('Invalid username or password.');

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

    if (profileError || !profile) throw new Error('Admin profile not found.');
    if (profile.role !== 'admin') throw new Error('Access denied. This account is not an administrator.');

    return {
        id: profile.id,
        name: profile.name,
        rate: profile.rate?.toString() ?? '0',
        role: 'admin',
    };
};

export const apiLogout = async () => {
    await supabase.auth.signOut();
};

export const getSessionUser = async (): Promise<UserProfile | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (!profile) return null;

    return {
        id: profile.id,
        name: profile.name,
        rate: profile.rate?.toString() ?? '0',
        role: profile.role as 'admin' | 'user',
    };
};

// --- TASKS ---

export const fetchTasks = async (): Promise<Task[]> => {
    const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.warn('fetchTasks error:', error.message);
        const local = localStorage.getItem('sitecommand_tasks');
        return local ? JSON.parse(local) : [];
    }

    const tasks = (data || []).map(row => ({
        id: row.id,
        title: row.title,
        description: row.description ?? '',
        location: row.location ?? '',
        assignedTo: row.assigned_to ?? '',
        dueDate: row.due_date ?? '',
        priority: (row.priority ?? 'Medium') as TaskPriority,
        status: (row.status ?? 'Pending') as TaskStatus,
        createdAt: row.created_at ?? Date.now(),
        image: row.image ?? undefined,
        jobName: row.job_name ?? undefined,
    }));

    localStorage.setItem('sitecommand_tasks', JSON.stringify(tasks));
    return tasks;
};

export const saveTask = async (task: Task, isNew: boolean): Promise<Task> => {
    const row = {
        id: task.id,
        title: task.title,
        description: task.description,
        location: task.location,
        assigned_to: task.assignedTo,
        due_date: task.dueDate || null,
        priority: task.priority,
        status: task.status,
        created_at: task.createdAt,
        image: task.image ?? null,
        job_name: task.jobName ?? null,
    };

    const { error } = await supabase.from('tasks').upsert(row);
    if (error) throw new Error(error.message);
    return task;
};

export const deleteTask = async (taskId: string): Promise<void> => {
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) throw new Error(error.message);
};

// --- TIME CLOCK (OFFLINE-FIRST) ---

const TIME_LOCAL_KEY = 'sitecommand_timeentries';

export const fetchTimeEntries = async (): Promise<TimeEntry[]> => {
    const localRaw = localStorage.getItem(TIME_LOCAL_KEY);
    const localData: TimeEntry[] = localRaw ? JSON.parse(localRaw) : [];
    const unsyncedItems = localData.filter(e => e.isSynced === false);

    try {
        const { data, error } = await supabase
            .from('time_entries')
            .select('*')
            .order('start_time', { ascending: false });

        if (error) throw error;

        const serverData: TimeEntry[] = (data || []).map(row => ({
            id: row.id,
            userId: row.user_name ?? row.user_id ?? '',
            startTime: row.start_time,
            endTime: row.end_time ?? null,
            status: row.status as 'active' | 'completed',
            jobName: row.job_name ?? undefined,
            notes: row.notes ?? undefined,
            totalPay: row.total_pay ?? undefined,
            isSynced: true,
        }));

        const serverMap = new Map<string, TimeEntry>(serverData.map(e => [e.id, e]));
        unsyncedItems.forEach(u => serverMap.set(u.id, u));
        const merged = Array.from(serverMap.values()).sort((a, b) => b.startTime - a.startTime);
        localStorage.setItem(TIME_LOCAL_KEY, JSON.stringify(merged));
        return merged;
    } catch (e) {
        console.warn('fetchTimeEntries fallback to local:', e);
        return localData;
    }
};

export const saveTimeEntryLocal = async (entry: TimeEntry): Promise<TimeEntry> => {
    const current: TimeEntry[] = JSON.parse(localStorage.getItem(TIME_LOCAL_KEY) || '[]');
    const dirty = { ...entry, isSynced: false };
    const idx = current.findIndex(e => e.id === entry.id);
    const updated = idx > -1
        ? current.map((e, i) => i === idx ? dirty : e)
        : [dirty, ...current];
    localStorage.setItem(TIME_LOCAL_KEY, JSON.stringify(updated));
    return dirty;
};

export const syncPendingTimeEntries = async (): Promise<number> => {
    const current: TimeEntry[] = JSON.parse(localStorage.getItem(TIME_LOCAL_KEY) || '[]');
    const pending = current.filter(e => e.isSynced === false);
    if (pending.length === 0) return 0;

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;

    const rows = pending.map(e => ({
        id: e.id,
        user_id: userId,
        user_name: e.userId,
        start_time: e.startTime,
        end_time: e.endTime ?? null,
        status: e.status,
        job_name: e.jobName ?? null,
        notes: e.notes ?? null,
        total_pay: e.totalPay ?? null,
        is_synced: true,
    }));

    const { error } = await supabase.from('time_entries').upsert(rows);
    if (error) throw new Error(error.message);

    const pendingIds = new Set(pending.map(e => e.id));
    const synced = current.map(e => pendingIds.has(e.id) ? { ...e, isSynced: true } : e);
    localStorage.setItem(TIME_LOCAL_KEY, JSON.stringify(synced));
    return pending.length;
};

export const saveTimeEntry = async (entry: TimeEntry, _isNew: boolean): Promise<TimeEntry> => {
    const saved = await saveTimeEntryLocal(entry);
    syncPendingTimeEntries().catch(console.error);
    return saved;
};

// --- CHAT ---

export const fetchMessages = async (): Promise<ChatMessage[]> => {
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('timestamp', { ascending: true })
        .limit(100);

    if (error) {
        console.warn('fetchMessages error:', error.message);
        return [];
    }

    return (data || []).map(row => ({
        id: row.id,
        sender: row.sender,
        text: row.text,
        timestamp: row.timestamp,
        image: row.image ?? undefined,
        status: 'sent' as const,
    }));
};

export const sendMessage = async (message: ChatMessage): Promise<ChatMessage> => {
    if (message.image) {
        try { message.image = await compressImage(message.image); } catch { /* keep raw */ }
    }

    const { error } = await supabase.from('messages').insert({
        id: message.id,
        sender: message.sender,
        text: message.text,
        timestamp: message.timestamp,
        image: message.image ?? null,
    });

    if (error) throw new Error(error.message);
    return { ...message, status: 'sent' };
};

// --- ADMIN: USERS ---

export const fetchUsers = async (): Promise<UserProfile[]> => {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('name');

    if (error) {
        console.warn('fetchUsers error:', error.message);
        return [];
    }

    return (data || []).map(row => ({
        id: row.id,
        name: row.name,
        rate: row.rate?.toString() ?? '0',
        role: row.role as 'admin' | 'user',
    }));
};

export const saveUser = async (user: UserProfile, isNew: boolean): Promise<UserProfile> => {
    if (isNew) {
        // Create via Supabase Auth so the trigger auto-creates the profile
        const result = await apiSignup(user.name, user.pin ?? '0000', user.rate ?? '0');
        // Then update role if admin
        if (user.role === 'admin') {
            await supabase.from('profiles').update({ role: 'admin' }).eq('id', result.id);
        }
        return { ...result, role: user.role };
    }

    const { error } = await supabase
        .from('profiles')
        .update({ name: user.name, rate: parseFloat(user.rate ?? '0'), role: user.role })
        .eq('id', user.id);

    if (error) throw new Error(error.message);
    return user;
};

export const deleteUser = async (id: string): Promise<void> => {
    // Deleting from profiles cascades via RLS; auth.users deletion requires admin API
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) throw new Error(error.message);
};

// --- ADMIN: JOBS ---

export const fetchJobs = async (): Promise<JobOption[]> => {
    const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('name');

    if (error) {
        console.warn('fetchJobs error:', error.message);
        const local = localStorage.getItem('sitecommand_jobs');
        return local ? JSON.parse(local) : [];
    }

    const jobs = (data || []).map(row => ({
        id: row.id,
        name: row.name,
        address: row.address ?? '',
        active: row.active ?? true,
    }));

    localStorage.setItem('sitecommand_jobs', JSON.stringify(jobs));
    return jobs;
};

export const saveJob = async (job: JobOption, _isNew: boolean): Promise<JobOption> => {
    const { error } = await supabase.from('jobs').upsert({
        id: job.id,
        name: job.name,
        address: job.address ?? '',
        active: job.active,
    });
    if (error) throw new Error(error.message);
    return job;
};

export const deleteJob = async (id: string): Promise<void> => {
    const { error } = await supabase.from('jobs').delete().eq('id', id);
    if (error) throw new Error(error.message);
};

// --- REPORTS (stub — no longer Google Sheets based) ---

export const generateReport = async (_userId: string, _startDate: string, _endDate: string): Promise<string> => {
    throw new Error('Report generation not yet implemented for Supabase backend.');
};
