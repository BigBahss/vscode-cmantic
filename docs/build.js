const fs = require('fs');
const path = require('path');

fs.copyFileSync(path.resolve(__dirname, '..', 'CHANGELOG.md'), path.resolve(__dirname, '_includes', 'CHANGELOG.md'));
