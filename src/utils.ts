import '@logseq/libs'
import { BlockEntity } from '@logseq/libs/dist/LSPlugin'
import { BookSettings } from './settings'

export const delay = (t = 100) => new Promise(r => setTimeout(r, t))

export async function showErrorToUser(message: string, details?: string) {
  logseq.UI.showMsg(message, "error")
  if (details) console.error(details)
}

export async function waitForPage(expectedPageName: string, maxWait: number = 5000): Promise<BlockEntity> {
  const startTime = Date.now()
  while (Date.now() - startTime < maxWait) {
    const currentPage = await logseq.Editor.getCurrentPage()
    if (currentPage?.originalName === expectedPageName) {
      return currentPage
    }
    await delay(100)
  }
  throw new Error(`Page "${expectedPageName}" not ready within ${maxWait}ms`)
}

export function truncateString(str: string | null | undefined, length: number): string {
  if (!str) {
    return ''
  }

  if (str.length > length) {
    return str.slice(0, length)
  }
  return str
}

export function normalizeAuthors(authors: string | undefined): string | undefined {
  if (!authors) return undefined
  return authors.replace(/\\\n/g, ', ')
}

export function generatePageName(metadata: any, settings: BookSettings): string {
  const prefix = settings.bookPagePrefix
  const title = metadata.doc_props.title || "Untitled Book"
  const authors = normalizeAuthors(metadata.doc_props.authors)

  if (settings.pageNamingConvention === "author_title" && authors) {
    return `${prefix}${authors} - ${title}`
  }
  return `${prefix}${title}`
}

export function sanitizePageName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*#\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 100)
}
