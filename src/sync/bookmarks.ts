import '@logseq/libs'
import { BlockEntity, IBatchBlock, BlockUUID } from '@logseq/libs/dist/LSPlugin'
import { insertBlockTree } from '../block-tree'
import { BookSettings } from '../settings'
import { createBookmarksSection } from '../book-pages'

export async function syncBookmarksToPage(
  metadata: any,
  pageUUID: string,
  _bookmarksUUID: string,
  settings: BookSettings
): Promise<void> {
  try {
    const pageBlocks = await logseq.Editor.getPageBlocksTree(pageUUID)

    if (!pageBlocks) return

    let existing_bookmark_block_uuid: string | null = null
    let existing_bookmark_blocks: any[] = []

    for (const block of pageBlocks) {
      if (block.content === "### Bookmarks") {
        existing_bookmark_block_uuid = block.uuid
        existing_bookmark_blocks = block.children || []
        break
      }
    }

    if (!existing_bookmark_block_uuid) {
      existing_bookmark_block_uuid = await createBookmarksSection(pageUUID)
    }

    const existing_bookmarks = {}
    for (const bookmark of existing_bookmark_blocks) {
      if (!Array.isArray(bookmark) || bookmark.length < 2) {
        continue
      }
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
      const content = content_start > -1 ? bookmark_block!.content!.substring(content_start + 3).replace('-', '\\-') : bookmark_block!.content!.substring(2).replace('-', '\\-')

      existing_bookmarks[content] = bookmark[1]
    }

    const annotations = metadata.annotations || metadata.bookmarks || []

    for (const annotation of annotations) {
      let key: string
      if (metadata.bookmarks) {
        key = annotation.notes.replace('-', '\\-')
      } else {
        if (!annotation.pos0) {
          key = "Page bookmark"
        } else if (annotation.text) {
          key = annotation.text.replace('-', '\\-')
        } else {
          continue
        }
      }

      const personal_note: IBatchBlock[] = []
      if (metadata.bookmarks && annotation.text) {
        personal_note.push({
          content: annotation.text,
        })
      } else if (!metadata.bookmarks && annotation.note) {
        personal_note.push({
          content: annotation.note.replace('-', '\\-'),
        })
      }

      let bookmarkBlock: IBatchBlock

      if (metadata.bookmarks) {
        bookmarkBlock = {
          content: `> ${annotation.notes.replace('-', '\\-')}`,
          properties: {
            'datetime': annotation.datetime,
            'page': annotation.page,
            'chapter': annotation.chapter,
            'collapsed': settings.collapseBookmarks && personal_note.length > 0,
          },
          children: personal_note,
        }
      } else {
        let text_content: string
        const isPageBookmark = !annotation.pos0
        if (isPageBookmark) {
          if (!settings.syncPageBookmarks) {
            continue
          }
          text_content = "> Page bookmark"
        } else if (annotation.text) {
          text_content = `> ${annotation.text.replace('-', '\\-')}`
        } else {
          text_content = "> (no text available)"
        }

        let annotation_date: string = annotation.datetime
        if (annotation.datetime_updated) {
          annotation_date = annotation.datetime_updated
        }

        bookmarkBlock = {
          content: text_content,
          properties: {
            'datetime': annotation_date,
            'page': annotation.pageno,
            'chapter': annotation.chapter,
            'collapsed': settings.collapseBookmarks && personal_note.length > 0,
          },
          children: personal_note,
        }
      }

      if (key in existing_bookmarks) {
        const existing_bookmark = await logseq.Editor.getBlock(existing_bookmarks[key])

        if (existing_bookmark!.children && existing_bookmark!.children!.length > 0) {
          const existing_note = existing_bookmark!.children![0]

          if (!personal_note || personal_note.length === 0) {
            await logseq.Editor.removeBlock(existing_note[1] as BlockUUID)
          } else {
            const existing_note_block = await logseq.Editor.getBlock(existing_note[1] as BlockEntity)

            if (existing_note_block!.content !== personal_note[0].content) {
              await logseq.Editor.updateBlock(existing_note[1] as string, personal_note[0].content)
            }
          }
        } else {
          if (personal_note && personal_note.length > 0) {
            await insertBlockTree(existing_bookmark!.uuid, personal_note[0], { sibling: false })
          }
        }

        delete existing_bookmarks[key]
      } else {
        await insertBlockTree(existing_bookmark_block_uuid!, bookmarkBlock, { sibling: false })
      }
    }

    for (const key in existing_bookmarks) {
      await logseq.Editor.removeBlock(existing_bookmarks[key] as BlockUUID)
    }
  } catch (e) {
    const errorDetails = e instanceof Error ? e.message : String(e)
    console.error('Error syncing bookmarks to page:', errorDetails)
    throw e
  }
}
