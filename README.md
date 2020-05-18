![Release status](https://vsrm.dev.azure.com/nexsobr/_apis/public/Release/badge/7c7f8052-bec7-4f7d-b267-22a6f7da4a37/1/1) 
![Build status](https://dev.azure.com/nexsobr/Nexso%20Agile%20Team/_apis/build/status/Tools/External/AzureDevOps.GoogleCloudTools.BaseExtension)

# Google Cloud Tools for Azure DevOps Pipelines

Google Cloud Platform (GCP) tasks for Azure DevOps Pipelines
(work in progress).

## Tasks
- **[Google Cloud SDK tool installer](Tasks/GoogleCloudSdkTool)**  
Install gcloud CLI for use in all tasks or for custom commands.
- **[Google Cloud Functions](Tasks/GoogleCloudFunctions)**  
Deploy code to Cloud Functions or manage them: Create/Update, Delete or call functions.
- **Deploy and manage App Service** (soon)
- **Manage DNS records** (soon)
- **Manage Service Endpoints** (soon)
- **Manage PubSub Topics** (soon)
- **Manage PubSub Subscriptions** (soon)
- **Manage Redis instances** (soon)

## How to install extension
Go to [the form to request access to preview version](https://forms.gle/FxXcBkfnN6xM3Jy29).  
Enable auto install (this will install the extension in your organization when we run a new Release) or [install via Azure Marketplace](https://marketplace.visualstudio.com/items?itemName=nexso.azure-devops-google-cloud-tools).  
*Please note that the page is shown to you only after we share the extension with your organization.*

## Service Connection

You can configure a service connection to use in the tasks.

![](images/scmenu.png)

And put the credentials exported in JSON from a service account from your Google Cloud Project.

![](images/sc.png)

## Contributing

Any help are welcome.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).

## Issues

We accept issue reports both here.
