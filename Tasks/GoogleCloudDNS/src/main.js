/* eslint-disable no-console */
import fs from 'fs';
import * as taskLib from 'azure-pipelines-task-lib/task';
import { google } from 'googleapis';

const dns = google.dns('v1');

/**
 * Check a result of a Rest call and fail task when response is not successful.
 *
 * @param {import('gaxios').GaxiosResponse<import('googleapis').dns_v1.Schema$Operation>} res The Rest API response
 * @returns {import('googleapis').dns_v1.Schema$Change} The metadata of the operation.
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

async function addRecord(auth, project, managedZone, name, type, ttl, value) {
  console.log(`Adding record ${name} to ${managedZone}`);
  const res = await dns.changes.create({
    auth,
    project,
    managedZone,
    isServing: true,
    resource: {
      kind: 'dns#change',
      additions: [
        {
          kind: 'dns#resourceRecordSet',
          name,
          type,
          ttl,
          rrdatas: [value],
        },
      ],
    },
  });

  return checkResultAndGetMetadata(res);
}

async function getRecordValue(auth, project, managedZone) {}

/**
 * Main function
 *
 */
async function main() {
  // gcloud dns record-sets transaction add "1.2.3.4" --name="x.example.com" --ttl=1234 --type=A --zone=ZONE
  let taskSuccess = false;

  try {
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

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(jsonEscaped),
      // Scopes can be specified either as an array or as a single, space-delimited string.
      scopes: [
        'https://www.googleapis.com/auth/ndev.clouddns.readwrite',
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
    const zone = taskLib.getInput('recordZone', true);
    const name = taskLib.getInput('recordName', true);

    switch (op) {
      case 'add':
        const result = await addRecord(authClient, projectId, zone, name);
        break;

      case 'value': {
        const callResult = await callFunction(authClient, location, name);
        taskSuccess = !!callResult;
        taskLib.setVariable('FunctionCallResult', callResult);
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
