/* eslint-disable no-console */
import * as taskLib from 'azure-pipelines-task-lib/task';
// eslint-disable-next-line no-unused-vars
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import SecureFileHelpers from 'securefiles-babel';
import deepDiff from 'return-deep-diff';

const apiUrl = 'https://pubsub.googleapis.com/v1';
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
          secureFilePath = await secureFileHelpers.downloadSecureFile(secureFileId, downloadPath, ticket, project);
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
// #endregion Utils

// #region Operations
/**
 * Get the topic configuration.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP project where managed zone is
 * @param {string} name The name of the PubSub topic
 * @returns {*} The API result data
 */
async function getTopic(client, project, name) {
  const url = `projects/${project}/topics/${name}`;
  console.log(`Check existence of ${url}`);

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
    if (error.status === 404) return null;
    console.error(JSON.stringify(error.response.data));
    throw error;
  }

  return checkResultAndGetData(res);
}

/**
 * Create a new PubSub topic
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP project where managed zone is
 * @param {string} name The name of the PubSub topic
 * @param {string[]} [persistenceRegions=[]] A list of regions where messages may be persisted
 * @param {object} [labels={}] A list of resource labels
 * @param {string} [kmsKeyName=null] CryptoKey to be used to protect access to messages published
 * @returns {*} The API result data
 */
async function createTopic(
  client, project, name, persistenceRegions = [], labels = {}, kmsKeyName = null,
) {
  const url = `projects/${project}/topics/${name}`;
  console.log(`Creating topic ${url}`);

  const requestBody = {
    labels,
    kmsKeyName,
    messageStoragePolicy: {
      allowedPersistenceRegions: persistenceRegions,
    },
  };

  let res;
  try {
    res = await client.request({
      method: 'PUT',
      url: `${apiUrl}/${url}`,
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
      console.log(`[!] The topic ${url} already exists.`);
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
 * Update existing PubSub topic
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP project where managed zone is
 * @param {string} name The name of the PubSub topic
 * @param {Object} currentProperties The current properties to compare with the changed values
 * @param {string[]} [persistenceRegions=[]] A list of regions where messages may be persisted
 * @param {object} [labels={}] A list of resource labels
 * @param {string} [kmsKeyName=null] The CryptoKey to be used to protect access to messages published
 * @returns {*} The API result data
 */
async function updateTopic(
  client, project, name, currentProperties, persistenceRegions = [], labels = {}, kmsKeyName = null,
) {
  const url = `projects/${project}/topics/${name}`;
  console.log(`Updating topic ${url}`);

  // New
  const requestBody = {
    labels,
    kmsKeyName,
    messageStoragePolicy: {
      allowedPersistenceRegions: persistenceRegions,
    },
  };

  // Get only the differences, including new props
  const diff = deepDiff(currentProperties, requestBody, true);
  taskLib.debug(`Changed or new properties of the existing function are: ${propertiesToArray(diff).join(',')}`);
  taskLib.debug(JSON.stringify(diff));

  // Nothing changed
  if (!diff) {
    console.log('Nothing was changed in the function.');
    return checkResultAndGetData({
      status: 200,
      data: requestBody,
    });
  }

  // Get only changed props
  const changedProps = deepDiff(currentProperties, requestBody) || {};
  const updateMask = propertiesToArray(changedProps).join(',');
  taskLib.debug(`Changed attributes are: ${updateMask}`);

  // Update
  let res;
  try {
    res = await client.request({
      method: 'PATCH',
      url: `${apiUrl}/${url}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: requestBody,
        updateMask,
      }),
    });
  } catch (error) {
    const result = error.response.data;

    // Already exists, just show a warning
    if (result.error && result.error.code === 409) {
      console.log(`[!] The topic ${url} already exists.`);
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
 * Delete the topic.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP project where managed zone is
 * @param {string} name The name of the PubSub topic
 * @returns {*} The API result data
 */
async function deleteTopic(client, project, name) {
  const url = `projects/${project}/topics/${name}`;
  console.log(`Deleting topic ${url}`);

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
 * Publish message to the topic.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP project where managed zone is
 * @param {string} name The name of the PubSub topic
 * @param {string} message The message data
 * @param {object} attributes Key-value of attributes for this message
 * @returns {*} The API result data
 */
async function publishMessage(client, project, name, message, attributes) {
  const url = `projects/${project}/topics/${name}`;
  console.log(`Publishing message to the topic ${url}`);

  const requestBody = {
    messages: [{
      data: Buffer.from(message).toString('base64'),
      attributes,
    }],
  };

  let res;
  try {
    res = await client.request({
      method: 'POST',
      url: `${apiUrl}/${url}:publish`,
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
 * Main function
 *
 */
async function main() {
  let taskSuccess = false;

  try {
    // Get authentication
    const auth = await getAuthenticatedClient([
      'https://www.googleapis.com/auth/pubsub',
    ]);

    // Check operation and get the name
    const op = taskLib.getInput('operation', false);
    const name = taskLib.getInput('topicName', true);

    switch (op) {
      case 'create': {
        const persistenceRegions = taskLib.getInput('recordType', false) || '';
        const kmsKeyName = taskLib.getInput('topicKmsKey', false) || '';
        const labels = taskLib.getInput('gcpLabels', false) || '';

        // Transform in arrays
        const arrRegions = persistenceRegions.split(',');
        const arrLabels = parseListInput(labels);

        // Check if the function already exists
        let result;
        const topic = await getTopic(auth.client, auth.projectId, name);

        if (topic) {
          console.log('Function already exists.');
          result = await updateTopic(
            auth.client, auth.projectId, name, arrRegions, arrLabels, kmsKeyName, topic,
          );
        } else {
          result = await createTopic(
            auth.client, auth.projectId, name, arrRegions, arrLabels, kmsKeyName,
          );
        }

        taskSuccess = result && result.name;
        break;
      }

      case 'delete': {
        await deleteTopic(auth.client, auth.projectId, name);
        taskSuccess = true;
        break;
      }

      case 'publish': {
        const message = taskLib.getInput('messageData', true);
        const result = await publishMessage(auth.client, auth.projectId, name, message);
        taskSuccess = result.messageIds.length > 0;
        break;
      }

      default:
        break;
    }

    taskLib.setVariable('PubSubTopic', `projects/${auth.projectId}/topics/${name}`);
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
