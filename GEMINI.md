# GEMINI Project Context: MyTab

## Project Overview

This project, "MyTab," is a browser extension that replaces the new tab page with a custom bookmark management dashboard. It is designed to be clean, modern, and highly functional. The core feature is its ability to synchronize and back up user bookmarks to a self-hosted or third-party WebDAV server, ensuring data privacy and longevity.

The project is built with vanilla HTML, CSS, and JavaScript (using ES modules), with no external frontend frameworks. It has two primary modes of operation:

1.  **Browser Extension:** The primary mode, designed for Chromium-based browsers like Chrome and Edge. It uses `chrome.storage` for local data and communicates directly with WebDAV servers.
2.  **Web App:** A web-accessible version that can be run directly in a browser. This is made possible by a compatibility layer (`web-shim.js`) that shims the required `chrome.*` APIs with web equivalents (`localStorage`). To overcome browser CORS limitations, the web app uses a serverless function deployed on Vercel (`api/webdav.js`) as a reverse proxy for all WebDAV communication.

## Building and Running

There is no formal build process (e.g., webpack, vite) required for this project.

### Running as a Browser Extension

1.  Open a Chromium-based browser (e.g., Google Chrome, Microsoft Edge).
2.  Navigate to the extensions management page (`chrome://extensions` or `edge://extensions`).
3.  Enable "Developer mode".
4.  Click "Load unpacked".
5.  Select the `mytab/` directory from this project.
6.  The extension will be installed, and opening a new tab will now show the MyTab interface.

### Running as a Web App

1.  The project is configured for deployment on Vercel. The `vercel.json` file handles routing, redirecting the root path to `mytab/index.html`.
2.  To run locally, simply open the `mytab/index.html` file in a web browser. The `web-shim.js` script will automatically activate, providing a near-identical experience to the extension, with the notable difference that WebDAV requests are proxied through the Vercel serverless function defined in `api/webdav.js`.

## Development Conventions

### Code Structure

The codebase is organized logically within the `mytab/` directory:

-   **`index.html`**: The main UI of the new tab page.
-   **`options.html`**: The settings page for configuring WebDAV, backups, and appearance.
-   **`manifest.json`**: The standard manifest file defining the browser extension's properties and permissions.
-   **`styles.css`**: Contains all the styles for the application.
-   **`scripts/`**: Contains all the JavaScript logic.
    -   **`app.js`**: The main application logic for the `index.html` page (rendering, event handling).
    -   **`options.js`**: The logic for the `options.html` page.
    -   **`storage.js`**: A dedicated data layer that abstracts all interactions with `chrome.storage.local`. It contains all functions for CRUD (Create, Read, Update, Delete) operations on folders and bookmarks.
    -   **`webdav.js`**: A WebDAV client used by the background script for direct communication with the server.
    -   **`web-shim.js`**: A critical compatibility layer that shims `chrome.*` APIs to allow the application to run as a standard website.
-   **`background/`**:
    -   **`service_worker.js`**: The extension's service worker. It handles background tasks like scheduled backups, listening for storage changes, and processing messages from the UI for long-running tasks (e.g., testing WebDAV, restoring backups).
-   **`api/`**:
    -   **`webdav.js`**: A Vercel serverless function that acts as a CORS reverse proxy for the web app version.

### Data Flow

-   **Storage**: All application data (folders, bookmarks, settings) is stored in `chrome.storage.local`. The `storage.js` module is the single source of truth for accessing this data.
-   **State Management**: The UI state is managed directly within `app.js`.
-   **Communication**: The UI scripts (`app.js`, `options.js`) communicate with the service worker (`service_worker.js`) using `chrome.runtime.sendMessage` for tasks that require elevated permissions or background processing, such as initiating a backup or testing a WebDAV connection.
-   **UI Updates**: When data is modified via `storage.js`, a `data:changed` message is broadcast using `chrome.runtime.sendMessage`. The `app.js` script listens for this message to re-render the UI, ensuring consistency.
