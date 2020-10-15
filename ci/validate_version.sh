#!/bin/bash

set -euo pipefail

log() { echo -e "\e[1mboldINFO [$(date +%F\ %T)] ---> $1\e[0m"; }
success() { echo -e "\e[32mSUCCESS [$(date +%F\ %T)] ---> $1\e[0m"; }
err() { echo -e "\e[31mERR [$(date +%F\ %T)] ---> $1\e[0m" ; return 1; }

# checks whether the app version has been updated
# comparing it with the last tag on the master branch
function validateVersion() {
    log "Checking the app version\n"

    local last_ver=$(git show master:package.json | jq -r .version)
    local curr_ver=$(jq -r .version package.json)
    local curr_chart_appver=$(yq r chart/Chart.yaml appVersion)

    log "Last version in package.json is: ${last_ver}"
    log "Current version package.json is: ${curr_ver}"
    log "Current appVersion in the Chart.yaml is: ${curr_chart_appver}"

    if $(semver-cli greater ${curr_ver} ${last_ver} && semver-cli equal ${curr_chart_appver} ${curr_ver}); then
        success "App version check passed\n"
    else
        err "App version check failed. Please update the version in the package.json file and make sure the appVersion in the Chart.yaml is equal"
    fi
}

validateVersion