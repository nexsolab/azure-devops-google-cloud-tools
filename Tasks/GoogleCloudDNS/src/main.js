/* eslint-disable no-console */
import fs from 'fs';
import * as taskLib from 'azure-pipelines-task-lib/task';
import { DNS } from '@google-cloud/dns';

/**
 * Check a result of a Rest call and fail task when response is not successful.
 *
 * @param {*} res The Rest API response
 * @returns {*} The metadata of the operation.
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
 * Add or delete a DNS record set.
 *
 * @author Gabriel Anderson
 * @param {('add'|'delete')} operation Should add or delete a record?
 * @param {DNS} dns Google DNS client
 * @param {string} project The GCP project where managed zone is
 * @param {string} managedZone The managed zone of the record
 * @param {string} name The name (address) of the record (for example www.example.com.)
 * @param {string} type The identifier of a supported record type.
 * @param {number} ttl Number of seconds that this ResourceRecordSet can be cached by resolvers.
 * @param {string} value The value of the record (like IP address if it is a record of type A)
 * @returns {*} The change result.
 */
async function changeRecord(operation, dns, project, managedZone, name, type, ttl, value) {
  console.log(`Adding record ${name} to ${managedZone} - ${project}`);

  const change = dns.zone(managedZone).change().create({
    [operation]: [
      {
        type,
        rrdatas: [value],
        metadata: {
          name,
          type,
          ttl,
          data: value,
        },
      },
    ],
  });

  const res = change[1];

  // Already exists, just show a warning
  if (res.status === 409) {
    console.warn(`The record ${name} - ${type}: ${value} already exists.`);
    return {
      name,
    };
  }

  return checkResultAndGetMetadata(res);
}

/**
 * Get the JSON value from a record.
 *
 * @author Gabriel Anderson
 * @param {DNS} dns Google DNS client
 * @param {string} project The GCP project where managed zone is
 * @param {string} managedZone The managed zone of the record
 * @param {string} name The name (address) of the record (for example www.example.com.)
 * @returns {import('googleapis').dns_v1.Schema$ResourceRecordSetsListResponse} The record set data.
 */
async function getRecord(credentials, project, managedZone, name) {
  // check if name ends in dot
  const fixedName = (name.substr(-1) === '.') ? name : `${name}.`;
  console.log(`Get value for ${fixedName} in ${managedZone} - ${project}`);
  
  query

  const res = await dns.resourceRecordSets.list({
    auth,
    project,
    managedZone,
    name: fixedName,
  });

  return checkResultAndGetMetadata(res);
}

/**
 * Main function
 *
 */
async function main() {
  let taskSuccess = false;

  try {
    // #region auth
    // Get authentication method
    let jsonCredential = '';
    const authMethod = taskLib.getInput('authenticationMethod', true);

    if (authMethod === 'serviceAccount') {
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
    const credentials = JSON.parse(jsonEscaped);

    // Get info about credential
    if (jsonCredential && credentials) {
      taskLib.debug(`Authenticated as ${credentials.client_email}`);
    } else {
      taskLib.debug('Authenticated (JSON could not be read.');
    }
    // #endregion auth

    // Check operation
    const op = taskLib.getInput('operation', false);

    // Get some basic info
    const projectId = taskLib.getInput('gcpProject', true);
    const zone = taskLib.getInput('recordZone', true);
    const name = taskLib.getInput('recordName', true);

    // Create DNS class
    const dns = new DNS({
      projectId,
      credentials,
    });

    switch (op) {
      case 'add': {
        const type = taskLib.getInput('recordType', true);
        // eslint-disable-next-line radix
        const ttl = parseInt(taskLib.getInput('recordTtl', true));
        const value = taskLib.getInput('recordValue', true);

        const result = await changeRecord('add', dns, projectId, zone, name, type, ttl, value);
        taskSuccess = result && result.name;
        break;
      }

      case 'delete': {
        const result = await changeRecord('delete', dns, projectId, zone, name);
        taskSuccess = result && result.name;
        break;
      }

      case 'value': {
        const result = await getRecord(dns, projectId, zone, name);
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
