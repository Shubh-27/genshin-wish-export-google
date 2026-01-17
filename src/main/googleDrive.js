/**
 * Genshin Wish Export - Google Drive Cloud Sync
 * 
 * Provides secure cloud backup/restore functionality with:
 * - Conflict detection via hash comparison
 * - Local backups before imports
 * - Confirmation dialogs before overwrites
 * - Automatic cloud backups before uploads
 */

const config = require('./config')
const { ipcMain, dialog, BrowserWindow } = require('electron')
const https = require('https')
const crypto = require('crypto')
const fs = require('fs-extra')
const path = require('path')
const { generateUigf30Json, generateUigf41Json, importUgif30Json, importUgif41Json } = require('./UIGFJson')
const { userDataPath } = require('./utils')

const SCHEMA_VERSION = 1
const APP_VERSION = require('../../package.json').version

/**
 * Generate a client ID for this installation (stored in config)
 */
const getClientId = () => {
    if (!config.cloudSyncClientId) {
        config.cloudSyncClientId = crypto.randomUUID()
        config.save()
    }
    return config.cloudSyncClientId
}

/**
 * Calculate SHA-256 hash of data
 */
const calculateHash = (data) => {
    const content = typeof data === 'string' ? data : JSON.stringify(data)
    return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * Count total records in UIGF data
 */
const countRecords = (data) => {
    let count = 0

    // UIGF 4.x format
    if (data && data.hk4e && Array.isArray(data.hk4e)) {
        data.hk4e.forEach(account => {
            if (account.list && Array.isArray(account.list)) {
                count += account.list.length
            }
        })
    }
    // UIGF 3.x format
    else if (data && data.list && Array.isArray(data.list)) {
        count = data.list.length
    }

    return count
}

/**
 * Make HTTP request to Apps Script API
 */
const makeRequest = (payload = null, requestUrl = null) => {
    return new Promise((resolve, reject) => {
        if (!config.googleAppsScriptUrl && !requestUrl) {
            return reject(new Error('Please set Google Apps Script URL in settings.'))
        }

        const targetUrlStr = requestUrl || config.googleAppsScriptUrl
        const url = new URL(targetUrlStr)
        const isRedirect = !!requestUrl

        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }

        // For redirects, use GET
        if (isRedirect) {
            options.method = 'GET'
        }

        const req = https.request(options, (res) => {
            // Handle Redirects (302/301/307)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const location = res.headers.location
                const newUrl = new URL(location, targetUrlStr).toString()
                makeRequest(null, newUrl)
                    .then(resolve)
                    .catch(reject)
                return
            }

            let responseBody = ''
            res.on('data', (chunk) => {
                responseBody += chunk
            })
            res.on('end', () => {
                try {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(responseBody))
                        } catch (jsonErr) {
                            reject(new Error(`Failed to parse JSON response: ${jsonErr.message}`))
                        }
                    } else {
                        reject(new Error(`Request failed with status ${res.statusCode}: ${responseBody}`))
                    }
                } catch (e) {
                    reject(e)
                }
            })
        })

        req.on('error', (e) => {
            reject(e)
        })

        req.setTimeout(30000, () => {
            req.destroy()
            reject(new Error('Request timeout'))
        })

        if (payload && !isRedirect) {
            req.write(JSON.stringify(payload))
        }
        req.end()
    })
}

/**
 * Get metadata from cloud
 */
const getCloudMetadata = async () => {
    const response = await makeRequest({ action: 'metadata' })
    if (response.status === 'error') {
        throw new Error(response.error)
    }
    return response
}

/**
 * Get local data metadata
 */
const getLocalMetadata = async () => {
    try {
        let data
        if (config.uigfVersion === '3.0') {
            data = await generateUigf30Json()
        } else {
            data = await generateUigf41Json(config.uigfAllAccounts)
        }

        const content = JSON.stringify(data)

        return {
            exists: true,
            localTimestamp: config.googleDriveLastSync || Date.now(),
            localHash: calculateHash(content),
            recordCount: countRecords(data),
            data: data
        }
    } catch (e) {
        // No local data available (e.g., "数据为空" error)
        return {
            exists: false,
            localTimestamp: null,
            localHash: null,
            recordCount: 0,
            data: null
        }
    }
}

/**
 * Create local backup before import
 */
const createLocalBackup = async () => {
    try {
        const backupDir = path.join(userDataPath, 'cloud-sync-backups')
        await fs.ensureDir(backupDir)

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const backupFileName = `backup_${timestamp}.json`
        const backupPath = path.join(backupDir, backupFileName)

        // Generate current data
        let data
        if (config.uigfVersion === '3.0') {
            data = await generateUigf30Json()
        } else {
            data = await generateUigf41Json(config.uigfAllAccounts)
        }

        await fs.writeJson(backupPath, data, { spaces: 2 })

        // Keep only last 10 backups
        const files = await fs.readdir(backupDir)
        const backups = files.filter(f => f.startsWith('backup_')).sort().reverse()
        for (let i = 10; i < backups.length; i++) {
            await fs.remove(path.join(backupDir, backups[i]))
        }

        return backupPath
    } catch (e) {
        // No local data to backup (e.g., "数据为空" error)
        return null
    }
}

/**
 * Upload data to cloud
 */
const uploadToCloud = async () => {
    // Generate data
    let data
    if (config.uigfVersion === '3.0') {
        data = await generateUigf30Json()
    } else {
        data = await generateUigf41Json(config.uigfAllAccounts)
    }

    const payload = {
        action: 'upload',
        schemaVersion: SCHEMA_VERSION,
        appVersion: APP_VERSION,
        clientId: getClientId(),
        timestamp: Date.now(),
        dataHash: calculateHash(data),
        payload: data
    }

    const response = await makeRequest(payload)

    if (response.status === 'error') {
        throw new Error(response.error)
    }

    config.googleDriveLastSync = Date.now()
    await config.save()

    return response
}

/**
 * Download data from cloud and import
 */
const downloadFromCloud = async () => {
    const response = await makeRequest({ action: 'download' })

    if (response.status === 'error') {
        throw new Error(response.error)
    }

    if (!response.payload) {
        throw new Error('No data payload in response')
    }

    // Validate schema version
    if (response.schemaVersion && response.schemaVersion > SCHEMA_VERSION) {
        throw new Error('Incompatible data format version. Please update the application.')
    }

    const data = response.payload

    // Import the data
    if (data && data.info) {
        if (data.hk4e) {
            await importUgif41Json(data)
        } else if (data.list) {
            await importUgif30Json(data)
        } else {
            throw new Error('Invalid data format')
        }
    } else {
        throw new Error('Invalid data format: missing info field')
    }

    config.googleDriveLastSync = Date.now()
    await config.save()

    return response
}

/**
 * Format timestamp for display
 */
const formatTimestamp = (ts) => {
    if (!ts) return 'Never'
    return new Date(ts).toLocaleString()
}

// ============================================
// IPC Handlers
// ============================================

/**
 * Get comparison metadata for both local and cloud
 */
ipcMain.handle('CLOUD_SYNC_GET_METADATA', async () => {
    try {
        const [cloudMeta, localMeta] = await Promise.all([
            getCloudMetadata().catch(e => ({ exists: false, error: e.message })),
            getLocalMetadata().catch(e => ({ exists: false, error: e.message }))
        ])

        return {
            status: 'ok',
            cloud: {
                exists: cloudMeta.exists || false,
                timestamp: cloudMeta.cloudTimestamp,
                timestampFormatted: formatTimestamp(cloudMeta.cloudTimestamp),
                hash: cloudMeta.cloudHash,
                recordCount: cloudMeta.recordCount || 0
            },
            local: {
                exists: localMeta.exists || false,
                timestamp: localMeta.localTimestamp,
                timestampFormatted: formatTimestamp(localMeta.localTimestamp),
                hash: localMeta.localHash,
                recordCount: localMeta.recordCount || 0
            },
            hasConflict: cloudMeta.exists && localMeta.exists && cloudMeta.cloudHash !== localMeta.localHash
        }
    } catch (e) {
        return { status: 'error', error: e.message }
    }
})

/**
 * Upload to cloud (with confirmation already done in UI)
 */
ipcMain.handle('CLOUD_SYNC_UPLOAD', async () => {
    try {
        const result = await uploadToCloud()
        return {
            status: 'ok',
            cloudTimestamp: result.cloudTimestamp,
            recordCount: result.recordCount
        }
    } catch (e) {
        return { status: 'error', error: e.message }
    }
})

/**
 * Download from cloud (with confirmation already done in UI)
 */
ipcMain.handle('CLOUD_SYNC_DOWNLOAD', async () => {
    try {
        // Create local backup first
        const backupPath = await createLocalBackup()

        try {
            const result = await downloadFromCloud()
            return {
                status: 'ok',
                cloudTimestamp: result.cloudTimestamp,
                recordCount: result.recordCount,
                backupPath: backupPath
            }
        } catch (importError) {
            // Import failed - backup is preserved
            return {
                status: 'error',
                error: importError.message,
                backupPath: backupPath,
                backupPreserved: true
            }
        }
    } catch (e) {
        return { status: 'error', error: e.message }
    }
})

/**
 * Legacy handlers for backward compatibility
 */
ipcMain.handle('GOOGLE_DRIVE_AUTH', async () => {
    if (!config.googleAppsScriptUrl) {
        return 'Please enter the Apps Script URL in settings.'
    }
    return 'success'
})

ipcMain.handle('GOOGLE_DRIVE_UPLOAD', async () => {
    try {
        await uploadToCloud()
        return 'success'
    } catch (e) {
        return e.message
    }
})

ipcMain.handle('GOOGLE_DRIVE_DOWNLOAD', async () => {
    try {
        await createLocalBackup()
        await downloadFromCloud()
        return 'success'
    } catch (e) {
        return e.message
    }
})
