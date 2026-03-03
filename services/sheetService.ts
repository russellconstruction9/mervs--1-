
import { supabase } from './supabaseClient';
import { Task, TaskPriority, TaskStatus, TimeEntry, ChatMessage, UserProfile, JobOption } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

// --- IMAGE UTILS ---

export const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Image compression timed out')), 10000);
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            clearTimeout(timeout);
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
        img.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Failed to load image for compression'));
        };
    });
};

// --- AUTH ---

/**
 * Unified authenticate function - handles both admin (email) and employee (username) login
 * Auto-detects based on whether the identifier contains '@'
 */
export const authenticate = async (identifier: string, password: string): Promise<UserProfile> => {
    const trimmedId = identifier.trim().toLowerCase();
    const isEmail = trimmedId.includes('@');
    
    // For employees, convert username to synthetic email
    const email = isEmail ? trimmedId : `${trimmedId}@taskpoint.local`;
    
    console.log('[Auth] Attempting login for:', email);
    
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
        console.error('[Auth] Login failed:', error?.message);
        throw new Error(isEmail 
            ? 'Invalid email or password. Please try again.' 
            : 'Invalid username or password. Please try again.');
    }
    
    console.log('[Auth] Login successful, fetching profile for:', data.user.id);

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

    if (profileError || !profile) {
        console.error('[Auth] Profile fetch failed:', profileError?.message);
        throw new Error('User profile not found.');
    }
    
    console.log('[Auth] Profile loaded:', { id: profile.id, role: profile.role, hasOrgId: !!profile.org_id });

    return {
        id: profile.id,
        name: profile.name,
        username: profile.username ?? undefined,
        rate: profile.rate?.toString() ?? '0',
        role: profile.role as 'admin' | 'user',
        orgId: profile.org_id ?? undefined,
    };
};

// Legacy functions - kept for backward compatibility, delegate to authenticate()
export const apiLogin = async (username: string, password: string): Promise<UserProfile> => {
    return authenticate(username, password);
};

export const apiAdminLogin = async (email: string, password: string): Promise<UserProfile> => {
    const user = await authenticate(email, password);
    if (user.role !== 'admin') {
        await supabase.auth.signOut();
        throw new Error('Access denied. This account is not an administrator.');
    }
    return user;
};

export const apiSignup = async (username: string, displayName: string, password: string, rate: string, orgId?: string): Promise<UserProfile> => {
    // Username is globally unique, used for login (converted to synthetic email)
    const email = `${username.trim().toLowerCase()}@taskpoint.local`;

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                name: displayName.trim(),
                username: username.trim().toLowerCase(),
                rate: parseFloat(rate) || 0,
                role: 'user',
                org_id: orgId ?? null
            }
        }
    });

    if (error || !data.user) throw new Error(error?.message || 'Signup failed');

    // The database trigger (handle_new_user) automatically creates the profile
    // with username and org_id from the metadata - no manual update needed

    return {
        id: data.user.id,
        name: displayName.trim(),
        username: username.trim().toLowerCase(),
        rate,
        role: 'user',
        orgId: orgId ?? undefined,
    };
};

export const apiLogout = async () => {
    await supabase.auth.signOut();
    // Clear all local caches on logout
    localStorage.removeItem('taskpoint_tasks');
    localStorage.removeItem('taskpoint_timeentries');
    localStorage.removeItem('taskpoint_jobs');
    localStorage.removeItem('last_notified_count');
};

export const getSessionUser = async (): Promise<UserProfile | null> => {
    console.log('[Session] Checking for existing session...');
    try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
            console.error('[Session] Error getting session:', sessionError.message);
            return null;
        }
        if (!session?.user) {
            console.log('[Session] No active session');
            return null;
        }
        
        console.log('[Session] Found session, fetching profile for:', session.user.id);

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (profileError) {
            console.error('[Session] Profile fetch error:', profileError.message);
            return null;
        }
        if (!profile) {
            console.log('[Session] No profile found');
            return null;
        }

        console.log('[Session] Profile loaded:', { id: profile.id, role: profile.role, hasOrgId: !!profile.org_id });
        return {
            id: profile.id,
            name: profile.name,
            username: profile.username ?? undefined,
            rate: profile.rate?.toString() ?? '0',
            role: profile.role as 'admin' | 'user',
            orgId: profile.org_id ?? undefined,
        };
    } catch (e) {
        console.error('[Session] Unexpected error:', e);
        return null;
    }
};

// --- ORGANIZATIONS ---

export const createOrganization = async (name: string, slug: string): Promise<{ id: string }> => {
    const { data, error } = await supabase
        .from('organizations')
        .insert({ name: name.trim(), slug: slug.trim().toLowerCase() })
        .select('id')
        .single();
    if (error || !data) throw new Error(error?.message || 'Failed to create organization');
    return data;
};

// --- TASKS ---

export const fetchTasks = async (orgId?: string): Promise<Task[]> => {
    let query = supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

    if (orgId) query = query.eq('org_id', orgId);

    const { data, error } = await query;

    if (error) {
        console.warn('fetchTasks error:', error.message);
        const local = localStorage.getItem('taskpoint_tasks');
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

    localStorage.setItem('taskpoint_tasks', JSON.stringify(tasks));
    return tasks;
};

export const saveTask = async (task: Task, isNew: boolean, orgId?: string): Promise<Task> => {
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
        ...(orgId ? { org_id: orgId } : {}),
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

const TIME_LOCAL_KEY = 'taskpoint_timeentries';
const MAX_ACTIVE_HOURS = 24; // auto-complete entries older than this

export const fetchTimeEntries = async (orgId?: string): Promise<TimeEntry[]> => {
    const localRaw = localStorage.getItem(TIME_LOCAL_KEY);
    const localData: TimeEntry[] = localRaw ? JSON.parse(localRaw) : [];
    const unsyncedItems = localData.filter(e => e.isSynced === false);

    try {
        let query = supabase
            .from('time_entries')
            .select('*')
            .order('start_time', { ascending: false });

        if (orgId) query = query.eq('org_id', orgId);

        const { data, error } = await query;

        if (error) throw error;

        const now = Date.now();
        const serverData: TimeEntry[] = (data || []).map(row => {
            const entry: TimeEntry = {
                id: row.id,
                userId: row.user_name ?? row.user_id ?? '',
                startTime: row.start_time,
                endTime: row.end_time ?? null,
                status: row.status as 'active' | 'completed',
                jobName: row.job_name ?? undefined,
                notes: row.notes ?? undefined,
                totalPay: row.total_pay ?? undefined,
                isSynced: true,
            };
            // Auto-complete orphaned active entries older than MAX_ACTIVE_HOURS
            if (entry.status === 'active' && entry.endTime === null) {
                const ageHours = (now - entry.startTime) / (1000 * 60 * 60);
                if (ageHours > MAX_ACTIVE_HOURS) {
                    entry.status = 'completed';
                    entry.endTime = entry.startTime + MAX_ACTIVE_HOURS * 60 * 60 * 1000;
                }
            }
            return entry;
        });

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

export const syncPendingTimeEntries = async (orgId?: string): Promise<number> => {
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
        ...(orgId ? { org_id: orgId } : {}),
    }));

    const { error } = await supabase.from('time_entries').upsert(rows);
    if (error) throw new Error(error.message);

    const pendingIds = new Set(pending.map(e => e.id));
    const synced = current.map(e => pendingIds.has(e.id) ? { ...e, isSynced: true } : e);
    localStorage.setItem(TIME_LOCAL_KEY, JSON.stringify(synced));
    return pending.length;
};

export const saveTimeEntry = async (entry: TimeEntry, _isNew: boolean, orgId?: string): Promise<TimeEntry> => {
    const saved = await saveTimeEntryLocal(entry);
    syncPendingTimeEntries(orgId).catch(console.error);
    return saved;
};

// --- CHAT ---

export const fetchMessages = async (orgId?: string): Promise<ChatMessage[]> => {
    let query = supabase
        .from('messages')
        .select('*')
        .order('timestamp', { ascending: true })
        .limit(100);

    if (orgId) query = query.eq('org_id', orgId);

    const { data, error } = await query;

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

export const sendMessage = async (message: ChatMessage, orgId?: string): Promise<ChatMessage> => {
    if (message.image) {
        try { message.image = await compressImage(message.image); } catch { /* keep raw */ }
    }

    const { error } = await supabase.from('messages').insert({
        id: message.id,
        sender: message.sender,
        text: message.text,
        timestamp: message.timestamp,
        image: message.image ?? null,
        ...(orgId ? { org_id: orgId } : {}),
    });

    if (error) throw new Error(error.message);
    return { ...message, status: 'sent' };
};

// --- ADMIN: USERS ---

export const fetchUsers = async (orgId?: string): Promise<UserProfile[]> => {
    let query = supabase
        .from('profiles')
        .select('*')
        .order('name');

    if (orgId) query = query.eq('org_id', orgId);

    const { data, error } = await query;

    if (error) {
        console.warn('fetchUsers error:', error.message);
        return [];
    }

    return (data || []).map(row => ({
        id: row.id,
        name: row.name,
        username: row.username ?? undefined,
        rate: row.rate?.toString() ?? '0',
        role: row.role as 'admin' | 'user',
        orgId: row.org_id ?? undefined,
    }));
};

export const saveUser = async (user: UserProfile, isNew: boolean, orgId?: string): Promise<UserProfile> => {
    if (isNew) {
        if (!user.username) throw new Error('Username is required for new employees');
        const result = await apiSignup(user.username, user.name, user.password ?? 'changeme123', user.rate ?? '0', orgId);
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
    // Call delete-user Edge Function which uses service role key to remove from auth.users
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId: id }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete user');
    }
};

export const resetUserPassword = async (userId: string, newPassword: string): Promise<void> => {
    // Call reset-password Edge Function which uses service role key
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/reset-password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId, newPassword }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to reset password');
    }
};

// --- ADMIN: JOBS ---

export const fetchJobs = async (orgId?: string): Promise<JobOption[]> => {
    let query = supabase
        .from('jobs')
        .select('*')
        .order('name');

    if (orgId) query = query.eq('org_id', orgId);

    const { data, error } = await query;

    if (error) {
        console.warn('fetchJobs error:', error.message);
        const local = localStorage.getItem('taskpoint_jobs');
        return local ? JSON.parse(local) : [];
    }

    const jobs = (data || []).map(row => ({
        id: row.id,
        name: row.name,
        address: row.address ?? '',
        active: row.active ?? true,
    }));

    localStorage.setItem('taskpoint_jobs', JSON.stringify(jobs));
    return jobs;
};

export const saveJob = async (job: JobOption, _isNew: boolean, orgId?: string): Promise<JobOption> => {
    const { error } = await supabase.from('jobs').upsert({
        id: job.id,
        name: job.name,
        address: job.address ?? '',
        active: job.active,
        ...(orgId ? { org_id: orgId } : {}),
    });
    if (error) throw new Error(error.message);
    return job;
};

export const deleteJob = async (id: string): Promise<void> => {
    const { error } = await supabase.from('jobs').delete().eq('id', id);
    if (error) throw new Error(error.message);
};

// --- REPORTS ---

export const generateReport = async (userId: string, startDate: string, endDate: string, orgId?: string): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const params = new URLSearchParams({ userId, startDate, endDate });
    if (orgId) params.set('orgId', orgId);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-report?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
    });

    if (!res.ok) throw new Error('Report generation failed');
    return await res.text(); // CSV string
};
