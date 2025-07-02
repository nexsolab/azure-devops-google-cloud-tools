/**
 * @fileoverview Google Cloud DNS task for Azure DevOps
 * @author Gabriel Anderson
 */

import * as taskLib from 'azure-pipelines-task-lib/task';
import { getAuthenticatedClient } from '../../src/shared/auth.js';
import { checkResultAndGetData, handleError, setTaskResult } from '../../src/shared/utils.js';

const apiUrl = 'https://dns.googleapis.com/dns/v1';

/**
 * Get the JSON value from a record.
 *
 * @param {import('google-auth-library').OAuth2Client} client Google Auth Client
 * @param {string} project The GCP project where managed zone is
 * @param {string} managedZone The managed zone of the record
 * @param {string} name The name (address) of the record (for example www.example.com.)
 * @returns {Promise<*>} The record set data.
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
 * @param {('add'|'delete')} operation Should add or delete a record?
 * @param {import('google-auth-library').OAuth2Client} client Google Auth Client
 * @param {string} project The GCP project where managed zone is
 * @param {string} managedZone The managed zone of the record
 * @param {string} name The name (address) of the record (for example www.example.com.)
 * @param {string} type The identifier of a supported record type.
 * @param {number} ttl Number of seconds that this ResourceRecordSet can be cached by resolvers.
 * @param {string} value The value of the record (like IP address if it is a record of type A)
 * @returns {Promise<*>} The change result.
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
    type = record.type;
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
 */
async function main() {
  let taskSuccess = false;

  try {
    // Get authentication
    const auth = await getAuthenticatedClient([
      'https://www.googleapis.com/auth/ndev.clouddns.readwrite',
    ]);

    if (!auth) {
      return;
    }

    // Check operation
    const op = taskLib.getInput('operation', false);

    // Get some basic info
    const zone = taskLib.getInput('recordZone', true);
    const name = taskLib.getInput('recordName', true);

    switch (op) {
      case 'add':
      case 'delete': {
        const type = taskLib.getInput('recordType', op === 'add');
        const ttl = parseInt(taskLib.getInput('recordTtl', op === 'add'), 10);
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
              [outputVal] = result.rrsets[0].rrdatas;
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
    handleError(error);
    return;
  }

  setTaskResult(taskSuccess);
}

main();
