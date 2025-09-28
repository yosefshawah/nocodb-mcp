// Global test setup
import { jest } from "@jest/globals";

// Mock console.error to avoid noise in test output
global.console.error = jest.fn();

// Set default environment variables for tests
process.env.NODE_ENV = "test";
