/* eslint-disable no-console */
import * as taskLib from 'azure-pipelines-task-lib/task';
// eslint-disable-next-line no-unused-vars
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import SecureFileHelpers from 'securefiles-babel';

const apiUrl = 'https://dns.googleapis.com/dns/v1';
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
// #endregion Utils

// #region Operations
/**
 * Get the JSON value from a record.
 *
 * @author Gabriel Anderson
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP project where managed zone is
 * @param {string} managedZone The managed zone of the record
 * @param {string} name The name (address) of the record (for example www.example.com.)
 * @returns {*} The record set data.
 */
async function getRecord(client, project, managedZone, name) {
  const url = `projects/${project}/managedZones/${managedZone}/rrsets`;
  // check if name ends in dot
  const fixedName = (name.substr(-1) === '.') ? name : `${name}.`;
  console.log(`Get value for ${fixedName} in ${url}`);

  let res;
  try {
    res = await client.request({
      method: 'GET',
      url: `${apiUrl}/${url}?name=${fixedName}`,
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
 * Add or delete a DNS record set.
 *
 * @author Gabriel Anderson
 * @param {('add'|'delete')} operation Should add or delete a record?
 * @param {OAuth2Client} client Google Auth Client
 * @param {string} project The GCP project where managed zone is
 * @param {string} managedZone The managed zone of the record
 * @param {string} name The name (address) of the record (for example www.example.com.)
 * @param {string} type The identifier of a supported record type.
 * @param {number} ttl Number of seconds that this ResourceRecordSet can be cached by resolvers.
 * @param {string} value The value of the record (like IP address if it is a record of type A)
 * @returns {*} The change result.
 */
async function changeRecord(operation, client, project, managedZone, name, type, ttl, value) {
  const fixedName = (name.substr(-1) === '.') ? name : `${name}.`;
  const url = `projects/${project}/managedZones/${managedZone}/changes`;
  console.log(`${operation === 'add' ? 'Adding' : 'Deleting'} record ${fixedName} to ${url}`);
  let rrdatas = [value];

  // If operation = delete, so get record info before
  if (operation === 'delete') {
    const current = await getRecord(client, project, managedZone, fixedName);
    if (!current || current.rrsets.length === 0) {
      throw new Error(`${fixedName} in projects/${project}/managedZones/${managedZone} not found and cannot be deleted.`);
    }

    const record = current.rrsets[0];
    // eslint-disable-next-line no-param-reassign
    type = record.type;
    // eslint-disable-next-line no-param-reassign
    ttl = record.ttl;
    rrdatas = record.rrdatas;
  }

  const ops = operation === 'delete' ? 'deletions' : 'additions';
  const requestBody = {
    kind: 'dns#change',
    [ops]: [
      {
        kind: 'dns#resourceRecordSet',
        name: fixedName,
        type,
        ttl,
        rrdatas,
      },
    ],
  };

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

    // Already exists, just show a warning
    if (result.error && result.error.code === 409 && operation === 'add') {
      console.log(`[!] The record ${type} ${name} already exists.`);
      return {
        data: requestBody,
        id: 1,
      };
    }

    console.error(JSON.stringify(result));
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
      'https://www.googleapis.com/auth/ndev.clouddns.readwrite',
    ]);

    // Check operation
    const op = taskLib.getInput('operation', false);

    // Get some basic info
    const zone = taskLib.getInput('recordZone', true);
    const name = taskLib.getInput('recordName', true);

    switch (op) {
      case 'add':
      case 'delete': {
        const type = taskLib.getInput('recordType', op === 'add');
        // eslint-disable-next-line radix
        const ttl = parseInt(taskLib.getInput('recordTtl', op === 'add'));
        const value = taskLib.getInput('recordValue', op === 'add');

        const result = await changeRecord(op, auth.client, auth.projectId, zone, name, type, ttl, value);
        taskSuccess = result && result.id;
        break;
      }

      case 'value': {
        const result = await getRecord(auth.client, auth.projectId, zone, name);
        taskSuccess = result.rrsets.length > 0;

        if (taskSuccess) {
          let outputVal = '';
          const outputTemplate = taskLib.getInput('outputTemplate', false) || 'typeval';

          switch (outputTemplate) {
            case 'typeval':
              outputVal = `${result.rrsets[0].type}|${result.rrsets[0].rrdatas.join(',')}`;
              break;

            case 'firstval':
              // eslint-disable-next-line prefer-destructuring
              outputVal = result.rrsets[0].rrdatas[0];
              break;

            case 'json':
              outputVal = JSON.stringify(result.rrsets[0]);
              break;

            default:
              break;
          }

          taskLib.setVariable('DnsRecordValue', outputVal);
        }

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
