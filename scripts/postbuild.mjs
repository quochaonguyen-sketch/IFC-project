import {copyFile} from 'node:fs/promises';
// Preserve old bookmarks and the rider support iframe without an extra redirect.
await copyFile('out/location-tools/index.html','out/location_tools.html');
await copyFile('out/rider/call/index.html','out/rider/call.html');
console.log('Legacy HTML URLs preserved.');
