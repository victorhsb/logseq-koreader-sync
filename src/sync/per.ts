import '@logseq/libs'
import { ProgressNotification } from '../progress'
import { getBookSettings } from '../settings'
import { getMetadataFiles } from '../filesystem'
import { lua_to_block } from '../metadata'
import { BookInfo, createBookmarksSection, getOrCreateBookPage, updateIndexPage } from '../book-pages'
import { normalizeAuthors, waitForPage } from '../utils'
import { syncBookmarksToPage } from './bookmarks'

export async function syncPerPageMode(directoryHandle: any): Promise<void> {
  const settings = getBookSettings()
  const files = await getMetadataFiles(directoryHandle)
  const allBooks: BookInfo[] = []
  const syncProgress = new ProgressNotification(
    `Syncing KOReader Books (${files.length})...`,
    files.length
  )

  for (const fileHandle of files) {
    try {
      const text = await fileHandle.text()
      const { metadata } = lua_to_block(text)

      if (metadata && metadata.doc_props) {
        const hasAnnotations = metadata.annotations && metadata.annotations.length > 0
        const hasBookmarks = metadata.bookmarks && metadata.bookmarks.length > 0

        if (!hasAnnotations && !hasBookmarks) {
          syncProgress.increment(1)
          continue
        }

        const page = await getOrCreateBookPage(metadata, settings)
        const bookmarksUUID = await createBookmarksSection(page.uuid)

        await syncBookmarksToPage(metadata, page.uuid, bookmarksUUID, settings)

        allBooks.push({
          title: metadata.doc_props.title || "Untitled Book",
          authors: normalizeAuthors(metadata.doc_props.authors),
          pageName: page.originalName as string,
          pageUUID: page.uuid,
          syncedAt: new Date(),
        })

        syncProgress.updateMessage(`Syncing: ${metadata.doc_props.title || "Untitled Book"} (${syncProgress.current + 1}/${files.length})`)
      }
    } catch (e) {
      const errorDetails = e instanceof Error ? e.message : String(e)
      console.error(`Error syncing ${fileHandle.name}:`, errorDetails)
    }

    syncProgress.increment(1)
  }

  await updateIndexPage(allBooks, settings)
  syncProgress.destruct()

  const indexPageName = settings.indexPageName
  logseq.App.pushState('page', { name: indexPageName })
  await waitForPage(indexPageName)
}
