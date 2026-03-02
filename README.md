# ext-devtools-panel

Advanced DevTools panel for Chrome extensions with network inspection, storage debugging, and performance profiling.

## Features

- Network request/response logging
- Storage inspection (local, sync, session)
- Console message capture
- Performance profiling
- HAR export
- TypeScript support

## Installation

```bash
npm install ext-devtools-panel
```

## Usage

```typescript
import { DevToolsPanel } from 'ext-devtools-panel';

const panel = new DevToolsPanel();
await panel.initialize();

// Get network requests
const requests = panel.network.getRequests();
console.log(requests);

// Get storage data
const storage = await panel.storage.getAllStorage();
```

## License

MIT
