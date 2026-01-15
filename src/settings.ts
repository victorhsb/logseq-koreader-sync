import '@logseq/libs'
import { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin'
import { del as delStorage } from 'idb-keyval'

export const settings: SettingSchemaDesc[] = [
  {
    key: "rememberDirectory",
    default: true,
    description: "Remember saved path to KOReader files. Uncheck to clear saved path, but remember to switch it back on after.",
    title: "Remember KOReader Path",
    type: "boolean",
  },
  {
    key: "syncPageBookmarks",
    default: true,
    description: "Sync page bookmarks (annotations without text).",
    title: "Sync Page Bookmarks",
    type: "boolean",
  },
  {
    key: "maxDescriptionLength",
    default: 250,
    description: "Maximum number of characters of book description to import from KOReader. Longer descriptions provide more context but take up more space in your graph.",
    title: "Max Description Length",
    type: "number",
  },
  {
    key: "collapseBookmarks",
    default: true,
    description: "Automatically collapse bookmark blocks that have personal notes attached. When enabled, only the bookmark text is shown by default, and personal notes are hidden until expanded.",
    title: "Collapse Bookmarks",
    type: "boolean",
  },
  {
    key: "syncMode",
    default: "single-page",
    description: "Choose how books are stored. Single-page: all books on one page (legacy). Per-page: each book gets its own page with an index.",
    title: "Sync Mode",
    type: "string",
    enum: ["single-page", "per-page"],
  },
  {
    key: "pageNamingConvention",
    default: "author_title",
    description: "How to name book pages. 'author_title': Author - Book Title (reduces conflicts). 'book_title': Book Title only.",
    title: "Page Naming Convention",
    type: "string",
    enum: ["author_title", "book_title"],
  },
  {
    key: "bookPagePrefix",
    default: "",
    description: "Optional prefix added to all book page names (e.g., '📚 '). Empty for no prefix.",
    title: "Book Page Prefix",
    type: "string",
  },
  {
    key: "indexPageName",
    default: "KOReader Books",
    description: "Name of the index page listing all synced books (per-page mode only).",
    title: "Index Page Name",
    type: "string",
  },
  {
    key: "syncPageName",
    default: "_logseq-koreader-sync",
    description: "Name of the page where synced annotations are stored (single-page mode only).",
    title: "Sync Page Name",
    type: "string",
  },
]

export interface BookSettings {
  maxDescriptionLength: number
  collapseBookmarks: boolean
  syncPageBookmarks: boolean
  syncMode: string
  pageNamingConvention: string
  bookPagePrefix: string
  indexPageName: string
  syncPageName: string
}

export function getBookSettings(): BookSettings {
  return {
    maxDescriptionLength: logseq.settings?.maxDescriptionLength ?? 250,
    collapseBookmarks: logseq.settings?.collapseBookmarks ?? true,
    syncPageBookmarks: logseq.settings?.syncPageBookmarks ?? true,
    syncMode: logseq.settings?.syncMode ?? "single-page",
    pageNamingConvention: logseq.settings?.pageNamingConvention ?? "author_title",
    bookPagePrefix: logseq.settings?.bookPagePrefix ?? "",
    indexPageName: logseq.settings?.indexPageName ?? "KOReader Books",
    syncPageName: logseq.settings?.syncPageName ?? "_logseq-koreader-sync",
  }
}

export function onSettingsChange() {
  console.log("settings changed.")
  if (!(logseq.settings?.rememberDirectory)) {
    delStorage('logseq_koreader_sync__directoryHandle')
  }
}
