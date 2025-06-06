const { MongoClient } = require('mongodb');
const { Readable } = require('stream');
const zlib = require('zlib');
const { IncomingWebhook } = require('@slack/webhook');
const cfg = require('./config');
const request = require('request-promise');
const _ = require('lodash');

// gets the Mongo log gzip using Atlas API
// and returns an array of log lines


async function getMongoLog(atlasAPI, hostName, startDate, endDate) {
    const options = {
        port: 443,
        uri: `https://cloud.mongodb.com/api/atlas/v1.0/groups/${atlasAPI.groupID}/clusters/${hostName}/logs/mongodb.gz`,
        method: 'GET',
        headers: {
            'Accept': 'application/gzip'
        },
        qs: {
            startDate,
            endDate
        },
        encoding: null
    }

    console.debug(`Getting Mongo logs issuing Atlas API call, URI: ${options.uri}`);

    try {
        var zippedLogStream = await request(options).auth(atlasAPI.publKey, atlasAPI.privKey, false);
    } catch (e) {
        console.error(`Failed to get mongo logs, status code. Atlas API request status name: ${e.name}, code: ${e.statusCode}`);
        if (e.statusCode == 401) {
            console.error('Probably your Atlas API authentication data is invalid or you don\'t have enough privileges');
        }
        return
    }

    if (zippedLogStream.length == 0) {
        console.debug(`There are no logs for the past period`);
        return [];
    }

    const mLog = zlib.gunzipSync(zippedLogStream).toString('ascii').split('\n');
    console.debug(`Logs have been successfully retrieved (${mLog.length} log lines)`);
    return mLog;
}

// takes an array of log lines
// and returns only ones containing the specified string

function searchLog(log, matchedString) {
    console.debug(`Searching the logs for the ${matchedString} string...`)
    return _.filter(log, (logL) => {
        return logL.includes(matchedString);
    });
}

// takes an array of log lines
// and sends it to a Slack channel

function alertCollscanOps(opLog, slackHookURL) {
    console.log("Sending found COLLSCAN ops to a Slack channel...");

    const slack = new IncomingWebhook(slackHookURL);

    let messagesLanded = _.map(opLog, (op) => {
        let text = `*Detected COLLSCAN operation:*\n\`\`\`${op}\`\`\``;
        return (async () => {
            console.log(`send to slack: ${text}`);
            await slack.send({text: text});
        })();
    });

    Promise.all(messagesLanded)
        .then(() => {
            console.log("Slack notification has been successfully sent");
        })
        .catch(function (err) {
            console.error(`Couldn't send notification to slack , error : ${err}`);
        });
}

async function getPrimaryReplica(mongoClient, atlasAPI) {
    console.log("Discovering the primary replica name...")
    try {
        const res = await mongoClient.db().admin().command({ isMaster: 1 });
        const setName = res.setName;

        const optionsProcesses = {
            port: 443,
            uri: `https://cloud.mongodb.com/api/atlas/v1.0/groups/${atlasAPI.groupID}/processes`,
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            encoding: null
        }
        let response = await request(optionsProcesses).auth(atlasAPI.publKey, atlasAPI.privKey, false);
        let chunks = []
        const readable = Readable.from(response)
        let joined_chunks = await new Promise((resolve, reject) => {
            readable.on('data', (chunk) => chunks.push(chunk.toString()))
            readable.on('error', (err) => reject(err))
            readable.on('end', () => resolve(chunks.join('')))
        })
        let parsed_response = JSON.parse(joined_chunks)
        // console.log(parsed_response.results)
        let result = parsed_response.results.filter((result) =>{
            return result.typeName == "REPLICA_PRIMARY" && result.replicaSetName == setName
        })
        // there is always only 1 primary replica, no needs to add a check
        let primaryReplica = result[0].userAlias

        console.log(`Primary replica is: ${primaryReplica}`);
        return primaryReplica;
    } catch (e) {
        throw new Error(`Failed to get the primary replica name..., ${e.errmsg}`);
    }
}

async function getCollScanOps(atlasAPI, replicaName, scanIntervalSec) {
    let log = await getMongoLog(atlasAPI, replicaName, Date.now() - scanIntervalSec * 1000, Date.now());
    if (log.length == 0) {
        return [];
    }
    return searchLog(log, 'COLLSCAN');
}

async function mainLoop(cfg, mongoClient) {
    console.log(`\nChecking for COLLSCAN operations for the past ${cfg.scanIntervalSec} seconds...`);

    let primaryReplicaName;
    try {
        primaryReplicaName  = await getPrimaryReplica(mongoClient, cfg.atlasAPI);
    } catch (e) {
        console.error(e);
        return
    }

    const collscanOps = await getCollScanOps(cfg.atlasAPI, primaryReplicaName, cfg.scanIntervalSec);

    if (collscanOps.length !== 0) {
        console.log(`${collscanOps.length} COLLSCAN operations have been found`);
        alertCollscanOps(collscanOps, cfg.slackHookURL);
    } else {
        console.log("No COLLSCAN operations have been found");
    }
}

async function init(cfg) {
    if (!cfg) {
        process.exit(1);
    }
    const mongoClient = new MongoClient(cfg.mongoURI, { useUnifiedTopology: true });
    await mongoClient.connect();
    mainLoop(cfg, mongoClient);
    setInterval(mainLoop, cfg.scanIntervalSec * 1000, cfg, mongoClient);
}

init(cfg);
