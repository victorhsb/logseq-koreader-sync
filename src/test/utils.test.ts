import { describe, it, expect, beforeEach } from 'vitest';
import { getBookSettings, normalizeAuthors, generatePageName, sanitizePageName, truncateString } from '../index';
import { logseq } from './setup';

describe('Utility Functions', () => {
  beforeEach(() => {
    logseq.settings = {};
  });
  describe('getBookSettings', () => {
    it('should return default settings when no settings are configured', () => {
      logseq.settings = {};
      const settings = getBookSettings();

      expect(settings).toEqual({
        maxDescriptionLength: 250,
        collapseBookmarks: true,
        syncPageBookmarks: true,
        syncMode: 'single-page',
        pageNamingConvention: 'author_title',
        bookPagePrefix: '',
        indexPageName: 'KOReader Books',
        syncPageName: '_logseq-koreader-sync',
      });
    });

    it('should use configured settings when available', () => {
      logseq.settings = {
        maxDescriptionLength: 500,
        collapseBookmarks: false,
        syncPageBookmarks: false,
      };

      const settings = getBookSettings();

      expect(settings.maxDescriptionLength).toBe(500);
      expect(settings.collapseBookmarks).toBe(false);
      expect(settings.syncPageBookmarks).toBe(false);
    });
  });

  describe('normalizeAuthors', () => {
    it('should return undefined for empty or null input', () => {
      expect(normalizeAuthors(undefined)).toBeUndefined();
      expect(normalizeAuthors('')).toBeUndefined();
    });

    it('should replace escaped newlines with commas', () => {
      const result = normalizeAuthors('Author One\\\nAuthor Two');
      expect(result).toBe('Author One, Author Two');
    });

    it('should not modify author strings without newlines', () => {
      const result = normalizeAuthors('Author One, Author Two');
      expect(result).toBe('Author One, Author Two');
    });
  });

  describe('generatePageName', () => {
    it('should use title only when naming convention is book_title', () => {
      const metadata = {
        doc_props: {
          title: 'Test Book',
          authors: 'Test Author',
        },
      };

      const settings = {
        bookPagePrefix: '',
        pageNamingConvention: 'book_title',
      };

      const result = generatePageName(metadata, settings);
      expect(result).toBe('Test Book');
    });

    it('should use author-title when naming convention is author_title and authors exist', () => {
      const metadata = {
        doc_props: {
          title: 'Test Book',
          authors: 'Test Author',
        },
      };

      const settings = {
        bookPagePrefix: '',
        pageNamingConvention: 'author_title',
      };

      const result = generatePageName(metadata, settings);
      expect(result).toBe('Test Author - Test Book');
    });

    it('should use title only when naming convention is author_title but no authors', () => {
      const metadata = {
        doc_props: {
          title: 'Test Book',
        },
      };

      const settings = {
        bookPagePrefix: '',
        pageNamingConvention: 'author_title',
      };

      const result = generatePageName(metadata, settings);
      expect(result).toBe('Test Book');
    });

    it('should include prefix when specified', () => {
      const metadata = {
        doc_props: {
          title: 'Test Book',
          authors: 'Test Author',
        },
      };

      const settings = {
        bookPagePrefix: '📚 ',
        pageNamingConvention: 'book_title',
      };

      const result = generatePageName(metadata, settings);
      expect(result).toBe('📚 Test Book');
    });
  });

  describe('sanitizePageName', () => {
    it('should remove invalid characters', () => {
      const input = 'Test<Book>Title';
      const result = sanitizePageName(input);
      expect(result).toBe('TestBookTitle');
    });

    it('should replace multiple spaces with single space', () => {
      const input = 'Test   Book    Title';
      const result = sanitizePageName(input);
      expect(result).toBe('Test Book Title');
    });

    it('should trim whitespace', () => {
      const input = '  Test Book  ';
      const result = sanitizePageName(input);
      expect(result).toBe('Test Book');
    });

    it('should limit length to 100 characters', () => {
      const longInput = 'A'.repeat(150);
      const result = sanitizePageName(longInput);
      expect(result.length).toBe(100);
    });

    it('should handle empty string', () => {
      const result = sanitizePageName('');
      expect(result).toBe('');
    });
  });

  describe('truncateString', () => {
    it('should return empty string for null or undefined', () => {
      expect(truncateString(null, 10)).toBe('');
      expect(truncateString(undefined, 10)).toBe('');
    });

    it('should return string unchanged if shorter than limit', () => {
      const result = truncateString('Short', 10);
      expect(result).toBe('Short');
    });

    it('should truncate string longer than limit', () => {
      const result = truncateString('This is a longer string', 10);
      expect(result).toBe('This is a ');
    });

    it('should handle exact length match', () => {
      const result = truncateString('Exactly 10', 10);
      expect(result).toBe('Exactly 10');
    });
  });
});
