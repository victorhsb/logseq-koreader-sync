import '@logseq/libs'
import { BlockEntity, IBatchBlock } from '@logseq/libs/dist/LSPlugin'
import { BookSettings } from './settings'
import { insertBlockTree } from './block-tree'
import { generatePageName, normalizeAuthors, sanitizePageName, truncateString } from './utils'

export async function getOrCreateBookPage(metadata: any, settings: BookSettings): Promise<BlockEntity> {
  const rawPageName = generatePageName(metadata, settings)
  const pageName = sanitizePageName(rawPageName)

  let existingPage = await logseq.Editor.getPage(pageName)

  if (!existingPage) {
    const page = await logseq.Editor.createPage(
      pageName,
      {
        'authors': normalizeAuthors(metadata.doc_props.authors),
        'description': truncateString(metadata.doc_props.description, settings.maxDescriptionLength),
        'language': metadata.doc_props.language,
      },
      { format: "markdown" }
    )
    existingPage = page
  }

  return existingPage
}

export async function createBookmarksSection(pageUUID: string): Promise<string> {
  const pageBlocks = await logseq.Editor.getPageBlocksTree(pageUUID)

  for (const block of pageBlocks || []) {
    if (block.content === "### Bookmarks") {
      return block.uuid
    }
  }

  const bookmarksBlock = await logseq.Editor.insertBlock(
    pageUUID,
    "### Bookmarks",
    { sibling: false }
  )

  return bookmarksBlock!.uuid
}

export interface BookInfo {
  title: string
  authors?: string
  pageName: string
  pageUUID: string
  syncedAt: Date
}

export async function updateIndexPage(books: BookInfo[], settings: BookSettings): Promise<void> {
  const indexPageName = settings.indexPageName

  let indexPage = await logseq.Editor.getPage(indexPageName)
  if (!indexPage) {
    indexPage = await logseq.Editor.createPage(
      indexPageName,
      {
        'type': 'koreader-index',
      },
      { format: ":markdown" }
    )
  }

  const indexBlocks: IBatchBlock[] = [
    {
      content: `# KOReader Books Index`,
      children: [
        {
          content: `Last synced: ${(new Date()).toLocaleString()}`,
        },
        {
          content: `## All Books (${books.length})`,
          children: books.map(book => ({
            content: `[[${book.pageName}]]`,
            properties: {
              'authors': book.authors,
            },
          })),
        },
      ],
    },
  ]

  const pageBlocks = await logseq.Editor.getPageBlocksTree(indexPage.uuid)
  for (const block of pageBlocks || []) {
    await logseq.Editor.removeBlock(block.uuid)
  }

  for (const block of indexBlocks) {
    await insertBlockTree(indexPage.uuid, block, { sibling: false })
  }
}
