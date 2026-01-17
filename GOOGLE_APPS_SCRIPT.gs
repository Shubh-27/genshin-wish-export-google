/**
 * Genshin Wish Export - Google Apps Script Cloud Sync API
 * 
 * This script provides a secure cloud backup/restore API for wish history data.
 * Deploy as a Web App with "Execute as: Me" and "Who has access: Anyone".
 * 
 * API Contract (POST-only JSON API):
 * - action: "metadata" | "upload" | "download" | "backup"
 * 
 * Data-Loss Prevention:
 * - Always creates backup before overwrite
 * - Validates schema version
 * - Returns hash and record count for conflict detection
 */

const FILE_NAME = 'genshin-wish-export-data.json';
const BACKUP_FOLDER_NAME = 'genshin-wish-export-backups';
const CURRENT_SCHEMA_VERSION = 1;

/**
 * Handle POST requests - the main entry point for the API
 */
function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    
    switch (action) {
      case 'metadata':
        return jsonResponse(getMetadata());
      case 'upload':
        return jsonResponse(uploadData(request));
      case 'download':
        return jsonResponse(downloadData());
      case 'backup':
        return jsonResponse(createBackup());
      default:
        return jsonResponse({ status: 'error', error: 'Invalid action: ' + action });
    }
  } catch (err) {
    return jsonResponse({ status: 'error', error: err.toString() });
  }
}

/**
 * Handle GET requests - returns metadata for simple health checks
 */
function doGet(e) {
  try {
    return jsonResponse(getMetadata());
  } catch (err) {
    return jsonResponse({ status: 'error', error: err.toString() });
  }
}

/**
 * Create a JSON response
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Get the main data file, or null if it doesn't exist
 */
function getDataFile() {
  const files = DriveApp.getFilesByName(FILE_NAME);
  if (files.hasNext()) {
    return files.next();
  }
  return null;
}

/**
 * Get or create the backup folder
 */
function getBackupFolder() {
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

/**
 * Calculate SHA-256 hash of content
 */
function calculateHash(content) {
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, content);
  return rawHash.map(function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/**
 * Count total records in UIGF data
 */
function countRecords(data) {
  let count = 0;
  
  // UIGF 4.x format (hk4e array)
  if (data && data.hk4e && Array.isArray(data.hk4e)) {
    data.hk4e.forEach(function(account) {
      if (account.list && Array.isArray(account.list)) {
        count += account.list.length;
      }
    });
  }
  // UIGF 3.x format (list array)
  else if (data && data.list && Array.isArray(data.list)) {
    count = data.list.length;
  }
  
  return count;
}

/**
 * Get metadata about the cloud file
 */
function getMetadata() {
  const file = getDataFile();
  
  if (!file) {
    return {
      status: 'ok',
      exists: false,
      cloudTimestamp: null,
      cloudHash: null,
      recordCount: 0
    };
  }
  
  const content = file.getBlob().getDataAsString();
  const data = JSON.parse(content);
  
  return {
    status: 'ok',
    exists: true,
    cloudTimestamp: file.getLastUpdated().getTime(),
    cloudHash: calculateHash(content),
    recordCount: countRecords(data),
    schemaVersion: data._schemaVersion || 1
  };
}

/**
 * Upload data to cloud (with automatic backup)
 */
function uploadData(request) {
  // Validate schema version
  if (request.schemaVersion && request.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return {
      status: 'error',
      error: 'Incompatible schema version. Please update the Apps Script.'
    };
  }
  
  const payload = request.payload;
  if (!payload) {
    return {
      status: 'error',
      error: 'Missing payload in upload request'
    };
  }
  
  // Add metadata to payload
  payload._schemaVersion = CURRENT_SCHEMA_VERSION;
  payload._uploadTimestamp = Date.now();
  payload._clientId = request.clientId || 'unknown';
  payload._appVersion = request.appVersion || 'unknown';
  
  const content = JSON.stringify(payload);
  const hash = calculateHash(content);
  
  // Create backup of existing file before overwriting
  const existingFile = getDataFile();
  if (existingFile) {
    createBackupOfFile(existingFile);
  }
  
  // Write new data
  let file;
  if (existingFile) {
    existingFile.setContent(content);
    file = existingFile;
  } else {
    file = DriveApp.createFile(FILE_NAME, content, MimeType.PLAIN_TEXT);
  }
  
  return {
    status: 'ok',
    cloudTimestamp: file.getLastUpdated().getTime(),
    cloudHash: hash,
    recordCount: countRecords(payload),
    fileId: file.getId()
  };
}

/**
 * Download data from cloud
 */
function downloadData() {
  const file = getDataFile();
  
  if (!file) {
    return {
      status: 'error',
      error: 'No data file found in cloud storage',
      exists: false
    };
  }
  
  const content = file.getBlob().getDataAsString();
  const data = JSON.parse(content);
  
  return {
    status: 'ok',
    cloudTimestamp: file.getLastUpdated().getTime(),
    cloudHash: calculateHash(content),
    recordCount: countRecords(data),
    schemaVersion: data._schemaVersion || 1,
    payload: data
  };
}

/**
 * Create a backup of the current data file
 */
function createBackup() {
  const file = getDataFile();
  
  if (!file) {
    return {
      status: 'ok',
      message: 'No file to backup',
      backupCreated: false
    };
  }
  
  const backupFile = createBackupOfFile(file);
  
  return {
    status: 'ok',
    backupCreated: true,
    backupFileName: backupFile.getName(),
    backupFileId: backupFile.getId()
  };
}

/**
 * Create a backup copy of a file
 */
function createBackupOfFile(file) {
  const folder = getBackupFolder();
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm-ss');
  const backupName = 'backup_' + timestamp + '_' + FILE_NAME;
  
  const content = file.getBlob().getDataAsString();
  return folder.createFile(backupName, content, MimeType.PLAIN_TEXT);
}
