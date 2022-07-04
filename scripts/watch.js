const fs = require('fs-extra');
const path = require('path')

fs.watch('./posts/**', (event, filename) => {
    console.log(event, filename)
})