const fs = require('fs');

fs.readFileSync('.env').toString().split('\n').forEach(line => {
    console.log(line);
});