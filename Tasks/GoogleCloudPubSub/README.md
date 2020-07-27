![Build status](https://dev.azure.com/nexsobr/nx-team/_apis/build/status/Tools/External/AzureDevOps.GoogleCloudTools.TaskFunctions) [![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=azure-devops-google-cloud-tools-task-functions&metric=alert_status)](https://sonarcloud.io/dashboard?id=azure-devops-google-cloud-tools-task-functions)

# <img src="src/icon.svg" height="48"> Google Cloud PubSub Topics

Create or delete Google Cloud PubSub topics, or publish messages in a topic.

## Extension

Make sure you have the extension installed for your organization.  
See [How to install](/#how-to-install-extension) for more instructions.

## How to use

1. On your Release Pipeline add a new task and search for "Google Cloud Functions".  
2. Choose the operation:
    - **Create/Update**  

    - **Delete**  
Delete the resource for your project.
    - **Publish message**  

    - **Call function**  

All operations export `PubSubTopic` output variable as the full resource name of the topic, in the format: `projects/{project_id}/topics/{topic_name}`.

## Authorization

The account informed in Service Connection or JSON key requires the following Google IAM permission on the specified resources (grouped by operation type):
- Create/Update
  - `cloudfunctions.functions.create`
  - `cloudfunctions.functions.get`
  - `cloudfunctions.functions.sourceCodeSet`
- Delete
  - `cloudfunctions.functions.delete`
- Deploy
  - `cloudfunctions.functions.sourceCodeSet`
- Call
  - `cloudfunctions.functions.call`

Or you can use the role:  
`roles/cloudfunctions.developer`

## Operations

### Deploy

![](screenshots/deploy.png)

### Delete

![](screenshots/delete.png)

### Publish message

![](screenshots/call.png)

### Create

![](screenshots/create.png)