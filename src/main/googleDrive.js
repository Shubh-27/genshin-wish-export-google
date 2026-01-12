const { google } = require('googleapis')
const config = require('./config')
const { ipcMain, shell } = require('electron')
const http = require('http')
const url = require('url')
const { generateUigf30Json, importUgif30Json } = require('./UIGFJson')

const SCOPES = ['https://www.googleapis.com/auth/drive.file']

const getAuthClient = () => {
    if (!config.googleClientId || !config.googleClientSecret) {
        throw new Error('Please set Google Client ID and Secret in settings.')
    }
    return new google.auth.OAuth2(
        config.googleClientId,
        config.googleClientSecret,
        'http://127.0.0.1:42898/callback'
    )
}

const authenticate = () => {
    return new Promise((resolve, reject) => {
        try {
            const oauth2Client = getAuthClient()
            const authUrl = oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: SCOPES
            })

            const server = http.createServer(async (req, res) => {
                try {
                    if (req.url.startsWith('/callback')) {
                        const qs = new url.URL(req.url, 'http://127.0.0.1:42898').searchParams
                        const code = qs.get('code')
                        res.end('Authentication successful! You can close this window.')
                        server.close()
                        const { tokens } = await oauth2Client.getToken(code)
                        oauth2Client.setCredentials(tokens)
                        config.googleRefreshToken = tokens.refresh_token
                        await config.save()
                        resolve(tokens)
                    }
                } catch (e) {
                    res.end('Authentication failed.')
                    server.close()
                    reject(e)
                }
            }).listen(42898, () => {
                shell.openExternal(authUrl)
            })

            server.on('error', (e) => {
                reject(e)
            })
        } catch (e) {
            reject(e)
        }
    })
}

const getDriveClient = async () => {
    const oauth2Client = getAuthClient()
    if (config.googleRefreshToken) {
        oauth2Client.setCredentials({ refresh_token: config.googleRefreshToken })
    } else {
        throw new Error('Not authenticated. Please auth first.')
    }
    return google.drive({ version: 'v3', auth: oauth2Client })
}

const uploadFile = async () => {
    const drive = await getDriveClient()
    const data = await generateUigf30Json()
    const fileMetadata = {
        name: `genshin-wish-export-data-${data.info.uid}.json`,
        mimeType: 'application/json'
    }
    const media = {
        mimeType: 'application/json',
        body: JSON.stringify(data)
    }

    try {
        if (config.googleDriveFileId) {
            // Update existing file
            await drive.files.update({
                fileId: config.googleDriveFileId,
                resource: fileMetadata,
                media: media,
                fields: 'id'
            })
        } else {
            // Create new file
            const file = await drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id'
            })
            config.googleDriveFileId = file.data.id
            await config.save()
        }
        return 'success'
    } catch (err) {
        // If file not found (e.g. deleted), try create
        if (err.code === 404 && config.googleDriveFileId) {
            config.googleDriveFileId = ''
            return uploadFile()
        }
        throw err
    }
}

const downloadFile = async () => {
    const drive = await getDriveClient()
    if (!config.googleDriveFileId) {
        throw new Error('No synced file found.')
    }

    const response = await drive.files.get({
        fileId: config.googleDriveFileId,
        alt: 'media'
    })

    const data = response.data
    // Validate and import (assuming 3.0 for now as we export 3.0)
    if (data && data.info && data.list) {
        await importUgif30Json(data)
        return 'success'
    } else {
        throw new Error('Invalid file format from Drive')
    }
}

ipcMain.handle('GOOGLE_DRIVE_AUTH', async () => {
    try {
        await authenticate()
        return 'success'
    } catch (e) {
        return e.message
    }
})

ipcMain.handle('GOOGLE_DRIVE_UPLOAD', async () => {
    try {
        return await uploadFile()
    } catch (e) {
        return e.message
    }
})

ipcMain.handle('GOOGLE_DRIVE_DOWNLOAD', async () => {
    try {
        return await downloadFile()
    } catch (e) {
        return e.message
    }
})
