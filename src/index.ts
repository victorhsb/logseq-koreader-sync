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
}

function getBookSettings(): BookSettings {
  return {
    maxDescriptionLength: logseq.settings?.maxDescriptionLength ?? 250,
    collapseBookmarks: logseq.settings?.collapseBookmarks ?? true,
    syncPageBookmarks: logseq.settings?.syncPageBookmarks ?? true,
  };
}

function normalizeAuthors(authors: string | undefined): string | undefined {
  if (!authors) return undefined;
  return authors.replace(/\\\n/g, ', ');
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

/** Uses luaparse to read a lua file and builds a metadata data structure to pass off to `metadata_to_block` */
function lua_to_block(text: string): IBatchBlock | null {
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

  return metadata_to_block(metadata);
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

      const syncPageBookmarks = logseq.settings?.syncPageBookmarks ?? true;

      const info = await logseq.App.getUserConfigs()
      if (loading) return

      const pageName = '_logseq-koreader-sync'

      logseq.App.pushState('page', { name: pageName })

      const currentPage = await waitForPage(pageName);
      const syncTimeLabel = (new Date()).toLocaleString()

      loading = true

      const pageBlocksTree = await logseq.Editor.getCurrentPageBlocksTree()

      let targetBlock : BlockEntity | null = null;
      let warningBlockFound = false;
      for (const block of pageBlocksTree) {
        if (block?.content.includes("LKRS")) {
          targetBlock = block;
          continue;
        }
        else if (block?.content.includes("BEGIN_WARNING")) {
          warningBlockFound = true;
        }
      }

      if (!warningBlockFound) {
        await logseq.Editor.insertBatchBlock(currentPage.uuid, [{ content: "\n#+BEGIN_WARNING\nPlease do not edit this page; stick to block references made elsewhere.\n#+END_WARNING" }], { sibling: false})
      }

      const original_content = targetBlock?.content;
      if (targetBlock === null || targetBlock === undefined) {
        targetBlock = await logseq.Editor.insertBlock(currentPage.uuid, '🚀 LKRS: Please Select KOReader Metadata Directory ...',)
      } else {
        await logseq.Editor.updateBlock(targetBlock!.uuid, `🚀 LKRS: Please Select KOReader Metadata Directory ...`)
      }

      let directoryHandle : any = await getStorage('logseq_koreader_sync__directoryHandle');

      let permission;
      if (directoryHandle) {
        permission = await verifyPermission(directoryHandle);
      }

      if (!directoryHandle || !permission) {
        try {
          directoryHandle = await window.showDirectoryPicker() // get a DirectoryHandle that will allow us to read the contents of the directory
        } catch (e) {
          if (original_content) {
            await logseq.Editor.updateBlock(targetBlock!.uuid, original_content)
          } else {
            await logseq.Editor.updateBlock(targetBlock!.uuid, "# ❌ LKRS: Sync cancelled by user.")
          }
          const errorDetails = e instanceof Error ? e.message : String(e);
          await showErrorToUser("Failed to select KOReader directory. Please try again.", `Directory selection error: ${errorDetails}`);
          return;
        }

        if (logseq.settings?.rememberDirectory) {
          setStorage('logseq_koreader_sync__directoryHandle', directoryHandle);
        }
      }

      if (!directoryHandle) {
        await showErrorToUser("No KOReader directory selected.", "Directory handle is null or undefined. Please select a valid KOReader metadata directory.");
        return;
      }

      await logseq.Editor.updateBlock(targetBlock!.uuid, `# ⚙ LKRS: Processing KOReader Annotations ...`)

      // Get all metadata files in a single walk
      const files = await getMetadataFiles(directoryHandle);
      const fileCount = files.length;

      // iterate over all blocks in this target page, and collect titles, authors, and uuids and place them in a dictionary
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
        `)
      } catch (e) {
        const errorDetails = e instanceof Error ? e.message : String(e);
        await showErrorToUser("Failed to query existing blocks. Please check your database and try again.", `Datascript query error: ${errorDetails}`);
        return;
      }

      const titleMatch : RegExp = /##\s+(.*?)\n/;

      let existingBlocks = {}
      for (const block of ret) {
        const authors = block[1];
        const content = block[0]["content"];
        const match = content?.match(titleMatch);
        let title = match[1];

        const key = authors + "___" +  title;
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
        const parsed_block = lua_to_block(text);

        if (parsed_block) {
          let key: string;
          if (parsed_block.properties!.authors === undefined) {
            key = "___" + parsed_block.content.substring(3);
          } else {
            key = parsed_block.properties!.authors + "___" + parsed_block.content.substring(3);
          }

          // Has this been synced before?
          if (key in existingBlocks) {
            const existing_block = await logseq.Editor.getBlock(existingBlocks[key]);
            if (existing_block === null) {
              const errorDetails = `Block UUID ${existingBlocks[key]} not found during sync.`;
              await showErrorToUser("Sync warning: A previously synced block could not be found.", errorDetails);
              continue;
            }

            // find the bookmarks block
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

            // iterate over bookmarks and build a dictionary for easy lookup
            let existing_bookmarks = {};
            for (const bookmark of existing_bookmark_blocks) {
              let bookmark_block = await logseq.Editor.getBlock(bookmark[1] as BlockEntity);

              if (!bookmark_block?.content) {
                continue;
              }

              const isPageBookmark = bookmark_block.content.trim() === "> Page bookmark";
              if (!syncPageBookmarks && isPageBookmark) {
                await logseq.Editor.removeBlock(bookmark[1] as BlockUUID);
                continue;
              }

              const content_start = bookmark_block!.content!.indexOf("\n> ");     // not ideal
              const content = bookmark_block!.content!.substring(content_start+3).replace('-', '\-');

              existing_bookmarks[content] = bookmark[1];
            }

            // iterate over bookmarks in `block`, checking if they already exist
            // the first child of `parsed_block` is the "### Bookmarks" block
            for (const bookmark of parsed_block.children![0].children!) {
              let key = bookmark.content.substring(2);

              // does this parsed block have a personal note?
              let parsed_personal_note = false;
              if (bookmark.children && bookmark.children.length > 0) {
                parsed_personal_note = true;
              }

              // existing bookmark, check personal note
              if (key in existing_bookmarks) {
                let existing_bookmark = await logseq.Editor.getBlock(existing_bookmarks[key]);

                // personal note exists in graph
                if (existing_bookmark!.children && existing_bookmark!.children!.length > 0) {
                  let existing_note = existing_bookmark!.children![0];

                  if (!parsed_personal_note) {
                    // delete it
                    await logseq.Editor.removeBlock(existing_note[1] as BlockUUID);
                  } else {
                    let existing_note_block = await logseq.Editor.getBlock(existing_note[1] as BlockEntity);

                    // if the existing note is different, update it
                    if (existing_note_block!.content !== bookmark.children![0].content) {
                      await logseq.Editor.updateBlock(existing_note[1] as string, bookmark.children![0].content);
                    }
                  }
                }
                // personal note does not exist in graph
                else {
                  // add it
                  if (parsed_personal_note) {
                    await logseq.Editor.insertBatchBlock(existing_bookmark!.uuid, [bookmark.children![0]], {
                      sibling: false
                    })
                  }
                }
              }
              // new bookmark, add it
              else {
                await logseq.Editor.insertBatchBlock(existing_bookmark_block_uuid, [bookmark], {
                  sibling: false
                })
              }
            }
          } else {
            await logseq.Editor.insertBatchBlock(targetBlock!.uuid, [parsed_block], {
              sibling: false
            })
          }
        }
        syncProgress.increment(1);
      }

      await logseq.Editor.updateBlock(targetBlock!.uuid, `# 📚 LKRS: KOReader - Sync Initiated at ${syncTimeLabel}`)

      syncProgress.destruct();
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
