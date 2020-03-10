# Google Cloud SDK tool installer

Install the Google Cloud SDK CLI `gcloud` in an agent to use with nested tasks.
This may be the first task in your pipeline.

## How to use

Goes to Azure Marketplace and search for "Google Cloud SDK tool installer".
Install the extension for your organization and later you can use as a task in a Release Pipeline.

## How it works

The script gets the compacted file from https://console.cloud.google.com/storage/browser/cloud-sdk-release for the specified version.
If "Check for Latest Version" is checked, we get the `lastest` manifest for Docker file of the SDK and get the version from environment variables of the config key.
