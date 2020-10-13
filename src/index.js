const { MongoClient } = require('mongodb');
const _ = require('lodash');
const cfg = require('./config');

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
    record = await recordOp(client, op, cfg.longOpsDB, cfg.killedOpsCollection);
    if (record) { // kill operation only if it has been successfully recorded
        try {
            await client.db().admin().command({ killOp: 1, op: op.opid });
            console.log(`Killed an operation with ID: ${op.opid}`);
        } catch (e) {
            console.log(`Failed killing operation with ID: ${op.opid}:\n${e}`);
        }
    }
}

async function mainLoop(cfg) {
    const client = new MongoClient(cfg.mongoURI, { useUnifiedTopology: true });
    await client.connect();
    while (true) {
        let promises = [];
        let ops = await getLongRunningOps(client, cfg.thresholdSeconds);
        if (ops.length !== 0) {
            _.forEach(ops, async (op) => {
                console.log(`Detected a long running operation with ID: ${op.opid}`);
                if (cfg.recordAllLongOps) {
                    let res = recordOp(client, op, cfg.longOpsDB, cfg.longOpsCollection);
                    promises.push(res);
                }
                if (cfg.killingEnabled) {
                    if (_.isMatch(op, cfg.killFilter)) {
                        let res = killOp(client, op);
                        promises.push(res);
                    } else {
                        console.log(`Operation ${op.opid} doesn't match the kill filter, ignoring`);
                    }
                }
            });
        }
        let timeout = new Promise(resolve => setTimeout(resolve, cfg.checkIntervalSeconds * 1000));
        
        // wait for all the pending queries before starting the next iteration
        await Promise.all(promises); 

        if (sigTerm) {
            console.log("Handling the received SIGTERM signal...");
            await client.close();
            console.log("Successfully handled the SIGTERM signal and exited gracefully...");
            process.exit(0);
        }

        await timeout;
    }
}

var sigTerm;
process.on('SIGTERM', function () {
    sigTerm = true;
});

mainLoop(cfg);