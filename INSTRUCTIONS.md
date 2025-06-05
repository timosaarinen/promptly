# Promptly - Instructions & Development Guide

## Project Overview

Promptly is a desktop application built with Electron and React, designed to assist developers in crafting and managing prompts for Large Language Models (LLMs). It provides an interface to select files and directories from a local codebase, view token and character counts, and assemble this information into a structured XML context for LLMs. The tool also supports parsing LLM responses to apply suggested code changes back to the project.

**Core Features:**

- **File System Exploration**: Navigate and select project files/directories.
- **Context Assembly**: Automatically generate an XML-formatted context from selected files, including directory structure and Git diff information.
- **Token Counting**: Utilizes `tiktoken` for core context tokenization in the main process and `gpt-tokenizer` for supplementary client-side estimations.
- **Prompt Engineering**: Different modes (Architect, Ask, Edit, etc.) to tailor system prompts.
- **LLM Response Application**: Parse XML-based LLM responses to preview and apply file creations, diffs (search/replace and potentially unified), or deletions.
- **Git Integration**: Leverages Git for status, diffs, and commit operations.
- **Terminal Integration**: Allows running test commands, post-processing scripts, and other terminal operations within the app.
- **Cross-Platform**: Built with Electron for desktop compatibility.

## Coding Conventions

Adherence to these conventions ensures consistency and maintainability across the project.

- **Language**:
  - **TypeScript**: Used for both the Electron main process (`electron/`), shared code (`shared/`), and the React renderer process (`src/`).
  - Strict mode is enabled (`"strict": true` in `tsconfig.*.json` files).
- **Frameworks & Libraries**:
  - **UI**: React (v18) with Vite as the build tool.
  - **Desktop Framework**: Electron (v28).
  - **State Management**: Jotai for global application state. Atoms are defined in `src/store/atoms.ts`.
  - **Styling**: Tailwind CSS (v3). Configuration in `tailwind.config.js`, base styles in `src/styles/index.css`.
  - **Icons**: Lucide React.
  - **Diff Processing**: The `diff` library for unified diffs and custom logic for search/replace blocks.
  - **File Watching**: `chokidar`.
- **Linting & Formatting**:
  - **ESLint**: Configured in `.eslintrc.cjs`. Please ensure code passes linting checks.
  - **Prettier**: Configured in `.prettierrc`. Formatting is enforced. Run `npm run format` before committing.
- **Naming Conventions**:
  - **Components**: PascalCase (e.g., `FileExplorer.tsx`, `PromptPanel.tsx`).
  - **Files**:
    - React components: PascalCase.
    - Utility/config/hook/service files: camelCase (e.g., `fileTreeUtils.ts`, `useToast.ts`).
  - **Functions & Variables**: camelCase (e.g., `handleToggleSelection`, `assembledContextAtom`).
  - **Types & Interfaces**: PascalCase (e.g., `FileSystemEntry`, `PromptMode`).
- **Path Aliases** (configured in `tsconfig.base.json` and `vite.config.ts`):
  - `@/*`: refers to files within the `src/` directory (renderer).
  - `@electron/*`: refers to files within the `electron/` directory (main process).
  - `@shared/*`: refers to files within the `shared/` directory (shared between main and renderer).
- **Modularity**:
  - Keep components focused on a single responsibility.
  - Electron main process logic resides in the `electron/` directory.
  - React renderer process logic resides in the `src/` directory.
  - Shared types and API contracts are in the `shared/` directory.
- **Comments**:
  - Write clear and concise JSDoc-style comments for functions, classes, and complex logic.
  - Explain "why" something is done, not just "what" it does, if not obvious.

### Electron Specifics

- **Main Process**: Code is in `electron/`. Entry point: `electron/main.ts`.
- **Renderer Process**: Code is in `src/`. A React application built with Vite.
- **Preload Script**: `electron/preload.ts` securely exposes IPC functionalities to the renderer via `contextBridge`.
- **Build Configuration**:
    - Shared TypeScript (`shared/`) is compiled first.
    - Electron main process (`electron/main.ts`) and preload script (`electron/preload.ts`) TypeScript sources are bundled and transpiled to CommonJS JavaScript (`dist/main/`) using `esbuild`.
    - `package.electron.json` is copied to `dist/main/package.json` to ensure the built main process code runs with `"type": "commonjs"`. The root `package.json` uses `"type": "module"`.
- **TypeScript Configuration**: Uses `tsconfig.base.json` for common settings like path aliases. `electron/tsconfig.json` and `src/tsconfig.json` extend this for their specific needs, building composite projects.

## Development Workflow

### Prerequisites

- Node.js (LTS version recommended, check `package.json` for engine specifics if any).
- npm (comes with Node.js).

### Setup

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd promptly
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```
    _(Note: Review `docs/setup.md` for typical installation warnings, primarily related to optional dependencies or deprecated sub-dependencies. The project should still function.)_

### Running in Development

- To start the application in development mode (with Vite dev server for the renderer and Electron app in watch mode):
  ```bash
  npm run dev
  ```
  This command concurrently runs `npm:vite:dev` (Vite dev server, typically on `http://localhost:3042`) and `npm:electron:watch` (builds main process and launches Electron). Electron will connect to the Vite server.

### Building for Production

- To build the application for production:
  ```bash
  npm run build
  ```
  This script performs the following steps:
  1.  `build:main`: Compiles shared TypeScript (`shared/`), then uses `esbuild` to bundle and transpile Electron main and preload scripts to `dist/main/`. Copies `package.electron.json`.
  2.  `build:renderer`: Builds the React renderer application (`src/`) using Vite, outputting to `dist/renderer/`.
  3.  `generate:icons`: Runs the `scripts/generate-icons.js` script to create application icons in `assets/`.
  4.  `electron-builder`: Packages the application for the host platform into the `release/` directory.

### Type Checking

- To run TypeScript compiler checks for type errors across the entire project (main, renderer, shared):
  ```bash
  npm run typecheck
  ```
  This uses `tsc -b` which respects project references defined in `tsconfig.json`.

### Linting & Formatting

- **Linting**: To lint the codebase using ESLint:
  ```bash
  npm run lint
  ```
- **Formatting**: To automatically format code using Prettier:
  ```bash
  npm run format
  ```
- **Check Formatting**: To check if code is formatted correctly without making changes:
  ```bash
  npm run format:check
  ```

### Testing

- To run unit tests using Vitest:
  ```bash
  npm run test
  ```
  Tests are located in the `tests/` directory.

## Architecture Notes

- **IPC (Inter-Process Communication)**:
  - Handlers are modularized in `electron/ipcHandlers/` (e.g., `fileSystemApi.ts`, `gitApi.ts`).
  - The main `electron/ipcHandlers.ts` aggregates registration.
  - Contracts (function signatures, request/response types) are defined in `shared/electron-api.ts`.
  - The preload script (`electron/preload.ts`) exposes these as `window.electronAPI`.
  - The renderer uses a typed wrapper `electronApi` from `shared/electron-api.ts` to call main process functions.
- **State Management**:
  - Jotai is used for global state in React (`src/store/atoms.ts`).
  - Persistent settings are managed by `electron-store` via `electron/settingsManager.ts`.
- **Context Generation**:
  - Primarily handled in the Electron main process by `electron/utils/contextBuilder.ts`.
  - Assembles XML from selected files, directory structure, and Git information.
- **LLM Response Handling**:
  - LLM responses are expected in a specific XML format (see `src/config/prompts.ts` for `outputRequirementsPrompt`).
  - Parsing is done by `src/utils/llmResponseParser.ts` using a custom tag-based parser for robustness.
  - The `ApplyPanel` (`src/components/right-panel/apply/ApplyPanel.tsx`) manages the UI for previewing and applying changes.
- **File System Watching**: `chokidar` is used in `electron/fileSystemWatcher.ts` to monitor changes in the active root directory and refresh the UI.
- **`.gitignore` Handling**: Uses the `ignore` library in `electron/gitignoreManager.ts` for efficient client-side parsing and checking of ignore rules.

## Contribution Guidelines

### Branching Strategy

- Create feature branches from `main` (or the primary development branch if different).
- Naming: `feature/your-feature`, `fix/bug-description`, `docs/update-guide`.

### Pull Requests (PRs)

- **Before PR**:
  - `npm run lint` (fix issues)
  - `npm run format`
  - `npm run typecheck` (ensure no errors)
  - `npm run test` (ensure tests pass)
  - Thoroughly test changes manually.
- **PR Description**:
  - Clear title summarizing the change.
  - Detailed description of purpose and implementation.
  - Link relevant issues (e.g., "Closes #123").
- Keep PRs focused.

### Code Reviews

- Aim for at least one approval.
- Provide constructive feedback.
- Respond to comments and address feedback.

## Debugging

- **Main Process**: Can be debugged using Node.js inspectors.
- **Renderer Process**: Use Chrome DevTools (opened automatically in dev mode, or via `Ctrl+Shift+I`/`Cmd+Option+I`).
- Logging is used throughout the Electron main process. Check the terminal output where you ran `npm run dev`.
- Various `LOG_..._DETAILS` flags exist in some modules (e.g., `LOG_PARSING_DETAILS` in `llmResponseParser.ts`) that can be temporarily set to `true` for verbose debugging.
  