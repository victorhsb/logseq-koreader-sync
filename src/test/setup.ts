import { vi } from 'vitest';

// Mock Logseq API
const mockLogseq = {
  baseInfo: {
    id: 'test-plugin-id',
  },
  settings: {},
  useSettingsSchema: vi.fn(),
  onSettingsChanged: vi.fn(),
  provideModel: vi.fn(),
  provideUI: vi.fn(),
  provideStyle: vi.fn(),
  App: {
    pushState: vi.fn(),
    getUserConfigs: vi.fn(() => Promise.resolve({})),
    registerUIItem: vi.fn(),
  },
  Editor: {
    getPage: vi.fn(),
    createPage: vi.fn(() => Promise.resolve({})),
    getCurrentPage: vi.fn(),
    getCurrentPageBlocksTree: vi.fn(),
    insertBlock: vi.fn(() => Promise.resolve({})),
    updateBlock: vi.fn(() => Promise.resolve()),
    removeBlock: vi.fn(() => Promise.resolve()),
    insertBatchBlock: vi.fn(() => Promise.resolve()),
    getPageBlocksTree: vi.fn(),
    getBlock: vi.fn(() => Promise.resolve({})),
  },
  UI: {
    showMsg: vi.fn(),
  },
  DB: {
    datascriptQuery: vi.fn(() => Promise.resolve([])),
  },
  ready: vi.fn((cb) => Promise.resolve(cb())),
};

global.logseq = mockLogseq as any;

// Mock File System Access API
const mockWindow = {
  showDirectoryPicker: vi.fn(),
};

global.window = mockWindow as any;

// Mock IndexedDB functions
vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

// Mock Lua parser
vi.mock('luaparse', () => ({
  parse: vi.fn((text, options) => ({
    body: [
      {
        type: 'CallExpression',
        arguments: [
          {
            type: 'TableConstructorExpression',
            fields: [],
          },
        ],
      },
    ],
  })),
}));

export { mockLogseq as logseq };
