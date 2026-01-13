import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProgressNotification } from '../progress';
import { logseq as mockLogseq } from './setup';

describe('ProgressNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock document methods
    document.getElementById = vi.fn();
    document.querySelector = vi.fn();

    // Mock window.parent.document
    const parentWindow = {
      document: {
        getElementById: vi.fn(),
      },
    };
    (global as any).window = {
      ...(global as any).window,
      parent: parentWindow,
    };

    // Reset logseq mock
    mockLogseq.baseInfo = { id: 'test-plugin-id' };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with message and max value', () => {
      const progress = new ProgressNotification('Processing files', 10);

      expect(progress.max).toBe(10);
      expect(progress.current).toBe(0);
      expect(progress.msgElement).toBeNull();
      expect(progress.progressBar).toBeNull();
    });

    it('should register UI with logseq', () => {
      new ProgressNotification('Processing files', 10);

      expect(mockLogseq.provideUI).toHaveBeenCalledWith(
        expect.objectContaining({
          template: expect.stringContaining('Processing files'),
        })
      );
    });

    it('should register custom styles', () => {
      new ProgressNotification('Processing files', 10);

      expect(mockLogseq.provideStyle).toHaveBeenCalled();
      const styleCall = (mockLogseq.provideStyle as any).mock.calls[0][0];
      expect(styleCall).toContain('#logseq-koreader-sync-progress-bar-');
    });

    it('should register custom styles', () => {
      new ProgressNotification('Processing files', 10);

      expect(mockLogseq.provideStyle).toHaveBeenCalled();
      const styleCall = (mockLogseq.provideStyle as any).mock.calls[0][0];
      expect(styleCall).toContain('#logseq-koreader-sync-progress-bar-');
    });
  });

  describe('increment', () => {
    it('should increase current value by default amount (1)', () => {
      const progress = new ProgressNotification('Test', 10);
      progress.increment();

      expect(progress.current).toBe(1);
    });

    it('should increase current value by specified amount', () => {
      const progress = new ProgressNotification('Test', 10);
      progress.increment(5);

      expect(progress.current).toBe(5);
    });

    it('should update progress bar when found', () => {
      const mockProgressBar = {
        setAttribute: vi.fn(),
      };

      const parentWindow = (global as any).window.parent;
      parentWindow.document.getElementById = vi.fn(() => mockProgressBar);
      const progress = new ProgressNotification('Test', 10);
      progress.increment(3);

      expect(parentWindow.document.getElementById).toHaveBeenCalled();
      expect(mockProgressBar.setAttribute).toHaveBeenCalledWith('value', '3');
    });

    it('should not crash when progress bar not found', () => {
      document.getElementById = vi.fn(() => null);
      const progress = new ProgressNotification('Test', 10);

      expect(() => progress.increment()).not.toThrow();
    });
  });

  describe('updateMessage', () => {
    it('should update message element when found', () => {
      const mockMsgElement = {
        textContent: '',
      };

      const mockNotification = {
        querySelector: vi.fn(() => mockMsgElement),
      };

      document.querySelector = vi.fn(() => mockNotification);
      const progress = new ProgressNotification('Initial', 10);
      progress.updateMessage('Updated message');

      expect(mockMsgElement.textContent).toBe('Updated message');
    });

    it('should not crash when message element not found', () => {
      document.querySelector = vi.fn(() => null);
      const progress = new ProgressNotification('Test', 10);

      expect(() => progress.updateMessage('New message')).not.toThrow();
    });
  });

  describe('destruct', () => {
    it('should clear UI and reset progress bar reference', () => {
      const progress = new ProgressNotification('Test', 10);
      progress.destruct();

      expect(mockLogseq.provideUI).toHaveBeenCalledWith(
        expect.objectContaining({
          template: '',
        })
      );
      expect(progress.progressBar).toBeNull();
    });
  });
});
