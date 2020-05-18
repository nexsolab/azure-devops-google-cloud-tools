/* eslint-disable no-console */
/* eslint-disable radix */
import * as taskLib from 'azure-pipelines-task-lib/task';
import { google } from 'googleapis';
import fetch from 'node-fetch';
import fs from 'fs';
import secureFilesCommon from 'securefiles-common/securefiles-common';
import deepDiff from 'return-deep-diff';

const cloudFunctions = google.cloudfunctions('v1');

/**
 * Upload the Zip file with source code to the cloud.
 *
 * @param {String} project Full project identification
 * @param {String} zipFile Path to the zip file
 * @returns {String} Return the url of the file uploaded.
 */
async function uploadFile(project, zipFile) {
  // Generate the URL to upload the file
  const storageResult = await cloudFunctions.projects.locations.functions.generateUploadUrl({
    // The project and location in which the Google Cloud Storage signed URL
    // should be generated, specified in the format `projects/x/locations/x`.
    parent: project,
  });

  const url = storageResult.data && storageResult.data.uploadUrl;

  if (!url) {
    taskLib.warning('Zip File could not be uploaded to Google (empty upload URL)');
    return '';
  }

  // Upload file
  console.log('Uploading source code file...');
  taskLib.debug(`Uploading file ${zipFile} to ${project}`);

  try {
    const stats = fs.statSync(zipFile);
    const readStream = fs.createReadStream(zipFile);

    if (stats.size >= 104857600) {
      taskLib.warning(`Zip file is bigger than the allowed size of 100MB. Total: ${stats.size / (1024 * 1024)}MB`);
    }

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': stats.size,
        'x-goog-content-length-range': '0,104857600',
      },
      body: readStream,
    });

    if (res.status >= 400) {
      taskLib.error(`Upload status code is ${res.status}`);
      taskLib.debug(await res.text());
    }

    console.log('File uploaded!');
  } catch (error) {
    taskLib.error(`Error when uploading source file: ${error.message}`);
    taskLib.debug(error.stack);
  }

  // Finish
  taskLib.debug(`Uploaded URL is ${url}`);
  return url;
}

/**
 * Converts an input text to a number
 *
 * @param {String} name Task input name
 * @param {Boolean} [required=false]
 * @returns {Number} The number converted from string or `undefined`
 */
function getInputNumber(name, required = false) {
  try {
    const value = taskLib.getInput(name, required);
    return value ? parseFloat(value) : undefined;
  } catch (error) {
    taskLib.warning(`Error get the number of ${name}: ${error.message}`);
    return undefined;
  }
}

/**
 * Check option to create a new or update a Google Cloud Function
 *
 * @returns {Object} The API request body
 */
async function getCreateResquestBody(location, name) {
  // Request body metadata
  const requestBody = {
    availableMemoryMb: getInputNumber('funcMemory', false),
    description: taskLib.getInput('funcDesc', true),
    entryPoint: taskLib.getInput('funcEntryPoint', true),
    environmentVariables: {},
    maxInstances: getInputNumber('funcMaxInstances', false),
    name,
    runtime: taskLib.getInput('funcRuntime', true),
    serviceAccountEmail: taskLib.getInput('funcServiceAccount', false),
    timeout: taskLib.getInput('funcTimeout', false),
  };

  // Put env vars
  const envVarList = taskLib.getInput('funcEnvVars', false);

  if (envVarList && envVarList.indexOf('-') >= 0) {
    const varsArray = envVarList.split('-').splice(1).map((p) => p.trim().split(' '));
    requestBody.environmentVariables = Object.fromEntries(new Map(varsArray));
    taskLib.debug('Environment variables are mapped to:');
    taskLib.debug(JSON.stringify(requestBody.environmentVariables));
  }

  // Check trigger mode
  const trigger = taskLib.getInput('funcTrigger', false) || 'https';

  // Check resource for event mode
  const eventType = taskLib.getInput('funcEvent', false);

  if (trigger === 'event' && !/^providers\/.+\/eventTypes\/.+/.test(eventType)) {
    taskLib.warning(`Event type ${eventType} doesn't match the pattern: providers/*/eventTypes/*.*.`);
  }

  switch (trigger) {
    case 'topic':
      requestBody.eventTrigger = {
        eventType: 'providers/cloud.pubsub/eventTypes/topic.publish',
        resource: taskLib.getInput('funcTopic', true),
      };
      break;

    case 'bucket':
      requestBody.eventTrigger = {
        eventType: 'providers/cloud.storage/eventTypes/object.change',
        resource: taskLib.getInput('funcBucket', true),
      };
      break;

    case 'event':
      requestBody.eventTrigger = {
        eventType,
        resource: taskLib.getInput('funcEventResource', false),
      };
      break;

    default:
      requestBody.httpsTrigger = {
        url: taskLib.getInput('funcHttpsUrl', true),
      };
      break;
  }

  // Get source mode
  const sourceMode = taskLib.getInput('funcSourceMode', false) || 'zip';

  switch (sourceMode) {
    case 'storage': {
      const storagePath = taskLib.getInput('funcSourceArchive', false);
      taskLib.debug(`Using Google Storage Zip file as source code at ${storagePath}`);
      requestBody.sourceArchiveUrl = storagePath;
      break;
    }

    case 'repo': {
      const sourceRepo = taskLib.getInput('funcSourceRepo', false);
      taskLib.debug(`Using Google Repository as source code at ${sourceRepo}`);
      requestBody.sourceRepository = {
        url: sourceRepo,
      };
      break;
    }

    case 'zip': {
      const zipPath = taskLib.getPathInput('funcSourceZip', true, true);
      taskLib.debug(`Using Zip file ${zipPath} as the source code.`);
      requestBody.sourceUploadUrl = await uploadFile(location, zipPath);
      break;
    }

    default:
      break;
  }

  // Check network option
  const networkMode = taskLib.getInput('networkMode', false);

  if (networkMode === 'vpc') {
    const network = taskLib.getInput('funcNetwork', true);
    taskLib.debug(`Set ${network} as network for the function`);
    requestBody.network = network;
  } else if (networkMode === 'connector') {
    // Connector
    const vpcConnector = taskLib.getInput('funcVpcConnector', true);
    taskLib.debug(`Set ${vpcConnector} as VPC Connector for Functions`);
    requestBody.vpcConnector = vpcConnector;

    // Egress Settings
    const vpcConnectorEgress = taskLib.getInput('funcVpcConnectorEgress', true);
    taskLib.debug(`VPC Connector egress setting is ${vpcConnectorEgress}`);
    requestBody.vpcConnectorEgressSettings = vpcConnectorEgress;

    // Ingress Settings
    const vpcConnectorIngress = taskLib.getInput('funcVpcConnectorIngress', true);
    taskLib.debug(`VPC Connector ingress setting is ${vpcConnectorIngress}`);
    requestBody.ingressSettings = vpcConnectorIngress;
  }

  // Check for labels
  const labels = taskLib.getInput('gcpLabels', false);

  if (labels.substring(0, 1) === '{') {
    // JSON
    requestBody.labels = JSON.parse(labels);
    taskLib.debug('Parse this JSON as resource labels:');
    taskLib.debug(labels);
  } else if (labels && labels.indexOf('-') >= 0) {
    // Editor
    const labelsArray = labels.split('-').splice(1).map((p) => p.trim().split(' '));
    requestBody.labels = Object.fromEntries(new Map(labelsArray));
    taskLib.debug('Parse parameters grid as resource labels:');
    taskLib.debug(labels);
    taskLib.debug('...that produces this JSON of labels:');
    taskLib.debug(JSON.stringify(requestBody.labels));
  }

  // Do the magic
  console.log('Options ready');
  return requestBody;
}

/**
 * Create a new Function in the GCP.
 *
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 * @returns {Boolean} `true` if the Function was created successfully.
 */
async function createFunction(location, name) {
  const req = await getCreateResquestBody(location, name);
  taskLib.debug('Calling Google API to create the function, with the request:');
  taskLib.debug(JSON.stringify(req));

  const res = await cloudFunctions.projects.locations.functions.create({
    // Required. The project and location in which the function should be created, specified
    // in the format `projects/x/locations/x`
    location,
    requestBody: req,
  });

  if (!res.data || !res.data.done) {
    taskLib.error(`${res.data.error.code} - ${res.data.error.message}`);
    taskLib.debug(res.data.error.details);
    taskLib.setResult(taskLib.TaskResult.Failed);
  }

  taskLib.debug('Result from operation:');
  taskLib.debug(JSON.stringify(res.data));
  return res.data;
}

function propertiesToArray(obj) {
  const isObject = (val) => typeof val === 'object' && !Array.isArray(val);

  const addDelimiter = (a, b) => (a ? `${a}.${b}` : b);

  // eslint-disable-next-line no-shadow
  const paths = (obj = {}, head = '') => Object.entries(obj)
    .reduce((product, [key, value]) => {
      const fullPath = addDelimiter(head, key);
      return isObject(value)
        ? product.concat(paths(value, fullPath))
        : product.concat(fullPath);
    }, []);

  return paths(obj);
}

/**
 * Update the changed properties of the existing Function.
 *
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 * @param {Object} currentProperties Current properties to compare with the changed values
 * @returns {Boolean} `true` if the Function was updated successfully.
 */
async function updateFunction(location, name, currentProperties) {
  taskLib.debug('Update Function');
  const req = await getCreateResquestBody(location, name);

  // Get only the differences
  const diff = deepDiff(currentProperties, req, true);
  taskLib.debug('Changed properties of the existing Function are:');
  taskLib.debug(JSON.stringify(diff));

  const changedPropertiesNames = propertiesToArray(diff);
  taskLib.debug(`Changed attributes are the above for ${location}/functions/${name}`);

  const res = await cloudFunctions.projects.locations.functions.patch({
    updateMask: changedPropertiesNames.join(','),
    requestBody: diff,
  });

  if (!res.data || !res.data.done) {
    taskLib.error(`${res.data.error.code} - ${res.data.error.message}`);
    taskLib.debug(res.data.error.details);
    taskLib.setResult(taskLib.TaskResult.Failed);
  }

  taskLib.debug('Result from operation:');
  taskLib.debug(JSON.stringify(res.data));
  return res.data;
}

/**
 * Get function properties data.
 *
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 * @returns {Object} The function body.
 */
async function getFunction(location, name) {
  const res = await cloudFunctions.projects.locations.functions.get({
    name: `${location}/functions/${name}`,
  });

  if (res && res.data && res.status === 200) {
    return res.data;
  }

  taskLib.debug(`getFunction return the status code: ${res.status}`);
  return null;
}

/**
 * Delete the resource from GCP.
 *
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 * @returns {Boolean} `true` if the Function was deleted successfully.
 */
async function deleteFunction(location, name) {
  console.log(`Removing Function ${location}/functions/${name}`);
  const res = await cloudFunctions.projects.locations.functions.delete({
    name: `${location}/functions/${name}`,
  });

  if (!res.data || !res.data.done) {
    taskLib.error(`${res.data.error.code} - ${res.data.error.message}`);
    taskLib.debug(res.data.error.details);
    taskLib.setResult(taskLib.TaskResult.Failed);
  }

  taskLib.debug('Result from operation:');
  taskLib.debug(JSON.stringify(res.data));
  return res.data && res.data.done;
}

/**
 * Make a call to the function.
 *
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 * @returns {String} Return the execution Id of function invocation.
 */
async function callFunction(location, name) {
  console.log(`Calling Function ${location}/functions/${name}`);
  const callData = taskLib.getInput('funcCallData');

  const firstChar = callData.substring(0, 1);
  taskLib.debug(`First char of data is ${firstChar}`);

  const data = (firstChar === '[' || firstChar === '{') ? JSON.parse(callData) : callData;
  taskLib.debug(`Data to call the function: ${callData}`);
  const res = await cloudFunctions.projects.locations.functions.call({
    name: `${location}/functions/${name}`,
    requestBody: data,
  });

  console.log(`Id of the invocation: ${res.data && res.data.executionId}`);
  taskLib.debug(`Result of invocation: ${res.data && res.data.result}`);
  return res.data && res.data.result;
}

/**
 * Deploy new version of the Function to the cloud.
 *
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 */
async function deployFunction(location, name) {
  const request = {
    name: `${location}/functions/${name}`,
    updateMask: '',
    requestBody: {},
  };

  // Get source mode
  const sourceMode = taskLib.getInput('deploySourceMode', false) || 'zip';

  switch (sourceMode) {
    case 'storage': {
      const storagePath = taskLib.getInput('deploySourceArchive', false);
      taskLib.debug(`Using Google Storage Zip file as source code at ${storagePath}`);
      request.requestBody.sourceArchiveUrl = storagePath;
      request.updateMask = 'sourceArchiveUrl';
      break;
    }

    case 'repo': {
      const sourceRepo = taskLib.getInput('deploySourceRepo', false);
      taskLib.debug(`Using Google Repository as source code at ${sourceRepo}`);
      request.requestBody.sourceRepository = {
        url: sourceRepo,
      };
      request.updateMask = 'sourceRepository.url';
      break;
    }

    case 'zip': {
      const zipPath = taskLib.getPathInput('deploySourceZip', true, true);
      taskLib.debug(`Using Zip file ${zipPath} as the source code.`);
      request.requestBody.sourceUploadUrl = await uploadFile(location, zipPath);
      request.updateMask = 'sourceUploadUrl';
      break;
    }

    default:
      break;
  }

  const res = await cloudFunctions.projects.locations.functions.patch(request);

  if (!res.data || !res.data.done) {
    taskLib.error(`${res.data.error.code} - ${res.data.error.message}`);
    taskLib.debug(res.data.error.details);
    taskLib.setResult(taskLib.TaskResult.Failed);
  }

  taskLib.debug('Result from operation:');
  taskLib.debug(JSON.stringify(res.data));
  return res.data && res.data.done;
}

/**
 * Main function
 *
 */
async function main() {
  let taskSuccess = false;

  // Get authentication method
  let jsonCredential = '';
  const authMethod = taskLib.getInput('authenticationMethod', true);

  if (authMethod === 'serviceAccount') {
    jsonCredential = taskLib.getEndpointDataParameter('serviceAccount', 'certificate', false);
    taskLib.debug('Using Service Connection authentication');
  } else if (authMethod === 'jsonFile') {
    const secureFileId = taskLib.getInput('jsonCredentials', true);
    const secureFileHelpers = new secureFilesCommon.SecureFileHelpers();
    const secureFilePath = await secureFileHelpers.downloadSecureFile(secureFileId);

    if (taskLib.exist(secureFilePath)) {
      jsonCredential = fs.readFileSync(secureFilePath, { encoding: 'utf8' });
    } else {
      taskLib.error(`Secure file not founded at ${secureFilePath}`);
      taskLib.setResult(taskLib.TaskResult.Failed);
      return;
    }
  }

  const auth = new google.auth.GoogleAuth({
    credentials: jsonCredential,
    // Scopes can be specified either as an array or as a single, space-delimited string.
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/cloudfunctions',
    ],
  });

  // Acquire an auth client, and bind it to all future calls
  const authClient = await auth.getClient();
  google.options('auth', authClient);

  // Get info about credential
  if (jsonCredential) {
    const credentials = JSON.parse(jsonCredential);
    taskLib.debug(`Authenticated as ${credentials.client_email}`);
  } else {
    taskLib.debug('Authenticated (JSON could not be read.');
  }

  // Check operation
  const op = taskLib.getInput('operation', false);

  // Get some basic info
  const projectId = taskLib.getInput('gcpProject', true);
  const region = taskLib.getInput('gcpRegion', true);
  const location = `projects/${projectId}/locations/${region}`;
  const name = taskLib.getInput('funcName', true);

  switch (op) {
    case 'create': {
      let result = null;
      taskLib.debug(`Project: ${location}, Function name: ${name}`);

      // Check if the function already exists
      console.log('Checking if the Function already exists...');
      const func = await getFunction(location, name);

      if (!func) {
        // Create
        console.log(`Function ${name} not found in ${location}.`);
        result = await createFunction(location, name);
      } else {
        // Update
        result = await updateFunction(location, name, func);
      }

      // Check if unauthenticated access is allowed
      if (taskLib.getBoolInput('funcHttpsAnonym', false)) {
        taskLib.debug('Should allow public access');

        const res = await cloudFunctions.projects.locations.functions.setIamPolicy({
          resource: `${location}/functions/${name}`,
          requestBody: {
            policy: {
              bindings: [
                {
                  role: 'roles/cloudfunctions.invoker',
                  members: ['allUsers'],
                },
              ],
            },
          },
        });

        taskLib.debug(`Status code of allow anonym access is ${res.status}`);
      }

      // Output vars
      if (result.httpsTrigger && result.httpsTrigger.url) {
        taskLib.setVariable('FunctionUrl', result.httpsTrigger.url);
      }

      taskLib.setVariable('FunctionVersionId', result.versionId);

      // Success?
      taskSuccess = result.done;

      break;
    }

    case 'delete':
      taskSuccess = await deleteFunction(location, name);
      break;

    case 'deploy':
      taskSuccess = await deployFunction(location, name);
      break;

    case 'call': {
      const callResult = await callFunction(location, name);
      taskSuccess = true;
      taskLib.setVariable('FunctionCallResult', callResult);
      break;
    }

    default:
      break;
  }

  // Set output
  taskLib.setVariable('FunctionName', `${location}/functions/${name}`);

  if (taskSuccess) {
    taskLib.setResult(taskLib.TaskResult.Succeeded);
  } else {
    taskLib.setResult(taskLib.TaskResult.Failed);
  }
}

main();
