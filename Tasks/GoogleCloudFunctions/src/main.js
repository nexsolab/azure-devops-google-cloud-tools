/* eslint-disable no-console */
/* eslint-disable radix */
/* eslint max-len: ["error", { "code": 100, "tabWidth": 2, "ignoreComments": true, "ignoreTemplateLiterals": true }] */
import * as taskLib from 'azure-pipelines-task-lib/task';
import { google } from 'googleapis';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';
import secureFilesCommon from 'securefiles-common/securefiles-common';
import deepDiff from 'return-deep-diff';

const cloudFunctions = google.cloudfunctions('v1');

/**
 * Check a result of a Rest call and fail task when response is not successful.
 *
 * @param {import('gaxios').GaxiosResponse<import('googleapis').cloudfunctions_v1.Schema$Operation>} res The Rest API response
 * @returns {import('googleapis').cloudfunctions_v1.Schema$CloudFunction} The metadata of the operation.
 */
function checkResultAndGetMetadata(res) {
  taskLib.debug('Result from operation:');
  taskLib.debug(JSON.stringify(res));

  if (res.status >= 400 || !res.data) {
    if (res.data.error) {
      taskLib.error(`${res.data.error.code} - ${res.data.error.message}`);
      taskLib.debug(res.data.error.details.join('\n'));
    }
    taskLib.setResult(taskLib.TaskResult.Failed);
  }

  return res.data && res.data.metadata;
}

/**
 * Upload the Zip file with source code to the cloud.
 *
 * @param {*} auth Google Auth Client
 * @param {String} project Full project identification
 * @param {String} zipFile Path to the zip file
 * @returns {String} Return the url of the file uploaded.
 */
async function uploadFile(auth, project, zipFile) {
  taskLib.debug(`Generate Upload URL for ${project}`);

  // Generate the URL to upload the file
  const storageResult = await cloudFunctions.projects.locations.functions.generateUploadUrl({
    auth,
    // The project and location in which the Google Cloud Storage signed URL
    // should be generated, specified in the format `projects/x/locations/x`.
    parent: project,
  });

  const url = storageResult.data && storageResult.data.uploadUrl;

  taskLib.debug(`Upload URL generated: ${url}`);

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
 * Find file with glob patterns
 *
 * @param {String} filepath File Pattern
 * @returns {String[]} List of files founded
 */
function findMatchingFiles(filepath) {
  taskLib.debug(`Finding files matching input: ${filepath}`);

  let filesList;
  if (filepath.indexOf('*') === -1 && filepath.indexOf('?') === -1) {
    // No pattern found, check literal path to a single file
    if (taskLib.exist(filepath)) {
      filesList = [filepath];
    } else {
      taskLib.debug(`No matching files were found with search pattern: ${filepath}`);
      return [];
    }
  } else {
    const firstWildcardIndex = (str) => {
      const idx = str.indexOf('*');
      const idxOfWildcard = str.indexOf('?');

      if (idxOfWildcard > -1) {
        return (idx > -1) ? Math.min(idx, idxOfWildcard) : idxOfWildcard;
      }

      return idx;
    };

    // Find app files matching the specified pattern
    taskLib.debug(`Matching glob pattern: ${filepath}`);

    // First find the most complete path without any matching patterns
    const idx = firstWildcardIndex(filepath);
    taskLib.debug(`Index of first wildcard: ${idx}`);
    const slicedPath = filepath.slice(0, idx);
    let findPathRoot = path.dirname(slicedPath);

    if (slicedPath.endsWith('\\') || slicedPath.endsWith('/')) {
      findPathRoot = slicedPath;
    }

    taskLib.debug(`find root dir: ${findPathRoot}`);

    // Now we get a list of all files under this root
    const allFiles = taskLib.find(findPathRoot);

    // Now matching the pattern against all files
    const options = { matchBase: true, nocase: !!taskLib.osType().match(/^Win/) };
    filesList = taskLib.match(allFiles, filepath, '', options);

    // Fail if no matching files were found
    if (!filesList || filesList.length === 0) {
      taskLib.debug(`No matching files were found with search pattern: ${filepath}`);
      return [];
    }
  }
  return filesList;
}

/**
 * Deploy new version of the Function to the cloud.
 *
 * @param {*} auth Google Auth Client
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 * @returns {import('googleapis').cloudfunctions_v1.Schema$CloudFunction} The function metadata.
 */
async function deployFunction(auth, location, name, mode, sourceValue) {
  const request = {
    auth,
    name: `${location}/functions/${name}`,
    updateMask: '',
    requestBody: {},
  };

  // mode
  switch (mode) {
    case 'storage': {
      const storagePath = sourceValue;
      taskLib.debug(`Using Google Storage Zip file as source code at ${storagePath}`);
      request.requestBody.sourceArchiveUrl = storagePath;
      request.updateMask = 'sourceArchiveUrl';
      break;
    }

    case 'repo': {
      const sourceRepo = sourceValue;
      taskLib.debug(`Using Google Repository as source code at ${sourceRepo}`);
      request.requestBody.sourceRepository = {
        url: sourceRepo,
      };
      request.updateMask = 'sourceRepository.url';
      break;
    }

    case 'zip': {
      const zipPath = sourceValue;
      const files = findMatchingFiles(zipPath);

      if (files.length === 0) {
        taskLib.error('Not found any file.');
        return taskLib.setResult(taskLib.TaskResult.Failed);
      }

      if (files.length > 1) {
        taskLib.warning('Several files were found, using the first. All others will be discarded');
      }

      console.log(`Using Zip file ${files[0]} as the source code.`);
      request.requestBody.sourceUploadUrl = await uploadFile(auth, location, files[0]);
      request.updateMask = 'sourceUploadUrl';
      break;
    }

    default:
      break;
  }

  taskLib.debug('Requesting GCP with data:');
  taskLib.debug(JSON.stringify(request));
  const res = await cloudFunctions.projects.locations.functions.patch(request);
  return checkResultAndGetMetadata(res);
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
    taskLib.debug(`Error get the number of ${name}: ${error.message}`);
    return undefined;
  }
}

/**
 * Check option to create a new or update a Google Cloud Function
 *
 * @returns {import('googleapis').cloudfunctions_v1.Schema$CloudFunction} The API request body
 */
async function getCreateResquestBody(location, name) {
  // Request body metadata
  const requestBody = {
    availableMemoryMb: getInputNumber('funcMemory', false),
    description: taskLib.getInput('funcDesc', false),
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
    requestBody.environmentVariables = {};
    const varsArray = envVarList.split('-').splice(1).map((p) => p.trim().split(' '));
    // eslint-disable-next-line prefer-destructuring
    varsArray.forEach((x) => { requestBody.environmentVariables[x[0]] = x[1]; });
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
      requestBody.httpsTrigger = {};
      break;
  }

  // Check network option
  const networkMode = taskLib.getInput('networkMode', false);

  if (networkMode === 'vpc') {
    const network = taskLib.getInput('funcNetwork', false);
    taskLib.debug(`Set ${network} as network for the function`);
    requestBody.network = network;
  } else if (networkMode === 'connector') {
    // Connector
    const vpcConnector = taskLib.getInput('funcVpcConnector', false);
    taskLib.debug(`Set ${vpcConnector} as VPC Connector for Functions`);
    requestBody.vpcConnector = vpcConnector;

    // Egress Settings
    const vpcConnectorEgress = taskLib.getInput('funcVpcConnectorEgress', false);
    taskLib.debug(`VPC Connector egress setting is ${vpcConnectorEgress}`);
    requestBody.vpcConnectorEgressSettings = vpcConnectorEgress;

    // Ingress Settings
    const vpcConnectorIngress = taskLib.getInput('funcVpcConnectorIngress', false);
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
 * @param {*} auth Google Auth Client
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 * @returns {import('googleapis').cloudfunctions_v1.Schema$CloudFunction} The function metadata.
 */
async function createFunction(auth, location, name) {
  const req = await getCreateResquestBody(location, name);
  taskLib.debug('Calling Google API to create the function, with the request:');
  taskLib.debug(JSON.stringify(req));

  // Create
  console.log(`Creating function ${location}`);
  const res = await cloudFunctions.projects.locations.functions.create({
    auth,
    // Required. The project and location in which the function should be created, specified
    // in the format `projects/x/locations/x`
    location,
    requestBody: req,
  });

  const createResult = checkResultAndGetMetadata(res);

  if (createResult) {
    console.log('Function created!');

    // Get source mode
    let sourceValue = '';
    const sourceMode = taskLib.getInput('funcSourceMode', false) || 'zip';

    switch (sourceMode) {
      case 'storage': {
        sourceValue = taskLib.getInput('funcSourceArchive', false);
        break;
      }

      case 'repo': {
        sourceValue = taskLib.getInput('funcSourceRepo', false);
        break;
      }

      case 'zip': {
        sourceValue = taskLib.getPathInput('funcSourceZip', true, true);
        break;
      }

      default:
        break;
    }

    // Upload source code
    const deployResult = await deployFunction(auth, location, name, sourceMode, sourceValue);
    checkResultAndGetMetadata(deployResult);
  }

  return createResult;
}

/**
 * Get a list of properties from a deep object.
 *
 * @param {Object} obj The object to get the keys
 * @returns {string[]} The paths of object keys.
 */
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
 * @param {*} auth Google Auth Client
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 * @param {Object} currentProperties Current properties to compare with the changed values
 * @returns {import('googleapis').cloudfunctions_v1.Schema$CloudFunction} The function metadata.
 */
async function updateFunction(auth, location, name, currentProperties) {
  taskLib.debug('Update Function');
  const req = await getCreateResquestBody(location, name);

  // Get only the differences
  const diff = deepDiff(currentProperties, req, true);
  taskLib.debug('Changed properties of the existing Function are:');
  taskLib.debug(JSON.stringify(diff));

  const changedPropertiesNames = propertiesToArray(diff);
  taskLib.debug(`Changed attributes are the above for ${location}/functions/${name}`);
  console.log(`Updating function ${req.name}`);

  const res = await cloudFunctions.projects.locations.functions.patch({
    auth,
    updateMask: changedPropertiesNames.join(','),
    requestBody: diff,
  });

  console.log('Function updated!');

  return checkResultAndGetMetadata(res);
}

/**
 * Get function properties data.
 *
 * @param {*} auth Google Auth Client
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 * @returns {import('googleapis').cloudfunctions_v1.Schema$CloudFunction} The function metadata.
 */
async function getFunction(auth, location, name) {
  taskLib.debug(`Check existence of ${location}/functions/${name}`);
  try {
    const res = await cloudFunctions.projects.locations.functions.get({
      auth,
      name: `${location}/functions/${name}`,
    });

    if (res && res.data && res.status === 200) {
      console.log(`Function ${location}/functions/${name} exists.`);
      return res.data;
    }

    taskLib.debug(`getFunction return the status code: ${res.status}`);
  } catch (error) {
    taskLib.debug(`Check error: ${error.message}`);
  }

  return null;
}

/**
 * Delete the resource from GCP.
 *
 * @param {*} auth Google Auth Client
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 * @returns {import('googleapis').cloudfunctions_v1.Schema$CloudFunction} The function metadata.
 */
async function deleteFunction(auth, location, name) {
  console.log(`Removing Function ${location}/functions/${name}`);
  const res = await cloudFunctions.projects.locations.functions.delete({
    auth,
    name: `${location}/functions/${name}`,
  });

  return checkResultAndGetMetadata(res);
}

/**
 * Make a call to the function.
 *
 * @param {*} auth Google Auth Client
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 * @returns {String} Return the response body.
 */
async function callFunction(auth, location, name) {
  console.log(`Calling Function ${location}/functions/${name}`);
  const callData = taskLib.getInput('funcCallData');

  const firstChar = callData.substring(0, 1);
  taskLib.debug(`First char of data is ${firstChar}`);

  const data = (firstChar === '[' || firstChar === '{') ? JSON.parse(callData) : callData;
  taskLib.debug(`Data to call the function: ${callData}`);
  const res = await cloudFunctions.projects.locations.functions.call({
    auth,
    name: `${location}/functions/${name}`,
    requestBody: data,
  });

  console.log(`Id of the invocation: ${res.data && res.data.executionId}`);
  taskLib.debug(`Result of invocation: ${res.data && res.data.result}`);
  return res.data && res.data.result;
}

/**
 * Export task output variables based on the response.
 *
 * @param {cloudfunctions_v1.Schema$CloudFunction} result The metadata of the function
 */
function setOutput(result) {
  if (result.httpsTrigger && result.httpsTrigger.url) {
    taskLib.setVariable('FunctionUrl', result.httpsTrigger.url);
  }

  taskLib.setVariable('FunctionVersionId', result.versionId);
}

/**
 * Main function
 *
 */
async function main() {
  let taskSuccess = false;

  try {
    // Get authentication method
    let jsonCredential = '';
    const authMethod = taskLib.getInput('authenticationMethod', true);

    if (authMethod === 'serviceAccount') {
      const account = taskLib.getInput('SCserviceAccount', true);
      jsonCredential = taskLib.getEndpointAuthorizationParameter(account, 'certificate', false);
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

    // Fix line breaks in private key before parse JSON
    const privateKeyIni = jsonCredential.indexOf('-----BEGIN PRIVATE KEY-----');
    const privateKeyEnd = jsonCredential.indexOf('",', privateKeyIni);
    const escapedKey = jsonCredential.substring(privateKeyIni, privateKeyEnd).replace(/\n/g, '\\n');
    const jsonStart = jsonCredential.substring(0, privateKeyIni);
    const jsonEscaped = jsonStart + escapedKey + jsonCredential.substr(privateKeyEnd);

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(jsonEscaped),
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
        const func = await getFunction(authClient, location, name);

        if (!func) {
          // Create
          console.log(`Function ${name} not found in ${location}.`);
          result = await createFunction(authClient, location, name);
        } else {
          // Update
          result = await updateFunction(authClient, location, name, func);
        }

        // Check if unauthenticated access is allowed
        if (taskLib.getBoolInput('funcHttpsAnonym', false)) {
          console.log('Enabling public access...');

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

          if (res && res.data && res.status === 200) {
            console.log('Public access allowed!');
          }
        }

        // Output vars
        setOutput(result);

        // Success?
        taskSuccess = ['ACTIVE', 'DEPLOY_IN_PROGRESS'].some((s) => s === result.status);
        break;
      }

      case 'delete': {
        const result = await deleteFunction(authClient, location, name);
        taskSuccess = [
          'DELETE_IN_PROGRESS',
          'UNKNOWN',
          'CLOUD_FUNCTION_STATUS_UNSPECIFIED'].some((s) => s === result.status);
        break;
      }

      case 'deploy': {
        let sourceValue = '';
        const sourceMode = taskLib.getInput('deploySourceMode', false) || 'zip';

        switch (sourceMode) {
          case 'storage': {
            sourceValue = taskLib.getInput('deploySourceArchive', false);
            break;
          }

          case 'repo': {
            sourceValue = taskLib.getInput('deploySourceRepo', false);
            break;
          }

          case 'zip': {
            sourceValue = taskLib.getPathInput('deploySourceZip', true, false);
            break;
          }

          default:
            break;
        }

        const result = await deployFunction(authClient, location, name, sourceMode, sourceValue);
        taskSuccess = ['ACTIVE', 'DEPLOY_IN_PROGRESS'].some((s) => s === result.status);
        break;
      }

      case 'call': {
        const callResult = await callFunction(authClient, location, name);
        taskSuccess = !!callResult;
        taskLib.setVariable('FunctionCallResult', callResult);
        break;
      }

      default:
        break;
    }

    // Set output
    taskLib.setVariable('FunctionName', `${location}/functions/${name}`);
  } catch (error) {
    console.error(`Failed: ${error.message}`);
    taskLib.debug(error.stack);
  }

  if (taskSuccess) {
    taskLib.setResult(taskLib.TaskResult.Succeeded);
  } else {
    taskLib.setResult(taskLib.TaskResult.Failed);
  }
}

main();
