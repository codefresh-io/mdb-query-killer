# MongoDB long queries killer

This service runs a loop to constantly check mongo for currently running operations and kill them, if they run more than a certain time threshold value.

The killer is also configurable with a specific **kill filter**. If a candidate operation object doesn't match the filter, it is not killed. It might be useful to exclude such operations as ETL, which are expected to be long.

Before killing an operation, the killer records it to a separate database and collection, which can be specified as configuration values.

The service is implemented as a K8s pod controlled by a deployment. The respective [Helm chart](https://github.com/codefresh-io/mdb-query-killer/tree/master/.deploy) is present in this repository.

## Configuration

### How the configuration is consumed

The application takes a path to a config file as as a first passed argument:

`node src/index.js path/to/cfg/file.json`

An example of such configuration file is [here](https://github.com/codefresh-io/mdb-query-killer/blob/master/examples/example-config.json). For production environments the application is configured via a [Helm chart](https://github.com/codefresh-io/mdb-query-killer/tree/master/chart) and a values file.

### Configuration values

|Value name|Description|Type|Default value
|---|---|--|--|
| mongoURI  | Mongo connection string | String | mongodb://root:password@localhost:27017/admin?retryWrites=true&w=majority
| thresholdSeconds  | Time in seconds a mongo operation must be running to be reported as a long running one | Int | 30
| killThresholdSeconds  | Time in seconds a mongo operation must be running to trigger the killer | Int | 90
| checkIntervalSeconds | Time in seconds between the checks | Int | 15
| killFilter  | Defines a JSON schema, which is matched against a mongo operation object. If there is no match, operation will not be killed | JSON Schema Obj | See the default value [here](https://github.com/codefresh-io/mdb-query-killer/blob/e6fb356d850356c415c78c48b76b0614959cbb06/src/config.js#L4-L13)
| recordAllLongOps | By default, only the killed operations are recorded. If this flag is `true`, all the operations above the threshold value will be recorded, not only the killed ones | Bool | false
| longOpsDB  |  Defines a name of the mongo database, where the long running operations are recorded to | String | "operations"
| longOpsCollection | Relevant only with the `recordAllLongOps` flag set. Defines a name for the mongo collection, where the long running operations are recorded to | String | long-queries
| killedOpsCollection | Defines a name for the mongo collection, where the long running operations are recorded to right before they are killed | String | killed-queries
| killingEnabled | Enables/Disables killing of the operations | Bool | false
| slack.webhookUrl | Slack webhook url | string | - |
| slack.channels.alerts | Slack channel to send alerts about the killed operations | string | - |
| slack.channels.warnings | Slack channel to send various warnings | string | - |

## Add-ons

All add-ons are managed in this folder [src/addons](https://github.com/codefresh-io/mdb-query-killer/tree/master/src/addons).

### collscan-ops-checker

This sub-service is intended to detect mongo operations that do full collection scan (COLLSCAN operations) and send an alert message to a Slack channel containing information about the operation. It is related to [CR-1425](https://codefresh-io.atlassian.net/browse/CR-1425).

All the related documentation can be found in the README.md of the add-on specific [folder](https://github.com/codefresh-io/mdb-query-killer/tree/master/src/addons/collscan-op-checker)
