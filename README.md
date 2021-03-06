![Build status](https://dev.azure.com/nexsobr/nx-team/_apis/build/status/Tools/External/AzureDevOps.GoogleCloudTools.BaseExtension) ![Release status](https://vsrm.dev.azure.com/nexsobr/_apis/public/Release/badge/7c7f8052-bec7-4f7d-b267-22a6f7da4a37/5/5) 

# Google Cloud Tools

Google Cloud Platform (GCP) tasks for Azure DevOps Pipelines
_(work in progress)._

## Tasks

|||
|-|-|
| [<img src="images/icons/sdk.png" height="48">](https://github.com/nexsolab/azure-devops-google-cloud-tools/tree/master/Tasks/GoogleCloudSdkTool) | **[Google Cloud SDK tool installer](https://github.com/nexsolab/azure-devops-google-cloud-tools/tree/master/Tasks/GoogleCloudSdkTool)**<br>Install gcloud CLI for use in all tasks or for custom commands. |
| [<img src="images/icons/functions.png" height="48">](https://github.com/nexsolab/azure-devops-google-cloud-tools/tree/master/Tasks/GoogleCloudFunctions) | **[Google Cloud Functions](https://github.com/nexsolab/azure-devops-google-cloud-tools/tree/master/Tasks/GoogleCloudFunctions)**<br>Deploy code to functions or manage Cloud Functions:<br> Create/Update, Delete or Call functions. |
| [<img src="images/icons/pubsub.png" height="48">](https://github.com/nexsolab/azure-devops-google-cloud-tools/tree/master/Tasks/GoogleCloudPubSub) | **[Google Cloud PubSub](https://github.com/nexsolab/azure-devops-google-cloud-tools/tree/master/Tasks/GoogleCloudPubSub)**<br>Manage PubSub topics, subscriptions and publish or get messages from topic. |
| [<img src="images/icons/memorystore.png" height="48">](https://github.com/nexsolab/azure-devops-google-cloud-tools/tree/master/Tasks/GoogleCloudMemorystore) | **[Google Cloud Memorystore](https://github.com/nexsolab/azure-devops-google-cloud-tools/tree/master/Tasks/GoogleCloudMemorystore)**<br>Create, delete, failover or upgrade Redis instances. |
| [<img src="images/icons/dns.png" height="48">](https://github.com/nexsolab/azure-devops-google-cloud-tools/tree/master/Tasks/GoogleCloudDNS) | **[Manage DNS records](https://github.com/nexsolab/azure-devops-google-cloud-tools/tree/master/Tasks/GoogleCloudDNS)**<br>Add, remove or get the value of the record sets for managed zones. |

### Next:
- **Deploy and manage App Service and Service Endpoints**
- **Google Cloud PubSub Lite**
- **Deploy resources through "Equivalent REST" - JSON deploy file**

## How to install extension
Search for "Google Cloud" when adding a new task or go to theAzure DevOps Marketplace and install [**Google Cloud Tools** extension](https://marketplace.visualstudio.com/items?itemName=nexso.azure-devops-google-cloud-tools).

## Service Connection

You can configure a service connection to use in the tasks.
[Learn more on how to configure here](SERVICECONN.md)

![](images/scmenu.png)

And put the credentials exported in JSON from a service account from your Google Cloud Project.

![](images/sc.png)

## Release notes

### v1.4 - 2020-09-02

- Cloud Memorystore **[new]**
- New visual for extension Readme

#### v1.4.1 - 2020-09-05

- Privacy Policy
- Icons exported with extension

### v1.3 - 2020-08-08

- Cloud PubSub [new]

### v1.2

- Cloud Functions:
  - Fixed connection via secure file
  - Fixed create operation
  - Task size optimized
- Cloud DNS [new]

### v1.1

- Public release

## Contributing

Personal project, any help are welcome.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).

## Issues

We accept issue reports both here.

## Privacy

Read the [Privacy Policy](https://github.com/nexsolab/azure-devops-google-cloud-tools/blob/master/privacy-policy.md) for more information.
