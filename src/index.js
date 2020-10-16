const { MongoClient } = require('mongodb');
const _ = require('lodash');
const cfg = require('./config');
const validate = require('jsonschema').validate;

async function getLongRunningOps(client, threshold) {
    const res = await client.db().admin().command({
        currentOp: 1,
        secs_running: { "$gt": threshold }
    });
    return res.inprog;
}

async function recordOp(client, op, dbname, collection) {
    try {
        op.command = JSON.stringify(op.command);
        op.originatingCommand = JSON.stringify(op.originatingCommand);
        return await client.db(dbname)
            .collection(collection)
            .replaceOne({ opid: op.opid }, op, { upsert: true });
    } catch (e) {
        console.log(`Failed to record a long running operation with ID: ${op.opid}`);
    }
}

async function killOp(client, op) {
    let record = await recordOp(client, op, cfg.longOpsDB, cfg.killedOpsCollection);
    if (record) { // kill operation only if it has been successfully recorded
        try {
            await client.db().admin().command({ killOp: 1, op: op.opid });
            console.log(`Killed an operation with ID: ${op.opid}`);
        } catch (e) {
            console.log(`Failed killing operation with ID: ${op.opid}:\n${e}`);
        }
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

async function mainLoop(cfg, client) {
    while (true) {
        let promises = [];
        console.log("Checking for long running operations...");
        let ops = await getLongRunningOps(client, cfg.thresholdSeconds);
        if (ops.length !== 0) {
            _.forEach(ops, async (op) => {
                console.log(`Detected a long running operation with ID: ${op.opid}`);
                if (cfg.recordAllLongOps) {
                    let res = recordOp(client, op, cfg.longOpsDB, cfg.longOpsCollection);
                    promises.push(res);
                }
                if (cfg.killingEnabled) {
                    if (matchesFilter(op, cfg.killFilter)) {
                        let res = killOp(client, op);
                        promises.push(res);
                    } else {
                        console.log(`Operation ${op.opid} doesn't match the kill filter, ignoring`);
                    }
                }

            });
            if (cfg.killingEnabled) {
                console.log("Operations will not be killed, as killing is disabled");
            }
        }

        let timeout = new Promise(resolve => timer = setTimeout(resolve, cfg.checkIntervalSeconds * 1000));

        await Promise.all(promises);

        if (sigTerm) {
            return Promise.resolve();
        }

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
    const client = new MongoClient(cfg.mongoURI, { useUnifiedTopology: true });
    console.log("Connecting to the database...");
    await client.connect();
    console.log("Successfully connected, starting the main loop...");

    const loopFinished = mainLoop(cfg, client);

    process.on('SIGTERM', async () => {
        await handleSigTerm(client, loopFinished)
    });
}

// global vars for handling the sigterm properly
var sigTerm;
var timer;

main();