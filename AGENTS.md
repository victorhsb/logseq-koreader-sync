# AGENTS.md - Logseq KOReader Sync Plugin

## Build & Development Commands

```bash
# Development server with hot reload
npm run dev

# Production build (outputs to dist/)
npm run build

# Run tests
npm test                    # Watch mode
npm run test:run            # Run tests once
npm run test:coverage       # Generate coverage report

# Linting
npm run lint                # Check code for issues
npm run lint:fix            # Auto-fix linting issues
```

**Important**: Always run tests and linting before committing changes. Build and manually test in Logseq after building.

## Project Overview

Logseq plugin that imports KOReader annotations (from `*.sdr/metadata.*.lua` files) into Logseq blocks or pages. Supports two sync modes:
- **Single-page mode**: All books stored under one page (legacy)
- **Per-page mode**: Each book gets its own Logseq page with an index

## Code Style Guidelines

### TypeScript Configuration
- Target: ES2020
- Module: ESNext with Node resolution
- Strict mode enabled: `strictNullChecks`, `strictFunctionTypes`
- Allow importing `.ts` extensions directly
- JSX: react (for template strings)

### File Structure
```
src/
├── index.ts        # Main plugin logic (~950 lines)
├── progress.ts     # Progress notification UI component
└── test/          # Test suite
    ├── setup.ts          # Test setup and mocks
    ├── utils.test.ts      # Utility function tests
    ├── progress.test.ts   # Progress notification tests
    └── metadata.test.ts   # Metadata processing tests
```

### Imports & Dependencies
```typescript
import '@logseq/libs'  // Always import Logseq library first
import { SettingSchemaDesc, BlockEntity, IBatchBlock, BlockUUID } from '@logseq/libs/dist/LSPlugin'
import { parse as luaparse } from 'luaparse'
import { get as getStorage, set as setStorage, del as delStorage } from 'idb-keyval'
```

- Import named exports explicitly, use `import { ... } from '...'`
- Prefer `import { foo } from 'bar'` over `import bar from 'bar'`
- Local imports use relative paths: `import { ProgressNotification } from './progress'`

### Variable Declarations
- Use `const` for immutable values
- Use `let` for reassignable variables
- **Do not use `var`** (legacy code still has some var declarations that should be replaced)
- Prefer arrow functions for callbacks

### Naming Conventions
- **Functions**: `camelCase` (e.g., `syncBookmarksToPage`, `getOrCreateBookPage`)
- **Variables**: `camelCase` (e.g., `directoryHandle`, `existingPage`)
- **Interfaces/Types**: `PascalCase` (e.g., `BookSettings`, `BookInfo`, `ParsedBook`)
- **Classes**: `PascalCase` (e.g., `ProgressNotification`)
- **Constants**: `UPPER_SNAKE_CASE` (though rare in current codebase)
- **Settings keys**: `camelCase` (e.g., `syncPageName`, `collapseBookmarks`)

### Error Handling
```typescript
// User-facing errors
async function showErrorToUser(message: string, details?: string) {
  logseq.UI.showMsg(message, "error");
  if (details) console.error(details);
}

// Error extraction
try {
  // operation
} catch (e) {
  const errorDetails = e instanceof Error ? e.message : String(e);
  await showErrorToUser("User-friendly message", `Technical details: ${errorDetails}`);
}
```
- Always extract error messages from Error objects: `e instanceof Error ? e.message : String(e)`
- Show user-friendly messages via `logseq.UI.showMsg()`
- Log technical details to console for debugging
- Distinguish between critical errors (stop operation) and warnings (continue)

### Type Definitions
- Current code uses `any` extensively for KOReader metadata (should be improved)
- Prefer explicit interfaces over `any` when possible
- Example of current type usage:
```typescript
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

interface BookInfo {
  title: string;
  authors?: string;
  pageName: string;
  pageUUID: string;
  syncedAt: Date;
}
```

### Settings Management
Settings are defined in `settings` array at top of `index.ts`:
```typescript
let settings: SettingSchemaDesc[] = [
  {
    key: "settingKey",           // camelCase
    default: defaultValue,
    description: "User-friendly description",
    title: "Setting Title",
    type: "string" | "boolean" | "number",
    enum: ["option1", "option2"]  // for enum types
  }
]

// Access settings
logseq.settings?.settingKey ?? defaultValue
```

### Logseq API Usage Patterns
- **Page navigation**: `logseq.App.pushState('page', { name: pageName })`
- **Get/create pages**: `logseq.Editor.getPage()`, `logseq.Editor.createPage()`
- **Block operations**: `insertBlock()`, `updateBlock()`, `removeBlock()`, `insertBatchBlock()`
- **Batch blocks**: Use `IBatchBlock` interface for hierarchical block structures
- **Wait for UI**: Use polling pattern like `waitForPage()` function
- **Database queries**: `logseq.DB.datascriptQuery()` for complex queries

### Block Content Formatting
- Headers: `## Book Title`, `### Section`
- Block quotes: `> Quoted text` (escape dashes: `replace('-', '\\-')`)
- Block properties: Use `properties` field on IBatchBlock
- Children: Use `children` array for nested blocks

### Progress Notifications
```typescript
const syncProgress = new ProgressNotification("Message", totalCount);
syncProgress.increment(1);  // Increment progress
syncProgress.updateMessage("New message");  // Update text
syncProgress.destruct();  // Clean up when done
```

### String Handling
- Escape dashes in user content: `text.replace('-', '\\-')` (dashes are list markers in Logseq)
- Truncate strings: Use helper function `truncateString(str, length)`
- Normalize authors: Replace escaped newlines: `replace(/\\\n/g, ', ')`
- Sanitize page names: Remove invalid characters, trim whitespace, limit length

### File System Access
- Uses File System Access API: `window.showDirectoryPicker()`
- Directory handles stored in IndexedDB via `idb-keyval`
- Recursive directory walking: `walkDirectory()` generator function
- File filtering: Check for `.lua` extension and `metadata` in filename

### Async Patterns
- Use `async/await` for all asynchronous operations
- Always await Logseq API calls
- Use `delay()` helper for small waits (e.g., `await delay(100)`)
- Polling for async UI state: See `waitForPage()` implementation

### Code Organization
- Keep related functions together (e.g., all bookmark syncing functions)
- Helper functions before main logic where possible
- Interfaces defined near usage
- Settings array at top of file
- Main entry point: `main()` function at end of `index.ts`

### Plugin Registration
```typescript
logseq.useSettingsSchema(settings)
logseq.provideModel({
  async functionName() {
    // implementation
  }
})
logseq.App.registerUIItem('toolbar', {
  key: 'unique-key',
  template: `<a data-on-click="functionName" class="button">...</a>`
})
logseq.ready(main).catch(console.error)
```

## Known Issues & Technical Debt

From `improvement-plans.md`:
- Some `var` declarations should be `const/let` (low priority)
- Extensive use of `any` type for metadata (should add proper types)
- Magic strings scattered throughout (should extract to constants)
- Limited test coverage (39 tests covering utility functions and metadata processing)

## Testing Guidelines

This project uses **Vitest** for unit testing. Current test coverage:
- **Utility functions** (18 tests): Settings, string handling, page naming, sanitization
- **Progress notification** (11 tests): UI component behavior and lifecycle
- **Metadata processing** (10 tests): Lua parsing, bookmark/annotation handling

### Running Tests
```bash
npm test                # Watch mode for development
npm run test:run        # Run all tests once
npm run test:coverage   # Generate coverage report
```

### Test Structure
```
src/test/
├── setup.ts          # Test setup and mocks (Logseq API, DOM, dependencies)
├── utils.test.ts      # Utility function tests
├── progress.test.ts   # Progress notification tests
└── metadata.test.ts   # Metadata processing tests
```

### Writing Tests
- Use `describe()` to group related tests
- Use `it()` or `test()` for individual test cases
- Mock external dependencies (Logseq API, DOM, etc.)
- Use `beforeEach()` for setup, `afterEach()` for cleanup
- Follow arrange-act-assert pattern

### Manual Testing Required
Since some functionality requires Logseq environment, manual testing is still needed:
1. Test both sync modes: single-page and per-page
2. Test edge cases: empty directories, large libraries, special characters
3. Test with both bookmark types: annotations and bookmarks
4. Test personal notes preservation
5. Test settings changes (toggle bookmarks, collapse, etc.)
6. Verify error handling: invalid directory, cancelled selection, etc.
7. Build and test in actual Logseq instance

## Build Output

Production build outputs to `dist/` directory:
- Entry point: `dist/index.html`
- Parcel bundles everything automatically
- Use `--no-source-maps` in production build
- Public URL set to `./` for relative paths

## Deployment

Built files in `dist/` can be loaded as a Logseq plugin. The plugin is registered with:
- ID: `_isosphere-koreader-sync`
- Title: "Logseq Koreader Sync"
- Icon: `./icon.png`
