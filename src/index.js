const { MongoClient } = require('mongodb');
const validate = require('jsonschema').validate;
const _ = require('lodash');
const Slack = require('./Slack');
const cfg = require('./config');

async function getLongRunningOps(client, threshold) {
    try {
        const res = await client.db().admin().command({
            currentOp: 1,
            secs_running: { "$gt": threshold }
        });
        return res.inprog;
    } catch (e) {
        console.log(`Failed to get long running ops:\n${e}`);
        throw e;
    }
}

// reports long running ops that are finished
// by comparing the current ops with the ops saved from the
// previous iteration
function reportLongRunningOps(slack, currentOps) {
    const finishedOps = _.differenceBy(opsHistory, currentOps, 'opid');
    for (op of finishedOps) {
        console.log(`Sending notification about long running operation with ID ${op.opid}`);
        slack.warn(`Detected a long running operation with id ${op.opid}`, op);
    }
}

async function recordOp(client, op, dbname, collection) {
    let storedOp = _.cloneDeep(op);
    try {
        storedOp.command = JSON.stringify(op.command);
        storedOp.originatingCommand = JSON.stringify(op.originatingCommand);
        return await client.db(dbname)
            .collection(collection)
            .replaceOne({ opid: op.opid }, storedOp, { upsert: true });
    } catch (e) {
        console.log(`Failed to record an operation with ID: ${op.opid}`);
        throw e;
    }
}

async function killOp(client, op) {
    try {
        await recordOp(client, op, cfg.longOpsDB, cfg.killedOpsCollection);
        await client.db().admin().command({ killOp: 1, op: op.opid });
        console.log(`Killed an operation with ID: ${op.opid}`);
    } catch (e) {
        console.log(`Failed killing operation with ID: ${op.opid}:\n${e}`);
        throw e;
    }
}

function matchesFilter(obj, jsonschema) {
    try {
        return validate(obj, jsonschema).valid;
    }
    catch (e) {
        console.log(`An exception occurred on trying to match the kill filter: ${e}`);
        return false;
    }
}

async function mainLoop(cfg, client, slack) {
    while (true) {
        let promises = [];
        console.log("Checking for long running operations...");
        let ops = await getLongRunningOps(client, cfg.thresholdSeconds);
        reportLongRunningOps(slack, ops);
        if (ops.length !== 0) {
            _.forEach(ops, async (op) => {
                if (!op) {
                    console.log(`Detect op that is unknown, skipping`);
                } else {
                    console.log(`Detected a long running operation with ID: ${op.opid}`);
                    if (cfg.recordAllLongOps) {
                        let res = recordOp(client, op, cfg.longOpsDB, cfg.longOpsCollection)
                            .catch(() => { });
                        promises.push(res);
                    }
                    if (cfg.killingEnabled) {
                        if (op.secs_running > cfg.killThresholdSeconds) {
                            if (matchesFilter(op, cfg.killFilter)) {
                                let res = killOp(client, op)
                                    .then(() => {
                                        console.log("Sending notification about the killed operation to Slack...");
                                        // return slack.alert('Killed a long running operation', op);
                                    })
                                    .catch((e) => {
                                        // return slack.alert(`Failed killing an operation, error: ${e}`, op);
                                    });
                                _.remove(ops, (o) => { return o.opid == op.opid });
                                return promises.push(res);
                            }
                            console.log(`Operation ${op.opid} doesn't match the kill filter, ignoring`);
                            return slack.alert(`Detected an operation above the kill threshold, but not matching the kill filter`, op);
                        } else {
                            console.log(`Operation ${op.opid} is running less than ${cfg.killThresholdSeconds} seconds, delaying killing`);
                        }
                    }
                }

            });
            if (!cfg.killingEnabled) {
                console.log("Operations will not be killed, as killing is disabled");
            }
        }

        let timeout = new Promise(resolve => timer = setTimeout(resolve, cfg.checkIntervalSeconds * 1000));

        await Promise.all(promises);

        if (sigTerm) {
            return Promise.resolve();
        }

        opsHistory = ops;

        await timeout;
    }
}

async function handleSigTerm(client, semaphore) {
    console.log("Handling the received SIGTERM signal...");
    sigTerm = true;
    if (_.get(timer, '_destroyed', true)) {
        await semaphore;
    }
    await client.close();
    console.log("Successfully handled the SIGTERM signal and exited gracefully...");
    process.exit(0);
}

async function main() {
    const slack = new Slack(cfg.slack);
    const client = new MongoClient(cfg.mongoURI, { useUnifiedTopology: true });

    console.log("Connecting to the database...");
    await client.connect();
    console.log("Successfully connected, starting the main loop...");

    const loopFinished = mainLoop(cfg, client, slack).catch(() => {
        // exit with non-zero code to force K8s to restart the service and re-initialize the mongo client
        process.exit(1);
    });

    process.on('SIGTERM', async () => {
        await handleSigTerm(client, loopFinished)
    });
}

// global vars for handling the sigterm properly
var sigTerm;
var timer;

// array containing detected long running operations
// to be kept between the loop iterations
var opsHistory = [];

main();
