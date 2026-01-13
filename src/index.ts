import '@logseq/libs'
import { SettingSchemaDesc, BlockEntity, IBatchBlock, BlockUUID } from '@logseq/libs/dist/LSPlugin'
import { parse as luaparse } from 'luaparse'
import { ProgressNotification } from './progress'
import { get as getStorage, set as setStorage, del as delStorage } from 'idb-keyval';

let settings: SettingSchemaDesc[] = [
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

const delay = (t = 100) => new Promise(r => setTimeout(r, t))

async function showErrorToUser(message: string, details?: string) {
  logseq.UI.showMsg(message, "error");
  if (details) console.error(details);
}

async function waitForPage(expectedPageName: string, maxWait: number = 5000): Promise<BlockEntity> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    const currentPage = await logseq.Editor.getCurrentPage();
    if (currentPage?.originalName === expectedPageName) {
      return currentPage;
    }
    await delay(100);
  }
  throw new Error(`Page "${expectedPageName}" not ready within ${maxWait}ms`);
}

function onSettingsChange() {
  console.log("settings changed.");
  if (!(logseq.settings?.rememberDirectory)) {
    delStorage('logseq_koreader_sync__directoryHandle')
  }
}

function truncateString(str, length) {
  if (!str) {
      return '';
  }

  if (str.length > length) {
      return str.slice(0, length);
  } else {
      return str;
  }
}

interface BookSettings {
  maxDescriptionLength: number;
  collapseBookmarks: boolean;
  syncPageBookmarks: boolean;
  syncMode: string;
  pageNamingConvention: string;
  bookPagePrefix: string;
  indexPageName: string;
  syncPageName: string;
}

function getBookSettings(): BookSettings {
  return {
    maxDescriptionLength: logseq.settings?.maxDescriptionLength ?? 250,
    collapseBookmarks: logseq.settings?.collapseBookmarks ?? true,
    syncPageBookmarks: logseq.settings?.syncPageBookmarks ?? true,
    syncMode: logseq.settings?.syncMode ?? "single-page",
    pageNamingConvention: logseq.settings?.pageNamingConvention ?? "author_title",
    bookPagePrefix: logseq.settings?.bookPagePrefix ?? "",
    indexPageName: logseq.settings?.indexPageName ?? "KOReader Books",
    syncPageName: logseq.settings?.syncPageName ?? "_logseq-koreader-sync",
  };
}

function normalizeAuthors(authors: string | undefined): string | undefined {
  if (!authors) return undefined;
  return authors.replace(/\\\n/g, ', ');
}

function generatePageName(metadata: any, settings: BookSettings): string {
  const prefix = settings.bookPagePrefix;
  const title = metadata.doc_props.title || "Untitled Book";
  const authors = normalizeAuthors(metadata.doc_props.authors);
  
  if (settings.pageNamingConvention === "author_title" && authors) {
    return `${prefix}${authors} - ${title}`;
  }
  return `${prefix}${title}`;
}

function sanitizePageName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*#\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 100);
}

function createSimpleBookHeader(metadata: any, settings: BookSettings): IBatchBlock {
  return {
    content: `## ${metadata.doc_props.title}`,
    properties: {
      'authors': normalizeAuthors(metadata.doc_props.authors),
      'description': truncateString(metadata.doc_props.description, settings.maxDescriptionLength),
      'language': metadata.doc_props.language,
    }
  };
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
  };
}

async function getOrCreateBookPage(metadata: any, settings: BookSettings): Promise<BlockEntity> {
  const rawPageName = generatePageName(metadata, settings);
  const pageName = sanitizePageName(rawPageName);
  
  let existingPage = await logseq.Editor.getPage(pageName);
  
  if (!existingPage) {
    const page = await logseq.Editor.createPage(pageName, {
      'authors': normalizeAuthors(metadata.doc_props.authors),
      'description': truncateString(metadata.doc_props.description, settings.maxDescriptionLength),
      'language': metadata.doc_props.language,
    });
    existingPage = page;
  }
  
  return existingPage;
}

async function createBookmarksSection(pageUUID: string): Promise<string> {
  const pageBlocks = await logseq.Editor.getPageBlocksTree(pageUUID);
  
  for (const block of pageBlocks || []) {
    if (block.content === "### Bookmarks") {
      return block.uuid;
    }
  }
  
  const bookmarksBlock = await logseq.Editor.insertBlock(
    pageUUID,
    "### Bookmarks",
    { sibling: false }
  );
  
  return bookmarksBlock!.uuid;
}

interface BookInfo {
  title: string;
  authors?: string;
  pageName: string;
  pageUUID: string;
  syncedAt: Date;
}

async function updateIndexPage(books: BookInfo[], settings: BookSettings): Promise<void> {
  const indexPageName = settings.indexPageName;
  
  let indexPage = await logseq.Editor.getPage(indexPageName);
  if (!indexPage) {
    indexPage = await logseq.Editor.createPage(indexPageName, {
      'type': 'koreader-index',
    });
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
  ];
  
  const pageBlocks = await logseq.Editor.getPageBlocksTree(indexPage.uuid);
  for (const block of pageBlocks || []) {
    await logseq.Editor.removeBlock(block.uuid);
  }
  
  await logseq.Editor.insertBatchBlock(indexPage.uuid, indexBlocks, { sibling: false });
}

async function syncBookmarksToPage(metadata: any, pageUUID: string, bookmarksUUID: string, settings: BookSettings): Promise<void> {
  const pageBlocks = await logseq.Editor.getPageBlocksTree(pageUUID);
  
  if (!pageBlocks) return;
  
  let existing_bookmark_block_uuid: string | null = null;
  let existing_bookmark_blocks: any[] = [];
  
  for (const block of pageBlocks) {
    if (block.content === "### Bookmarks") {
      existing_bookmark_block_uuid = block.uuid;
      existing_bookmark_blocks = block.children || [];
      break;
    }
  }
  
  if (!existing_bookmark_block_uuid) {
    existing_bookmark_block_uuid = await createBookmarksSection(pageUUID);
  }
  
  let existing_bookmarks = {};
  for (const bookmark of existing_bookmark_blocks) {
    let bookmark_block = await logseq.Editor.getBlock(bookmark[1] as BlockEntity);
    
    if (!bookmark_block?.content) {
      continue;
    }
    
    const isPageBookmark = bookmark_block.content.trim() === "> Page bookmark";
    if (!settings.syncPageBookmarks && isPageBookmark) {
      await logseq.Editor.removeBlock(bookmark[1] as BlockUUID);
      continue;
    }
    
    const content_start = bookmark_block!.content!.indexOf("\n> ");
    const content = content_start > -1 ? bookmark_block!.content!.substring(content_start+3).replace('-', '\-') : bookmark_block!.content!.substring(2).replace('-', '\-');
    
    existing_bookmarks[content] = bookmark[1];
  }
  
  const annotations = metadata.annotations || metadata.bookmarks || [];
  
  for (const annotation of annotations) {
    let key: string;
    if (metadata.bookmarks) {
      key = annotation.notes.replace('-', '\-');
    } else {
      if (!annotation.pos0) {
        key = "Page bookmark";
      } else if (annotation.text) {
        key = annotation.text.replace('-', '\-');
      } else {
        continue;
      }
    }
    
    let personal_note: IBatchBlock[] = [];
    if (metadata.bookmarks && annotation.text) {
      personal_note.push({
        content: annotation.text,
      });
    } else if (!metadata.bookmarks && annotation.note) {
      personal_note.push({
        content: annotation.note.replace('-', '\\-'),
      });
    }
    
    let bookmarkBlock: IBatchBlock;
    
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
      };
    } else {
      let text_content: string;
      const isPageBookmark = !annotation.pos0;
      if (isPageBookmark) {
        if (!settings.syncPageBookmarks) {
          continue;
        }
        text_content = "> Page bookmark";
      } else if (annotation.text) {
        text_content = `> ${annotation.text.replace('-', '\\-')}`;
      } else {
        text_content = "> (no text available)";
      }
      
      let annotation_date: string = annotation.datetime;
      if (annotation.datetime_updated) {
        annotation_date = annotation.datetime_updated;
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
      };
    }
    
    if (key in existing_bookmarks) {
      let existing_bookmark = await logseq.Editor.getBlock(existing_bookmarks[key]);
      
      if (existing_bookmark!.children && existing_bookmark!.children!.length > 0) {
        let existing_note = existing_bookmark!.children![0];
        
        if (!personal_note || personal_note.length === 0) {
          await logseq.Editor.removeBlock(existing_note[1] as BlockUUID);
        } else {
          let existing_note_block = await logseq.Editor.getBlock(existing_note[1] as BlockEntity);
          
          if (existing_note_block!.content !== personal_note[0].content) {
            await logseq.Editor.updateBlock(existing_note[1] as string, personal_note[0].content);
          }
        }
      } else {
        if (personal_note && personal_note.length > 0) {
          await logseq.Editor.insertBatchBlock(existing_bookmark!.uuid, [personal_note[0]], {
            sibling: false
          });
        }
      }
      
      delete existing_bookmarks[key];
    } else {
      await logseq.Editor.insertBatchBlock(existing_bookmark_block_uuid!, [bookmarkBlock], {
        sibling: false
      });
    }
  }
  
    for (const key in existing_bookmarks) {
    await logseq.Editor.removeBlock(existing_bookmarks[key] as BlockUUID);
  }
}

async function syncSinglePageMode(directoryHandle: any): Promise<void> {
  const settings = getBookSettings();
  const pageName = settings.syncPageName;
  
  logseq.App.pushState('page', { name: pageName });
  
  const currentPage = await waitForPage(pageName);
  const syncTimeLabel = (new Date()).toLocaleString();
  
  const pageBlocksTree = await logseq.Editor.getCurrentPageBlocksTree();
  
  let targetBlock: BlockEntity | null = null;
  let warningBlockFound = false;
  
  for (const block of pageBlocksTree) {
    if (block?.content.includes("LKRS")) {
      targetBlock = block;
      continue;
    } else if (block?.content.includes("BEGIN_WARNING")) {
      warningBlockFound = true;
    }
  }
  
  if (!warningBlockFound) {
    await logseq.Editor.insertBatchBlock(currentPage.uuid, [{ content: "\n#+BEGIN_WARNING\nPlease do not edit this page; stick to block references made elsewhere.\n#+END_WARNING" }], { sibling: false});
  }
  
  const original_content = targetBlock?.content;
  if (targetBlock === null || targetBlock === undefined) {
    targetBlock = await logseq.Editor.insertBlock(currentPage.uuid, '🚀 LKRS: Please Select KOReader Metadata Directory ...',);
  } else {
    await logseq.Editor.updateBlock(targetBlock!.uuid, `🚀 LKRS: Please Select KOReader Metadata Directory ...`);
  }
  
  let directoryHandleFinal: any = await getStorage('logseq_koreader_sync__directoryHandle');
  
  let permission;
  if (directoryHandleFinal) {
    permission = await verifyPermission(directoryHandleFinal);
  }
  
  if (!directoryHandleFinal || !permission) {
    try {
      directoryHandleFinal = await window.showDirectoryPicker();
    } catch (e) {
      if (original_content) {
        await logseq.Editor.updateBlock(targetBlock!.uuid, original_content);
      } else {
        await logseq.Editor.updateBlock(targetBlock!.uuid, "# ❌ LKRS: Sync cancelled by user.");
      }
      const errorDetails = e instanceof Error ? e.message : String(e);
      await showErrorToUser("Failed to select KOReader directory. Please try again.", `Directory selection error: ${errorDetails}`);
      return;
    }
    
    if (logseq.settings?.rememberDirectory) {
      setStorage('logseq_koreader_sync__directoryHandle', directoryHandleFinal);
    }
  }
  
  if (!directoryHandleFinal) {
    await showErrorToUser("No KOReader directory selected.", "Directory handle is null or undefined. Please select a valid KOReader metadata directory.");
    return;
  }
  
  await logseq.Editor.updateBlock(targetBlock!.uuid, `# ⚙ LKRS: Processing KOReader Annotations ...`);
  
  const files = await getMetadataFiles(directoryHandleFinal);
  const fileCount = files.length;
  
  let ret;
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
    `);
  } catch (e) {
    const errorDetails = e instanceof Error ? e.message : String(e);
    await showErrorToUser("Failed to query existing blocks. Please check your database and try again.", `Datascript query error: ${errorDetails}`);
    return;
  }
  
  const titleMatch: RegExp = /##\s+(.*?)\n/;
  
  let existingBlocks = {};
  for (const block of ret) {
    const authors = block[1];
    const content = block[0]["content"];
    const match = content?.match(titleMatch);
    let title = match[1];
    
    const key = authors + "___" + title;
    if (!(key in existingBlocks)) {
      let block_uuid = block[0]["uuid"];
      if (block_uuid) {
        existingBlocks[key] = block_uuid;
      }
    }
  }
  
  const syncProgress = new ProgressNotification("Syncing Koreader Annotations to Logseq:", fileCount);
  
  for (const fileHandle of files) {
    const text = await fileHandle.text();
    const { block: parsed_block } = lua_to_block(text);
    
    if (parsed_block) {
      let key: string;
      if (parsed_block.properties!.authors === undefined) {
        key = "___" + parsed_block.content.substring(3);
      } else {
        key = parsed_block.properties!.authors + "___" + parsed_block.content.substring(3);
      }
      
      if (key in existingBlocks) {
        const existing_block = await logseq.Editor.getBlock(existingBlocks[key]);
        if (existing_block === null) {
          const errorDetails = `Block UUID ${existingBlocks[key]} not found during sync.`;
          await showErrorToUser("Sync warning: A previously synced block could not be found.", errorDetails);
          continue;
        }
        
        let existing_bookmark_blocks;
        let existing_bookmark_block_uuid;
        
        for (const child of existing_block!.children!) {
          let child_block = await logseq.Editor.getBlock(child[1] as BlockEntity);
          
          if (child_block!.content === "### Bookmarks") {
            existing_bookmark_blocks = child_block!.children;
            existing_bookmark_block_uuid = child[1];
            
            break;
          }
        }
        
        if (existing_bookmark_blocks === undefined) {
          const errorDetails = `No bookmarks section found for block ${existingBlocks[key]}. The book may have been corrupted or manually edited.`;
          await showErrorToUser("Sync warning: Bookmarks section missing for a synced book.", errorDetails);
          continue;
        }
        
        let existing_bookmarks = {};
        for (const bookmark of existing_bookmark_blocks) {
          let bookmark_block = await logseq.Editor.getBlock(bookmark[1] as BlockEntity);
          
          if (!bookmark_block?.content) {
            continue;
          }
          
          const isPageBookmark = bookmark_block.content.trim() === "> Page bookmark";
          if (!settings.syncPageBookmarks && isPageBookmark) {
            await logseq.Editor.removeBlock(bookmark[1] as BlockUUID);
            continue;
          }
          
          const content_start = bookmark_block!.content!.indexOf("\n> ");
          const content = bookmark_block!.content!.substring(content_start+3).replace('-', '\-');
          
          existing_bookmarks[content] = bookmark[1];
        }
        
        for (const bookmark of parsed_block.children![0].children!) {
          let key = bookmark.content.substring(2);
          
          let parsed_personal_note = false;
          if (bookmark.children && bookmark.children.length > 0) {
            parsed_personal_note = true;
          }
          
          if (key in existing_bookmarks) {
            let existing_bookmark = await logseq.Editor.getBlock(existing_bookmarks[key]);
            
            if (existing_bookmark!.children && existing_bookmark!.children!.length > 0) {
              let existing_note = existing_bookmark!.children![0];
              
              if (!parsed_personal_note) {
                await logseq.Editor.removeBlock(existing_note[1] as BlockUUID);
              } else {
                let existing_note_block = await logseq.Editor.getBlock(existing_note[1] as BlockEntity);
                
                if (existing_note_block!.content !== bookmark.children![0].content) {
                  await logseq.Editor.updateBlock(existing_note[1] as string, bookmark.children![0].content);
                }
              }
            } else {
              if (parsed_personal_note) {
                await logseq.Editor.insertBatchBlock(existing_bookmark!.uuid, [bookmark.children![0]], {
                  sibling: false
                });
              }
            }
          } else {
            await logseq.Editor.insertBatchBlock(existing_bookmark_block_uuid, [bookmark], {
              sibling: false
            });
          }
        }
      } else {
        await logseq.Editor.insertBatchBlock(targetBlock!.uuid, [parsed_block], {
          sibling: false
        });
      }
    }
    syncProgress.increment(1);
  }
  
  await logseq.Editor.updateBlock(targetBlock!.uuid, `# 📚 LKRS: KOReader - Sync Initiated at ${syncTimeLabel}`);
  
  syncProgress.destruct();
}

async function syncPerPageMode(directoryHandle: any): Promise<void> {
  const settings = getBookSettings();
  const files = await getMetadataFiles(directoryHandle);
  const allBooks: BookInfo[] = [];
  const syncProgress = new ProgressNotification(
    `Syncing KOReader Books (${files.length})...`,
    files.length
  );
  
  for (const fileHandle of files) {
    const text = await fileHandle.text();
    const { block: parsed_block, metadata } = lua_to_block(text);
    
    if (metadata && metadata.doc_props) {
      const page = await getOrCreateBookPage(metadata, settings);
      const bookmarksUUID = await createBookmarksSection(page.uuid);
      
      await syncBookmarksToPage(metadata, page.uuid, bookmarksUUID, settings);
      
      allBooks.push({
        title: metadata.doc_props.title || "Untitled Book",
        authors: normalizeAuthors(metadata.doc_props.authors),
        pageName: page.originalName,
        pageUUID: page.uuid,
        syncedAt: new Date(),
      });
      
      syncProgress.updateMessage(`Syncing: ${metadata.doc_props.title || "Untitled Book"} (${syncProgress.current + 1}/${files.length})`);
    }
    
    syncProgress.increment(1);
  }
  
  await updateIndexPage(allBooks, settings);
  syncProgress.destruct();
  
  const indexPageName = settings.indexPageName;
  logseq.App.pushState('page', { name: indexPageName });
  await waitForPage(indexPageName);
}

/** This function is responsible for converting a KOReader metadata data structure into a Logseq block. */
function metadata_to_block(metadata: any): IBatchBlock | null {
  if (metadata.doc_props === 'object' && Object.keys(metadata.doc_props).length === 0) {
    return null;
  }

  if (!metadata.annotations) {
    return handle_bookmarks_metadata(metadata);
  } else {
    return handle_annotations_metadata(metadata);
  }
}

function handle_annotations_metadata(metadata: any): IBatchBlock | null {
  if (typeof metadata.annotations === 'object' && Object.keys(metadata.annotations).length === 0) {
    return null;
  }

  const settings = getBookSettings();
  let bookmarks: IBatchBlock[] = [];

  if (!metadata.annotations) {
    return createSimpleBookHeader(metadata, settings);
  }

  for (const annotation of metadata.annotations) {
    let personal_note: IBatchBlock[] = [];
    if (annotation.note) {
      personal_note.push({
        content: annotation.note.replace('-', '\\-'),
      });
    }

    let text_content: string = "> (no text available)";
    const isPageBookmark = !annotation.pos0;
    if (isPageBookmark) {
      if (!settings.syncPageBookmarks) {
        continue;
      }
      text_content = "> Page bookmark";
    } else if (annotation.text) {
      text_content = `> ${annotation.text.replace('-', '\\-')}`; // escape dashes; they're used for lists in logseq
    }

    let annotation_date: string = annotation.datetime;
    if (annotation.datetime_updated) {
        annotation_date = annotation.datetime_updated;
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

  return createBookBlock(metadata, settings, bookmarks);
}

function handle_bookmarks_metadata(metadata: any): IBatchBlock | null {
  if (typeof metadata.bookmarks === 'object' && Object.keys(metadata.bookmarks).length === 0) {
    return null;
  }

  const settings = getBookSettings();
  let bookmarks: IBatchBlock[] = [];

  if (!metadata.bookmarks) {
    return createSimpleBookHeader(metadata, settings);
  }

  for (const bookmark of metadata.bookmarks) {
    let personal_note: IBatchBlock[] = [];
    if (bookmark.text) {
      personal_note.push({
        content: bookmark.text,
      });
    }

    bookmarks.push(
      {
        content: `> ${bookmark.notes.replace('-', '\\-')}`, // escape dashes; they're used for lists in logseq
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

  return createBookBlock(metadata, settings, bookmarks);
}

interface ParsedBook {
  block: IBatchBlock | null;
  metadata: any;
}

/** Uses luaparse to read a lua file and builds a metadata data structure to pass off to `metadata_to_block` */
function lua_to_block(text: string): ParsedBook {
  const ast = luaparse(text, {
    comments: false,
    locations: false,
    ranges: false,
    luaVersion: 'LuaJIT'
  });

  const metadata = {};

  for (const field in (ast.body[0] as any).arguments[0].fields) {
    const target = (ast.body[0] as any).arguments[0].fields[field]
    const key = target.key.raw.replace(/"/g, '');

    // it's easier to skip some fields
    if (key === "stats") {
      continue;
    }

    if (target.value.type === "TableConstructorExpression") {
      if (target.value.fields[0] && target.value.fields[0].value.type === "TableConstructorExpression") {
        metadata[key] = [];
      } else {
        metadata[key] = {};
      }

      for (const subfield in target.value.fields) {
        const subtarget = target.value.fields[subfield];
        if (subtarget.value.type === "TableConstructorExpression") {
          const sub_dictionary = {};

          for (const subsubfield in subtarget.value.fields) {
            const subsubtarget = subtarget.value.fields[subsubfield];
            const subkey = subsubtarget.key.raw.replace(/"/g, '');
            sub_dictionary[subkey] = subsubtarget.value.raw?.replace(/"/g, '');
          }
          metadata[key].push(sub_dictionary);
        } else {
          metadata[key][subtarget.key.raw.replace(/"/g, '')] = subtarget.value.raw?.replace(/"/g, '');
        }
      }
    } else {
      metadata[key] = target.value.raw?.replace(/"/g, '');
    }
  }

  const block = metadata_to_block(metadata);
  return { block, metadata };
}


/** Used to find all of the KOReader metadata files in a directory and its subdirectories */
async function* walkDirectory(directoryHandle: any) { // DirectoryHandle
  if (directoryHandle.kind === "file") {
    const file = await directoryHandle.getFile();
    if (file !== null && file.name.toLowerCase().endsWith('.lua') && file.name.toLowerCase().includes('metadata')) {
      yield file;
    }
  } else if (directoryHandle.kind === "directory") {
    for await (const handle of directoryHandle.values()) {
      yield* walkDirectory(handle);
    }
  }
}

async function getMetadataFiles(directoryHandle: any): Promise<File[]> {
  const files: File[] = [];
  for await (const file of walkDirectory(directoryHandle)) {
    files.push(file);
  }
  return files;
}

// https://developer.chrome.com/docs/capabilities/web-apis/file-system-access#stored_file_or_directory_handles_and_permissions
async function verifyPermission(fileHandle) {
  // Check if permission was already granted. If so, return true.
  if ((await fileHandle.queryPermission({})) === 'granted') {
    return true;
  }
  // Request permission. If the user grants permission, return true.
  if ((await fileHandle.requestPermission({})) === 'granted') { // should work, won't work until Electron or logseq or something supports it
    return true;
  }
  // The user didn't grant permission, so return false.
  return false;
}

declare global {
  interface Window {
    showDirectoryPicker: any; // DirectoryHandle
  }
}

/**
 * main entry
 * @param baseInfo
 */
function main () {
  let loading = false;

  logseq.useSettingsSchema(settings)
  logseq.provideModel({
    async syncKOReader () {
      onSettingsChange();
      logseq.onSettingsChanged(onSettingsChange);

      const info = await logseq.App.getUserConfigs()
      if (loading) return

      loading = true

      const settings = getBookSettings();
      
      let directoryHandle: any = await getStorage('logseq_koreader_sync__directoryHandle');
      
      let permission;
      if (directoryHandle) {
        permission = await verifyPermission(directoryHandle);
      }

      if (!directoryHandle || !permission) {
        try {
          directoryHandle = await window.showDirectoryPicker();
        } catch (e) {
          const errorDetails = e instanceof Error ? e.message : String(e);
          await showErrorToUser("Failed to select KOReader directory. Please try again.", `Directory selection error: ${errorDetails}`);
          loading = false;
          return;
        }

        if (logseq.settings?.rememberDirectory) {
          setStorage('logseq_koreader_sync__directoryHandle', directoryHandle);
        }
      }

      if (!directoryHandle) {
        await showErrorToUser("No KOReader directory selected.", "Directory handle is null or undefined. Please select a valid KOReader metadata directory.");
        loading = false;
        return;
      }

      if (settings.syncMode === "per-page") {
        await syncPerPageMode(directoryHandle);
      } else {
        await syncSinglePageMode(directoryHandle);
      }

      loading = false;
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
