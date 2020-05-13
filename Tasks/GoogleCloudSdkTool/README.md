![Build status](https://dev.azure.com/nexsobr/nexso/_apis/build/status/Tools/AzureDevOps.GoogleCloudSdkTool?branchName=master)

# Google Cloud SDK tool installer

Install the Google Cloud SDK CLI `gcloud` in an agent to use with nested tasks.
This may be the first task in your pipeline.

## How to use

Goes to Azure Marketplace and search for "Google Cloud SDK tool installer".
Install the extension for your organization and later you can use as a task in a Release Pipeline.
This should be the first step for any pipeline that needs `gcloud` CLI.

## How it works

The script gets the compacted file from https://console.cloud.google.com/storage/browser/cloud-sdk-release for the specified version.
If "Check for Latest Version" is checked, it will get the `lastest` manifest for Docker file of the SDK from `DockerHub` and get the version in the environment variables of the config key.

The tool is cached for the specified version in your account.
