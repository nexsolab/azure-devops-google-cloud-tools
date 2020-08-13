/* eslint-disable no-console */
import * as taskLib from 'azure-pipelines-task-lib/task';
// eslint-disable-next-line no-unused-vars
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import SecureFileHelpers from 'securefiles-babel';
import deepDiff from 'return-deep-diff';

const apiUrl = 'https://redis.googleapis.com/v1';
const isInTest = process.argv.join().includes('azure-pipelines-task-lib');
if (isInTest) console.log('Testing...');

// #region Utils
/**
 * @typedef {object} AuthClientResult
 * @property {OAuth2Client} client Google API authenticated client
 * @property {string} projectId The current Google Cloud Project ID
 */

/**
 * Authenticate using credentials and return a client.
 *
 * @param {string[]} [scopes=[]] Needed Google API scopes
 * @returns {AuthClientResult}
 */
async function getAuthenticatedClient(scopes = []) {
  try {
    // Get authentication method
    let auth;
    let projectId;
    let jsonCredential = '';
    const authMethod = taskLib.getInput('authenticationMethod', true);

    if (authMethod === 'serviceAccount' && !isInTest) {
      // Service Connection
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

      taskLib.debug(`Using Service Connection authentication [${schema}]`);

      // Fix line breaks in private key before parse JSON
      const privateKeyIni = jsonCredential.indexOf('-----BEGIN PRIVATE KEY-----');
      const privateKeyEnd = jsonCredential.indexOf('",', privateKeyIni);
      const escapedKey = jsonCredential.substring(privateKeyIni, privateKeyEnd).replace(/\n/g, '\\n');
      const jsonStart = jsonCredential.substring(0, privateKeyIni);
      const jsonEscaped = jsonStart + escapedKey + jsonCredential.substr(privateKeyEnd);
      const credentials = JSON.parse(jsonEscaped);

      auth = new GoogleAuth({
        credentials,
        // Scopes can be specified either as an array or as a single, space-delimited string.
        scopes: [
          'https://www.googleapis.com/auth/cloud-platform',
          ...scopes,
        ],
      });

      projectId = credentials.project_id;
      taskLib.debug(`Authenticated as ${credentials.client_email} for project "${projectId}"`);
    } else if (authMethod === 'jsonFile' || isInTest) {
      // Secure file
      let filename;
      let downloadPath = '';
      let secureFilePath = '';

      if (isInTest) {
        console.log('Testing! Using local "credentials.json" file');
        secureFilePath = 'credentials.json';
      } else {
        const secureFileId = taskLib.getInput('jsonCredentials', true);
        filename = taskLib.getSecureFileName(secureFileId);
        downloadPath = taskLib.resolve(taskLib.getVariable('Agent.TempDirectory'), filename);
        const ticket = taskLib.getSecureFileTicket(secureFileId);
        const project = taskLib.getVariable('SYSTEM.TEAMPROJECT');
        const proxy = taskLib.getHttpProxyConfiguration();
        const collectionUri = taskLib.getVariable('System.TeamFoundationCollectionUri');
        const credential = taskLib.getEndpointAuthorizationParameter('SYSTEMVSSCONNECTION', 'ACCESSTOKEN', false);

        try {
          taskLib.debug(`Downloading secure file "${filename}" with credentials...`);
          const secureFileHelpers = new SecureFileHelpers(collectionUri, credential, proxy, 3);
          secureFilePath = await secureFileHelpers.downloadSecureFile(
            secureFileId, downloadPath, ticket, project,
          );
        } catch (error) {
          console.log(`Error while downloading credentials: ${error.message}`);
          throw error;
        }

        taskLib.debug(`Secure file path is ${JSON.stringify(secureFilePath)}`);
      }

      if (!taskLib.exist(secureFilePath)) {
        taskLib.error(`Secure file not founded at ${secureFilePath}`);
        taskLib.setResult(taskLib.TaskResult.Failed);
        return null;
      }

      auth = new GoogleAuth({
        keyFile: secureFilePath,
        // Scopes can be specified either as an array or as a single, space-delimited string.
        scopes: [
          'https://www.googleapis.com/auth/cloud-platform',
          ...scopes,
        ],
      });

      projectId = await auth.getFileProjectId();
      taskLib.debug(`Authenticated with JSON file for project "${projectId}"`);

      // Remove secure file
      try {
        taskLib.debug('Remove downloaded secure file');
        if (taskLib.exist(downloadPath)) taskLib.rmRF(downloadPath);
      } catch (error) {
        console.log(`Erro while deleting secure file: ${error.message}`);
      }
    }

    // Acquire an auth client, and bind it to all future calls
    const client = await auth.getClient();
    return { client, projectId };
  } catch (error) {
    taskLib.error(`Failed to authenticate in Google Cloud: ${error.message}`);
    taskLib.debug(error.stack);
    taskLib.debug(JSON.stringify(error));
    taskLib.setResult(taskLib.TaskResult.Failed);
    return null;
  }
}

/**
 * Check a result of a Rest call and fail task when response is not successful.
 *
 * @param {import('gaxios').GaxiosResponse} res The Rest API response
 * @returns {*} The metadata of the operation.
 */
function checkResultAndGetData(res) {
  taskLib.debug('Result from operation:');
  taskLib.debug(JSON.stringify({
    status: res.status,
    statusText: res.statusText,
    data: res.data,
  }));

  if (res.status >= 400 || !res.data) {
    if (res.data && res.data.error) {
      taskLib.error(`${res.data.error.code} - ${res.data.error.message}`);
      taskLib.debug(res.data.error.details.join('\n'));
    }
    taskLib.setResult(taskLib.TaskResult.Failed);
  }

  return res.data;
}

/**
 * Parse the value of Parameters Grid input
 *
 * @author Gabriel Anderson
 * @param {string} list The value of the input
 * @returns {object} Key-value
 */
function parseListInput(list) {
  let obj = {};

  if (list.substring(0, 1) === '{') {
    // JSON
    obj = JSON.parse(list);
  } else if (list && list.indexOf('-') >= 0) {
    // Editor
    const listArray = list.split('-').splice(1).map((p) => p.trim().split(' '));
    // eslint-disable-next-line prefer-destructuring
    listArray.forEach((x) => { obj[x[0]] = x[1]; });
  }

  return obj;
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
 * Converts an input text to a number
 *
 * @param {String} name Task input name
 * @param {Boolean} [required=false]
 * @returns {Number} The number converted from string or `undefined`
 */
function getNumberInput(name, required = false) {
  try {
    const value = taskLib.getInput(name, required);
    return value ? parseFloat(value) : undefined;
  } catch (error) {
    taskLib.debug(`Error get the number of ${name}: ${error.message}`);
    return undefined;
  }
}

/**
 * @typedef {object} OperationMetadata
 * @property {string} createTime The time the operation was created.
 * @property {string} endTime The time the operation finished running.
 * @property {string} target Server-defined resource path for the target of the operation.
 * @property {string} verb Name of the verb executed by the operation.
 * @property {string} statusDetail Human-readable status of the operation, if any.
 * @property {string} cancelRequested Whether the user has requested cancellation of the operation.
 * @property {string} apiVersion API version used to start the operation
 */

/**
 * @typedef {object} Operation
 * @property {string} name The server-assigned name
 * @property {OperationMetadata} metadata Informations about operation
 * @property {boolean} done `false` means the operation is still in progress, otherwise is completed
 * @property {object} error The error result of the operation in case of failure or cancellation
 * @property {object} response The normal response of the operation in case of success.
 */

/**
 * Get the current status of long running operation.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {string} region The GCP region ID
 * @param {string} operation The operation ID
 * @returns {Operation} The API result data
 */
async function getOperation(client, project, region, operation) {
  const url = `projects/${project}/locations/${region}/operations/${operation}`;
  console.log('Check operation status...');

  let res;
  try {
    res = await client.request({
      method: 'GET',
      url: `${apiUrl}/${url}`,
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (error) {
    console.error(JSON.stringify(error.response.data));
    throw error;
  }

  return res && res.data;
}

let tries = 0;
let errors = 0;
let exponent = 1;

/**
 * Check if the operation ends.
 *
 * @author Gabriel Anderson
 * @param {Function} resolve Resolve function
 * @param {Function} reject Reject function
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {string} region The GCP region ID
 * @param {Operation} operationBody The operation name
 */
async function checkOperation(resolve, reject, client, project, region, operationBody) {
  /**
   * @type {Operation}
   */
  let result;
  const operation = operationBody.name;

  if (operationBody.done) {
    // Already finished operation
    result = operationBody;
  } else {
    // Check the status of operation
    try {
      result = await getOperation(client, project, region, operation);
      tries += 1;
    } catch (error) {
      // just update tries and errors count
      tries += 1;
      errors += 1;
    }
  }

  // Too many errors
  if (errors >= 3) {
    reject('Too many errors.');
    return;
  }

  // Too many errors
  if (tries > 15) {
    reject('Too many attempts.');
    return;
  }

  if (result.done) {
    console.log('Provisioning finished!');
    if (typeof result.response === 'object') {
      resolve(result.response);
    } else {
      reject(result.error);
    }
  } else {
    exponent += 1;
    if (exponent > 5) exponent = 1;

    const seconds = 2 ** exponent;
    const detail = result.metadata && result.metadata.statusDetail;
    console.log(`Status is ${detail}. Trying again in ${seconds} seconds.`);

    setTimeout(async () => {
      await checkOperation(resolve, reject, client, project, region, operationBody);
    }, seconds * 1000);
  }
}

/**
 * Wait until long running operation finishes.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {string} region The GCP region ID
 * @param {Operation} operationBody The operation body received from a operation
 * @returns {*} The API result data
 */
async function waitOperation(client, project, region, operationBody) {
  return new Promise((resolve, reject) => {
    checkOperation(resolve, reject, client, project, region, operationBody).catch(reject);
  });
}
// #endregion Utils

// #region Operations
/**
 * Get the topic configuration.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {string} region The GCP region ID
 * @param {string} name The name of the Redis intance
 * @returns {*} The API result data
 */
async function getInstance(client, project, region, name) {
  const url = `projects/${project}/locations/${region}/instances/${name}`;
  console.log(`Check existence of ${url}...`);

  let res;
  try {
    res = await client.request({
      method: 'GET',
      url: `${apiUrl}/${url}`,
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (error) {
    if (error.code === 404) return null;
    console.error(JSON.stringify(error.response.data));
    throw error;
  }

  return res && res.data;
}

/**
 * Create a new instance of Redis service (Cloud Memorystore)
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {string} region The GCP region ID
 * @param {string} name The name of the Redis intance
 * @param {string} displayName Friendly name of the resource
 * @param {string} tier The service tier
 * @param {number} memorySize Redis memory size in GiB
 * @param {string} network Authorized network
 * @param {string} connectMode Connection mode
 * @param {string} zone Instance zone
 * @param {string} alternativeZone Alternative zone (in case of failures)
 * @param {string} ipRange Reserved IP Range
 * @param {string} version Redis version
 * @param {object} redisConfigs Redis configuration
 * @param {object[]} labels GCP resource labels
 * @returns {*} The API result data
 */
async function createInstance(
  client, project, region, name, displayName, tier, memorySize, network,
  connectMode, zone, alternativeZone, ipRange, version, redisConfigs, labels,
) {
  const url = `projects/${project}/locations/${region}/instances`;
  console.log(`Creating Redis ${url}/${name}...`);

  const requestBody = {
    tier,
    name: `${url}/${name}`,
    authorizedNetwork: network,
    connectMode,
    displayName,
    labels,
    locationId: zone,
    alternativeLocationId: alternativeZone,
    memorySizeGb: memorySize,
    redisConfigs,
    redisVersion: version,
    reservedIpRange: ipRange,
  };

  let res;
  try {
    res = await client.request({
      method: 'POST',
      url: `${apiUrl}/${url}?instanceId=${name}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    const result = error.response.data;
    console.error(JSON.stringify(result));
    throw error;
  }

  return checkResultAndGetData(res);
}

/**
 * Update the existing instance of Redis service (Cloud Memorystore)
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {string} region The GCP region ID
 * @param {string} name The name of the Redis intance
 * @param {string} displayName Friendly name of the resource
 * @param {string} tier The service tier
 * @param {number} memorySize Redis memory size in GiB
 * @param {string} network Authorized network
 * @param {string} connectMode Connection mode
 * @param {string} zone Instance zone
 * @param {string} alternativeZone Alternative zone (in case of failures)
 * @param {string} ipRange Reserved IP Range
 * @param {string} version Redis version
 * @param {object} redisConfigs Redis configuration
 * @param {object[]} labels GCP resource labels
 * @param {object} currentInstance The current instance metadata
 * @returns {*} The API result data
 */
async function updateInstance(
  client, project, region, name, displayName, tier, memorySize, network,
  connectMode, zone, alternativeZone, ipRange, version, redisConfigs, labels,
  currentInstance,
) {
  const url = `projects/${project}/locations/${region}/instances/${name}`;
  console.log(`Updating Redis ${url}`);

  // New
  const requestBody = {
    tier,
    name: `${url}/${name}`,
    authorizedNetwork: network,
    connectMode,
    displayName,
    labels,
    locationId: zone,
    alternativeLocationId: alternativeZone,
    memorySizeGb: memorySize,
    redisConfigs,
    redisVersion: version,
    reservedIpRange: ipRange,
  };

  // Get only the differences, including new props
  const diff = deepDiff(currentInstance, requestBody, true);
  taskLib.debug(`Changed or new properties of the existing instance are: ${propertiesToArray(diff).join(',')}`);
  taskLib.debug(JSON.stringify(diff));

  // Nothing changed
  if (!diff) {
    console.log('Nothing was changed in the instance.');
    return checkResultAndGetData({
      status: 200,
      data: requestBody,
    });
  }

  // Get only changed props
  const changedProps = deepDiff(currentInstance, requestBody) || {};
  const updateMask = propertiesToArray(changedProps).join(',');
  const qsMask = encodeURIComponent(updateMask);
  taskLib.debug(`Changed attributes are: ${updateMask}`);

  // Update
  let res;
  try {
    res = await client.request({
      method: 'PATCH',
      url: `${apiUrl}/${url}?updateMask=${qsMask}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    const result = error.response.data;

    // Already exists, just show a warning
    if (result.error && result.error.code === 409) {
      console.log(`[!] The instance ${url} already exists.`);
      return {
        data: {
          ...requestBody,
          name: url,
        },
        id: 1,
      };
    }

    console.error(JSON.stringify(result));
    throw error;
  }

  return checkResultAndGetData(res);
}

/**
 * Delete the instance.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {string} region The GCP region ID
 * @param {string} name The name of the Redis intance
 * @returns {*} The API result data
 */
async function deleteInstance(client, project, region, name) {
  const url = `projects/${project}/locations/${region}/instances/${name}`;
  console.log(`Deleting Redis ${url}...`);

  let res;
  try {
    res = await client.request({
      method: 'DELETE',
      url: `${apiUrl}/${url}`,
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (error) {
    console.error(JSON.stringify(error.response.data));
    throw error;
  }

  return checkResultAndGetData(res);
}

/**
 * Initiates a failover of the master node to current replica node for a specific STANDARD tier.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {string} region The GCP region ID
 * @param {string} name The name of the Redis intance
 * @param {('LIMITED_DATA_LOSS'|'FORCE_DATA_LOSS'))} mode Available data protection mode
 * @returns {*} The API result data
 */
async function failover(client, project, region, name, mode) {
  const url = `projects/${project}/locations/${region}/instances/${name}`;
  console.log(`Failover the ${url} to ${mode}...`);

  const requestBody = {
    dataProtectionMode: mode,
  };

  let res;
  try {
    res = await client.request({
      method: 'POST',
      url: `${apiUrl}/${url}:failover`,
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

  return checkResultAndGetData(res);
}

/**
 * Initiates a failover of the master node to current replica node for a specific STANDARD tier.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {string} region The GCP region ID
 * @param {string} name The name of the Redis intance
 * @param {string} version Specifies the target version of Redis software to upgrade to
 * @returns {*} The API result data
 */
async function upgrade(client, project, region, name, version) {
  const url = `projects/${project}/locations/${region}/instances/${name}`;
  console.log(`Upgrade ${url} to version ${version}...`);

  const requestBody = {
    redisVersion: version,
  };

  let res;
  try {
    res = await client.request({
      method: 'POST',
      url: `${apiUrl}/${url}:upgrade`,
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

  return checkResultAndGetData(res);
}
// #endregion Operations

/**
 * Main function
 *
 */
async function main() {
  let taskSuccess = false;

  try {
    /**
     * @type {Operation}
     */
    let result;

    // Get authentication
    const auth = await getAuthenticatedClient([]);

    // Check operation and get the name
    const op = taskLib.getInput('operation', true);
    const region = taskLib.getInput('gcpRegion', true);
    const name = taskLib.getInput('instanceName', true);

    switch (op) {
      case 'create': {
        const labels = taskLib.getInput('gcpLabels', false) || '';
        const displayName = taskLib.getInput('instanceDisplayName', false) || '';
        const tier = taskLib.getInput('instanceTier', true);
        const memorySize = getNumberInput('instanceMemorySize', true);
        const network = taskLib.getInput('instanceNetwork', false) || '';
        const connectMode = taskLib.getInput('instanceConnectMode', false) || 'DIRECT_PEERING';
        const zone = taskLib.getInput('instanceZone', false) || '';
        const alternativeZone = taskLib.getInput('instanceAlternativeZone', false) || '';
        const ipRange = taskLib.getInput('instanceIpRange', false) || '';

        // Redis config
        const version = taskLib.getInput('redisVersion', true);
        const redisConfig = {
          'maxmemory-policy': taskLib.getInput('redisMaxMemoryPolicy', false) || 'noeviction',
          'notify-keyspace-events': taskLib.getInput('redisNotifyEvents', false) || '',
          activedefrag: taskLib.getBoolInput('redisActiveDefrag', false) || false,
          'lfu-decay-time': getNumberInput('redisLfuDecayTime', false) || 1,
          'lfu-log-factor': getNumberInput('redisLfuLogFactor', false) || 10,
          'stream-node-max-bytes': getNumberInput('redisStreamMaxBytes', false) || 4096,
          'stream-node-max-entries': getNumberInput('redisStreamMaxEntries', false) || 100,
        };

        // Transform in arrays
        const arrLabels = parseListInput(labels);

        // Check if the function already exists
        const instance = await getInstance(auth.client, auth.projectId, region, name);

        if (instance) {
          console.log('Function already exists.');
          result = await updateInstance(
            auth.client, auth.projectId, region, name, displayName,
            tier, memorySize, network, connectMode, zone, alternativeZone,
            ipRange, version, redisConfig, arrLabels, instance,
          );
        } else {
          result = await createInstance(
            auth.client, auth.projectId, region, name, displayName,
            tier, memorySize, network, connectMode, zone, alternativeZone,
            ipRange, version, redisConfig, arrLabels,
          );
        }
        break;
      }

      case 'delete': {
        result = await deleteInstance(auth.client, auth.projectId, region, name);
        break;
      }

      case 'failover': {
        const mode = taskLib.getInput('instanceDataProtectionMode', true);
        result = await failover(auth.client, auth.projectId, region, name, mode);
        break;
      }

      case 'upgrade': {
        const version = taskLib.getInput('redisVersion', true);
        result = await upgrade(auth.client, auth.projectId, region, name, version);
        break;
      }

      default:
        break;
    }

    // Check if we should wait for operation ends
    const shouldWait = taskLib.getBoolInput('waitOperation', false) || false;

    if (shouldWait) {
      const finalResult = await waitOperation(auth.client, auth.projectId, region, result);
      taskSuccess = true;

      if (typeof finalResult.port === 'number' && typeof finalResult.host === 'string') {
        taskLib.setVariable('RedisHost', finalResult.host);
        taskLib.setVariable('RedisPort', finalResult.port);
        taskLib.setVariable('RedisCurrentLocation', finalResult.currentLocationId);
      }
    } else {
      taskSuccess = result && result.metadata && result.metadata.createTime;
    }
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
