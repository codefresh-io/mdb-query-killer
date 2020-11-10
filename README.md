# MongoDB long queries killer

This service runs a loop to constantly check mongo for currently running operations and kill them, if they run more than a certain time threshold value.

The killer is also configurable with a specific **kill filter**. If a candidate operation object doesn't match the filter, it is not killed. It might be useful to exclude such operations as ETL, which are expected to be long.

Before killing an operation, the killer records it to a separate database and collection, which can be specified as configuration values.

The service is implemented as a K8s pod controlled by a deployment. The respective [Helm chart](https://github.com/codefresh-io/mdb-query-killer/tree/master/chart) is present in this repository.

## Configuration

### How the configuration is consumed

The application takes a path to a config file as as a first passed argument:

`node src/index.js path/to/cfg/file.json`

An example of such configuration file is [here](https://github.com/codefresh-io/mdb-query-killer/blob/master/examples/example-config.json). For production environments the application is configured via a [Helm chart](https://github.com/codefresh-io/mdb-query-killer/tree/master/chart) and a values file.

### Configuration values

|Value name|Description|Type|Default value
|---|---|--|--|
| mongoURI  | Mongo connection string | String | mongodb://root:password@localhost:27017/admin?retryWrites=true&w=majority
| thresholdSeconds  | Time in seconds a mongo operation must be running to trigger the killer| Int | 90
| checkIntervalSeconds | Time in seconds between the checks | Int | 30
| killFilter  | Defines a JSON schema, which is matched against a mongo operation object. If there is no match, operation will not be killed | JSON Schema Obj | See the default value [here](https://github.com/codefresh-io/mdb-query-killer/blob/e6fb356d850356c415c78c48b76b0614959cbb06/src/config.js#L4-L13)
| recordAllLongOps | By default, only the killed operations are recorded. If this flag is `true`, all the operations above the threshold value will be recorded, not only the killed ones | Bool | false
| longOpsDB  |  Defines a name of the mongo database, where the long running operations are recorded to | String | "operations"
| longOpsCollection | Relevant only with the `recordAllLongOps` flag set. Defines a name for the mongo collection, where the long running operations are recorded to | String | long-queries
| killedOpsCollection | Defines a name for the mongo collection, where the long running operations are recorded to right before they are killed | String | killed-queries
| killingEnabled | Enables/Disables killing of the operations | Bool | false
| slackHookURL | Slack webhook URL to send alerts about the killed operations | string | - |

## Installation

The application can be installed on a K8s cluster in 2 ways:
1. Manually
2. Via a Codefresh pipeline

### Manual Installation/Upgrade

Warning: in case if you need to install it onto the production cluster, do not use this type of installation.

1. Clone the repo and cd into the directory:
```
git clone https://github.com/codefresh-io/mdb-query-killer.git
cd mdb-query-killer
```
2. Optionally, change the default values in the `chart/values.yaml` and issue the command:
```
helm upgrade --install --namespace default --atomic mdb-query-killer chart/
```

### Installation/Upgrade via a Codefresh pipeline

There is a [deployment pipeline](https://g.codefresh.io/pipelines/edit/workflow?id=5f883eb9e76a53333c2f5b8a&pipeline=cd-mdb-query-killer&projects=mongo-query-killer&projectId=5f882f99e76a5355a52f5add) in the `codefresh-inc` account, which is triggered automatically on pushes to the `master` branch of this repository and deploys the killer onto our production cluster.

The pipeline has 2 triggers - one for `production` and another for `staging` clusters, which have different set of variables attached to each:
|Variable name|Description|
|---|---|
|TARGET_CLUSTER|The name of the cluster seen on the Integrations page of the account|
|NAMESPACE|K8s Namespace, where the application will be installed to |
|VALUES_SHRD_CTX_NAME| The name of a [Shared Configuration](https://codefresh.io/docs/docs/configure-ci-cd-pipeline/shared-configuration/) of type "YAML", which is present in the account. It defines a set of passed Helm values|

You can also run the deployment pipeline *manually* selecting a trigger and your branch.

If you need to update some configuration values of the killer without pushing any code changes, do the following:
1. Find the corresponding Shared Configuration in the `codefresh-inc` account, change it in-place using Codefresh UI and save it.
2. Run the deployment pipeline, selecting one of the triggers and specifiying the master branch. For the staging cluster you can select a different branch.

## CI/CD Flow

There is a CI [pipeline](https://g.codefresh.io/pipelines/edit/workflow?id=5f88360b3e8ff4784adae34f&pipeline=ci-mdb-query-killer&projects=mongo-query-killer&projectId=5f882f99e76a5355a52f5add) in `codefresh-inc` account, triggered on pushes to this repository, which does the following:
- for the development branches:
1. Verifies if the package.json version and `Chart.appVersion` are raised comparing it with the last version of the master branch
2. Builds and pushes a docker image with the branch tag
- for the master branch:
1. Builds and pushes a docker image with a semversioned tag
2. Creates a git tag according to the semantic version
3. Runs the [deployment pipeline](https://g.codefresh.io/pipelines/edit/workflow?id=5f883eb9e76a53333c2f5b8a&pipeline=cd-mdb-query-killer&projects=mongo-query-killer&projectId=5f882f99e76a5355a52f5add)

Details about the deployment pipeline you can find above in the "Installation" section of this document.

## Add-ons

All add-ons are managed in this folder [src/addons](https://github.com/codefresh-io/mdb-query-killer/tree/master/src/addons).

### collscan-ops-checker

This sub-service is intended to detect mongo operations that do full collection scan (COLLSCAN operations) and send an alert message to a Slack channel containing information about the operation. It is related to [CR-1425](https://codefresh-io.atlassian.net/browse/CR-1425).

All the related documentation can be found in the README.md of the add-on specific [folder](https://github.com/codefresh-io/mdb-query-killer/tree/master/src/addons/collscan-op-checker)