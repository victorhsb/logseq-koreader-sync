# Logseq Koreader Sync - Improvement Plans

## Table of Contents
1. [High Priority Improvements](#high-priority-improvements)
2. [Medium Priority Improvements](#medium-priority-improvements)
3. [Low Priority Improvements](#low-priority-improvements)
4. [New Feature: One Page Per Book](#new-feature-one-page-per-book)

---

## High Priority Improvements

### ✅ 1.1 Make Description Length Configurable **COMPLETED**
**File**: `src/index.ts:45`

**Original State**:
```typescript
const MAXIMUM_DESCRIPTION_LENGTH = 250; // FIXME: this should be a setting
```

**Implementation Completed**:
- ✅ Added `maxDescriptionLength` setting to `settings` array in `src/index.ts`
- ✅ Replaced hardcoded constant with dynamic setting read in `handle_annotations_metadata()` and `handle_bookmarks_metadata()`
- ✅ Updated setting description to explain plugin behavior impact

**Current State**:
```typescript
const MAXIMUM_DESCRIPTION_LENGTH = logseq.settings?.maxDescriptionLength ?? 250;
```

**Implementation Details**:
- Added new setting with improved description: "Maximum number of characters of book description to import from KOReader. Longer descriptions provide more context but take up more space in your graph."
- Settings are read dynamically within each function to ensure current values are used
- Maintains backward compatibility with default value of 250 characters

**Impact**: Allows users to control how much book description is imported, useful for graphs with space constraints or detailed notes.

---

### ✅ 1.2 Make Block Collapse Configurable **COMPLETED**
**File**: `src/index.ts:46`

**Original State**:
```typescript
const COLLAPSE_BLOCKS = true; // FIXME: this should be a setting
```

**Implementation Completed**:
- ✅ Added `collapseBookmarks` setting to `settings` array in `src/index.ts`
- ✅ Replaced hardcoded constant with dynamic setting read in `handle_annotations_metadata()` and `handle_bookmarks_metadata()`
- ✅ Updated setting description to explain plugin behavior impact

**Current State**:
```typescript
const COLLAPSE_BLOCKS = logseq.settings?.collapseBookmarks ?? true;
```

**Implementation Details**:
- Added new setting with improved description: "Automatically collapse bookmark blocks that have personal notes attached. When enabled, only the bookmark text is shown by default, and personal notes are hidden until expanded."
- Settings are read dynamically within each function to ensure current values are used
- Maintains backward compatibility with default value of `true`

**Impact**: Users can choose visual presentation of bookmarks, improving readability based on preference.

---

### ✅ 1.3 Replace Fixed Delay with Proper Wait Loop **COMPLETED**
**File**: `src/index.ts:338`

**Original State**:
```typescript
await delay(300) // wait for our UI elements to exist. FIXME: replace with check/sleep loop
```

**Implementation Completed**:
- ✅ Added `waitForPage()` polling function after `delay()` at line 40
- ✅ Replaced fixed delay + getCurrentPage() + page check with single `waitForPage()` call
- ✅ Removed unnecessary duplicate `getCurrentPage()` call

**Current State**:
```typescript
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

// Usage in syncKOReader():
logseq.App.pushState('page', { name: pageName })

const currentPage = await waitForPage(pageName);
const syncTimeLabel = (new Date()).toLocaleString()

loading = true
```

**Implementation Details**:
- `waitForPage()` polls for page readiness using Logseq API every 100ms
- Returns the page object directly when ready, eliminating redundant API call
- Times out after 5 seconds with descriptive error message
- More reliable: eliminates race condition on slow systems
- More efficient: no unnecessary waiting on fast systems

**Impact**: More reliable synchronization with UI, less chance of race conditions, better performance (no unnecessary waiting).

---

### 1.4 Improve Error Handling and User Feedback
**Files**: `src/index.ts:359`, `src/index.ts:392`, `src/index.ts:432`, `src/index.ts:452`, `src/index.ts:461`

**Current State**:
- Errors only logged to console
- Generic error messages like "Sync cancelled by user"
- Errors in bookmark reconciliation silently continue

**Proposed Implementation**:
1. Create a user-friendly error notification function:
   ```typescript
   async function showErrorToUser(message: string, details?: string) {
     logseq.UI.showMsg(message, "error");
     if (details) console.error(details);
   }
   ```

2. Replace console-only errors with user-facing messages:
   - Line 359: Show actual error reason
   - Line 392: Show datascript query errors with helpful context
   - Lines 432, 452, 461: Optionally show warnings for skipped blocks

3. Add error recovery guidance where possible

**Impact**: Users can understand and act on errors, reducing support burden and improving UX.

---

## Medium Priority Improvements

### ✅ 2.1 Eliminate Code Duplication - Extract Common Functions **COMPLETED**
**Files**: `src/index.ts:71-117`

**Original State**:
- Duplicate header block creation in `handle_annotations_metadata()` and `handle_bookmarks_metadata()`
- Duplicate author normalization logic in both functions
- Duplicate settings reading in both functions

**Implementation Completed**:
- ✅ Added `BookSettings` interface for type safety
- ✅ Created `getBookSettings()` function to centralize settings reading
- ✅ Created `normalizeAuthors()` function to handle author normalization
- ✅ Created `createSimpleBookHeader()` for early returns (no collapsed, no children)
- ✅ Created `createBookBlock()` for final returns (with collapsed and children)
- ✅ Refactored `handle_annotations_metadata()` to use all new functions
- ✅ Refactored `handle_bookmarks_metadata()` to use all new functions

**Current State**:
```typescript
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

// Usage in handlers:
function handle_annotations_metadata(metadata: any): IBatchBlock | null {
  // ...
  const settings = getBookSettings();
  // ...process annotations...
  return createBookBlock(metadata, settings, bookmarks);
}
```

**Implementation Details**:
- Settings now read once per function call via `getBookSettings()`
- Author normalization logic consolidated into single function
- Book header creation unified with two variants: simple (for early returns) and full (for final returns)
- Both handlers now use the same helper functions, eliminating duplication
- Code is more maintainable and less error-prone

**Impact**: Easier maintenance, less chance of bugs when updating one function but not the other.

---

### 2.2 Optimize Directory Walking
**Files**: `src/index.ts:376-377`, `src/index.ts:416`

**Current State**:
- Directory walked twice: once to count files, once to process files
- Both walks read metadata from disk

**Proposed Implementation**:
1. Modify `walkDirectory()` to return both file handles and count:
   ```typescript
   async function walkDirectoryWithCount(directoryHandle: any) {
     const files: File[] = [];
     for await (const file of walkDirectory(directoryHandle)) {
       files.push(file);
     }
     return files;
   }
   ```

2. Update sync flow:
   ```typescript
   const files = await walkDirectoryWithCount(directoryHandle);
   const fileCount = files.length;
   const syncProgress = new ProgressNotification("Syncing Koreader Annotations to Logseq:", fileCount);
   for (const fileHandle of files) {
     // process file
     syncProgress.increment(1);
   }
   ```

**Impact**: Faster sync operations, especially for large directories.

---

### 2.3 Make Sync Page Name Configurable
**File**: `src/index.ts:306`

**Current State**:
```typescript
const pageName = '_logseq-koreader-sync'
```

**Proposed Implementation**:
- Add a new setting:
  ```typescript
  {
    key: "syncPageName",
    default: "_logseq-koreader-sync",
    description: "Name of the page where synced annotations are stored.",
    title: "Sync Page Name",
    type: "string",
  }
  ```
- Use setting value in sync function
- Validate that page name is valid (no invalid characters)

**Impact**: Users can customize where synced content goes, useful for multiple graphs or naming conventions.

---

### 2.4 Add Cancel Button for Long-Running Syncs
**Current State**: No way to cancel a running sync

**Proposed Implementation**:
1. Add a cancellation flag to track state
2. Add a cancel button to the progress notification in `progress.ts`:
   ```typescript
   template: `
     <div>
       <div class="text">${msg} <progress value="${current}" max="${max}"></progress></div>
       <button data-on-click="cancelSync">Cancel</button>
     </div>
   `
   ```
3. Check cancellation flag in sync loop and exit gracefully if set

**Impact**: Better UX for large libraries - users can abort accidental syncs or reconfigure settings mid-sync.

---

### 2.5 Show Current File in Progress Bar
**File**: `src/progress.ts`, `src/index.ts:415`

**Current State**: Progress bar only shows completion percentage

**Proposed Implementation**:
1. Modify `ProgressNotification` to support dynamic message updates:
   ```typescript
   updateMessage(msg: string) {
     const msgElement = this.msgElement;
     if (msgElement) {
       msgElement.textContent = msg;
     }
   }
   ```

2. Update progress in sync loop:
   ```typescript
   syncProgress.updateMessage(`Processing: ${fileHandle.name}`);
   syncProgress.increment(1);
   ```

**Impact**: Users can see which file is currently being processed, helpful for debugging large syncs.

---

### 2.6 Add "Clear All Sync Data" Option
**Current State**: No built-in way to remove all synced data

**Proposed Implementation**:
1. Add a new model function `clearSyncData()` to plugin model
2. Add a button to toolbar or settings page to trigger it
3. Implementation:
   - Find all book blocks under the sync page
   - Remove them recursively
   - Optionally remove the sync page itself or just clear it

**Impact**: Users can start fresh without manual deletion, useful for testing or major changes.

---

## Low Priority Improvements

### 3.1 Replace var with Modern JavaScript
**Files**: `src/index.ts:212`, `src/index.ts:417`, `src/index.ts:425`

**Current State**:
```typescript
var metadata = {};
var text = await fileHandle.text();
var parsed_block = lua_to_block(text);
```

**Proposed Implementation**:
Replace all `var` with `const` or `let`:
```typescript
const metadata = {};
const text = await fileHandle.text();
const parsed_block = lua_to_block(text);
```

**Impact**: Modern JavaScript best practices, clearer code intent, better scoping rules.

---

### 3.2 Add TypeScript Types for KOReader Metadata
**Files**: `src/index.ts:49`, `src/index.ts:204`

**Current State**: All metadata uses `any` type

**Proposed Implementation**:
1. Create type definitions for KOReader metadata:
   ```typescript
   interface KOReaderDocProps {
     title: string;
     authors?: string;
     description?: string;
     language?: string;
   }

   interface KOReaderAnnotation {
     datetime: string;
     datetime_updated?: string;
     pageno?: number;
     chapter?: string;
     pos0?: string;
     pos1?: string;
     text?: string;
     note?: string;
   }

   interface KOReaderMetadata {
     doc_props: KOReaderDocProps;
     annotations?: KOReaderAnnotation[];
     bookmarks?: KOReaderBookmark[];
   }
   ```

2. Replace `any` types with proper types

**Impact**: Better type safety, IDE autocomplete, catch bugs at compile time.

---

### 3.3 Extract Magic Strings to Constants
**Files**: `src/index.ts:306`, `src/index.ts:308`, `src/index.ts:323`, `src/index.ts:328`, etc.

**Current State**: Hardcoded strings scattered throughout code

**Proposed Implementation**:
1. Create a constants section at top of file:
   ```typescript
   const CONSTANTS = {
     PAGE_NAME: '_logseq-koreader-sync',
     WARNING_BLOCK_CONTENT: 'BEGIN_WARNING',
     LKRS_BLOCK_CONTENT: 'LKRS',
     BOOKMARKS_HEADER: '### Bookmarks',
     PAGE_BOOKMARK_CONTENT: '> Page bookmark',
   } as const;
   ```

2. Replace hardcoded strings with constants

**Impact**: Easier to maintain, reduce typos, easier to change UI strings in one place.

---

### 3.4 Add Sync Filtering by Date Range
**Current State**: All annotations are synced regardless of age

**Proposed Implementation**:
1. Add settings for date range:
   ```typescript
   {
     key: "syncFromDate",
     default: "",
     description: "Only sync annotations from this date (YYYY-MM-DD). Leave empty for all.",
     title: "Sync From Date",
     type: "string",
   }
   ```

2. Filter annotations during sync loop:
   ```typescript
   if (syncFromDate && annotation.datetime < syncFromDate) {
     continue;
   }
   ```

**Impact**: Useful for incremental syncs or limiting graph size.

---

### 3.5 Add Option to Sync Only Specific Books/Authors
**Current State**: All books in metadata directory are synced

**Proposed Implementation**:
1. Add settings for filters:
   ```typescript
   {
     key: "syncFilterAuthors",
     default: "",
     description: "Comma-separated list of authors to sync. Leave empty for all.",
     title: "Filter by Authors",
     type: "string",
   }
   {
     key: "syncFilterTitles",
     default: "",
     description: "Comma-separated list of book titles to sync. Leave empty for all.",
     title: "Filter by Titles",
     type: "string",
   }
   ```

2. Implement filter logic during sync loop

**Impact**: Useful for large libraries where users only want to track certain books.

---

### 3.6 Auto-Sync on Directory Changes
**Current State**: Manual sync only via toolbar button

**Proposed Implementation**:
1. Investigate File System Access API for change watching
2. Add setting:
   ```typescript
   {
     key: "autoSync",
     default: false,
     description: "Automatically sync when KOReader metadata changes.",
     title: "Auto Sync",
     type: "boolean",
   }
   ```

3. Implement directory watcher using available APIs
4. Debounce syncs to avoid rapid-fire updates

**Impact**: Users don't have to manually sync, always have latest annotations.

**Note**: This may have platform limitations - needs careful implementation and testing.

---

## New Feature: One Page Per Book

### Overview
Convert from single-page sync model to per-book page model. Each book will have its own Logseq page, improving organization and enabling better graph navigation.

### Current Architecture
- Single page: `_logseq-koreader-sync`
- All books stored as top-level blocks under this page
- Each book has a `## Book Title` header
- Bookmarks stored as children under each book

### Proposed Architecture
- One page per book, with page name based on book title
- Each page contains:
  - Page properties: authors, description, language
  - Bookmarks section with annotations
  - Book metadata
- An index page (configurable) listing all synced books with links

### Detailed Implementation Plan

#### Phase 1: Core Infrastructure

**1.1 Create Page Naming Strategy**
- Add setting for page naming convention:
  ```typescript
  {
    key: "pageNamingConvention",
    default: "book_title",
    description: "How to name book pages.",
    title: "Page Naming Convention",
    type: "string",
    enum: ["book_title", "author_title", "title_year"],
  }
  ```
- Implement page name generators:
  - `book_title`: `Book Title` (simple)
  - `author_title`: `Author - Book Title` (adds author prefix)
  - `title_year`: `Book Title (YYYY)` (adds year if available)

**1.2 Implement Page Creation/Update Logic**
- Create function `getOrCreateBookPage(bookMetadata: any) -> BlockEntity`
  - Generate page name from convention
  - Check if page exists using `logseq.Editor.getPage()`
  - If not exists, create page with `logseq.Editor.createPage()`
  - Set page properties (authors, description, language)
  - Return the page entity

- Create function `syncBookToPage(bookMetadata: any, pageUUID: string) -> void`
  - Get or create the page
  - Compare existing blocks with new annotations
  - Update or create bookmark blocks
  - Remove bookmarks that no longer exist (similar to current logic)
  - Handle page bookmark filtering (respect `syncPageBookmarks` setting)

**1.3 Implement Index Page**
- Create function `updateIndexPage(allBooks: BookInfo[]) -> void`
  - Create or update index page (configurable name, default: `KOReader Books Index`)
  - List all synced books with:
    - Link to book page: `[[Book Title]]`
    - Book properties summary
    - Sync timestamp
  - Sort alphabetically or by most recent sync

**1.4 Migration Path**
- On first run with new architecture:
  - Detect existing single-page sync
  - Offer to migrate to per-book pages
  - Migration process:
    - Parse existing sync page
    - Extract each book's content
    - Create per-book pages
    - Delete or archive old sync page
  - Provide rollback option

#### Phase 2: Sync Logic Updates

**2.1 Modify Main Sync Loop**
Current flow:
```typescript
for await (const fileHandle of walkDirectory(directoryHandle)) {
  const parsed_block = lua_to_block(text);
  if (key in existingBlocks) {
    // update existing
  } else {
    // add new block
  }
}
```

New flow:
```typescript
const allSyncedBooks: BookInfo[] = [];

for await (const fileHandle of walkDirectory(directoryHandle)) {
  const metadata = parseMetadata(text);
  const pageUUID = await getOrCreateBookPage(metadata);
  await syncBookToPage(metadata, pageUUID);
  allSyncedBooks.push({
    title: metadata.doc_props.title,
    authors: metadata.doc_props.authors,
    pageUUID,
    syncedAt: new Date(),
  });
}

await updateIndexPage(allSyncedBooks);
```

**2.2 Bookmark Reconciliation Updates**
- Current logic compares blocks under same parent block
- New logic compares blocks under same page
- Update existing book detection:
  - Instead of: `key = authors + "___" + title` (block-based)
  - Use: `pageName = generatePageName(bookMetadata)` (page-based)
  - Check if page exists to determine if book synced before

**2.3 Personal Note Handling**
- Keep existing logic for personal notes (children of bookmarks)
- Ensure notes are preserved when migrating to per-book pages
- Notes should remain children of the same bookmark block

#### Phase 3: UI and UX Improvements

**3.1 Progress Bar Updates**
- Update progress bar to show which book is being processed
- Format: `Syncing: Book Title (3/25)`

**3.2 Add Navigation Helper**
- Add button to toolbar to jump to book index page
- Or add to settings menu for easy access

**3.3 Add Book-Specific Actions**
- Per-book context menu:
  - Resync this book
  - Remove this book
  - Jump to this book's page

#### Phase 4: Configuration Options

**4.1 Page Management Settings**
```typescript
{
  key: "bookPagePrefix",
  default: "",
  description: "Prefix for all book page names.",
  title: "Book Page Prefix",
  type: "string",
}
{
  key: "indexPageName",
  default: "KOReader Books",
  description: "Name of the index page listing all synced books.",
  title: "Index Page Name",
  type: "string",
}
{
  key: "enablePerPageSync",
  default: false,
  description: "Use one page per book instead of single page sync.",
  title: "Enable Per-Page Sync",
  type: "boolean",
}
```

**4.2 Backward Compatibility**
- Keep single-page sync as default initially
- Allow users to opt-in to per-page sync
- Provide clear documentation on pros/cons of each approach

#### Phase 5: Edge Cases and Error Handling

**5.1 Duplicate Book Titles**
- Strategy 1: Add author prefix automatically
- Strategy 2: Append counter `(1)`, `(2)`, etc.
- Strategy 3: Ask user to resolve
- Make configurable via setting

**5.2 Invalid Page Names**
- Logseq has restrictions on page names
- Sanitize book titles:
  - Remove/replace invalid characters
  - Shorten excessively long titles
  - Handle special cases
- Example: `The "Book" Title` → `The Book Title` or `The-Book-Title`

**5.3 Book Metadata Changes**
- Handle cases where book title/author changes in KOReader
- Option 1: Rename page (if allowed by Logseq)
- Option 2: Create new page, link from index
- Option 3: Keep old page, add note about change

**5.4 Concurrent Access**
- Handle case where user edits book page during sync
- Strategy:
  - Only add/update blocks, don't delete unless explicitly requested
  - Add warnings if manual edits detected
  - Or lock page during sync (if Logseq supports it)

### Implementation Steps

**Step 1**: Add new settings for per-page sync configuration
**Step 2**: Implement page naming utilities (generate, validate, sanitize)
**Step 3**: Implement `getOrCreateBookPage()` function
**Step 4**: Implement `syncBookToPage()` function
**Step 5**: Implement `updateIndexPage()` function
**Step 6**: Update main sync loop to use new functions
**Step 7**: Update bookmark reconciliation logic for page-based model
**Step 8**: Implement migration tool for existing single-page syncs
**Step 9**: Update progress bar with book names
**Step 10**: Add index page navigation helper
**Step 11**: Write comprehensive tests for new logic
**Step 12**: Update README with new architecture documentation

### Benefits
- Better organization: Each book is a first-class page in the graph
- Improved navigation: Easy to find and reference specific books
- Better graph structure: Books become nodes with properties
- Scalability: Easier to manage large libraries
- Flexibility: Users can add their own notes to book pages
- Better search: Logseq page search works naturally

### Drawbacks
- More pages in the graph (could clutter if not managed well)
- Need index page to see all books
- Migration complexity for existing users
- Potential name collisions (duplicate titles)

### Migration Strategy
1. Detect existing sync on plugin load
2. Show notification to user: "One-page-per-book feature available. Migrate?"
3. If user accepts:
   - Create per-book pages from existing content
   - Create index page
   - Archive old sync page (rename with `-old-` suffix)
   - Enable per-page sync setting
4. If user declines:
   - Keep using single-page sync
   - Offer migration option again in settings

### Rollback Strategy
If user wants to revert to single-page sync:
1. User disables per-page sync in settings
2. Offer option to:
   - Keep per-book pages as-is (recommended)
   - Merge back to single page (complex, may lose some structure)
3. Index page can be kept or removed

---

## Prioritization Summary

### Immediate (This Sprint) ✅
- ✅ 1.1 Make Description Length Configurable
- ✅ 1.2 Make Block Collapse Configurable
- ✅ 1.3 Replace Fixed Delay with Proper Wait Loop
- 1.4 Improve Error Handling and User Feedback

### Short Term (Next 1-2 Sprints)
- ✅ 2.1 Eliminate Code Duplication
- 2.2 Optimize Directory Walking
- New Feature: One Page Per Book (Phase 1-3)

### Medium Term (Next 3-4 Sprints)
- 2.3 Make Sync Page Name Configurable
- 2.4 Add Cancel Button for Long-Running Syncs
- 2.5 Show Current File in Progress Bar
- 2.6 Add "Clear All Sync Data" Option
- New Feature: One Page Per Book (Phase 4-5)

### Long Term (Future Enhancements)
- 3.1 Replace var with Modern JavaScript
- 3.2 Add TypeScript Types for KOReader Metadata
- 3.3 Extract Magic Strings to Constants
- 3.4-3.6 Additional filtering and auto-sync features

---

## Notes for Implementation

### Testing Requirements
- All changes must be tested with:
  - Empty sync (first run)
  - Existing sync (incremental update)
  - Large library (100+ books)
  - Books with:
    - Long titles
    - Special characters
    - No authors
    - Multiple authors
    - Duplicate titles
    - Page bookmarks (with and without setting)
    - Personal notes
    - Mixed annotation types

### Compatibility
- Must maintain backward compatibility with existing single-page sync during transition
- Support both modes during migration period
- Preserve UUIDs where possible for existing block references

### Documentation
- Update README.md with new features
- Add migration guide for existing users
- Document all new settings
- Provide examples of per-page sync usage

### Performance
- Benchmark sync times before/after changes
- Ensure per-page sync doesn't significantly impact performance
- Consider caching page lookups during sync

---

*Last Updated: 2025-01-12*
*Plan Status: Implementation in Progress - 1.1, 1.2, 1.3, and 2.1 completed*
