# Testing

This project uses Vitest for unit testing.

## Running Tests

```bash
# Run all tests in watch mode
npm test

# Run all tests once
npm run test:run

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

- `src/test/setup.ts` - Test setup and mocks
- `src/test/utils.test.ts` - Tests for utility functions
- `src/test/progress.test.ts` - Tests for ProgressNotification class
- `src/test/metadata.test.ts` - Tests for metadata processing functions

## Writing Tests

Tests should follow these conventions:
- Use `describe()` to group related tests
- Use `it()` or `test()` for individual test cases
- Always mock external dependencies (Logseq API, DOM, etc.)
- Use `beforeEach()` to set up test state
- Use `afterEach()` or `afterAll()` to clean up

Example:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('FunctionName', () => {
  beforeEach(() => {
    // Setup mock state
  });

  it('should do something', () => {
    // Arrange
    const input = ...;

    // Act
    const result = functionName(input);

    // Assert
    expect(result).toBe(expected);
  });
});
```
