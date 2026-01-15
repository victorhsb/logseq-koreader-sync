import '@logseq/libs'
import { BlockEntity, BlockUUID } from '@logseq/libs/dist/LSPlugin'
import { get as getStorage, set as setStorage } from 'idb-keyval'
import { ProgressNotification } from '../progress'
import { getBookSettings } from '../settings'
import { getMetadataFiles, verifyPermission } from '../filesystem'
import { lua_to_block } from '../metadata'
import { insertBlockTree } from '../block-tree'
import { showErrorToUser, waitForPage } from '../utils'

export async function syncSinglePageMode(directoryHandle: any): Promise<void> {
  const settings = getBookSettings()
  const pageName = settings.syncPageName

  logseq.App.pushState('page', { name: pageName })

  const currentPage = await waitForPage(pageName)
  const syncTimeLabel = (new Date()).toLocaleString()

  const pageBlocksTree = await logseq.Editor.getCurrentPageBlocksTree()

  let targetBlock: BlockEntity | null = null
  let warningBlockFound = false

  for (const block of pageBlocksTree) {
    if (block?.content.includes("LKRS")) {
      targetBlock = block
      continue
    } else if (block?.content.includes("BEGIN_WARNING")) {
      warningBlockFound = true
    }
  }

  if (!warningBlockFound) {
    await insertBlockTree(currentPage.uuid, {
      content: "\n#+BEGIN_WARNING\nPlease do not edit this page; stick to block references made elsewhere.\n#+END_WARNING"
    }, { sibling: false })
  }

  const original_content = targetBlock?.content
  if (targetBlock === null || targetBlock === undefined) {
    targetBlock = await logseq.Editor.insertBlock(currentPage.uuid, '🚀 LKRS: Please Select KOReader Metadata Directory ...',)
  } else {
    await logseq.Editor.updateBlock(targetBlock!.uuid, `🚀 LKRS: Please Select KOReader Metadata Directory ...`)
  }

  let directoryHandleFinal: any = await getStorage('logseq_koreader_sync__directoryHandle')

  let permission
  if (directoryHandleFinal) {
    permission = await verifyPermission(directoryHandleFinal)
  }

  if (!directoryHandleFinal || !permission) {
    try {
      directoryHandleFinal = await window.showDirectoryPicker()
    } catch (e) {
      if (original_content) {
        await logseq.Editor.updateBlock(targetBlock!.uuid, original_content)
      } else {
        await logseq.Editor.updateBlock(targetBlock!.uuid, "# ❌ LKRS: Sync cancelled by user.")
      }
      const errorDetails = e instanceof Error ? e.message : String(e)
      await showErrorToUser("Failed to select KOReader directory. Please try again.", `Directory selection error: ${errorDetails}`)
      return
    }

    if (logseq.settings?.rememberDirectory) {
      setStorage('logseq_koreader_sync__directoryHandle', directoryHandleFinal)
    }
  }

  if (!directoryHandleFinal) {
    await showErrorToUser("No KOReader directory selected.", "Directory handle is null or undefined. Please select a valid KOReader metadata directory.")
    return
  }

  await logseq.Editor.updateBlock(targetBlock!.uuid, `# ⚙ LKRS: Processing KOReader Annotations ...`)

  const files = await getMetadataFiles(directoryHandleFinal)
  const fileCount = files.length

  let ret
  try {
    ret = await logseq.DB.datascriptQuery(`
    [
        :find (pull ?b [:block/content :block/uuid]) ?authors
        :where
          [?b :block/parent ?p]
          [?p :block/uuid #uuid "${targetBlock!.uuid}"]
          [?b :block/properties ?props]
          [(get ?props :authors) ?authors]
    ]
    `)
  } catch (e) {
    const errorDetails = e instanceof Error ? e.message : String(e)
    await showErrorToUser("Failed to query existing blocks. Please check your database and try again.", `Datascript query error: ${errorDetails}`)
    return
  }

  const titleMatch: RegExp = /##\s+(.*?)\n/

  const existingBlocks = {}
  for (const block of ret) {
    const authors = block[1]
    const content = block[0]["content"]
    const match = content?.match(titleMatch)
    const title = match[1]

    const key = authors + "___" + title
    if (!(key in existingBlocks)) {
      const block_uuid = block[0]["uuid"]
      if (block_uuid) {
        existingBlocks[key] = block_uuid
      }
    }
  }

  const syncProgress = new ProgressNotification("Syncing Koreader Annotations to Logseq:", fileCount)

  for (const fileHandle of files) {
    const text = await fileHandle.text()
    const { block: parsed_block } = lua_to_block(text)

    if (parsed_block) {
      let key: string
      if (parsed_block.properties!.authors === undefined) {
        key = "___" + parsed_block.content.substring(3)
      } else {
        key = parsed_block.properties!.authors + "___" + parsed_block.content.substring(3)
      }

      if (key in existingBlocks) {
        const existing_block = await logseq.Editor.getBlock(existingBlocks[key])
        if (existing_block === null) {
          const errorDetails = `Block UUID ${existingBlocks[key]} not found during sync.`
          await showErrorToUser("Sync warning: A previously synced block could not be found.", errorDetails)
          continue
        }

        let existing_bookmark_blocks
        let existing_bookmark_block_uuid

        for (const child of existing_block!.children!) {
          const child_block = await logseq.Editor.getBlock(child[1] as BlockEntity)

          if (child_block!.content === "### Bookmarks") {
            existing_bookmark_blocks = child_block!.children
            existing_bookmark_block_uuid = child[1]

            break
          }
        }

        if (existing_bookmark_blocks === undefined) {
          const errorDetails = `No bookmarks section found for block ${existingBlocks[key]}. The book may have been corrupted or manually edited.`
          await showErrorToUser("Sync warning: Bookmarks section missing for a synced book.", errorDetails)
          continue
        }

        const existing_bookmarks = {}
        for (const bookmark of existing_bookmark_blocks) {
          const bookmark_block = await logseq.Editor.getBlock(bookmark[1] as BlockEntity)

          if (!bookmark_block?.content) {
            continue
          }

          const isPageBookmark = bookmark_block.content.trim() === "> Page bookmark"
          if (!settings.syncPageBookmarks && isPageBookmark) {
            await logseq.Editor.removeBlock(bookmark[1] as BlockUUID)
            continue
          }

          const content_start = bookmark_block!.content!.indexOf("\n> ")
          const content = bookmark_block!.content!.substring(content_start + 3).replace('-', '\\-')

          existing_bookmarks[content] = bookmark[1]
        }

        for (const bookmark of parsed_block.children![0].children!) {
          const key = bookmark.content.substring(2)

          let parsed_personal_note = false
          if (bookmark.children && bookmark.children.length > 0) {
            parsed_personal_note = true
          }

          if (key in existing_bookmarks) {
            const existing_bookmark = await logseq.Editor.getBlock(existing_bookmarks[key])

            if (existing_bookmark!.children && existing_bookmark!.children!.length > 0) {
              const existing_note = existing_bookmark!.children![0]

              if (!parsed_personal_note) {
                await logseq.Editor.removeBlock(existing_note[1] as BlockUUID)
              } else {
                const existing_note_block = await logseq.Editor.getBlock(existing_note[1] as BlockEntity)

                if (existing_note_block!.content !== bookmark.children![0].content) {
                  await logseq.Editor.updateBlock(existing_note[1] as string, bookmark.children![0].content)
                }
              }
            } else {
              if (parsed_personal_note) {
                await insertBlockTree(existing_bookmark!.uuid, bookmark.children![0], { sibling: false })
              }
            }
          } else {
            await insertBlockTree(existing_bookmark_block_uuid, bookmark, { sibling: false })
          }
        }
      } else {
        await insertBlockTree(targetBlock!.uuid, parsed_block, { sibling: false })
      }
    }
    syncProgress.increment(1)
  }

  await logseq.Editor.updateBlock(targetBlock!.uuid, `# 📚 LKRS: KOReader - Sync Initiated at ${syncTimeLabel}`)

  syncProgress.destruct()
}
