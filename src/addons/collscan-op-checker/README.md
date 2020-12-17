# collscan-ops-checker

## Description

This sub-service is intended to detect mongo operations that do full collection scan (COLLSCAN operations) and send an alert message to a Slack channel containing information about the operation. It is related to [CR-1425](https://codefresh-io.atlassian.net/browse/CR-1425).

## Implementation details

The service does the following in a loop:
1. Discovers a primary replica of the target mongo cluster
2. Gets logs from the primary replica via Atlas API for a specified amount of time (`scanIntervalSec` config value)
3. Decompresses the log and searches for the operations that has `COLLSCAN` as the `planSummary` value.
4. Sends each found log line as is to a specified Slack channel.

The service code runs in a *separate container* within the `mdb-query-killer` pod. It is integrated into the relevant Helm [chart](https://github.com/codefresh-io/mdb-query-killer/tree/master/chart) and shares the same [values file](https://github.com/codefresh-io/mdb-query-killer/blob/master/chart/values.yaml)

## Configuration

The service consumes a JSON config file. Example: 

```json
{
    "scanIntervalSec": 300,
    "slackHookURL": "https://hooks.slack.com/services/DUMMY/HOOK/TokeNasdqw4623542dsfjk",
    "mongoURI": "mongodb://root:password@localhost:27017/admin?retryWrites=true&w=majority",
    "atlasAPI": {
        "groupID": "5ed4aqew1ecc9e2ee2e3qhuc",
        "publKey": "mqkqyubj",
        "privKey": "dummy-key2-qwg4-sdg7-qwe47rgh0000"
    }
}
```
The config file path is passed as the first and only argument to the application. When deployed as part of a Helm chart, this file is [mounted](https://github.com/codefresh-io/mdb-query-killer/blob/373071665d6775e7dd9570d5dd9b1191c3e8ab22/chart/templates/deployment.yaml#L53-L56) to the container from the K8s [secret](https://github.com/codefresh-io/mdb-query-killer/blob/373071665d6775e7dd9570d5dd9b1191c3e8ab22/chart/templates/secrets.yaml#L16-L17). The secret takes the config file contents from the [values file](https://github.com/codefresh-io/mdb-query-killer/blob/373071665d6775e7dd9570d5dd9b1191c3e8ab22/chart/values.yaml#L36-L46) (`addons.collscanOps.config` value).


List of the *application* configuration values:
|Value name|Description|Type|Default value
|---|---|--|--|
|`scanIntervalSec` | Defines how frequently it performs the checks in seconds. It is not advised to set this value lesser than 60 seconds | int | - |
|`slackHookURL` | Slack webhook URL for the alerts to be sent | string | - |
|`mongoURI` | Mongo URI connection string. Used for primary replica discovery | string | - |
|`atlasAPI.groupID` | Atlas API related [group id](https://docs.atlas.mongodb.com/api/#project-id) | string | - |
|`atlasAPI.publKey` | Atlas API public key | string | - |
|`atlasAPI.privKey` | Atlas API private key | string | - |

List of the *Helm* configuration values:
|Value name|Description|Type|Default value
|---|---|--|--|
|`addons.collscanOps.enabled`| The addon can be disabled/enabled by this value | bool| true |
|`addons.collscanOps.config`| Contents of the application config JSON | string | - |
|`addons.collscanOps.image.registry`| Docker registry prefix for the application image | string | "gcr.io/codefresh-inc" |
|`addons.collscanOps.image.name`| Name for the application image | string | "codefresh/collscan-ops-checker" |
|`addons.collscanOps.image.tag`| Optional tag for the image| string | {{ $.Chart.AppVersion }} |

## CI/CD flow & Installation

The `collscan-ops-checker` image is built and pushed as part of the same `mdb-query-killer` CI pipeline described in the main documentation [page](https://github.com/codefresh-io/mdb-query-killer).

The add-on can be installed by running the Codefresh deployment pipeline or by the Helm client directly, using the chart within this repository.

When the deployment is run, the Helm configuration values are substituted as part of the same shared context YAML named `mdb-query-killer-staging`/`mdb-query-killer-prod`. You can edit this configuration YAML in Codefresh UI and then re-deploy the application with the changed configuration by running the deployment pipeline manually.