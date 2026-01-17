<template>
  <div class="bg-white pt-2 pb-4 px-6 w-full h-full absolute inset-0">
    <div class="flex content-center items-center mb-4 justify-between">
      <h3 class="text-lg">{{text.title}}</h3>
      <el-button icon="close" @click="closeSetting" plain circle type="default" class="w-8 h-8 relative -right-4 -top-2 shadow-md focus:shadow-none focus:outline-none"></el-button>
    </div>
    <el-form :model="settingForm" label-width="120px">
      <el-form-item :label="text.language">
        <el-select @change="saveLang" v-model="settingForm.lang">
          <el-option v-for="item of data.langMap" :key="item[0]" :label="item[1]" :value="item[0]"></el-option>
        </el-select>
        <p class="text-gray-400 text-xs m-1.5">{{text.languageHint}}</p>
      </el-form-item>
      <el-form-item :label="text.logType">
        <el-radio-group @change="saveSetting" v-model.number="settingForm.logType">
          <el-radio-button :label="0">{{text.auto}}</el-radio-button>
          <el-radio-button :label="1">{{text.cnServer}}</el-radio-button>
          <el-radio-button :label="2">{{text.seaServer}}</el-radio-button>
          <el-radio-button v-if="settingForm.lang === 'zh-cn'" :label="3">云原神</el-radio-button>
        </el-radio-group>
        <p class="text-gray-400 text-xs m-1.5">{{text.logTypeHint}}</p>
      </el-form-item>
      <el-form-item :label="text.UIGFLable">
        <div class="flex space-x-2">
          <el-button :loading="data.loadingOfUIGFJSON" class="focus:outline-none" plain type="primary" @click="importUIGFJSON">{{ text.UIGFImportButton }}</el-button>
          <el-button :loading="data.loadingOfUIGFJSON" class="focus:outline-none" plain type="success" @click="exportUIGFJSON">{{ text.UIGFButton }}</el-button>
          <el-select class="w-24" v-model="settingForm.uigfVersion">
            <el-option
              v-for="version in uigfSupportedVersions"
              :key="version"
              :label="'UIGFv' + version"
              :value="version"
            />
          </el-select>
          <el-checkbox v-if="settingForm.uigfVersion === uigfSupportedVersions[0]" v-model="settingForm.uigfAllAccounts">{{ text.UIGFAllAccounts }}</el-checkbox>
          <el-checkbox v-model="settingForm.readableJSON" @change="saveSetting">{{ text.UIGFReadable }}</el-checkbox>
        </div>
        <p class="text-gray-400 text-xs m-1.5 leading-normal">{{ text.UIGFHint }}
          <a class="cursor-pointer text-blue-400"
             @click="openLink(`https://uigf.org/${settingForm.lang.startsWith('zh-') ? 'zh/': 'en/'}`)"
          >{{ text.UIGFLink }}</a>
        </p>
      </el-form-item>
      <el-form-item :label="text.autoUpdate">
        <el-switch
          @change="saveSetting"
          v-model="settingForm.autoUpdate">
        </el-switch>
      </el-form-item>
      <el-form-item :label="text.hideNovice">
        <el-switch
          @change="saveSetting"
          v-model="settingForm.hideNovice">
        </el-switch>
      </el-form-item>
      <el-form-item :label="text.fetchFullHistory">
        <el-switch
          @change="saveSetting"
          v-model="settingForm.fetchFullHistory">
        </el-switch>
        <p class="text-gray-400 text-xs m-1.5">{{text.fetchFullHistoryHint}}</p>
      </el-form-item>

      <!-- Cloud Sync Section -->
      <el-form-item :label="cloudSync.title">
        <div class="flex flex-col space-y-3 w-full">
          <p class="text-gray-500 text-xs">{{ cloudSync.description }}</p>
          
          <!-- Apps Script URL Input -->
          <el-input 
            v-model="settingForm.googleAppsScriptUrl" 
            :placeholder="cloudSync.urlPlaceholder"
            size="small"
            @change="saveGoogleConfig"
            :suffix-icon="settingForm.googleAppsScriptUrl ? CircleCheck : CircleClose"
          >
          </el-input>
          <div class="text-xs" :class="settingForm.googleAppsScriptUrl ? 'text-green-500' : 'text-red-500'">
            <span v-if="settingForm.googleAppsScriptUrl">{{ cloudSync.configured }}</span>
            <span v-else>{{ cloudSync.notConfigured }}</span>
          </div>
          
          <!-- Sync Buttons -->
          <div class="flex space-x-2">
            <el-tooltip :content="cloudSync.uploadTooltip" placement="top">
              <el-button 
                @click="handleCloudUpload" 
                type="success" 
                plain 
                size="small" 
                :loading="cloudSyncState.uploading"
                :disabled="!settingForm.googleAppsScriptUrl || cloudSyncState.loading"
              >
                <el-icon class="mr-1"><Upload /></el-icon>
                {{ cloudSync.uploadButton }}
              </el-button>
            </el-tooltip>
            <el-tooltip :content="cloudSync.downloadTooltip" placement="top">
              <el-button 
                @click="handleCloudDownload" 
                type="warning" 
                plain 
                size="small"
                :loading="cloudSyncState.downloading"
                :disabled="!settingForm.googleAppsScriptUrl || cloudSyncState.loading"
              >
                <el-icon class="mr-1"><Download /></el-icon>
                {{ cloudSync.downloadButton }}
              </el-button>
            </el-tooltip>
          </div>
          
          <!-- Last Sync Info -->
          <div v-if="formattedSyncDate" class="text-xs text-gray-500">
            {{ cloudSync.lastSync }}: {{ formattedSyncDate }}
          </div>
        </div>
      </el-form-item>
    </el-form>
    <h3 class="text-lg my-4">{{about.title}}</h3>
    <p class="text-gray-600 text-xs mt-1">{{about.license}}</p>
    <p class="text-gray-600 text-xs mt-1 pb-6">Github: <a @click="openGithub" class="cursor-pointer text-blue-400">https://github.com/biuuu/genshin-wish-export</a></p>

    <!-- Cloud Sync Confirmation Dialog -->
    <el-dialog 
      v-model="cloudSyncDialog.visible" 
      :title="cloudSync.confirmTitle"
      width="480px"
      :close-on-click-modal="false"
    >
      <div class="space-y-4">
        <!-- Conflict Warning -->
        <el-alert 
          v-if="cloudSyncDialog.hasConflict" 
          :title="cloudSync.conflictWarning"
          type="warning" 
          show-icon
          :closable="false"
        />
        
        <!-- Comparison Table -->
        <el-table :data="cloudSyncDialog.comparisonData" border size="small">
          <el-table-column prop="label" label="" width="140" />
          <el-table-column prop="local" :label="cloudSync.localData" align="center" />
          <el-table-column prop="cloud" :label="cloudSync.cloudData" align="center" />
        </el-table>
        
        <!-- Action Description -->
        <div class="text-sm text-gray-600">
          <span v-if="cloudSyncDialog.action === 'upload'">{{ cloudSync.uploadConfirmHint }}</span>
          <span v-else>{{ cloudSync.downloadConfirmHint }}</span>
        </div>
      </div>
      
      <template #footer>
        <div class="flex justify-end space-x-2">
          <el-button @click="cloudSyncDialog.visible = false">{{ cloudSync.cancel }}</el-button>
          <el-button 
            v-if="cloudSyncDialog.action === 'upload'" 
            type="danger" 
            @click="confirmCloudUpload"
          >
            {{ cloudSync.overwriteCloud }}
          </el-button>
          <el-button 
            v-else 
            type="danger" 
            @click="confirmCloudDownload"
          >
            {{ cloudSync.overwriteLocal }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
const { ipcRenderer, shell } = require('electron')
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { CircleCheck, CircleClose, Upload, Download } from '@element-plus/icons-vue'

const emit = defineEmits(['close', 'changeLang', 'dataUpdated'])

const props = defineProps({
  i18n: Object
})

const data = reactive({
  langMap: new Map(),
  loadingOfUIGFJSON: false
})

const settingForm = reactive({
  lang: 'zh-cn',
  logType: 1,
  proxyMode: true,
  autoUpdate: true,
  fetchFullHistory: false,
  hideNovice: true,
  gistsToken: '',
  uigfVersion: "4.1",
  uigfAllAccounts: true,
  readableJSON: false,
  googleAppsScriptUrl: '',
  googleDriveLastSync: 0
})

const uigfSupportedVersions = [
  "4.1",
  "3.0"
]

// Cloud Sync State
const cloudSyncState = reactive({
  loading: false,
  uploading: false,
  downloading: false
})

// Cloud Sync Dialog
const cloudSyncDialog = reactive({
  visible: false,
  action: '', // 'upload' or 'download'
  hasConflict: false,
  comparisonData: [],
  metadata: null
})

const text = computed(() => props.i18n.ui.setting)
const about = computed(() => props.i18n.ui.about)

// Cloud Sync i18n with fallbacks
const cloudSync = computed(() => {
  const cs = props.i18n.ui.cloudSync || {}
  return {
    title: cs.title || 'Cloud Sync (Google Drive)',
    description: cs.description || 'Back up and restore your wish history using Google Drive.',
    urlPlaceholder: cs.urlPlaceholder || 'Google Apps Script URL',
    configured: cs.configured || 'Configured',
    notConfigured: cs.notConfigured || 'Not Configured',
    uploadButton: cs.uploadButton || 'Upload to Cloud',
    uploadTooltip: cs.uploadTooltip || 'Upload your local wish history to Google Drive.',
    downloadButton: cs.downloadButton || 'Download from Cloud',
    downloadTooltip: cs.downloadTooltip || 'Replace or merge your local data with the cloud backup.',
    lastSync: cs.lastSync || 'Last Sync',
    confirmTitle: cs.confirmTitle || 'Confirm Sync Operation',
    localData: cs.localData || 'Local',
    cloudData: cs.cloudData || 'Cloud',
    lastModified: cs.lastModified || 'Last Modified',
    recordCount: cs.recordCount || 'Record Count',
    conflictWarning: cs.conflictWarning || 'Warning: Local and cloud data differ. Choose which version to keep.',
    overwriteLocal: cs.overwriteLocal || 'Overwrite Local',
    overwriteCloud: cs.overwriteCloud || 'Overwrite Cloud',
    cancel: cs.cancel || 'Cancel',
    uploadSuccess: cs.uploadSuccess || 'Data uploaded to cloud successfully.',
    downloadSuccess: cs.downloadSuccess || 'Data downloaded from cloud successfully.',
    noCloudData: cs.noCloudData || 'No data found in cloud storage.',
    networkError: cs.networkError || 'Network error. Please check your connection.',
    uploadConfirmHint: cs.uploadConfirmHint || 'This will replace the cloud backup with your local data.',
    downloadConfirmHint: cs.downloadConfirmHint || 'This will replace your local data with the cloud backup. A local backup will be created first.'
  }
})

const formattedSyncDate = computed(() => {
  if (!settingForm.googleDriveLastSync) return ''
  return new Date(settingForm.googleDriveLastSync).toLocaleString()
})

const saveSetting = async () => {
  const keys = ['lang', 'logType', 'proxyMode', 'autoUpdate', 'fetchFullHistory', 'hideNovice', 'gistsToken', 'readableJSON', 'googleAppsScriptUrl', 'googleDriveLastSync']
  for (let key of keys) {
    await ipcRenderer.invoke('SAVE_CONFIG', [key, settingForm[key]])
  }
}

const saveLang = async () => {
  await saveSetting()
  emit('changeLang')
}

const closeSetting = () => emit('close')

const disableProxy = async () => {
  await ipcRenderer.invoke('DISABLE_PROXY')
}

const openGithub = () => shell.openExternal('https://github.com/biuuu/genshin-wish-export')
const openLink = (link) => shell.openExternal(link)

const exportUIGFJSON = async () => {
  data.loadingOfUIGFJSON = true
  try {
    await ipcRenderer.invoke('EXPORT_UIGF_JSON', settingForm.uigfVersion, settingForm.uigfAllAccounts)
  } catch (e) {
    ElMessage({
      message: e.message || e,
      type: 'error'
    })
  } finally {
    data.loadingOfUIGFJSON = false
  }
}

const importUIGFJSON = async () => {
  data.loadingOfUIGFJSON = true
  try {
    const result = await ipcRenderer.invoke('IMPORT_UIGF_JSON')
    if (result === 'canceled') {
      return
    }
    emit('dataUpdated')
    closeSetting()
    ElMessage({
      message: text.value.UIGFImportSuccessed,
      type: 'success'
    })
  } catch (e) {
    ElMessage({
      message: e.message || e,
      type: 'error'
    })
  } finally {
    data.loadingOfUIGFJSON = false
  }
}

const gistsConfigDisabled = ref(true)

const configGistsToken = () => {
  gistsConfigDisabled.value = false
  openLink('https://github.com/settings/personal-access-tokens/new')
}

const saveGistsToken = async () => {
  gistsConfigDisabled.value = true
  await saveSetting()
}

const uploadGistsLoading = ref(false)
const uploadGists = async () => {
  uploadGistsLoading.value = true
  const result = await ipcRenderer.invoke('EXPORT_UIGF_JSON_GISTS')
  if (result === 'successed') {
    ElMessage({
      message: '上传数据成功',
      type: 'success',
    })
  } else {
    ElMessage({
      message: result,
      type: 'error',
    })
  }
  uploadGistsLoading.value = false
}

// ============================================
// Cloud Sync Functions
// ============================================

const handleCloudUpload = async () => {
  cloudSyncState.loading = true
  try {
    // Get metadata to check if we need confirmation
    const result = await ipcRenderer.invoke('CLOUD_SYNC_GET_METADATA')
    
    if (result.status === 'error') {
      ElMessage.error(result.error || cloudSync.value.networkError)
      return
    }
    
    // If cloud has data, show confirmation dialog
    if (result.cloud.exists) {
      cloudSyncDialog.action = 'upload'
      cloudSyncDialog.hasConflict = result.hasConflict
      cloudSyncDialog.metadata = result
      cloudSyncDialog.comparisonData = [
        { 
          label: cloudSync.value.lastModified, 
          local: result.local.timestampFormatted, 
          cloud: result.cloud.timestampFormatted 
        },
        { 
          label: cloudSync.value.recordCount, 
          local: result.local.recordCount.toLocaleString(), 
          cloud: result.cloud.recordCount.toLocaleString() 
        }
      ]
      cloudSyncDialog.visible = true
    } else {
      // No cloud data, proceed directly
      await performUpload()
    }
  } catch (e) {
    ElMessage.error(e.message || cloudSync.value.networkError)
  } finally {
    cloudSyncState.loading = false
  }
}

const handleCloudDownload = async () => {
  cloudSyncState.loading = true
  try {
    // Get metadata to check if cloud has data
    const result = await ipcRenderer.invoke('CLOUD_SYNC_GET_METADATA')
    
    if (result.status === 'error') {
      ElMessage.error(result.error || cloudSync.value.networkError)
      return
    }
    
    if (!result.cloud.exists) {
      ElMessage.warning(cloudSync.value.noCloudData)
      return
    }
    
    // Show confirmation dialog
    cloudSyncDialog.action = 'download'
    cloudSyncDialog.hasConflict = result.hasConflict
    cloudSyncDialog.metadata = result
    cloudSyncDialog.comparisonData = [
      { 
        label: cloudSync.value.lastModified, 
        local: result.local.timestampFormatted, 
        cloud: result.cloud.timestampFormatted 
      },
      { 
        label: cloudSync.value.recordCount, 
        local: result.local.recordCount.toLocaleString(), 
        cloud: result.cloud.recordCount.toLocaleString() 
      }
    ]
    cloudSyncDialog.visible = true
  } catch (e) {
    ElMessage.error(e.message || cloudSync.value.networkError)
  } finally {
    cloudSyncState.loading = false
  }
}

const confirmCloudUpload = async () => {
  cloudSyncDialog.visible = false
  await performUpload()
}

const confirmCloudDownload = async () => {
  cloudSyncDialog.visible = false
  await performDownload()
}

const performUpload = async () => {
  cloudSyncState.uploading = true
  try {
    const result = await ipcRenderer.invoke('CLOUD_SYNC_UPLOAD')
    
    if (result.status === 'error') {
      ElMessage.error(result.error)
      return
    }
    
    // Update last sync time in local state
    settingForm.googleDriveLastSync = result.cloudTimestamp || Date.now()
    await saveSetting()
    
    ElMessage.success(cloudSync.value.uploadSuccess)
  } catch (e) {
    ElMessage.error(e.message || cloudSync.value.networkError)
  } finally {
    cloudSyncState.uploading = false
  }
}

const performDownload = async () => {
  cloudSyncState.downloading = true
  try {
    const result = await ipcRenderer.invoke('CLOUD_SYNC_DOWNLOAD')
    
    if (result.status === 'error') {
      ElMessage.error(result.error)
      return
    }
    
    // Update last sync time
    settingForm.googleDriveLastSync = result.cloudTimestamp || Date.now()
    await saveSetting()
    
    ElMessage.success(cloudSync.value.downloadSuccess)
    emit('dataUpdated')
    closeSetting()
  } catch (e) {
    ElMessage.error(e.message || cloudSync.value.networkError)
  } finally {
    cloudSyncState.downloading = false
  }
}

const saveGoogleConfig = async () => {
  await saveSetting()
  ElMessage.success('Configuration saved')
}

onMounted(async () => {
  data.langMap = await ipcRenderer.invoke('LANG_MAP')
  const config = await ipcRenderer.invoke('GET_CONFIG')
  Object.assign(settingForm, config)
})

</script>

<style>
.el-form-item__label {
  line-height: normal !important;
  position: relative;
  top: 6px;
}
.el-form-item__content {
  flex-direction: column;
  align-items: start !important;
}
.el-form-item--default {
  margin-bottom: 14px !important;
}
</style>
