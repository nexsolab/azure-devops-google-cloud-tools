/* eslint-disable no-console */
/* eslint-disable radix */
/* eslint max-len: ["error", { "code": 100, "tabWidth": 2, "ignoreComments": true, "ignoreTemplateLiterals": true }] */
import * as taskLib from 'azure-pipelines-task-lib/task';
// eslint-disable-next-line no-unused-vars
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';
import secureFilesCommon from 'securefiles-common';
import deepDiff from 'return-deep-diff';

const apiUrl = 'https://cloudfunctions.googleapis.com/v1';
const isInTest = process.argv.join().includes('azure-pipelines-task-lib');

// #region Utils
/**
 * @typedef {object} AuthClientResult
 * @property {OAuth2Client} client Google API authenticated client
 * @property {string} projectId The current Google Cloud Project ID
 */

/**
 * Authenticate using credentials and return a client.
 *
 * @param {string[]} scopes Needed Google API scopes
 * @returns {AuthClientResult}
 */
async function getAuthenticatedClient(scopes) {
  try {
    // Get authentication method
    let jsonCredential = '';
    const authMethod = taskLib.getInput('authenticationMethod', true);

    if (authMethod === 'serviceAccount' && !isInTest) {
      const account = taskLib.getInput('SCserviceAccount', true);
      const schema = taskLib.getEndpointAuthorizationScheme(account);
      taskLib.debug(`Authorization schema is ${schema}`);

      if (schema === 'ms.vss-endpoint.endpoint-auth-scheme-oauth2') {
        const authSc = taskLib.getEndpointAuthorization(account);
        taskLib.debug(JSON.stringify(authSc));
      } else {
        jsonCredential = taskLib.getEndpointAuthorizationParameter(account, 'certificate', false);
        taskLib.debug('Recovered JSON file contents');
      }

      console.log(`jsonCredential é: ${jsonCredential}`);

      taskLib.debug(`Using Service Connection authentication [${schema}]`);
    } else if (authMethod === 'jsonFile' || isInTest) {
      let secureFilePath = '';

      if (isInTest) {
        console.log('Testing! Using local "credentials.json" file');
        secureFilePath = 'credentials.json';
      } else {
        const secureFileId = taskLib.getInput('jsonCredentials', true);
        const secureFileHelpers = new secureFilesCommon.SecureFileHelpers();
        secureFilePath = await secureFileHelpers.downloadSecureFile(secureFileId);
      }

      if (taskLib.exist(secureFilePath)) {
        jsonCredential = fs.readFileSync(secureFilePath, { encoding: 'utf8' });
      } else {
        taskLib.error(`Secure file not founded at ${secureFilePath}`);
        taskLib.setResult(taskLib.TaskResult.Failed);
        return null;
      }
    }

    // Fix line breaks in private key before parse JSON
    const privateKeyIni = jsonCredential.indexOf('-----BEGIN PRIVATE KEY-----');
    const privateKeyEnd = jsonCredential.indexOf('",', privateKeyIni);
    const escapedKey = jsonCredential.substring(privateKeyIni, privateKeyEnd).replace(/\n/g, '\\n');
    const jsonStart = jsonCredential.substring(0, privateKeyIni);
    const jsonEscaped = jsonStart + escapedKey + jsonCredential.substr(privateKeyEnd);
    const credentials = JSON.parse(jsonEscaped);

    const auth = new GoogleAuth({
      credentials,
      // Scopes can be specified either as an array or as a single, space-delimited string.
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        ...scopes,
      ],
    });

    // Acquire an auth client, and bind it to all future calls
    const client = await auth.getClient();
    const projectId = credentials.project_id;

    // Get info about credential
    if (jsonCredential && credentials) {
      taskLib.debug(`Authenticated as ${credentials.client_email} for project "${projectId}"`);
    } else {
      taskLib.debug('Authenticated (JSON could not be read.');
    }

    return { client, projectId };
  } catch (error) {
    taskLib.error(`Failed to authenticate in Google Cloud: ${error.message}`);
    taskLib.debug(error);
    taskLib.setResult(taskLib.TaskResult.Failed);
    return null;
  }
}

/**
 * Check a result of a Rest call and fail task when response is not successful.
 *
 * @param {import('gaxios').GaxiosResponse<import('googleapis').cloudfunctions_v1.Schema$Operation>} res The Rest API response
 * @returns {import('googleapis').cloudfunctions_v1.Schema$CloudFunction} The metadata of the operation.
 */
function checkResultAndGetMetadata(res) {
  taskLib.debug('Result from operation:');
  taskLib.debug(JSON.stringify(res.data));

  if (res.status >= 400 || !res.data) {
    if (res.data && res.data.error) {
      taskLib.error(`${res.data.error.code} - ${res.data.error.message}`);
      taskLib.debug(res.data.error.details.join('\n'));
    }
    taskLib.setResult(taskLib.TaskResult.Failed);
  }

  return res.data && res.data.metadata;
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
// #endregion Utils

// #region Operations
/**
 * Upload the Zip file with source code to the cloud.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {String} project Full project identification
 * @param {String} zipFile Path to the zip file
 * @returns {String} Return the url of the file uploaded.
 */
async function uploadFile(client, project, zipFile) {
  taskLib.debug(`Generate Upload URL for ${project}`);

  // Generate the URL to upload the file
  let storageResult;
  try {
    storageResult = await client.request({
      method: 'POST',
      url: `${apiUrl}/${project}/functions:generateUploadUrl`,
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (error) {
    console.error(JSON.stringify(error.response.data));
    throw error;
  }

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
 * @typedef {Object} CheckSourceResult
 * @property {String} updateMask The changed properties
 * @property {String} requestBody Request body to call API
 */

/**
 * Check function code source and upload file (if is needed)
 *
 * @param @param {OAuth2Client} client Google Auth Client
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} mode Source selected mode
 * @param {String} sourceValue The path of the zip, or storage or repository
 * @returns {CheckSourceResult} The update mask and request body
 */
async function checkSource(client, location, mode, sourceValue) {
  let updateMask = '';
  const requestBody = {};

  switch (mode) {
    case 'storage': {
      const storagePath = sourceValue;
      taskLib.debug(`Using Google Storage Zip file as source code at ${storagePath}`);
      requestBody.sourceArchiveUrl = storagePath;
      updateMask = 'sourceArchiveUrl';
      break;
    }

    case 'repo': {
      const sourceRepo = sourceValue;
      taskLib.debug(`Using Google Repository as source code at ${sourceRepo}`);
      requestBody.sourceRepository = {
        url: sourceRepo,
      };
      updateMask = 'sourceRepository.url';
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
      requestBody.sourceUploadUrl = await uploadFile(client, location, files[0]);
      updateMask = 'sourceUploadUrl';
      break;
    }

    default:
      break;
  }

  return { updateMask, requestBody };
}

/**
 * Deploy new version of the Function to the cloud.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 * @param {String} sourceValue The path of the zip, or storage or repository
 * @returns {Object} The function metadata.
 */
async function deployFunction(client, location, name, mode, sourceValue) {
  // mode
  const { updateMask, requestBody } = await checkSource(client, location, mode, sourceValue);

  taskLib.debug('Requesting GCP with data:');
  taskLib.debug(JSON.stringify(requestBody));

  let res;
  try {
    res = await client.request({
      method: 'PATCH',
      url: `${apiUrl}/${location}/functions/${name}?updateMask=${updateMask}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    console.error(JSON.stringify(error.response.data));
    throw error;
  }

  return checkResultAndGetMetadata(res);
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
  const labels = taskLib.getInput('gcpLabels', false) || '';

  if (labels.substring(0, 1) === '{') {
    // JSON
    requestBody.labels = JSON.parse(labels);
    taskLib.debug('Parse this JSON as resource labels:');
    taskLib.debug(labels);
  } else if (labels && labels.indexOf('-') >= 0) {
    // Editor
    requestBody.labels = {};
    const labelsArray = labels.split('-').splice(1).map((p) => p.trim().split(' '));
    // eslint-disable-next-line prefer-destructuring
    labelsArray.forEach((x) => { requestBody.labels[x[0]] = x[1]; });
    taskLib.debug('Labels are:');
    taskLib.debug(JSON.stringify(requestBody.labels));
  }

  // Do the magic
  console.log('Options ready');
  return requestBody;
}

/**
 * Create a new Function in the GCP.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 * @returns {import('googleapis').cloudfunctions_v1.Schema$CloudFunction} The function metadata.
 */
async function createFunction(client, location, name) {
  let res;

  // Fix name
  const funcName = name.split('/').length === 6 ? name : `${location}/functions/${name}`;

  // Get body
  const req = await getCreateResquestBody(location, funcName);

  // Get source
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
      sourceValue = taskLib.getPathInput('funcSourceZip', true, false);
      break;
    }

    default:
      break;
  }

  const { requestBody } = await checkSource(client, location, sourceMode, sourceValue);
  Object.assign(req, requestBody);

  taskLib.debug('Calling Google API to create the function, with the request:');
  taskLib.debug(JSON.stringify(req));

  // Create
  console.log(`Creating function ${location}`);
  try {
    res = await client.request({
      method: 'POST',
      url: `${apiUrl}/${location}/functions`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req),
    });
  } catch (error) {
    console.error(JSON.stringify(error.response.data));
    throw error;
  }

  return checkResultAndGetMetadata(res);
}

/**
 * Update the changed properties of the existing Function.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 * @param {Object} currentProperties Current properties to compare with the changed values
 * @returns {import('googleapis').cloudfunctions_v1.Schema$CloudFunction} The function metadata.
 */
async function updateFunction(client, location, name, currentProperties) {
  taskLib.debug('Update Function');
  const req = await getCreateResquestBody(location, name);

  // Names can be updated
  delete req.name;

  // Get only the differences, including new props
  const diff = deepDiff(currentProperties, req, true);
  taskLib.debug(`Changed or new properties of the existing function are: ${propertiesToArray(diff).join(',')}`);
  taskLib.debug(JSON.stringify(diff));

  // Nothing changed
  if (!diff) {
    console.log('Nothing was changed in the function.');
    return checkResultAndGetMetadata({
      status: 200,
      data: {
        metadata: currentProperties,
      },
    });
  }

  // Get only changed props
  const changedProps = deepDiff(currentProperties, req) || {};
  const updateMask = propertiesToArray(changedProps).join(',');
  const qsMask = encodeURIComponent(updateMask);
  taskLib.debug(`Changed attributes are: ${updateMask}`);
  console.log(`Updating function ${location}/functions/${name}`);

  let res;
  try {
    res = await client.request({
      method: 'PATCH',
      url: `${apiUrl}/${location}/functions/${name}?updateMask=${qsMask}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req),
    });
  } catch (error) {
    console.error(JSON.stringify(error.response.data));
    throw error;
  }

  console.log('Function updated!');

  return checkResultAndGetMetadata(res);
}

/**
 * Get function properties data.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 * @returns {import('googleapis').cloudfunctions_v1.Schema$CloudFunction} The function metadata.
 */
async function getFunction(client, location, name) {
  taskLib.debug(`Check existence of ${location}/functions/${name}`);
  try {
    const res = await client.request({
      method: 'GET',
      url: `${apiUrl}/${location}/functions/${name}`,
    });

    if (res && res.data && res.status === 200) {
      console.log(`Function ${location}/functions/${name} exists.`);
      return res.data;
    }

    taskLib.debug(`getFunction return the status code: ${res.status}`);
  } catch (error) {
    console.error(JSON.stringify(error.response.data));
    taskLib.debug(`Check error: ${error.message}`);
  }

  return null;
}

/**
 * Delete the resource from GCP.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 * @returns {import('googleapis').cloudfunctions_v1.Schema$CloudFunction} The function metadata.
 */
async function deleteFunction(client, location, name) {
  console.log(`Removing Function ${location}/functions/${name}`);

  let res;
  try {
    res = await client.request({
      method: 'DELETE',
      url: `${apiUrl}/${location}/functions/${name}`,
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (error) {
    console.error(JSON.stringify(error.response.data));
    throw error;
  }

  return checkResultAndGetMetadata(res);
}

/**
 * Make a call to the function.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {String} location `projects/{project_id}/locations/{location_id}` of the function
 * @param {String} name Function name
 * @returns {String} Return the response body.
 */
async function callFunction(client, location, name) {
  console.log(`Calling Function ${location}/functions/${name}`);
  const callData = taskLib.getInput('funcCallData');

  let res;
  try {
    res = await client.request({
      method: 'POST',
      url: `${apiUrl}/${location}/functions/${name}:call`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: callData }),
    });
  } catch (error) {
    console.error(JSON.stringify(error.response.data));
    throw error;
  }

  taskLib.debug('Result of invocation:');
  taskLib.debug(JSON.stringify(res.data));
  console.log(`Id of the invocation: ${res.data && res.data.executionId}`);
  return res.data && res.data.result;
}
// #endregion Operations

/**
 * Main function
 *
 */
async function main() {
  let taskSuccess = false;

  try {
    // Get authentication
    const auth = await getAuthenticatedClient([
      'https://www.googleapis.com/auth/cloudfunctions',
    ]);

    // Check operation
    const op = taskLib.getInput('operation', false);

    // Get some basic info
    const region = taskLib.getInput('gcpRegion', true);
    const location = `projects/${auth.projectId}/locations/${region}`;
    const name = taskLib.getInput('funcName', true);

    switch (op) {
      case 'create': {
        /**
         * @type {import('googleapis').cloudfunctions_v1.Schema$OperationMetadataV1}
         */
        let result = null;
        taskLib.debug(`Project: ${location}, Function name: ${name}`);

        // Check if the function already exists
        console.log('Checking if the Function already exists...');
        const func = await getFunction(auth.client, location, name);

        if (!func) {
          // Create
          console.log(`Function ${name} not found in ${location}.`);
          result = await createFunction(auth.client, location, name);
        } else {
          // Update
          result = await updateFunction(auth.client, location, name, func);
        }

        // Check if unauthenticated access is allowed
        if (taskLib.getBoolInput('funcHttpsAnonym', false)) {
          try {
            console.log('Enabling public access...');
            let res;

            try {
              res = await auth.client.request({
                method: 'POST',
                url: `${apiUrl}/${location}/functions/${name}:setIamPolicy`,
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
            } catch (error) {
              console.error(JSON.stringify(error.response.data));
              throw error;
            }

            taskLib.debug(`Status code of allow anonym access is ${res.status}`);

            if (res && res.data && res.status === 200) {
              console.log('Public access allowed!');
            }
          } catch (error) {
            taskLib.warning(`Error at allowing public access: ${error.message}`);
            taskLib.debug(error);
          }
        }

        // Output vars
        setOutput(result);

        // Success?
        console.log();
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

        const result = await deployFunction(auth.client, location, name, sourceMode, sourceValue);
        taskSuccess = ['ACTIVE', 'DEPLOY_IN_PROGRESS'].some((s) => s === result.request.status);
        break;
      }

      case 'call': {
        const callResult = await callFunction(auth.client, location, name);
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
    taskLib.debug(error);
  }

  if (taskSuccess) {
    taskLib.setResult(taskLib.TaskResult.Succeeded);
  } else {
    taskLib.setResult(taskLib.TaskResult.Failed);
  }
}

main();
