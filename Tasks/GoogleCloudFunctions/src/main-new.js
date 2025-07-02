import * as taskLib from 'azure-pipelines-task-lib/task';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';
import deepDiff from 'return-deep-diff';
import { getAuthenticatedClient } from '@shared/auth';
import { checkResultAndGetMetadata, setOutput } from '@shared/utils';

const API_URL = 'https://cloudfunctions.googleapis.com/v1';

/**
 * Upload a ZIP file to Google Cloud Storage for Cloud Functions.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} zipFile - Path to the ZIP file
 * @returns {Promise<string>} The upload URL
 */
async function uploadFile(client, project, zipFile) {
  try {
    taskLib.debug(`Starting upload of ${zipFile}...`);
    console.log('Generating upload URL...');

    // Generate upload URL
    const uploadRes = await client.request({
      method: 'POST',
      url: `${API_URL}/projects/${project}/locations/-/functions:generateUploadUrl`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    const { uploadUrl } = uploadRes.data;
    taskLib.debug(`Generated upload URL: ${uploadUrl}`);

    // Upload file
    console.log(`Uploading ${path.basename(zipFile)}...`);
    const fileData = fs.readFileSync(zipFile);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/zip',
        'x-goog-content-length-range': '0,104857600', // 100MB limit
      },
      body: fileData,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed with status ${uploadResponse.status}: ${uploadResponse.statusText}`);
    }

    console.log('File uploaded successfully!');
    return uploadUrl;
  } catch (error) {
    taskLib.error(`Failed to upload file: ${error.message}`);
    throw error;
  }
}

/**
 * Check source configuration and return the appropriate source value.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} location - Function location
 * @param {string} mode - Source mode ('zip', 'repo', 'storage')
 * @param {string} sourceValue - Source value based on mode
 * @returns {Promise<Object>} Source configuration object
 */
async function checkSource(client, location, mode, sourceValue) {
  const source = {};

  switch (mode) {
    case 'storage':
      source.sourceArchiveUrl = sourceValue;
      break;

    case 'repo':
      source.sourceRepository = {
        url: sourceValue,
      };
      break;

    case 'zip':
    default: {
      if (!fs.existsSync(sourceValue)) {
        throw new Error(`Source ZIP file not found: ${sourceValue}`);
      }

      const project = location.split('/')[1];
      const uploadUrl = await uploadFile(client, project, sourceValue);
      source.sourceUploadUrl = uploadUrl;
      break;
    }
  }

  return source;
}

/**
 * Deploy function source code.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} location - Function location
 * @param {string} name - Function name
 * @param {string} mode - Source mode
 * @param {string} sourceValue - Source value
 * @returns {Promise<Object>} Operation result
 */
async function deployFunction(client, location, name, mode, sourceValue) {
  try {
    console.log(`Deploying function ${name}...`);

    const source = await checkSource(client, location, mode, sourceValue);

    const res = await client.request({
      method: 'PATCH',
      url: `${API_URL}/${location}/functions/${name}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceArchiveUrl: source.sourceArchiveUrl,
        sourceRepository: source.sourceRepository,
        sourceUploadUrl: source.sourceUploadUrl,
      }),
    });

    return checkResultAndGetMetadata(res);
  } catch (error) {
    taskLib.error(`Failed to deploy function: ${error.message}`);
    throw error;
  }
}

/**
 * Build request body for function creation.
 * @param {string} location - Function location
 * @param {string} name - Function name
 * @returns {Promise<Object>} Request body object
 */
async function getCreateRequestBody(location, name) {
  const body = {
    name: `${location}/functions/${name}`,
  };

  // Description
  const description = taskLib.getInput('funcDesc', false);
  if (description) {
    body.description = description;
  }

  // Entry point
  const entryPoint = taskLib.getInput('funcEntryPoint', true);
  body.entryPoint = entryPoint;

  // Runtime
  const runtime = taskLib.getInput('funcRuntime', true);
  body.runtime = runtime;

  // Service account
  const serviceAccount = taskLib.getInput('funcServiceAccount', false);
  if (serviceAccount) {
    body.serviceAccountEmail = serviceAccount;
  }

  // Environment variables
  const envVars = taskLib.getInput('funcEnvVars', false);
  if (envVars) {
    try {
      body.environmentVariables = JSON.parse(envVars);
    } catch (error) {
      taskLib.warning(`Invalid environment variables JSON: ${error.message}`);
    }
  }

  // Memory and timeout
  const memory = taskLib.getInput('funcMemory', false);
  if (memory && parseInt(memory, 10) > 0) {
    body.availableMemoryMb = parseInt(memory, 10);
  }

  const timeout = taskLib.getInput('funcTimeout', false);
  if (timeout && parseInt(timeout, 10) > 0) {
    body.timeout = `${parseInt(timeout, 10)}s`;
  }

  // Max instances
  const maxInstances = taskLib.getInput('funcMaxInstances', false);
  if (maxInstances && parseInt(maxInstances, 10) > 0) {
    body.maxInstances = parseInt(maxInstances, 10);
  }

  // VPC connector
  const vpcConnector = taskLib.getInput('funcVpcConnector', false);
  if (vpcConnector) {
    body.vpcConnector = vpcConnector;
  }

  // Ingress settings
  const ingressSettings = taskLib.getInput('funcIngressSettings', false);
  if (ingressSettings) {
    body.ingressSettings = ingressSettings;
  }

  // Source configuration
  const sourceMode = taskLib.getInput('funcSourceMode', true);
  let sourceValue = '';

  switch (sourceMode) {
    case 'storage':
      sourceValue = taskLib.getInput('funcSourceArchive', true);
      body.sourceArchiveUrl = sourceValue;
      break;

    case 'repo':
      sourceValue = taskLib.getInput('funcSourceRepo', true);
      body.sourceRepository = { url: sourceValue };
      break;

    case 'zip':
    default:
      sourceValue = taskLib.getPathInput('funcSourceZip', true, false);
      if (!fs.existsSync(sourceValue)) {
        throw new Error(`Source ZIP file not found: ${sourceValue}`);
      }
      break;
  }

  // If using ZIP, we need to upload it first
  if (sourceMode === 'zip') {
    // We'll handle the upload in the createFunction method
    body.sourceZip = sourceValue;
  }

  // Trigger configuration
  const trigger = taskLib.getInput('funcTrigger', true);

  switch (trigger) {
    case 'https':
      body.httpsTrigger = {};
      break;

    case 'topic': {
      const topic = taskLib.getInput('funcTopic', true);
      body.eventTrigger = {
        eventType: 'providers/cloud.pubsub/eventTypes/topic.publish',
        resource: `projects/${location.split('/')[1]}/topics/${topic}`,
      };
      break;
    }

    case 'bucket': {
      const bucket = taskLib.getInput('funcBucket', true);
      body.eventTrigger = {
        eventType: 'providers/cloud.storage/eventTypes/object.change',
        resource: `projects/_/buckets/${bucket}`,
      };
      break;
    }

    case 'event': {
      const eventType = taskLib.getInput('funcEvent', true);
      const eventResource = taskLib.getInput('funcEventResource', true);
      body.eventTrigger = {
        eventType,
        resource: eventResource,
      };
      break;
    }

    default:
      throw new Error(`Unsupported trigger type: ${trigger}`);
  }

  return body;
}

/**
 * Create a new Cloud Function.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} location - Function location
 * @param {string} name - Function name
 * @returns {Promise<Object>} Operation result
 */
async function createFunction(client, location, name) {
  try {
    console.log(`Creating function ${name}...`);

    const body = await getCreateRequestBody(location, name);

    // Handle ZIP upload if needed
    if (body.sourceZip) {
      const project = location.split('/')[1];
      const uploadUrl = await uploadFile(client, project, body.sourceZip);
      body.sourceUploadUrl = uploadUrl;
      delete body.sourceZip;
    }

    const res = await client.request({
      method: 'POST',
      url: `${API_URL}/${location}/functions`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return checkResultAndGetMetadata(res);
  } catch (error) {
    taskLib.error(`Failed to create function: ${error.message}`);
    throw error;
  }
}

/**
 * Update an existing Cloud Function.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} location - Function location
 * @param {string} name - Function name
 * @param {Object} currentProperties - Current function properties
 * @returns {Promise<Object>} Operation result
 */
async function updateFunction(client, location, name, currentProperties) {
  try {
    console.log(`Updating function ${name}...`);

    const newBody = await getCreateRequestBody(location, name);

    // Handle ZIP upload if needed
    if (newBody.sourceZip) {
      const project = location.split('/')[1];
      const uploadUrl = await uploadFile(client, project, newBody.sourceZip);
      newBody.sourceUploadUrl = uploadUrl;
      delete newBody.sourceZip;
    }

    // Compare with current properties to see what needs updating
    const diff = deepDiff(currentProperties, newBody);

    if (Object.keys(diff || {}).length === 0) {
      console.log('No changes detected, skipping update.');
      return { type: 'UPDATE_FUNCTION', name: currentProperties.name };
    }

    taskLib.debug('Detected changes:');
    taskLib.debug(JSON.stringify(diff, null, 2));

    const res = await client.request({
      method: 'PATCH',
      url: `${API_URL}/${location}/functions/${name}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newBody),
    });

    return checkResultAndGetMetadata(res);
  } catch (error) {
    taskLib.error(`Failed to update function: ${error.message}`);
    throw error;
  }
}

/**
 * Get function information.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} location - Function location
 * @param {string} name - Function name
 * @returns {Promise<Object|null>} Function information or null if not found
 */
async function getFunction(client, location, name) {
  try {
    const res = await client.request({
      method: 'GET',
      url: `${API_URL}/${location}/functions/${name}`,
      headers: {
        Accept: 'application/json',
      },
    });

    if (res.status === 200) {
      return res.data;
    }

    return null;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }

    taskLib.error(`Failed to get function: ${error.message}`);
    throw error;
  }
}

/**
 * Delete a Cloud Function.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} location - Function location
 * @param {string} name - Function name
 * @returns {Promise<Object>} Operation result
 */
async function deleteFunction(client, location, name) {
  try {
    console.log(`Deleting function ${name}...`);

    const res = await client.request({
      method: 'DELETE',
      url: `${API_URL}/${location}/functions/${name}`,
      headers: {
        Accept: 'application/json',
      },
    });

    return checkResultAndGetMetadata(res);
  } catch (error) {
    taskLib.error(`Failed to delete function: ${error.message}`);
    throw error;
  }
}

/**
 * Call a Cloud Function.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} location - Function location
 * @param {string} name - Function name
 * @returns {Promise<string>} Function execution result
 */
async function callFunction(client, location, name) {
  try {
    console.log(`Calling function ${name}...`);

    const callData = taskLib.getInput('funcCallData', false) || '';
    const requestBody = {};

    if (callData) {
      if (callData.startsWith('[') || callData.startsWith('{')) {
        try {
          requestBody.data = JSON.parse(callData);
        } catch (error) {
          taskLib.warning(`Invalid JSON data, using as string: ${error.message}`);
          requestBody.data = callData;
        }
      } else {
        requestBody.data = callData;
      }
    }

    const res = await client.request({
      method: 'POST',
      url: `${API_URL}/${location}/functions/${name}:call`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const result = res.data?.result || '';
    console.log(`Function execution result: ${result}`);

    return result;
  } catch (error) {
    taskLib.error(`Failed to call function: ${error.message}`);
    throw error;
  }
}

/**
 * Main execution function.
 */
async function main() {
  let taskSuccess = false;

  try {
    // Get authentication
    const auth = await getAuthenticatedClient([
      'https://www.googleapis.com/auth/cloudfunctions',
    ]);

    if (!auth) {
      return;
    }

    // Get operation
    const operation = taskLib.getInput('operation', false);

    // Get basic info
    const region = taskLib.getInput('gcpRegion', true);
    const location = `projects/${auth.projectId}/locations/${region}`;
    const name = taskLib.getInput('funcName', true);

    taskLib.debug(`Operation: ${operation}, Location: ${location}, Function: ${name}`);

    switch (operation) {
      case 'create': {
        let result = null;

        // Check if function already exists
        console.log('Checking if function already exists...');
        const existingFunction = await getFunction(auth.client, location, name);

        if (!existingFunction) {
          console.log(`Function ${name} not found in ${location}.`);
          result = await createFunction(auth.client, location, name);
        } else {
          console.log(`Function ${name} already exists, updating...`);
          result = await updateFunction(auth.client, location, name, existingFunction);
        }

        // Handle public access if requested
        if (taskLib.getBoolInput('funcHttpsAnonym', false)) {
          try {
            console.log('Enabling public access...');

            const policyRes = await auth.client.request({
              method: 'POST',
              url: `${API_URL}/${location}/functions/${name}:setIamPolicy`,
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                policy: {
                  bindings: [
                    {
                      role: 'roles/cloudfunctions.invoker',
                      members: ['allUsers'],
                    },
                  ],
                },
              }),
            });

            if (policyRes.status === 200) {
              console.log('Public access enabled successfully!');
            }
          } catch (error) {
            taskLib.warning(`Failed to enable public access: ${error.message}`);
          }
        }

        // Set output variables
        setOutput(result);
        taskSuccess = ['CREATE_FUNCTION', 'UPDATE_FUNCTION'].includes(result.type);
        break;
      }

      case 'delete': {
        const result = await deleteFunction(auth.client, location, name);
        taskSuccess = result.type === 'DELETE_FUNCTION';
        break;
      }

      case 'deploy': {
        let sourceValue = '';
        const sourceMode = taskLib.getInput('deploySourceMode', false) || 'zip';

        switch (sourceMode) {
          case 'storage':
            sourceValue = taskLib.getInput('deploySourceArchive', false);
            break;
          case 'repo':
            sourceValue = taskLib.getInput('deploySourceRepo', false);
            break;
          case 'zip':
          default:
            sourceValue = taskLib.getPathInput('deploySourceZip', true, false);
            break;
        }

        const result = await deployFunction(auth.client, location, name, sourceMode, sourceValue);
        taskSuccess = ['ACTIVE', 'DEPLOY_IN_PROGRESS'].includes(result.request?.status);
        break;
      }

      case 'call': {
        const callResult = await callFunction(auth.client, location, name);
        taskSuccess = !!callResult;
        taskLib.setVariable('FunctionCallResult', callResult);
        break;
      }

      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }

    // Set output variable
    taskLib.setVariable('FunctionName', `${location}/functions/${name}`);
  } catch (error) {
    console.error(`Task failed: ${error.message}`);
    taskLib.debug(error.stack);
    taskSuccess = false;
  }

  // Set final result
  if (taskSuccess) {
    console.log('Task completed successfully!');
    taskLib.setResult(taskLib.TaskResult.Succeeded);
  } else {
    console.error('Task failed!');
    taskLib.setResult(taskLib.TaskResult.Failed);
  }
}

// Execute main function
main();
