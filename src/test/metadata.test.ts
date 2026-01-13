import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handle_annotations_metadata, handle_bookmarks_metadata, getBookSettings } from '../index';
import { logseq as mockLogseq } from './setup';

describe('Metadata Processing', () => {
  beforeEach(() => {
    mockLogseq.settings = {
      maxDescriptionLength: 250,
      collapseBookmarks: true,
      syncPageBookmarks: true,
      syncMode: 'single-page',
      pageNamingConvention: 'author_title',
      bookPagePrefix: '',
      indexPageName: 'KOReader Books',
      syncPageName: '_logseq-koreader-sync',
    };
  });

  describe('handle_annotations_metadata', () => {
    it('should return null for empty doc_props object', () => {
      const metadata = {
        doc_props: {},
      };

      const result = handle_annotations_metadata(metadata);

      expect(result).toBeNull();
    });

    it('should return simple header when annotations is missing', () => {
      const metadata = {
        doc_props: {
          title: 'Test Book',
          authors: 'Test Author',
          description: 'Test description',
          language: 'en',
        },
      };

      const result = handle_annotations_metadata(metadata);

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('content', '## Test Book');
      expect(result).toHaveProperty('properties');
      expect(result?.properties).toHaveProperty('authors', 'Test Author');
    });

    it('should create bookmark blocks with properties', () => {
      const metadata = {
        doc_props: {
          title: 'Test Book',
        },
        annotations: [
          {
            datetime: '2025-01-13',
            text: 'Test annotation text',
            pageno: 10,
            chapter: 'Chapter 1',
          },
        ],
      };

      const result = handle_annotations_metadata(metadata);

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('children');
      expect(result?.children).toHaveLength(1);
      expect(result?.children?.[0]).toHaveProperty('content', '### Bookmarks');
    });

    it('should handle personal notes in annotations', () => {
      const metadata = {
        doc_props: {
          title: 'Test Book',
        },
        annotations: [
          {
            text: 'Test annotation',
            note: 'My personal note',
          },
        ],
      };

      const result = handle_annotations_metadata(metadata);

      const bookmarkBlock = result?.children?.[0]?.children?.[0];
      expect(bookmarkBlock).toHaveProperty('children');
      expect(bookmarkBlock?.children).toHaveLength(1);
      expect(bookmarkBlock?.children?.[0]).toHaveProperty('content', 'My personal note');
    });

    it('should skip page bookmarks when syncPageBookmarks is false', () => {
      mockLogseq.settings.syncPageBookmarks = false;
      const metadata = {
        doc_props: {
          title: 'Test Book',
        },
        annotations: [
          {
            pageno: 5,
          },
        ],
      };

      const result = handle_annotations_metadata(metadata);

      expect(result).not.toBeNull();
    });
  });

  describe('handle_bookmarks_metadata', () => {
    it('should return null for empty doc_props object', () => {
      const metadata = {
        doc_props: {},
      };

      const result = handle_bookmarks_metadata(metadata);

      expect(result).toBeNull();
    });

    it('should return simple header when bookmarks is missing', () => {
      const metadata = {
        doc_props: {
          title: 'Test Book',
          authors: 'Test Author',
        },
      };

      const result = handle_bookmarks_metadata(metadata);

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('content', '## Test Book');
    });

    it('should create bookmark blocks from bookmarks array', () => {
      const metadata = {
        doc_props: {
          title: 'Test Book',
        },
        bookmarks: [
          {
            notes: 'Test bookmark notes',
            datetime: '2025-01-13',
            page: 10,
            chapter: 'Chapter 1',
          },
        ],
      };

      const result = handle_bookmarks_metadata(metadata);

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('children');
      expect(result?.children).toHaveLength(1);
    });

    it('should handle text field in bookmarks', () => {
      const metadata = {
        doc_props: {
          title: 'Test Book',
        },
        bookmarks: [
          {
            notes: 'Test bookmark',
            text: 'My note about this bookmark',
          },
        ],
      };

      const result = handle_bookmarks_metadata(metadata);

      const bookmarkBlock = result?.children?.[0]?.children?.[0];
      expect(bookmarkBlock).toHaveProperty('children');
      expect(bookmarkBlock?.children).toHaveLength(1);
      expect(bookmarkBlock?.children?.[0]).toHaveProperty('content', 'My note about this bookmark');
    });

    it('should escape dashes in bookmark content', () => {
      const metadata = {
        doc_props: {
          title: 'Test Book',
        },
        bookmarks: [
          {
            notes: 'Test - with - dashes',
          },
        ],
      };

      const result = handle_bookmarks_metadata(metadata);

      const bookmarkBlock = result?.children?.[0]?.children?.[0];
      expect(bookmarkBlock).toHaveProperty('content');
      expect(bookmarkBlock?.content).toContain('\\-');
    });
  });
});
