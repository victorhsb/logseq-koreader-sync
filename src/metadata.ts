import '@logseq/libs'
import { IBatchBlock } from '@logseq/libs/dist/LSPlugin'
import { parse as luaparse } from 'luaparse'
import { BookSettings, getBookSettings } from './settings'
import { normalizeAuthors, truncateString } from './utils'

function createSimpleBookHeader(metadata: any, settings: BookSettings): IBatchBlock {
  return {
    content: `## ${metadata.doc_props.title}`,
    properties: {
      'authors': normalizeAuthors(metadata.doc_props.authors),
      'description': truncateString(metadata.doc_props.description, settings.maxDescriptionLength),
      'language': metadata.doc_props.language,
    }
  }
}

function createBookBlock(metadata: any, settings: BookSettings, bookmarks: IBatchBlock[]): IBatchBlock {
  return {
    content: `## ${metadata.doc_props.title}`,
    properties: {
      'authors': normalizeAuthors(metadata.doc_props.authors),
      'description': truncateString(metadata.doc_props.description, settings.maxDescriptionLength),
      'language': metadata.doc_props.language,
      'collapsed': settings.collapseBookmarks,
    },
    children: [
      {
        content: `### Bookmarks`,
        children: bookmarks
      }
    ]
  }
}

/** This function is responsible for converting a KOReader metadata data structure into a Logseq block. */
function metadata_to_block(metadata: any): IBatchBlock | null {
  if (typeof metadata.doc_props === 'object' && Object.keys(metadata.doc_props).length === 0) {
    return null
  }

  if (!metadata.annotations) {
    return handle_bookmarks_metadata(metadata)
  }
  return handle_annotations_metadata(metadata)
}

export function handle_annotations_metadata(metadata: any): IBatchBlock | null {
  if (typeof metadata.doc_props === 'object' && Object.keys(metadata.doc_props).length === 0) {
    return null
  }

  if (typeof metadata.annotations === 'object' && Object.keys(metadata.annotations).length === 0) {
    return null
  }

  const settings = getBookSettings()
  let bookmarks: IBatchBlock[] = []

  if (!metadata.annotations) {
    return createSimpleBookHeader(metadata, settings)
  }

  for (const annotation of metadata.annotations) {
    let personal_note: IBatchBlock[] = []
    if (annotation.note) {
      personal_note.push({
        content: annotation.note.replace('-', '\\-'),
      })
    }

    let text_content: string = "> (no text available)"
    const isPageBookmark = !annotation.pos0
    if (isPageBookmark) {
      if (!settings.syncPageBookmarks) {
        continue
      }
      text_content = "> Page bookmark"
    } else if (annotation.text) {
      text_content = `> ${annotation.text.replace('-', '\\-')}`
    }

    let annotation_date: string = annotation.datetime
    if (annotation.datetime_updated) {
      annotation_date = annotation.datetime_updated
    }

    bookmarks.push(
      {
        content: text_content,
        properties: {
          'datetime': annotation_date,
          'page': annotation.pageno,
          'chapter': annotation.chapter,
          'collapsed': settings.collapseBookmarks && personal_note.length > 0,
        },
        children: personal_note
      }
    )
  }

  return createBookBlock(metadata, settings, bookmarks)
}

export function handle_bookmarks_metadata(metadata: any): IBatchBlock | null {
  if (typeof metadata.doc_props === 'object' && Object.keys(metadata.doc_props).length === 0) {
    return null
  }

  if (typeof metadata.bookmarks === 'object' && Object.keys(metadata.bookmarks).length === 0) {
    return null
  }

  const settings = getBookSettings()
  let bookmarks: IBatchBlock[] = []

  if (!metadata.bookmarks) {
    return createSimpleBookHeader(metadata, settings)
  }

  for (const bookmark of metadata.bookmarks) {
    let personal_note: IBatchBlock[] = []
    if (bookmark.text) {
      personal_note.push({
        content: bookmark.text,
      })
    }

    bookmarks.push(
      {
        content: `> ${bookmark.notes.replace('-', '\\-')}`,
        properties: {
          'datetime': bookmark.datetime,
          'page': bookmark.page,
          'chapter': bookmark.chapter,
          'collapsed': settings.collapseBookmarks && personal_note.length > 0,
        },
        children: personal_note
      }
    )
  }

  return createBookBlock(metadata, settings, bookmarks)
}

export interface ParsedBook {
  block: IBatchBlock | null
  metadata: any
}

/** Uses luaparse to read a lua file and builds a metadata data structure to pass off to `metadata_to_block` */
export function lua_to_block(text: string): ParsedBook {
  const ast = luaparse(text, {
    comments: false,
    locations: false,
    ranges: false,
    luaVersion: 'LuaJIT'
  })

  const metadata = {}

  for (const field in (ast.body[0] as any).arguments[0].fields) {
    const target = (ast.body[0] as any).arguments[0].fields[field]
    const key = target.key.raw.replace(/"/g, '')

    if (key === "stats") {
      continue
    }

    if (target.value.type === "TableConstructorExpression") {
      if (target.value.fields[0] && target.value.fields[0].value.type === "TableConstructorExpression") {
        metadata[key] = []
      } else {
        metadata[key] = {}
      }

      for (const subfield in target.value.fields) {
        const subtarget = target.value.fields[subfield]
        if (subtarget.value.type === "TableConstructorExpression") {
          const sub_dictionary = {}

          for (const subsubfield in subtarget.value.fields) {
            const subsubtarget = subtarget.value.fields[subsubfield]
            const subkey = subsubtarget.key.raw.replace(/"/g, '')
            sub_dictionary[subkey] = subsubtarget.value.raw?.replace(/"/g, '')
          }
          metadata[key].push(sub_dictionary)
        } else {
          metadata[key][subtarget.key.raw.replace(/"/g, '')] = subtarget.value.raw?.replace(/"/g, '')
        }
      }
    } else {
      metadata[key] = target.value.raw?.replace(/"/g, '')
    }
  }

  const block = metadata_to_block(metadata)
  return { block, metadata }
}
