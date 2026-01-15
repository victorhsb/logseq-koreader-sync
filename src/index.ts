import '@logseq/libs'
import { get as getStorage, set as setStorage } from 'idb-keyval'
import { settings, onSettingsChange, getBookSettings } from './settings'
import { showErrorToUser } from './utils'
import { verifyPermission } from './filesystem'
import { syncSinglePageMode } from './sync/single'
import { syncPerPageMode } from './sync/per'

/**
 * main entry
 * @param baseInfo
 */
function main () {
  let loading = false

  logseq.useSettingsSchema(settings)
  logseq.provideModel({
    async syncKOReader () {
      onSettingsChange()
      logseq.onSettingsChanged(onSettingsChange)

      await logseq.App.getUserConfigs()
      if (loading) return

      loading = true

      const currentSettings = getBookSettings()

      let directoryHandle: any = await getStorage('logseq_koreader_sync__directoryHandle')

      let permission
      if (directoryHandle) {
        permission = await verifyPermission(directoryHandle)
      }

      if (!directoryHandle || !permission) {
        try {
          directoryHandle = await window.showDirectoryPicker()
        } catch (e) {
          const errorDetails = e instanceof Error ? e.message : String(e)
          await showErrorToUser("Failed to select KOReader directory. Please try again.", `Directory selection error: ${errorDetails}`)
          loading = false
          return
        }

        if (logseq.settings?.rememberDirectory) {
          setStorage('logseq_koreader_sync__directoryHandle', directoryHandle)
        }
      }

      if (!directoryHandle) {
        await showErrorToUser("No KOReader directory selected.", "Directory handle is null or undefined. Please select a valid KOReader metadata directory.")
        loading = false
        return
      }

      if (currentSettings.syncMode === "per-page") {
        await syncPerPageMode(directoryHandle)
      } else {
        await syncSinglePageMode(directoryHandle)
      }

      loading = false
    }
  })

  logseq.App.registerUIItem('toolbar', {
    key: 'koreader-sync',
    template: `
      <a data-on-click="syncKOReader" class="button">
        <i class="ti ti-book"></i>
      </a>
    `
  })
}

// bootstrap
logseq.ready(main).catch(console.error)

export { getBookSettings } from './settings'
export { normalizeAuthors, generatePageName, sanitizePageName, truncateString } from './utils'
export { handle_annotations_metadata, handle_bookmarks_metadata, lua_to_block } from './metadata'
