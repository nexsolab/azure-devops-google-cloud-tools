/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import * as taskLib from 'azure-pipelines-task-lib/task';
// eslint-disable-next-line no-unused-vars
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import SecureFileHelpers from 'securefiles-babel';
import deepDiff from 'return-deep-diff';

const apiUrl = 'https://appengine.googleapis.com/v1';
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
        taskLib.debug(JSON.stringify(authSc, null, 2));
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
    taskLib.debug(JSON.stringify(error, null, 2));
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
  }, null, 2));

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
 * @param {string} operation The operation ID
 * @returns {Operation} The API result data
 */
async function getOperation(client, project, operation) {
  const url = operation;
  console.log('Checking operation status...');

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

  taskLib.debug('Response of operation was:');
  taskLib.debug(JSON.stringify(res));

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
 * @param {Operation} operationBody The operation name
 */
async function checkOperation(resolve, reject, client, project, operationBody) {
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
      tries += 1;
      result = await getOperation(client, project, operation);
    } catch (error) {
      // just update errors count
      errors += 1;
    }
  }

  // Too many errors
  if (errors >= 3) {
    reject('Too many errors.');
    return;
  }

  // Too many errors
  if (tries > 30) {
    reject('Too many attempts.');
    return;
  }

  if (result && result.done) {
    console.log('Provisioning finished!');
    if (typeof result.response === 'object') {
      resolve(result.response);
    } else {
      reject(result.error);
    }
  } else {
    exponent += 1;
    if (exponent > 5) exponent = 1 * Math.round(tries / 10);

    const seconds = 2 ** exponent;
    const detail = result.metadata && result.metadata.statusDetail;
    console.log(`Status is ${detail}. Trying again in ${seconds} seconds.`);

    setTimeout(async () => {
      await checkOperation(resolve, reject, client, project, operationBody);
    }, seconds * 1000);
  }
}

/**
 * Wait until long running operation finishes.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {Operation} operationBody The operation body received from a operation
 * @returns {*} The API result data
 */
async function waitOperation(client, project, operationBody) {
  return new Promise((resolve, reject) => {
    checkOperation(resolve, reject, client, project, operationBody).catch(reject);
  });
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
 * Download a secure file from Azure DevOps.
 *
 * @param {string} secureFileId The ID of the secure file
 * @returns {string} The path to the downloaded file
 */
async function loadSecureFile(secureFileId) {
  let secureFilePath;
  const filename = taskLib.getSecureFileName(secureFileId);
  const downloadPath = taskLib.resolve(taskLib.getVariable('Agent.TempDirectory'), filename);
  const ticket = taskLib.getSecureFileTicket(secureFileId);
  const project = taskLib.getVariable('SYSTEM.TEAMPROJECT');
  const proxy = taskLib.getHttpProxyConfiguration();
  const collectionUri = taskLib.getVariable('System.TeamFoundationCollectionUri');
  const credential = taskLib.getEndpointAuthorizationParameter('SYSTEMVSSCONNECTION', 'ACCESSTOKEN', false);

  try {
    taskLib.debug(`Downloading secure file "${filename}"...`);
    const secureFileHelpers = new SecureFileHelpers(collectionUri, credential, proxy, 3);
    secureFilePath = await secureFileHelpers.downloadSecureFile(
      secureFileId, downloadPath, ticket, project,
    );
  } catch (error) {
    console.log(`Error while downloading credentials: ${error.message}`);
    throw error;
  }

  taskLib.debug(`Secure file path is ${JSON.stringify(secureFilePath)}`);

  if (!taskLib.exist(secureFilePath)) {
    taskLib.error(`Secure file not founded at ${secureFilePath}`);
    taskLib.setResult(taskLib.TaskResult.Failed);
    return null;
  }

  return secureFilePath;
}

/**
 * Get the contents of the file path.
 *
 * @param {string} filepath Path to the file
 * @returns {string} The contents of the file.
 */
function getFilepathContent(filepath) {
  const files = findMatchingFiles(filepath);

  if (files.length === 0) {
    taskLib.error('No file founded.');
    return taskLib.setResult(taskLib.TaskResult.Failed);
  }

  if (files.length > 1) {
    taskLib.warning('Several files were found, using the first. All others will be discarded');
  }

  console.log(`Found certificate file ${files[0]}`);
  return fs.readFileSync(files[0]);
}

/**
 * Get the contents of a certificate.
 *
 * @param {('certificate'|'certificateKey')} prefix The input group name prefix
 * @returns {string} The contents of the certificate.
 */
async function getCertificateContent(prefix) {
  const source = taskLib.getInput(`${prefix}Source`, true);

  switch (source) {
    case 'raw':
      return taskLib.getInput(`${prefix}Raw`, true);

    case 'path': {
      const filepath = taskLib.getPathInput(`${prefix}Path`, true, false);
      return getFilepathContent(filepath);
    }

    case 'secure': {
      const secureFileId = taskLib.getInput(`${prefix}Secure`, true);
      const filepath = loadSecureFile(secureFileId);
      return getFilepathContent(filepath);
    }

    default:
      return null;
  }
}
// #endregion Utils

// #region AppOperations
/**
 * Get the app configuration
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @returns {*} The API result data
 */
async function getApp(client, project) {
  const url = `apps/${project}`;
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
 * Create (enable) an app in the project.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {string} region The GCP region ID
 * @param {string} servingStatus The status of the app
 * @param {number} cookieExp Time in seconds to expire the cookie
 * @param {string} gcrDomain The Google Container Registry domain used for storing docker images
 * @param {string} authDomain Google Apps authentication domain that controls which users can access
 * @param {string} databaseType The type of the Cloud Firestore or Datastore database associated
 * @param {boolean} optimizedOs Use Container-Optimized OS base image for VMs, instead Debian
 * @param {boolean} iap Serving infrastructure will authenticate and authorize all incoming requests
 * @param {string} clientId OAuth2 client ID to use for the authentication flow
 * @param {string} clientSecret OAuth2 client secret to use for the authentication flow
 * @returns {Operation} The operation metadata.
 */
async function createApp(
  client, project, region, servingStatus, cookieExp, gcrDomain, authDomain, databaseType,
  optimizedOs, iap, clientId, clientSecret,
) {
  const url = 'apps';
  console.log(`Creating app ${project}...`);

  const requestBody = {
    id: project,
    locationId: region,
    servingStatus,
    defaultCookieExpiration: `${cookieExp}s`,
    gcrDomain,
    authDomain,
    databaseType,
    featureSettings: {
      useContainerOptimizedOs: optimizedOs,
    },
    iap: {
      enabled: iap,
      oauth2ClientId: clientId,
      oauth2ClientSecret: clientSecret,
    },
    dispatchRules: [],
  };

  taskLib.debug('Requesting GCP with data:');
  taskLib.debug(JSON.stringify(requestBody, null, 2));

  let res;
  try {
    res = await client.request({
      method: 'POST',
      url: `${apiUrl}/${url}`,
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
 * @param {number} cookieExp Time in seconds to expire the cookie
 * @param {string} authDomain Google Apps authentication domain that controls which users can access
 * @param {object} currentApp The current app metadata
 * @returns {Operation} The operation metadata.
 */
async function updateApp(client, project, cookieExp, authDomain, currentApp) {
  const url = `apps/${project}`;
  console.log(`Updating app ${url}`);

  // New
  const requestBody = {
    defaultCookieExpiration: cookieExp,
    authDomain,
  };

  // Get only the differences, including new props
  const diff = deepDiff(currentApp, requestBody, true);
  taskLib.debug(`Changed or new properties of the existing app are: ${propertiesToArray(diff).join(',')}`);
  taskLib.debug(JSON.stringify(diff, null, 2));

  // Get only changed props
  const changedProps = deepDiff(currentApp, requestBody) || {};
  const updateMask = propertiesToArray(changedProps).join(',');
  const qsMask = encodeURIComponent(updateMask);
  taskLib.debug(`Changed attributes are: ${updateMask}`);

  // Nothing changed
  if (!diff || !updateMask) {
    console.log('Nothing was changed in the app.');
    return checkResultAndGetData({
      status: 200,
      data: {
        name: 'none',
        metadata: {},
        done: true,
      },
    });
  }

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
      console.log(`[!] The app ${url} already exists.`);
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
 * Recreates the required App Engine features for the specified App Engine application.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @returns {Operation} The operation metadata.
 */
async function repairApp(client, project) {
  const url = `apps/${project}`;
  console.log(`Repair app ${url}...`);

  let res;
  try {
    res = await client.request({
      method: 'POST',
      url: `${apiUrl}/${url}:repair`,
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
 * @typedef {object} CertificateMetadata
 * @property {string} name Full path to the AuthorizedCertificate resource in the API
 * @property {string} id Relative name of the certificate
 * @property {string} displayName The user-specified display name of the certificate
 * @property {string[]} domainNames Topmost applicable domains of this certificate
 * @property {string} expireTime The time when this certificate expires
 * @property {object} certificateRawData The SSL certificate serving the resource
 */

/**
 * Upload an SSL certificate that a user has been authorized to administer.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {string} name The user-specified display name of the certificate
 * @param {string} privateKey Unencrypted PEM encoded RSA private key
 * @param {string} publicCertificate PEM encoded x.509 public key certificate
 * @returns {CertificateMetadata} The newly created instance of certificate.
 */
async function createCertificate(client, project, name, privateKey, publicCertificate) {
  const url = `apps/${project}/authorizedCertificates`;
  console.log('Configuring custom SSL certificate...');

  // Check inputs
  const errorMessage = [];
  if (!privateKey.trim().startsWith('-----BEGIN RSA PRIVATE KEY-----')) {
    errorMessage.push('Private key doesn\'t start with -----BEGIN RSA PRIVATE KEY-----');
  }
  if (!publicCertificate.trim().startsWith('-----BEGIN CERTIFICATE-----')) {
    errorMessage.push('Private key doesn\'t start with -----BEGIN CERTIFICATE-----');
  }
  if (errorMessage.length > 0) throw new Error(errorMessage.join('\n'));

  const requestBody = {
    displayName: name,
    certificateRawData: {
      privateKey: privateKey.trim(),
      publicCertificate: publicCertificate.trim(),
    },
    managedCertificate: {},
  };

  taskLib.debug('Requesting GCP with data:');
  taskLib.debug(JSON.stringify(requestBody, null, 2));

  let res;
  try {
    res = await client.request({
      method: 'POST',
      url: `${apiUrl}/${url}`,
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
 * Update the current certificate or update the metadata.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {string} name The user-specified display name of the certificate
 * @param {string} privateKey Unencrypted PEM encoded RSA private key
 * @param {string} publicCertificate PEM encoded x.509 public key certificate
 * @param {CertificateMetadata} current The current certificate metadata
 * @returns {CertificateMetadata} The instance of certificate.
 */
async function updateCertificate(client, project, name, privateKey, publicCertificate, current) {
  const url = `apps/${project}/authorizedCertificates/${current.id}`;
  console.log('Updating custom SSL certificate...');

  // Check inputs
  const errorMessage = [];
  if (!privateKey.trim().startsWith('-----BEGIN RSA PRIVATE KEY-----')) {
    errorMessage.push('Private key doesn\'t start with -----BEGIN RSA PRIVATE KEY-----');
  }
  if (!publicCertificate.trim().startsWith('-----BEGIN CERTIFICATE-----')) {
    errorMessage.push('Private key doesn\'t start with -----BEGIN CERTIFICATE-----');
  }
  if (errorMessage.length > 0) throw new Error(errorMessage.join('\n'));

  const requestBody = {
    displayName: name,
    certificateRawData: {
      privateKey: privateKey.trim(),
      publicCertificate: publicCertificate.trim(),
    },
  };

  // Clone current and remove properties that cannot be changed
  const currentCert = { ...current };
  delete currentCert.domainNames;
  delete currentCert.expireTime;
  delete currentCert.name;
  delete currentCert.id;

  // Get only the differences, including new props
  const diff = deepDiff(currentCert, requestBody, true);
  taskLib.debug(`Changed or new properties of the existing certificate are: ${propertiesToArray(diff).join(',')}`);
  taskLib.debug(JSON.stringify(diff, null, 2));

  // Get only changed props
  const changedProps = deepDiff(currentCert, requestBody) || {};
  const updateMask = propertiesToArray(changedProps).join(',');
  const qsMask = encodeURIComponent(updateMask);
  taskLib.debug(`Changed certificate attributes are: ${updateMask}`);

  // Nothing changed
  if (!diff || !updateMask) {
    console.log('Nothing was changed in the certificate.');
    return checkResultAndGetData({
      status: 200,
      data: current,
    });
  }

  taskLib.debug('Requesting GCP with data:');
  taskLib.debug(JSON.stringify(requestBody, null, 2));

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
    console.error(JSON.stringify(error.response.data));
    throw error;
  }

  return checkResultAndGetData(res);
}

/**
 * Delete an SSL certificate.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {string} certId The ID of the certificate to delete
 */
async function deleteCertificate(client, project, certId) {
  const url = `apps/${project}/authorizedCertificates/${certId}`;
  console.log(`Deleting custom SSL certificate ${url}...`);

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

  checkResultAndGetData(res);
}

/**
 * Listing all the authorized certificates an existing application has.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @returns {CertificateMetadata[]} The list of the cert metadata.
 */
async function listCertificates(client, project) {
  const url = `apps/${project}/authorizedCertificates`;
  console.log('Listing authorized certificates...');

  let res;
  try {
    res = await client.request({
      method: 'GET',
      url: `${apiUrl}/${url}?view=BASIC_CERTIFICATE`,
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
 * Configure the certificates for the app, adding or updating existing.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {boolean} [newApp=true] Indicates if it is a new app
 * @returns {CertificateMetadata} The certificate configured to the app.
 */
async function configureCertificate(client, project, newApp = true) {
  const customCert = taskLib.getBoolInput('appCustomCert', false) || false;
  if (!customCert) return null;

  // List all existing certs
  /**
   * @type {CertificateMetadata[]}
   */
  let certList = [];
  if (!newApp) {
    certList = await listCertificates(client, project);
    console.log(`Found ${certList.length} certificate(s) in the current app.`);
  }

  // Get data of the cert
  const displayName = taskLib.getInput('certificateName', true);
  const deployMode = taskLib.getInput('certificateDeployMode', false) || 'incremental';

  // Before all, check the deploy mode and if the display name already exists
  const currentCert = certList.find((c) => c.displayName === displayName);

  // Incremental and Maintain modes ignore existing certs
  if (currentCert && ['incremental', 'maintain'].includes(deployMode)) return currentCert;

  // Create or update
  const publicCert = await getCertificateContent('certificate');
  const privateKey = await getCertificateContent('certificateKey');

  let cert;
  if (currentCert) {
    cert = await updateCertificate(
      client, project, displayName, privateKey, publicCert, currentCert,
    );
  } else {
    cert = await createCertificate(client, project, displayName, privateKey, publicCert);
  }

  if (!cert || !cert.name) {
    taskLib.warning('Failed at uploading certificate');
  }

  // Delete others certificates
  if (currentCert && ['maintain', 'complete'].includes(deployMode)) {
    await certList.filter((c) => c.displayName !== displayName).forEach(async (c) => {
      await deleteCertificate(client, project, c.id);
    });
  }

  return cert;
}

/**
 * @typedef {object} DomainMapping Maps a domain to an application
 * @property {string} name Full path to the DomainMapping resource in the API.
 * @property {string} id Relative name of the domain serving the application. Like: `example.com.`
 * @property {object} sslSettings SSL configuration for this domain
 * @property {string} sslSettings.certificateId AuthorizedCertificate resource ID configuring SSL
 * @property {('AUTOMATIC'|'MANUAL')} sslSettings.sslManagementType SSL management type for this
 *   domain. If AUTOMATIC, a managed certificate is automatically provisioned. If MANUAL,
 *   certificateId must be manually specified in order to configure SSL for this domain.
 * @property {string} sslSettings.pendingManagedCertificateId ID of the managed
 *   AuthorizedCertificate resource currently being provisioned, if applicable
 * @property {object[]} resourceRecords The resource records to configure this domain mapping
 */

/**
 * Create a custom domain map to an app.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {string} dns Relative name of the domain serving the application. Example: `example.com.`
 * @param {string} certificateId AuthorizedCertificate resource ID configuring SSL for the app
 * @returns {DomainMapping} The newly created instance of certificate.
 */
async function createDomainMap(client, project, dns, certificateId) {
  const url = `apps/${project}/domainMappings`;
  console.log('Configuring custom DNS mapping...');

  /**
   * @type {DomainMapping}
   */
  const requestBody = {
    id: dns,
    sslSettings: {
      certificateId: certificateId || '',
      sslManagementType: certificateId ? 'MANUAL' : 'AUTOMATIC',
    },
  };

  taskLib.debug('Requesting GCP with data:');
  taskLib.debug(JSON.stringify(requestBody, null, 2));

  let res;
  try {
    res = await client.request({
      method: 'POST',
      url: `${apiUrl}/${url}`,
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
 * Update a custom domain map from an app.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {string} dns Relative name of the domain serving the application. Example: `example.com.`
 * @param {string} certificateId AuthorizedCertificate resource ID configuring SSL for the app
 * @param {DomainMapping} current Current config of the domain mapping
 * @returns {DomainMapping} The newly created instance of certificate.
 */
async function updateDomain(client, project, dns, certificateId, current) {
  const url = `apps/${project}/domainMappings/${current.id}`;
  console.log('Updating custom DNS mapping...');

  /**
   * @type {DomainMapping}
   */
  const requestBody = {
    id: dns,
    sslSettings: {
      certificateId: certificateId || '',
      sslManagementType: certificateId ? 'MANUAL' : 'AUTOMATIC',
    },
  };

  // Clone current and remove properties that cannot be changed
  const currentDNS = { ...current };
  delete currentDNS.resourceRecords;
  delete currentDNS.name;

  // Get only the differences, including new props
  const diff = deepDiff(currentDNS, requestBody, true);
  taskLib.debug(`Changed or new properties of the existing domain mapping are: ${propertiesToArray(diff).join(',')}`);
  taskLib.debug(JSON.stringify(diff, null, 2));

  // Get only changed props
  const changedProps = deepDiff(currentDNS, requestBody) || {};
  const updateMask = propertiesToArray(changedProps).join(',');
  const qsMask = encodeURIComponent(updateMask);
  taskLib.debug(`Changed domain mapping attributes are: ${updateMask}`);

  // Nothing changed
  if (!diff || !updateMask) {
    console.log('Nothing was changed in the domain mapping.');
    return checkResultAndGetData({
      status: 200,
      data: current,
    });
  }

  taskLib.debug('Requesting GCP with data:');
  taskLib.debug(JSON.stringify(requestBody, null, 2));

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
    console.error(JSON.stringify(error.response.data));
    throw error;
  }

  return checkResultAndGetData(res);
}

/**
 * Delete a domain mapping.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {string} domainMappingId The domain name to delete
 * @returns {Operation} The operation result.
 */
async function deleteDomain(client, project, domainMappingId) {
  const url = `apps/${project}/domainMappings/${domainMappingId}`;
  console.log(`Deleting domain mapping ${url}...`);

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
 * List all domain mappgins of an app.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @returns {DomainMapping[]} Domain Mapping list
 */
async function listDomainMappings(client, project) {
  const url = `apps/${project}/domainMappings`;
  console.log('Listing current domain mappings...');

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

  const result = checkResultAndGetData(res);
  return result && result.domainMappings;
}

/**
 * Configure the certificates for the app, adding or updating existing.
 *
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP Project ID
 * @param {boolean} [newApp=true] Indicates if it is a new app
 * @param {CertificateMetadata} certificate The certificate configured before
 * @returns {DomainMapping} The domain mapping configured to the app.
 */
async function configureDomain(client, project, newApp = true, certificate = null) {
  const customDomain = taskLib.getBoolInput('appCustomDNS', false) || false;
  if (!customDomain) return null;

  // List all existing certs
  /**
   * @type {DomainMapping[]}
   */
  let dnsList = [];
  if (!newApp) {
    dnsList = await listDomainMappings(client, project);
    console.log(`Found ${dnsList.length} domain mapping(s) in the current app.`);
  }

  // Get data of the cert
  let dns = taskLib.getInput('customDns', true);
  if (dns.substr(-1) !== '.') dns = `${dns}.`;
  const deployMode = taskLib.getInput('certificateDeployMode', false) || 'incremental';

  // Before all, check the deploy mode and if the domain already exists
  const currentDomain = dnsList.find((c) => c.id === dns);

  // Incremental and Maintain modes ignore existing certs
  if (currentDomain && ['incremental', 'maintain'].includes(deployMode)) return currentDomain;

  // Associate this DNS with custom certificate
  const shouldAssociate = taskLib.getBoolInput('customDnsAssociate', false) || true;
  const certificateId = shouldAssociate && certificate ? certificate.id : undefined;

  // Create or update
  let domainMap;
  if (currentDomain) {
    domainMap = await updateDomain(client, project, dns, certificateId, currentDomain);
  } else {
    domainMap = await createDomainMap(client, project, dns, certificateId);
  }

  if (!domainMap || !domainMap.id) {
    taskLib.warning('Failed at configuring custom DNS');
  }

  // Delete others domain
  if (currentDomain && ['maintain', 'complete'].includes(deployMode)) {
    await dnsList.filter((c) => c.id !== dns).forEach(async (c) => {
      await deleteDomain(client, project, c.id);
    });
  }

  return domainMap;
}
// #endregion AppOperations

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

    switch (op) {
      case 'create': {
        const region = taskLib.getInput('gcpRegion', true);
        let servingStatus = taskLib.getInput('appServingStatus', false) || 'serving';
        const cookieExp = getNumberInput('appCookieExp', false) || 24 * 60 * 60; // 1d
        const gcrDomain = taskLib.getInput('appGCRDomain', false);
        const authDomain = taskLib.getInput('appAuthDomain', false);
        let database = taskLib.getInput('appDatabase', false) || 'databaseTypeUnspecified';
        const optimizedOS = taskLib.getBoolInput('appOptimizedOS', false) || false;
        const iap = taskLib.getBoolInput('appIap', false) || false;
        const iapClientId = taskLib.getInput('appIapClientId', false);
        const iapClientSecret = taskLib.getInput('appIapClientSecret', false);

        // Fix values
        servingStatus = servingStatus.replace(/[A-Z]/g, (n) => `_${n}`).toUpperCase();
        database = database.replace(/[A-Z]/g, (n) => `_${n}`).toUpperCase();

        // Check if the app already exists
        const instance = await getApp(auth.client, auth.projectId);

        if (instance) {
          console.log('App already exists, updating JUST the cookie default expiration and auth domain');
          result = await updateApp(
            auth.client, auth.projectId, cookieExp, authDomain, instance,
          );
        } else {
          result = await createApp(
            auth.client, auth.projectId, region, servingStatus, cookieExp, gcrDomain, authDomain,
            database, optimizedOS, iap, iapClientId, iapClientSecret,
          );
        }

        // Configure SSL certificates
        let certificate;
        try {
          certificate = await configureCertificate(auth.client, auth.projectId, !!instance);
        } catch (error) {
          taskLib.warning(`Fail to configure SSL certificate: ${error.message}`);
        }

        // Configure custom DNS mapping
        try {
          await configureDomain(auth.client, auth.projectId, !!instance, certificate);
        } catch (error) {
          taskLib.warning(`Fail to configure DNS mapping: ${error.message}`);
        }

        break;
      }

      case 'update': {
        const cookieExp = getNumberInput('appCookieExp', false) || 24 * 60 * 60; // 1d
        const authDomain = taskLib.getInput('appAuthDomain', false);

        // Check current app metadata
        const instance = await getApp(auth.client, auth.projectId);

        if (instance) {
          result = await updateApp(
            auth.client, auth.projectId, cookieExp, authDomain, instance,
          );

          // Configure SSL certificates
          let certificate;
          try {
            certificate = await configureCertificate(auth.client, auth.projectId, !!instance);
          } catch (error) {
            taskLib.warning(`Fail to configure SSL certificate: ${error.message}`);
          }

          // Configure custom DNS mapping
          try {
            await configureDomain(auth.client, auth.projectId, !!instance, certificate);
          } catch (error) {
            taskLib.warning(`Fail to configure DNS mapping: ${error.message}`);
          }
        } else {
          taskLib.error(`The app ${auth.projectId} doesn't exist.`);
          result = null;
        }
        break;
      }

      case 'repair': {
        result = await repairApp(auth.client, auth.projectId);
        break;
      }

      default:
        break;
    }

    // Check if we should wait for operation ends
    const shouldWait = taskLib.getBoolInput('waitOperation', false) || false;

    if (shouldWait) {
      taskLib.debug('Waiting for operation:');
      taskLib.debug(JSON.stringify(result));
      const finalResult = await waitOperation(auth.client, auth.projectId, result);
      taskSuccess = true;

      if (typeof finalResult.defaultHostname === 'string' && typeof finalResult.name === 'string') {
        taskLib.setVariable('AppName', finalResult.name);
        taskLib.setVariable('AppCodeBucket', finalResult.codeBucket);
        taskLib.setVariable('AppDefaultBucket', finalResult.defaultBucket);
        taskLib.setVariable('AppDefaultHostname', finalResult.defaultHostname);
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
