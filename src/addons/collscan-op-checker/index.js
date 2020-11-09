const zlib = require('zlib');
const SlackWebhook = require('slack-webhook');
const cfg = require('./config');
const request = require('request-promise');
const _ = require('lodash');

// gets the Mongo log gzip using Atlas API
// and returns an array of log lines

async function getMongoLog(atlasAPI, startDate, endDate) {
    const options = {
        port: 443,
        uri: `https://cloud.mongodb.com/api/atlas/v1.0/groups/${atlasAPI.groupID}/clusters/${atlasAPI.clusterHostName}/logs/mongodb.gz`,
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
        console.error("Failed to get mongo logs, status code. Atlas API request status code:", e.statusCode);
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

    const slack = new SlackWebhook(slackHookURL);
    let messagesLanded = _.map(opLog, (op) => {
        let text = `*Detected COLLSCAN operation:*\n\`\`\`${op}\`\`\``;
        return slack.send({ text: text });
    });

    Promise.all(messagesLanded)
        .then(() => {
            console.log("Slack notification has been successfully sent");
        })
        .catch(function (err) {
            console.error(`Couldn't send notification to slack , error : ${err}`);
        });
}

async function getCollScanOps(atlasAPI, scanIntervalSec) {
    let log = await getMongoLog(atlasAPI, Date.now() - scanIntervalSec * 1000, Date.now());
    if (log.length == 0) {
        return [];
    }
    return searchLog(log, 'COLLSCAN');
}

async function mainLoop(cfg) {
    console.log(`\nChecking for COLLSCAN operations for the past ${cfg.scanIntervalSec} seconds...`);
    const collscanOps = await getCollScanOps(cfg.atlasAPI, cfg.scanIntervalSec);

    if (collscanOps.length !== 0) {
        console.log(`${collscanOps.length} COLLSCAN operations have been found`);
        alertCollscanOps(collscanOps, cfg.slackHookURL);
    } else {
        console.log("No COLLSCAN operations have been found");
    }
}

function init(cfg) {
    if (!cfg) {
        process.exit(1);
    }
    mainLoop(cfg);
    setInterval(mainLoop, cfg.scanIntervalSec * 1000, cfg);
}

init(cfg);
