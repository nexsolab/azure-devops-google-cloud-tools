![Build status](https://dev.azure.com/nexsobr/Nexso%20Agile%20Team/_apis/build/status/Tools/External/AzureDevOps.GoogleCloudTools.TaskCloudSdk)

# Google Cloud SDK tool installer

Install the Google Cloud SDK CLI `gcloud` in an agent to use with nested tasks.  
*This may be the first task in your pipeline.*

## Extension

Make sure you have the extension installed for your organization.  
See [How to install](/#how-to-install-extension) for more instructions.

## How to use

On your Release Pipeline add a new task and search for "Google Cloud SDK tool installer". 

## Task preview

![Azure DevOps Task Screenshot](screenshots/task.png)

## How it works

The script gets the compacted file from https://console.cloud.google.com/storage/browser/cloud-sdk-release for the specified version.
If "Check for Latest Version" is checked, it will get the `lastest` manifest for Docker file of the SDK from `DockerHub` and get the version in the environment variables of the config key.

The tool is cached for the specified version in your account.
