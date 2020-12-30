fs = require("fs");
_ = require("lodash");

const defaultKillFilter = {
    "type": "object",
    "properties": {
        "op": {
            "type": "string",
            "enum": ["query"]
        }
    },
    "additionalProperties": true
}

const configEnv = {
    mongoURI: process.env.MONGO_URI || 'mongodb://root:password@localhost:27017/admin?retryWrites=true&w=majority',
    thresholdSeconds: Number(process.env.THRESHOLD_SEC) || 30,
    killThresholdSeconds: Number(process.env.KILL_THRESHOLD_SEC) || 90,
    checkIntervalSeconds: Number(process.env.CHECK_INTERVAL_SEC) || 15,
    killFilter: _.get(process, 'env.KILL_FILTER') && JSON.parse(process.env.KILL_FILTER),
    recordAllLongOps: Boolean(process.env.RECORD_ALL_LONG_OPS) || false,
    longOpsDB: process.env.LONG_OPS_DB || 'operations',
    longOpsCollection: process.env.LONG_OPS_COLLECTION || 'long-queries',
    killedOpsCollection: process.env.KILLED_OPS_COLLECTION || 'killed-queries',
    killingEnabled: Boolean(process.env.KILLING_ENABLED) || false
}

let configFile;
try {
    const cfgFilepath = process.argv[2] ;
    if (cfgFilepath) {
        configFile = JSON.parse(fs.readFileSync(cfgFilepath));
    } else {
        console.log("Config file is not specified, using the default values");
    }
} catch {
    console.error("Failed to parse the config file, using the default values");
}

const config = _.merge(configEnv, configFile);

if (!config.killFilter) {
    config.killFilter = defaultKillFilter;
}

module.exports = config;