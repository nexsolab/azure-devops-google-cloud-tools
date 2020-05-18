![Build status](https://dev.azure.com/nexsobr/Nexso%20Agile%20Team/_apis/build/status/Tools/External/AzureDevOps.GoogleCloudTools.TaskFunctions)

# Google Cloud Functions

Deploy and manage Cloud Functions via Azure DevOps Pipeline task.  
*Note: You don't need the Cloud SDK tool before this task.*

## Extension

Make sure you have the extension installed for your organization.  
See [How to install](/#how-to-install-extension) for more instructions.

## How to use

1. On your Release Pipeline add a new task and search for "Google Cloud Functions".  
2. Choose the operation:
    - **Create/Update**  
Create a new Cloud Function or update the properties of existing resource. Also deploy the source code. *(use this in Infra pipelines)*  
This will output the function URL (`FunctionUrl`) and the deployed version (`FunctionVersionId`) as output variables.
    - **Delete**  
Delete the resource for your project.
    - **Deploy**  
Upload the code to existing Function *(use this for Deploy pipelines)*
    - **Call function**  
Call the function and export the result in a output variable (`FunctionCallResult`).
