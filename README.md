![Build status](https://dev.azure.com/nexsobr/nx-team/_apis/build/status/Tools/External/AzureDevOps.GoogleCloudTools.BaseExtension) ![Release status](https://vsrm.dev.azure.com/nexsobr/_apis/public/Release/badge/7c7f8052-bec7-4f7d-b267-22a6f7da4a37/1/1) 

# Google Cloud Tools for Azure DevOps Pipelines

Google Cloud Platform (GCP) tasks for Azure DevOps Pipelines
(work in progress).

## Tasks
- **[Google Cloud SDK tool installer](Tasks/GoogleCloudSdkTool)**  
Install gcloud CLI for use in all tasks or for custom commands.
- **[Google Cloud Functions](Tasks/GoogleCloudFunctions)**  
Deploy code to Cloud Functions or manage them: Create/Update, Delete or Call functions.
- **[Manage DNS records](Tasks/GoogleCloudDNS)**  
Add, remove or get the value of the record sets for managed zones.
- **Deploy and manage App Service** (soon)
- **Manage Service Endpoints** (soon)
- **Manage PubSub Topics** (next)
- **Manage PubSub Subscriptions** (soon)
- **Manage Redis instances** (soon)

## How to install extension
Search for "Google Cloud" when adding a new task or go to theAzure DevOps Marketplace and install [**Google Cloud tools for Azure DevOps Pipelines** extension](https://marketplace.visualstudio.com/items?itemName=nexso.azure-devops-google-cloud-tools).

## Service Connection

You can configure a service connection to use in the tasks.

![](images/scmenu.png)

And put the credentials exported in JSON from a service account from your Google Cloud Project.

![](images/sc.png)

## Recent updates
* Cloud Functions:
  - Fixed connection via secure file
  - Fixed create operation
  - Task size optimized
* Cloud DNS **[new]**

## Contributing

Personal project, any help are welcome.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).

## Issues

We accept issue reports both here.
