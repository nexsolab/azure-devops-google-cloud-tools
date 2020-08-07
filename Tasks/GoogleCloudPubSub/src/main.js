/* eslint-disable no-console */
import * as taskLib from 'azure-pipelines-task-lib/task';
// eslint-disable-next-line no-unused-vars
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import SecureFileHelpers from 'securefiles-babel';
import deepDiff from 'return-deep-diff';

const apiUrl = 'https://pubsub.googleapis.com/v1';
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
// #endregion Utils

// #region Topic Operations
/**
 * Get the topic configuration.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP project where managed zone is
 * @param {string} name The PubSub topic name
 * @returns {*} The API result data
 */
async function getTopic(client, project, name) {
  const url = `projects/${project}/topics/${name}`;
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

  return checkResultAndGetData(res);
}

/**
 * Create a new PubSub topic
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP project where managed zone is
 * @param {string} name The PubSub topic name
 * @param {string[]} [persistenceRegions=[]] A list of regions where messages may be persisted
 * @param {object} [labels={}] A list of resource labels
 * @param {string} [kmsKeyName=null] CryptoKey to be used to protect access to messages published
 * @returns {*} The API result data
 */
async function createTopic(
  client, project, name, persistenceRegions = [], labels = {}, kmsKeyName = null,
) {
  const url = `projects/${project}/topics/${name}`;
  console.log(`Creating topic ${url}...`);

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
 * @param {string} name The PubSub topic name
 * @param {Object} currentProperties The current properties to compare with the changed values
 * @param {string[]} [persistenceRegions=[]] A list of regions where messages may be persisted
 * @param {object} [labels={}] A list of resource labels
 * @param {string} [kmsKeyName=null] The CryptoKey to protect access to messages published
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
 * @param {string} name The PubSub topic name
 * @returns {*} The API result data
 */
async function deleteTopic(client, project, name) {
  const url = `projects/${project}/topics/${name}`;
  console.log(`Deleting topic ${url}...`);

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
 * @param {string} name The PubSub topic name
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
// #endregion Topic Operations

// #region Subscription Operations
/**
 * Auto-detect the best mechanism based in the criterias.
 *
 * @author Gabriel Anderson
 * @param {boolean} largeVolume Large volume of messages
 * @param {boolean} criticalThroughput Efficiency and throughput of message processing is critical
 * @param {boolean} processMultipleTopics Multiple topics that must be processed by the same webhook
 * @param {boolean} serverless App Engine Standard and Cloud Functions subscribers
 * @param {('pull'|'push')} publicAccess Whether the resource can be accessed publicly (push)
 * @param {('pull'|'push')} flowControl Flow control
 * @returns {('pull'|'push')} Detected mechanism: `pull` or `push`
 */
function detectMechanism(
  largeVolume, criticalThroughput, processMultipleTopics, serverless, publicAccess, flowControl,
) {
  console.log('Auto detecting the mechanism...');
  const pull = [largeVolume, criticalThroughput, flowControl === 'pull'].filter((p) => p);
  const push = [processMultipleTopics, serverless, flowControl === 'push'].filter((p) => p);

  // If the endpoint doesn't have public access, only usefull mechanism is 'pull'.
  if (publicAccess === 'pull') {
    console.log(`Public HTTPS endpoint, with non-self-signed SSL certificate, is not feasible to set up.
So 'pull' should be used.`);
    return 'pull';
  }

  const result = push.length > pull.length ? 'push' : 'pull';
  console.log(`The chosen mechanism is '${result}'`);
  return result;
}

/**
 * @typedef {object} PushConfig
 * @property {object[]} attributes
 * @property {string} audience
 * @property {string} serviceAccountEmail
 * @property {string} endpointUrl
 */

/**
 * Create a request body for subscribe and update operations.
 *
 * @author Gabriel Anderson
 * @param {string} topic The PubSub topic name
 * @param {number} ackDeadlineSeconds Seconds to wait for the subscriber to acknowledge
 * @param {string} vpcSC VPC Service Control
 * @param {string} filter An expression written in the Pub/Sub filter language
 * @param {('pull'|'push')} mechanism The way where messages are delivered
 * @param {PushConfig} pushConfig Configuration of push delivery (if if was used) or {} for `pull`
 * @param {number} expirationTtl Specifies the conditions for this subscription's expiration
 * @param {boolean} retainAcked Whether to retain acknowledged messages
 * @param {number} retentionDuration How long to retain unacknowledged messages in the backlog
 * @param {boolean} deadLetter A policy that specifies the conditions for dead lettering messages
 * @param {string} deadLetterTopic The topic to which dead letter messages should be published
 * @param {number} deadLetterAttempts The maximum number of delivery attempts for any message
 * @param {number} retryMinBackoff The minimum delay between consecutive deliveries
 * @param {number} retryMaxBackoff The maximum delay between consecutive deliveries
 * @returns {*} The API result data.
 */
function getCreateResquestBody(
  topic, ackDeadlineSeconds, vpcSC, filter, mechanism, pushConfig, expires, expirationTtl,
  retainAcked, retentionDuration, deadLetter, deadLetterTopic, deadLetterAttempts,
  retryMinBackoff, retryMaxBackoff, enableMessageOrdering, labels,
) {
  const requestBody = {
    topic,
    ackDeadlineSeconds,
    filter,
    enableMessageOrdering,
    retryPolicy: {
      minimumBackoff: `${retryMinBackoff}s`,
      maximumBackoff: `${retryMaxBackoff}s`,
    },
    labels,
  };

  // Expiration Policy
  if (expires) {
    requestBody.expirationPolicy = {
      ttl: `${expirationTtl}s`,
    };
  } else {
    // By default, Google specifies 31 days, so set 0 disable the expiration.
    requestBody.expirationPolicy = {
      ttl: 'never',
    };
  }

  // Retain Policy
  if (retainAcked) {
    requestBody.retainAckedMessages = true;
    requestBody.messageRetentionDuration = `${retentionDuration}s`;
  }

  // Push Config
  if (mechanism === 'push') {
    requestBody.pushConfig = {
      attributes: pushConfig.attributes,
      oidcToken: {
        audience: pushConfig.audience,
        serviceAccountEmail: pushConfig.serviceAccountEmail,
      },
      pushEndpoint: pushConfig.endpointUrl,
    };
  } else {
    // Pull mechanism
    requestBody.pushConfig = {};
  }

  // Dead Letter Policy
  if (deadLetter) {
    requestBody.deadLetterPolicy = {
      deadLetterTopic,
      maxDeliveryAttempts: deadLetterAttempts,
    };
  }

  return requestBody;
}

/**
 * Create a topic subscription.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project Full project identification
 * @param {string} name The PubSub topic name
 * @param {string} subName The PubSub subscription name
 * @param {number} ackDeadlineSeconds Seconds to wait for the subscriber to acknowledge
 * @param {string} vpcSC VPC Service Control
 * @param {string} filter An expression written in the Pub/Sub filter language
 * @param {('pull'|'push')} mechanism The way where messages are delivered
 * @param {PushConfig} pushConfig Configuration of push delivery (if if was used) or {} for `pull`
 * @param {number} expirationTtl Specifies the conditions for this subscription's expiration
 * @param {boolean} retainAcked Whether to retain acknowledged messages
 * @param {number} retentionDuration How long to retain unacknowledged messages in the backlog
 * @param {boolean} deadLetter A policy that specifies the conditions for dead lettering messages
 * @param {string} deadLetterTopic The topic to which dead letter messages should be published
 * @param {number} deadLetterAttempts The maximum number of delivery attempts for any message
 * @param {number} retryMinBackoff The minimum delay between consecutive deliveries
 * @param {number} retryMaxBackoff The maximum delay between consecutive deliveries
 * @param {boolean} enableMessageOrdering Messages will be delivered to the subscribers in the order
 *  in which they are received
 * @param {object[]} labels GCP resource labels
 * @returns {*} The API result data.
 */
async function subscribe(
  client, project, name, subName, ackDeadlineSeconds, vpcSC, filter, mechanism, pushConfig, expires,
  expirationTtl, retainAcked, retentionDuration, deadLetter, deadLetterTopic, deadLetterAttempts,
  retryMinBackoff, retryMaxBackoff, enableMessageOrdering, labels,
) {
  const url = `projects/${project}/subscriptions/${subName}`;
  const topic = `projects/${project}/topics/${name}`;
  console.log(`Creating subscription ${url}...`);

  const requestBody = getCreateResquestBody(
    topic, ackDeadlineSeconds, vpcSC, filter, mechanism, pushConfig, expires,
    expirationTtl, retainAcked, retentionDuration, deadLetter, deadLetterTopic, deadLetterAttempts,
    retryMinBackoff, retryMaxBackoff, enableMessageOrdering, labels,
  );

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
 * Gets the configuration details of a subscription.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project Full project identification
 * @param {string} subName The PubSub subscription name
 * @returns {*} The API result data.
 */
async function getSubscription(client, project, subName) {
  const url = `projects/${project}/subscriptions/${subName}`;
  console.log(`Checking if subscription ${url} exists...`);

  let res;
  try {
    res = await client.request({
      method: 'GET',
      url: `${apiUrl}/${url}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
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
 * Create a topic subscription.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project Full project identification
 * @param {string} name The PubSub topic name
 * @param {string} subName The PubSub subscription name
 * @param {number} ackDeadlineSeconds Seconds to wait for the subscriber to acknowledge
 * @param {string} vpcSC VPC Service Control
 * @param {string} filter An expression written in the Pub/Sub filter language
 * @param {('pull'|'push')} mechanism The way where messages are delivered
 * @param {PushConfig} pushConfig Configuration of push delivery (if if was used) or {} for `pull`
 * @param {number} expirationTtl Specifies the conditions for this subscription's expiration
 * @param {boolean} retainAcked Whether to retain acknowledged messages
 * @param {number} retentionDuration How long to retain unacknowledged messages in the backlog
 * @param {boolean} deadLetter A policy that specifies the conditions for dead lettering messages
 * @param {string} deadLetterTopic The topic to which dead letter messages should be published
 * @param {number} deadLetterAttempts The maximum number of delivery attempts for any message
 * @param {number} retryMinBackoff The minimum delay between consecutive deliveries
 * @param {number} retryMaxBackoff The maximum delay between consecutive deliveries
 * @param {boolean} enableMessageOrdering Messages will be delivered to the subscribers in the order
 *  in which they are received
 * @param {object[]} labels GCP resource labels
 * @param {object} currentProperties The current subscription configuration
 * @returns {*} The API result data.
 */
async function updateSubscription(
  client, project, name, subName, ackDeadlineSeconds, vpcSC, filter, mechanism, pushConfig, expires,
  expirationTtl, retainAcked, retentionDuration, deadLetter, deadLetterTopic, deadLetterAttempts,
  retryMinBackoff, retryMaxBackoff, enableMessageOrdering, labels, currentProperties,
) {
  const url = `projects/${project}/subscriptions/${subName}`;
  const topic = `projects/${project}/topics/${name}`;
  console.log(`Updating subscription ${url} ...`);

  const requestBody = getCreateResquestBody(
    topic, ackDeadlineSeconds, vpcSC, filter, mechanism, pushConfig, expires,
    expirationTtl, retainAcked, retentionDuration, deadLetter, deadLetterTopic, deadLetterAttempts,
    retryMinBackoff, retryMaxBackoff, enableMessageOrdering, labels,
  );

  // Names can be updated
  delete requestBody.name;

  // Get only the differences, including new props
  const diff = deepDiff(currentProperties, requestBody, true);
  taskLib.debug(`Changed or new properties of the existing subscription are: ${propertiesToArray(diff).join(',')}`);
  taskLib.debug(JSON.stringify(diff));

  // Nothing changed
  if (!diff) {
    console.log('Nothing was changed in the subscription.');
    return checkResultAndGetData({
      status: 200,
      data: currentProperties,
    });
  }

  // Get only changed props
  const changedProps = deepDiff(currentProperties, requestBody) || {};
  const updateMask = propertiesToArray(changedProps).join(',');
  taskLib.debug(`Changed attributes are: ${updateMask}`);

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
        subscription: requestBody,
        updateMask,
      }),
    });
  } catch (error) {
    const result = error.response.data;
    console.error(JSON.stringify(result));
    throw error;
  }

  return checkResultAndGetData(res);
}

/**
 * Delete the subscription to the given topic.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project Full project identification
 * @param {string} subName The PubSub subscription name
 * @returns {*} The API result data.
 */
async function deleteSubscription(client, project, subName) {
  const url = `projects/${project}/subscriptions/${subName}`;
  console.log(`Deleting subscription ${url}...`);

  let res;
  try {
    res = await client.request({
      method: 'DELETE',
      url: `${apiUrl}/${url}`,
    });
  } catch (error) {
    const result = error.response.data;
    console.error(JSON.stringify(result));
    throw error;
  }

  return checkResultAndGetData(res);
}

/**
 * Pauses pull subscription to a topic.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project Full project identification
 * @param {string} subName The PubSub subscription name
 * @returns {*} The API result data.
 */
async function pauseSubscription(client, project, subName) {
  const url = `projects/${project}/subscriptions/${subName}`;
  console.log(`Pausing subscription ${subName}...`);

  let res;
  try {
    res = await client.request({
      method: 'POST',
      url: `${apiUrl}/${url}:modifyPushConfig`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pushConfig: {} }),
    });
  } catch (error) {
    const result = error.response.data;
    console.error(JSON.stringify(result));
    throw error;
  }

  return checkResultAndGetData(res);
}

/**
 * Get a list of messages from given topic.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project Full project identification
 * @param {string} subName The PubSub subscription name
 * @param {number} maxMessages Maximum number of messages to retrieve
 * @returns {*} The API result data.
 */
async function pullMessages(client, project, subName, maxMessages) {
  const url = `projects/${project}/subscriptions/${subName}`;
  console.log(`Pulling messages using subscription ${url}...`);

  let res;
  try {
    res = await client.request({
      method: 'POST',
      url: `${apiUrl}/${url}:pull`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        maxMessages,
        returnImmediately: false,
      }),
    });
  } catch (error) {
    const result = error.response.data;
    console.error(JSON.stringify(result));
    throw error;
  }

  return checkResultAndGetData(res);
}

// #endregion Subscription Operations

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

    switch (op) {
      case 'create': {
        const name = taskLib.getInput('topicName', true);
        const persistenceRegions = taskLib.getInput('topicPersistenceRegions', false) || '';
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
        if (taskSuccess) taskLib.setVariable('PubSubTopic', `projects/${auth.projectId}/topics/${name}`);
        break;
      }

      case 'delete': {
        const name = taskLib.getInput('topicName', true);
        await deleteTopic(auth.client, auth.projectId, name);
        taskSuccess = true;
        if (taskSuccess) taskLib.setVariable('PubSubTopic', `projects/${auth.projectId}/topics/${name}`);
        break;
      }

      case 'publish': {
        const name = taskLib.getInput('topicName', true);
        const message = taskLib.getInput('messageData', true);
        const result = await publishMessage(auth.client, auth.projectId, name, message);
        taskSuccess = result.messageIds.length > 0;
        taskLib.setVariable('PubSubTopic', `projects/${auth.projectId}/topics/${name}`);
        break;
      }

      case 'subscribe': {
        const name = taskLib.getInput('topicName', true);
        const subName = taskLib.getInput('subName', true);
        const ackDeadlineSeconds = getNumberInput('subAckDeadlineSeconds', false) || 10;
        const vpcSC = taskLib.getBoolInput('subVpcSC', false) || false;
        const filter = taskLib.getInput('subFilter', false) || '';
        const enableMessageOrdering = taskLib.getBoolInput('subMessageOrdering', false) || false;
        const labels = taskLib.getInput('gcpLabels', false) || '';
        const arrLabels = parseListInput(labels);
        let mechanism = taskLib.getInput('subMechanism', false) || 'pull';

        if (mechanism === 'auto') {
          const largeVolume = taskLib.getBoolInput('subAutoLargeVolume', false) || false;
          const criticalThroughput = taskLib.getBoolInput('subAutoThroughput', false) || false;
          const processMultipleTopics = taskLib.getBoolInput('subAutoMultiple', false) || false;
          const serverless = taskLib.getBoolInput('subAutoServerless', false) || false;
          const publicAccess = taskLib.getInput('subAutoPublic', false) || 'pull';
          const flowControl = taskLib.getInput('subAutoFlowControl', false) || 'pull';

          mechanism = detectMechanism(
            largeVolume, criticalThroughput, processMultipleTopics, serverless, publicAccess,
            flowControl,
          );
        }

        // Push Config
        let pushConfig = {};

        if (mechanism === 'push') {
          const pushEndpoint = taskLib.getInput('subPushEndpoint', true);
          const pushAuth = taskLib.getBoolInput('subPushAuth', false) || true;
          const pushServiceAccountEmail = taskLib.getInput('subPushServiceAccountEmail', false) || '';
          const pushAudience = taskLib.getInput('subPushAudience', false) || '';
          const pushAttributesValue = taskLib.getInput('subPushAttributes', false) || '';
          const pushAttributes = parseListInput(pushAttributesValue);

          pushConfig = {
            pushEndpoint,
            pushAuth,
            pushServiceAccountEmail,
            pushAudience,
            pushAttributes,
          };
        }

        // Retain Policy
        const retainAcked = taskLib.getBoolInput('subRetainAcked', false) || false;
        const retentionDurationValue = getNumberInput('subMessageRetentionDuration', retainAcked) || 7;
        const retentionDurationUnit = taskLib.getInput('subMessageRetentionDurationUnit', retainAcked) || 'd';
        const retentionDuration = retentionDurationUnit === 'd' ? retentionDurationValue * 24 * 60 * 60 : retentionDurationValue * 60;

        // Expiration Policy
        const expires = taskLib.getBoolInput('subExpires', false) || true;
        const expirationTtlValue = getNumberInput('subExpirationTtl', expires) || 31;
        const expirationTtl = expirationTtlValue * 24 * 60 * 60;

        // Dead Letter
        const deadLetter = taskLib.getBoolInput('subDeadLetter', false) || false;
        const deadLetterTopic = taskLib.getInput('subDeadLetterTopic', deadLetter) || '';
        const deadLetterAttempts = getNumberInput('subDeadLetterAttempts', deadLetter) || 5;

        // Retry Policy
        const retryMinBackoff = getNumberInput('subRetryMinBackoff', false) || 10;
        const retryMaxBackoff = getNumberInput('subRetryMaxBackoff', false) || 600;

        // Check if subscription already exists
        let subscription = null;
        try {
          subscription = await getSubscription(auth.client, auth.projectId, subName);
        } catch (error) {
          taskLib.debug(`Erro while checking existence of subscription: ${error.message}`);
        }

        let result;
        if (subscription) {
          // Update
          result = await updateSubscription(
            auth.client, auth.projectId, name, subName, ackDeadlineSeconds, vpcSC, filter,
            mechanism, pushConfig, expires, expirationTtl, retainAcked, retentionDuration,
            deadLetter, deadLetterTopic, deadLetterAttempts, retryMinBackoff, retryMaxBackoff,
            enableMessageOrdering, arrLabels, subscription,
          );
        } else {
          // Create
          result = await subscribe(
            auth.client, auth.projectId, name, subName, ackDeadlineSeconds, vpcSC, filter,
            mechanism, pushConfig, expires, expirationTtl, retainAcked, retentionDuration,
            deadLetter, deadLetterTopic, deadLetterAttempts, retryMinBackoff, retryMaxBackoff,
            enableMessageOrdering, arrLabels,
          );
        }

        taskSuccess = !!result.name;

        if (taskSuccess) {
          console.log(`Subscription ${result.name} created!`);
          taskLib.setVariable('SubscriptionName', result.name);
        }
        break;
      }

      case 'delsub': {
        const subName = taskLib.getInput('subName', true);
        await deleteSubscription(auth.client, auth.projectId, subName);
        taskSuccess = true;
        taskLib.setVariable('SubscriptionName', `projects/${auth.projectId}/subscriptions/${subName}`);
        break;
      }

      case 'pause': {
        const subName = taskLib.getInput('subName', true);
        await pauseSubscription(auth.client, auth.projectId, subName);
        console.log(`Subscription ${subName} will no longer receive new messages`);
        taskSuccess = true;
        taskLib.setVariable('SubscriptionName', `projects/${auth.projectId}/subscriptions/${subName}`);
        break;
      }

      case 'pull': {
        const subName = taskLib.getInput('subName', true);
        const maxMessages = getNumberInput('subMaxMessages', false) || 0;
        const result = await pullMessages(auth.client, auth.projectId, subName, maxMessages);
        taskSuccess = Array.isArray(result.receivedMessages);

        if (taskSuccess) {
          const sub = `projects/${auth.projectId}/subscriptions/${subName}`;
          const plural = result.receivedMessages.length > 1 ? 's' : '';
          console.log(`Found ${result.receivedMessages.length} message${plural} from ${sub}`);
          taskLib.setVariable('PubSubMessages', JSON.stringify(result.receivedMessages));
        }
        taskLib.setVariable('SubscriptionName', `projects/${auth.projectId}/subscriptions/${subName}`);
        break;
      }

      default:
        break;
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
