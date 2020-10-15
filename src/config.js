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

const config = {
    mongoURI: process.env.MONGO_URI || 'mongodb://root:password@localhost:27017/admin?retryWrites=true&w=majority',
    thresholdSeconds: Number(process.env.THRESHOLD_SEC) || 90,
    checkIntervalSeconds: Number(process.env.CHECK_INTERVAL_SEC) || 30,
    killFilter: _.get(process, 'env.KILL_FILTER') && JSON.parse(process.env.KILL_FILTER) || defaultKillFilter,
    recordAllLongOps: Boolean(process.env.RECORD_ALL_LONG_OPS) || true,
    longOpsDB: process.env.LONG_OPS_DB || 'long-queries',
    longOpsCollection: process.env.LONG_OPS_COLLECTION || 'long-queries',
    killedOpsCollection: process.env.KILLED_OPS_COLLECTION || 'killed-queries',
    killingEnabled: Boolean(process.env.KILLING_ENABLED) || false
}

module.exports = config;