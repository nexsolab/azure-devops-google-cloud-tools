![Build status](https://dev.azure.com/nexsobr/Nexso%20Agile%20Team/_apis/build/status/Tools/External/AzureDevOps.GoogleCloudTools.TaskFunctions) [![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=azure-devops-google-cloud-tools&metric=alert_status)](https://sonarcloud.io/dashboard?id=azure-devops-google-cloud-tools)

# <img src="src/icon.svg" height="48"> Google Cloud DNS

Deploy and manage Cloud DNS via Azure DevOps Pipeline task.  
*Note: You don't need the Cloud SDK tool before this task.*

## Extension

Make sure you have the extension installed for your organization.  
See [How to install](/#how-to-install-extension) for more instructions.

## How to use

1. On your Release Pipeline add a new task and search for "Google Cloud DNS".  
2. Choose the operation:
    - **Add**  
Create a new Cloud Function or update the properties of existing resource. Also deploy the source code. *(use this in Infra pipelines)*  
This will output the function URL (`FunctionUrl`) and the deployed version (`FunctionVersionId`) as output variables.
    - **Remove**  
Delete the resource for your project.
    - **Get record value**  
Upload the code to existing Function *(use this for Deploy pipelines)*
    - **Call function**  
Call the function and export the result in a output variable (`FunctionCallResult`).

All operations export `FunctionName` output variable as the full resource name of the function, in the format: `projects/{project_id}/locations/{location_id}/functions/{function_id}`.

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

Or you can use roles:  
`roles/cloudfunctions.developer`

Note that you'll need also the roles:  
- `roles/iam.serviceAccountTokenCreator`
- `roles/iam.serviceAccountUser`

## Operations

### Deploy

![](screenshots/deploy.png)

### Call

![](screenshots/call.png)

### Delete

![](screenshots/delete.png)

### Create

![](screenshots/create.png)