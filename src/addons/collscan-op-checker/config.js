fs = require("fs");

let config;
try {
    const cfgFilepath = process.argv[2];
    if (cfgFilepath) {
        config = JSON.parse(fs.readFileSync(cfgFilepath));
    } else {
        console.error("Config file is not specified, exiting");
    }
} catch (e) {
    console.error(`Failed to parse the config file. Error: ${e}`);
}

module.exports = config;