
import { GOOGLE_SCRIPT_URL } from '../constants';
import { Task, TaskStatus, TaskPriority, SheetResponse, TimeEntry, ChatMessage, UserProfile, JobOption } from '../types';

// Mock Tasks
const MOCK_TASKS: Task[] = [
  {
    id: '1',
    title: 'Roof Inspection - Smith Residence',
    description: 'Check for hail damage on the north slope and inspect flashing around the chimney.',
    location: '124 Maple Ave, Sector 4',
    assignedTo: 'Mike R.',
    dueDate: '2023-11-15',
    priority: TaskPriority.HIGH,
    status: TaskStatus.IN_PROGRESS,
    createdAt: Date.now() - 10000000,
    image: 'https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&q=80&w=600'
  }
];

// Mock Time Entries
const MOCK_TIME_ENTRIES: TimeEntry[] = [
    {
        id: 't1',
        userId: 'Mike R.',
        startTime: Date.now() - 3600000 * 4, 
        endTime: Date.now() - 3600000 * 2,
        status: 'completed',
        notes: 'Morning Shift',
        isSynced: true
    }
];

const MOCK_MESSAGES: ChatMessage[] = [
  { id: 'm1', sender: 'System', text: 'Welcome to TruChoice Chat!', timestamp: Date.now(), status: 'sent' }
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper for fetch with timeout
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 8000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
};

// --- AUTH ---

export const apiLogin = async (name: string, pin: string): Promise<UserProfile> => {
    if (!GOOGLE_SCRIPT_URL) {
        // Fallback for demo
        return { id: 'demo', name, pin, rate: '25', role: 'user' };
    }
    
    const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'login',
            data: { name, pin }
        })
    }, 10000);

    const result = await response.json();
    if (result.status === 'success' && result.data) {
        return result.data;
    }
    throw new Error(result.message || 'Login failed');
};

export const apiSignup = async (name: string, pin: string, rate: string): Promise<UserProfile> => {
    if (!GOOGLE_SCRIPT_URL) {
        return { id: 'demo-new', name, pin, rate, role: 'user' };
    }

    const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'signup',
            data: { name, pin, rate }
        })
    }, 15000);

    const result = await response.json();
    if (result.status === 'success' && result.data) {
        return result.data;
    }
    throw new Error(result.message || 'Signup failed');
};


// --- IMAGE UTILS ---

// Compresses image to max 800px width/height and 0.7 quality jpeg
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
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        // Returns full data URI
        resolve(canvas.toDataURL('image/jpeg', 0.7)); 
      } else {
        resolve(base64Str); // Fallback
      }
    };
    img.onerror = () => resolve(base64Str); // Fallback
  });
};

// --- TASKS ---

export const fetchTasks = async (): Promise<Task[]> => {
  return fetchGeneric('tasks', MOCK_TASKS);
};

export const saveTask = async (task: Task, isNew: boolean): Promise<Task> => {
  return saveGeneric('tasks', task, isNew);
};

export const deleteTask = async (taskId: string): Promise<void> => {
  return deleteGeneric('tasks', taskId);
};

// --- TIME CLOCK (OFFLINE-FIRST) ---

export const fetchTimeEntries = async (): Promise<TimeEntry[]> => {
    // 1. Get whatever is in local storage first
    const localKey = `sitecommand_timeentries`;
    const localRaw = localStorage.getItem(localKey);
    const localData: TimeEntry[] = localRaw ? JSON.parse(localRaw) : MOCK_TIME_ENTRIES;

    // 2. Identify items that haven't been synced yet (we must preserve these)
    const unsyncedItems = localData.filter(item => item.isSynced === false);

    if (!GOOGLE_SCRIPT_URL) return localData;

    try {
        // 3. Fetch fresh data from server
        const cacheBuster = `?table=timeentries&nocache=${Math.floor(Date.now() / 30000)}`;
        const response = await fetchWithTimeout(`${GOOGLE_SCRIPT_URL}${cacheBuster}`, {}, 10000);
        
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        
        const result: SheetResponse = await response.json();
        
        if (result.status === 'success' && result.data) {
            const serverData = result.data as TimeEntry[];
            
            // 4. Merge Strategies:
            // Server data is source of truth for history.
            // Local Unsynced data overrides server data (in case of conflict) and appends to top.
            
            // Mark all server items as synced
            const cleanServerData = serverData.map(item => ({ ...item, isSynced: true }));

            // Map server data to ID for easy lookup
            const serverMap = new Map<string, TimeEntry>(cleanServerData.map(item => [item.id, item]));

            // Add/Overwrite unsynced items
            unsyncedItems.forEach(uItem => {
                serverMap.set(uItem.id, uItem);
            });

            const mergedData = Array.from(serverMap.values());
            
            // Sort by time descending
            mergedData.sort((a, b) => b.startTime - a.startTime);

            // Update local storage
            localStorage.setItem(localKey, JSON.stringify(mergedData));
            return mergedData;
        }
        return localData;
    } catch (error) {
        console.warn(`API Fetch Error (TimeEntries):`, error);
        return localData;
    }
};

// Saves locally IMMEDIATELY. Does not call network.
export const saveTimeEntryLocal = async (entry: TimeEntry): Promise<TimeEntry> => {
    const localKey = `sitecommand_timeentries`;
    const currentItems: TimeEntry[] = JSON.parse(localStorage.getItem(localKey) || '[]');
    
    // Check if updating or creating
    const index = currentItems.findIndex(e => e.id === entry.id);
    const entryToSave = { ...entry, isSynced: false }; // Mark as dirty

    let updatedItems;
    if (index > -1) {
        updatedItems = [...currentItems];
        updatedItems[index] = entryToSave;
    } else {
        updatedItems = [entryToSave, ...currentItems];
    }
    
    localStorage.setItem(localKey, JSON.stringify(updatedItems));
    return entryToSave;
};

// Batch syncs all items marked isSynced: false
export const syncPendingTimeEntries = async (): Promise<number> => {
    if (!GOOGLE_SCRIPT_URL) return 0;

    const localKey = `sitecommand_timeentries`;
    const currentItems: TimeEntry[] = JSON.parse(localStorage.getItem(localKey) || '[]');
    
    const pendingItems = currentItems.filter(e => e.isSynced === false);
    
    if (pendingItems.length === 0) return 0;

    try {
        // Send batch request
        const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'batchSync',
                table: 'timeentries',
                data: pendingItems
            })
        }, 15000); // Higher timeout for batch

        if (!response.ok) throw new Error("Network response not ok");
        
        const result = await response.json();
        
        if (result.status === 'success') {
            // Mark these items as synced in local storage
            const pendingIds = new Set(pendingItems.map(p => p.id));
            const syncedItems = currentItems.map(item => {
                if (pendingIds.has(item.id)) {
                    return { ...item, isSynced: true };
                }
                return item;
            });
            localStorage.setItem(localKey, JSON.stringify(syncedItems));
            return pendingItems.length;
        } else {
            throw new Error(result.message);
        }

    } catch (e) {
        console.error("Batch Sync Failed:", e);
        throw e;
    }
};

export const saveTimeEntry = async (entry: TimeEntry, isNew: boolean): Promise<TimeEntry> => {
    const saved = await saveTimeEntryLocal(entry);
    syncPendingTimeEntries().catch(console.error); // Try to sync in background
    return saved;
};

// NEW: Report Generation
export const generateReport = async (userId: string, startDate: string, endDate: string): Promise<string> => {
    if (!GOOGLE_SCRIPT_URL) throw new Error("Backend not configured");

    try {
        const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'generateReport',
                data: { userId, startDate, endDate }
            })
        }, 20000); // Longer timeout for PDF generation

        if (!response.ok) throw new Error("Report generation failed");
        
        const result = await response.json();
        if (result.status === 'success' && result.data?.url) {
            return result.data.url;
        }
        throw new Error(result.message || "Failed to generate report");
    } catch (e) {
        console.error("Report Error:", e);
        throw e;
    }
};

// --- CHAT ---

export const fetchMessages = async (): Promise<ChatMessage[]> => {
    // Shorter timeout for chat to keep it snappy, faster updates
    return fetchGeneric('messages', MOCK_MESSAGES, true, 5000); 
};

export const sendMessage = async (message: ChatMessage): Promise<ChatMessage> => {
    // 1. Compress image if present
    if (message.image) {
        try {
            message.image = await compressImage(message.image);
        } catch (e) {
            console.warn("Image compression failed, sending raw", e);
        }
    }
    
    // 2. Send to server
    // We do NOT save to generic local storage immediately here, 
    // we let the UI handle the "pending" state via Optimistic UI
    if (!GOOGLE_SCRIPT_URL) {
        await delay(500);
        return { ...message, status: 'sent' };
    }

    try {
        const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'create',
                table: 'messages',
                data: message
            })
        }, 15000); // Image upload might take a bit

        if (!response.ok) throw new Error("Network error");
        
        const result = await response.json();
        if (result.status === 'success') {
            return { ...message, status: 'sent' };
        } else {
            throw new Error(result.message);
        }
    } catch (e) {
        console.error("Send Message Error:", e);
        throw e;
    }
};

// --- ADMIN (USERS & JOBS) ---

export const fetchUsers = async (): Promise<UserProfile[]> => {
    return fetchGeneric('users', []);
};

export const saveUser = async (user: UserProfile, isNew: boolean): Promise<UserProfile> => {
    return saveGeneric('users', user, isNew);
};

export const deleteUser = async (id: string): Promise<void> => {
    return deleteGeneric('users', id);
};

export const fetchJobs = async (): Promise<JobOption[]> => {
    return fetchGeneric('jobs', []);
};

export const saveJob = async (job: JobOption, isNew: boolean): Promise<JobOption> => {
    return saveGeneric('jobs', job, isNew);
};

export const deleteJob = async (id: string): Promise<void> => {
    return deleteGeneric('jobs', id);
};


// --- GENERIC HELPERS ---

async function fetchGeneric<T>(table: 'tasks' | 'timeentries' | 'messages' | 'users' | 'jobs', mockData: T[], forceRefresh = false, timeout = 10000): Promise<T[]> {
  if (!GOOGLE_SCRIPT_URL) {
    await delay(500);
    const local = localStorage.getItem(`sitecommand_${table}`);
    return local ? JSON.parse(local) : mockData;
  }

  try {
    const cacheBuster = `?table=${table}&nocache=${forceRefresh ? Date.now() : Math.floor(Date.now() / 30000)}`;
    const response = await fetchWithTimeout(`${GOOGLE_SCRIPT_URL}${cacheBuster}`, {}, timeout);
    
    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
    
    const result: SheetResponse = await response.json();
    if (result.status === 'success' && result.data) {
      localStorage.setItem(`sitecommand_${table}`, JSON.stringify(result.data));
      return result.data;
    }
    throw new Error(result.message || 'Failed to fetch');
  } catch (error) {
    console.warn(`API Fetch Error (${table}):`, error);
    const local = localStorage.getItem(`sitecommand_${table}`);
    return local ? JSON.parse(local) : mockData;
  }
}

async function saveGeneric<T extends { id: string }>(table: 'tasks' | 'timeentries' | 'messages' | 'users' | 'jobs', item: T, isNew: boolean): Promise<T> {
  const localKey = `sitecommand_${table}`;
  const currentItems = JSON.parse(localStorage.getItem(localKey) || '[]');
  let updatedItems = [];
  
  if (isNew) {
    if (table === 'messages') {
        updatedItems = [...currentItems, item];
    } else {
        updatedItems = [item, ...currentItems];
    }
  } else {
    updatedItems = currentItems.map((t: any) => t.id === item.id ? item : t);
  }
  localStorage.setItem(localKey, JSON.stringify(updatedItems));

  if (GOOGLE_SCRIPT_URL) {
    try {
      const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: isNew ? 'create' : 'update',
          table: table,
          data: item
        })
      }, 8000);

      if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
      }
      
      const result = await response.json();
      if (result.status !== 'success') {
          throw new Error(result.message || 'Backend returned error');
      }

    } catch (e) {
      console.error("API Save Error:", e);
      // We throw here for generic items, but local is already saved.
      throw e;
    }
  }
  return item;
}

async function deleteGeneric(table: 'tasks' | 'users' | 'jobs', id: string): Promise<void> {
    const localKey = `sitecommand_${table}`;
    const currentItems = JSON.parse(localStorage.getItem(localKey) || '[]');
    const updatedItems = currentItems.filter((t: any) => String(t.id) !== String(id));
    localStorage.setItem(localKey, JSON.stringify(updatedItems));

    if (GOOGLE_SCRIPT_URL) {
        try {
          const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'delete', table: table, id: id, data: { id } })
          });
          
          if (!response.ok) throw new Error('Delete failed network');
          const result = await response.json();
          if (result.status !== 'success') throw new Error(result.message);

        } catch (e) { 
            console.error(e);
            throw e; 
        }
    }
}
