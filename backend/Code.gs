
// ==========================================
// TRUCHOICE ROOFING - BACKEND V7.3 (AUTH & ADMIN TASKS)
// Updated: 2026-03-02
// ==========================================

// --- CONFIGURATION ---
const CONFIG = {
  FOLDER_NAME: "TruChoice Photos",
  REPORT_FOLDER_NAME: "TruChoice Pay Reports",
  CACHE_TTL: 600, // 10 minutes
  SHEETS: {
    tasks:         { name: "Tasks",         headers: ["id", "title", "description", "location", "assignedTo", "dueDate", "priority", "status", "createdAt", "image", "jobName"] },
    timeentries:   { name: "TimeEntries",   headers: ["id", "userId", "startTime", "endTime", "status", "jobName", "notes", "totalPay"] },
    messages:      { name: "Messages",      headers: ["id", "sender", "text", "timestamp", "image"] },
    users:         { name: "Users",         headers: ["id", "name", "rate", "role", "pin"] },
    jobs:          { name: "Jobs",          headers: ["id", "name", "address", "active"] },
    subscriptions: { name: "Subscriptions", headers: ["endpoint", "p256dh", "auth", "userId", "userAgent", "updatedAt"] }
  }
};

// ==========================================
// 1. ENTRY POINTS
// ==========================================

function doGet(e)  { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    const request = parseRequest(e);
    let result = null;

    // --- READ STRATEGY (Concurrent, Cached) ---
    if (request.action === 'read') {
      const cacheKey = `READ_${request.tableName}_${JSON.stringify(request.data)}`;
      result = getCachedData(cacheKey);

      if (!result) {
        result = readData(request.tableName);
        setCachedData(cacheKey, result);
      }
      return responseJSON({ status: 'success', data: result });
    }

    // --- WRITE STRATEGY (Locked, Serialized) ---
    else {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(30000)) {
        return responseJSON({ status: 'error', message: 'Server busy. Please try again.' });
      }

      try {
        switch (request.action) {
          case 'login':
            result = handleLogin(request.data);
            break;
          case 'signup':
            result = handleSignup(request.data);
            break;
          case 'create':
            result = createItem(request.tableName, request.data);
            triggerNotification(request.tableName, result);
            break;
          case 'update':
            result = updateItem(request.tableName, request.data);
            break;
          case 'delete':
            result = deleteItem(request.tableName, request.id);
            break;
          case 'batchSync':
            result = batchSyncItems(request.tableName, request.data);
            break;
          case 'saveSubscription':
            result = saveSubscription(request.data);
            break;
          case 'generateReport':
            result = generatePayReport(request.data.userId, request.data.startDate, request.data.endDate);
            break;
          case 'setup':
            result = doSetup();
            break;
          default:
            throw new Error("Invalid action: " + request.action);
        }

        // Invalidate cache after any write
        if (request.tableName) clearCache(request.tableName);

      } finally {
        lock.releaseLock();
      }

      return responseJSON({ status: 'success', data: result });
    }

  } catch (err) {
    console.error("Main Error", err);
    return responseJSON({ status: 'error', message: err.toString() });
  }
}

function parseRequest(e) {
  if (e.parameter && e.parameter.setup) return { action: 'setup' };

  if (e.postData && e.postData.contents) {
    const json = JSON.parse(e.postData.contents);
    return {
      action:    json.action || 'read',
      tableName: (json.table || '').toLowerCase(),
      data:      json.data || {},
      id:        json.id || (json.data && !Array.isArray(json.data) ? json.data.id : null)
    };
  }

  return {
    action:    'read',
    tableName: (e.parameter.table || 'tasks').toLowerCase(),
    data:      {}
  };
}

// ==========================================
// 2. AUTH OPERATIONS
// ==========================================

function handleLogin(data) {
  const users = readData('users');
  const nameInput = (data.name || '').trim().toLowerCase();
  const pinInput  = String(data.pin || '').trim();

  const user = users.find(u =>
    u.name.trim().toLowerCase() === nameInput &&
    String(u.pin).trim() === pinInput
  );

  if (!user) throw new Error("Invalid name or PIN");
  return user;
}

function handleSignup(data) {
  const users = readData('users');
  const nameInput = (data.name || '').trim().toLowerCase();
  const exists = users.find(u => u.name.trim().toLowerCase() === nameInput);
  if (exists) throw new Error("User already exists");

  const newUser = {
    id:   Utilities.getUuid(),
    name: data.name.trim(),
    pin:  data.pin,
    rate: data.rate || "0",
    role: 'user' // Default role
  };

  createItem('users', newUser);
  return newUser;
}

// ==========================================
// 3. DATA OPERATIONS (OPTIMIZED)
// ==========================================

function readData(tableName) {
  const sheet = getSheet(tableName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values  = sheet.getDataRange().getValues();
  const headers = values[0];
  const rows    = values.slice(1);

  return rows.map(row => {
    const item = {};
    headers.forEach((header, i) => {
      let val = row[i];
      if (val instanceof Date) {
        item[header] = val.getTime();
      } else {
        item[header] = val;
      }
    });
    return item;
  });
}

function createItem(tableName, data) {
  const sheet   = getSheet(tableName);
  const headers = getHeaders(sheet);

  if (!data.id) data.id = Utilities.getUuid();
  if (headers.includes('createdAt') && !data.createdAt) data.createdAt = new Date();
  if (headers.includes('timestamp') && !data.timestamp) data.timestamp = new Date();

  if (data.image && typeof data.image === 'string' && data.image.startsWith('data:image')) {
    data.image = processImageUpload(data.image, data.id);
  }

  const row = headers.map(h => {
    if (typeof data[h] === 'boolean') return data[h];
    return (data[h] === undefined || data[h] === null) ? "" : data[h];
  });

  sheet.appendRow(row);
  return data;
}

function updateItem(tableName, data) {
  if (!data.id) throw new Error("Update requires ID");
  const sheet = getSheet(tableName);

  const finder = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(data.id);
  const cell   = finder.findNext();

  if (!cell) throw new Error("Item ID not found: " + data.id);

  const rowIndex   = cell.getRow();
  const headers    = getHeaders(sheet);
  const range      = sheet.getRange(rowIndex, 1, 1, headers.length);
  const currentVals = range.getValues()[0];

  if (data.image && typeof data.image === 'string' && data.image.startsWith('data:image')) {
    data.image = processImageUpload(data.image, data.id);
  }

  const newRow = headers.map((h, i) => {
    if (h === 'id') return currentVals[i];
    return (data[h] !== undefined) ? data[h] : currentVals[i];
  });

  range.setValues([newRow]);
  return { ...data, updated: true };
}

function deleteItem(tableName, id) {
  const sheet   = getSheet(tableName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("Item not found");

  const finder = sheet.getRange(2, 1, lastRow - 1, 1).createTextFinder(id);
  const cell   = finder.findNext();

  if (!cell) throw new Error("Item ID not found for deletion");

  sheet.deleteRow(cell.getRow());
  return { id: id, deleted: true };
}

function batchSyncItems(tableName, items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const sheet = getSheet(tableName);

  const range  = sheet.getDataRange();
  const values = range.getValues();
  const headers = values[0];

  const idMap = new Map();
  for (let i = 1; i < values.length; i++) {
    idMap.set(String(values[i][0]), i);
  }

  const rowsToAdd   = [];
  const results     = [];
  let updatesMade   = false;

  items.forEach(item => {
    if (item.image && typeof item.image === 'string' && item.image.startsWith('data:image')) {
      item.image = processImageUpload(item.image, item.id);
    }

    if (idMap.has(String(item.id))) {
      const idx = idMap.get(String(item.id));
      headers.forEach((h, colIdx) => {
        if (item[h] !== undefined) values[idx][colIdx] = item[h];
      });
      updatesMade = true;
      results.push({ id: item.id, status: 'updated' });
    } else {
      const row = headers.map(h => (item[h] === undefined || item[h] === null) ? "" : item[h]);
      rowsToAdd.push(row);
      results.push({ id: item.id, status: 'created' });
    }
  });

  if (updatesMade) {
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  }
  if (rowsToAdd.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
  }

  return results;
}

// ==========================================
// 4. UTILITIES
// ==========================================

function getCachedData(key) {
  try {
    const cached = CacheService.getScriptCache().get(key);
    return cached ? JSON.parse(cached) : null;
  } catch(e) { return null; }
}

function setCachedData(key, data) {
  try {
    const json = JSON.stringify(data);
    if (json.length < 90000) CacheService.getScriptCache().put(key, json, CONFIG.CACHE_TTL);
  } catch(e) {}
}

// FIX: was an empty no-op — now properly flushes all cache keys for the table
function clearCache(tableName) {
  try {
    const cache = CacheService.getScriptCache();
    // Remove the standard read key variants for this table
    cache.remove(`READ_${tableName}_{}`);
    cache.remove(`READ_${tableName}_`);
    // Flush the entire script cache to ensure stale reads don't persist
    cache.removeAll([
      `READ_${tableName}_{}`,
      `READ_${tableName}_`
    ]);
  } catch(e) {}
}

function getFolderId(folderName, propKey) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(propKey);
  if (id) { try { return DriveApp.getFolderById(id); } catch(e) {} }
  const folders = DriveApp.getFoldersByName(folderName);
  const folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  props.setProperty(propKey, folder.getId());
  return folder;
}

function processImageUpload(base64String, id) {
  try {
    const folder  = getFolderId(CONFIG.FOLDER_NAME, 'FOLDER_ID_PHOTOS');
    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return base64String;
    const contentType = matches[1];
    const blob = Utilities.newBlob(Utilities.base64Decode(matches[2]), contentType, `${id}_${Date.now()}`);
    const file  = folder.createFile(blob);
    return `https://drive.google.com/uc?export=view&id=${file.getId()}`;
  } catch (e) { return ""; }
}

function triggerNotification(tableName, data) {
  const key = PropertiesService.getScriptProperties().getProperty('FCM_SERVER_KEY');
  if (!key || tableName === 'timeentries') return;
  try {
    const subSheet = getSheet('subscriptions');
    if (subSheet.getLastRow() < 2) return;
    const rawTokens = subSheet.getRange(2, 1, subSheet.getLastRow()-1, 1).getValues().flat();
    const tokens    = [...new Set(rawTokens.map(t => t.split('/').pop()))];
    if (tokens.length === 0) return;

    let title = "TruChoice Update";
    let body  = "New activity";
    if (tableName === 'messages') { title = `New Message: ${data.sender}`; body = data.text || 'Sent an image'; }
    if (tableName === 'tasks')    { title = "Task Update"; body = `${data.title} (${data.status})`; }

    const payload = {
      registration_ids: tokens,
      notification: { title: title, body: body, icon: "./icon.svg" }
    };

    UrlFetchApp.fetch('https://fcm.googleapis.com/fcm/send', {
      method:           'post',
      contentType:      'application/json',
      headers:          { Authorization: 'key=' + key },
      payload:          JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {}
}

function saveSubscription(subData) {
  const sheet    = getSheet('subscriptions');
  const endpoint = subData.endpoint;
  const finder   = sheet.getRange(2, 1, Math.max(sheet.getLastRow()-1, 1), 1).createTextFinder(endpoint);
  const cell     = finder.findNext();

  const payload = {
    endpoint:  endpoint,
    p256dh:    subData.keys?.p256dh  || '',
    auth:      subData.keys?.auth    || '',
    userId:    subData.userId        || 'Anon',
    userAgent: subData.userAgent     || '',
    updatedAt: new Date().getTime()
  };

  const headers = CONFIG.SHEETS.subscriptions.headers;
  const row     = headers.map(h => payload[h]);
  if (cell) {
    sheet.getRange(cell.getRow(), 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return { status: 'saved' };
}

// FIX: Improved endTime null check so active (clocked-in) entries are always included in reports
function generatePayReport(userId, startDate, endDate) {
  const all   = readData('timeentries');
  const start = new Date(startDate).getTime();
  const end   = new Date(endDate).getTime();

  // Include an entry if:
  //  - it belongs to the user
  //  - it started on or after the start date
  //  - it either hasn't ended yet (active) OR ended before/on the end date
  const relevant = all.filter(e =>
    e.userId === userId &&
    Number(e.startTime) >= start &&
    (!e.endTime || Number(e.endTime) <= end)
  );

  let total = 0;
  let html  = `<h2>Pay Report: ${userId}</h2><table border="1" style="border-collapse:collapse; width:100%"><tr><th>Date</th><th>Job</th><th>Hours</th><th>Pay</th></tr>`;

  relevant.forEach(r => {
    const hrs = r.endTime
      ? (Number(r.endTime) - Number(r.startTime)) / 3600000
      : (Date.now()        - Number(r.startTime)) / 3600000;
    const pay = Number(r.totalPay || 0);
    total += pay;
    html += `<tr><td>${new Date(r.startTime).toLocaleDateString()}</td><td>${r.jobName || '-'}</td><td>${hrs.toFixed(2)}</td><td>$${pay.toFixed(2)}</td></tr>`;
  });

  html += `</table><h3>Total: $${total.toFixed(2)}</h3>`;
  const blob = Utilities.newBlob(html, MimeType.HTML).getAs(MimeType.PDF).setName(`PayReport_${userId}.pdf`);
  const file  = getFolderId(CONFIG.REPORT_FOLDER_NAME, 'FOLDER_ID_REPORTS').createFile(blob);
  return { url: `https://drive.google.com/file/d/${file.getId()}/view?usp=sharing` };
}

function getSheet(key) {
  const config = CONFIG.SHEETS[key];
  if (!config) throw new Error(`Unknown Table: ${key}`);
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(config.name);
  if (sheet) { try { sheet.getLastRow(); } catch (e) { sheet = null; } }
  if (!sheet) {
    try {
      sheet = ss.insertSheet(config.name);
      SpreadsheetApp.flush();
      sheet.appendRow(config.headers);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, config.headers.length).setFontWeight("bold");
    } catch (e) {
      sheet = ss.getSheetByName(config.name);
      if (!sheet) throw new Error(`Failed to initialize sheet '${config.name}'.`);
    }
  }
  return sheet;
}

function getHeaders(sheet) {
  if (sheet.getLastRow() < 1) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function doSetup() {
  const logs = [];
  try {
    const props = PropertiesService.getScriptProperties();
    if (!props.getProperty('FCM_SERVER_KEY')) props.setProperty('FCM_SERVER_KEY', 'PASTE_KEY_HERE');
    getFolderId(CONFIG.FOLDER_NAME,        'FOLDER_ID_PHOTOS');
    getFolderId(CONFIG.REPORT_FOLDER_NAME, 'FOLDER_ID_REPORTS');
    const keys = Object.keys(CONFIG.SHEETS);
    for (const key of keys) {
      try {
        const sheet = getSheet(key);
        SpreadsheetApp.flush();
        logs.push(`- Checked: ${CONFIG.SHEETS[key].name} (Rows: ${sheet.getLastRow()})`);
      } catch (e) { logs.push(`- ERROR on ${key}: ${e.message}`); }
    }
  } catch (err) { return "CRITICAL ERROR: " + err.toString(); }
  return logs.join('\n');
}
