import * as taskLib from 'azure-pipelines-task-lib/task';
import deepDiff from 'return-deep-diff';
import { getAuthenticatedClient } from '@shared/auth';
import { checkResultAndGetMetadata, setTaskResult } from '@shared/utils';

const API_URL = 'https://redis.googleapis.com/v1';

/**
 * Get operation status from Google Cloud.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} region - Region name
 * @param {string} operationName - Operation name
 * @returns {Promise<Object>} Operation details
 */
async function getOperation(client, project, region, operationName) {
  try {
    const res = await client.request({
      method: 'GET',
      url: `${API_URL}/projects/${project}/locations/${region}/operations/${operationName}`,
      headers: {
        Accept: 'application/json',
      },
    });

    return checkResultAndGetMetadata(res);
  } catch (error) {
    taskLib.error(`Failed to get operation: ${error.message}`);
    throw error;
  }
}

/**
 * Wait for an operation to complete.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} region - Region name
 * @param {Object} operationBody - Operation object
 * @returns {Promise<Object>} Final operation result
 */
async function waitOperation(client, project, region, operationBody) {
  return new Promise((resolve, reject) => {
    const checkOperation = async () => {
      try {
        const operation = await getOperation(client, project, region, operationBody.name);

        if (operation.done) {
          if (operation.error) {
            reject(new Error(`Operation failed: ${operation.error.message}`));
          } else {
            resolve(operation);
          }
        } else {
          console.log(`Operation ${operationBody.name} still in progress...`);
          setTimeout(checkOperation, 5000); // Check every 5 seconds
        }
      } catch (error) {
        reject(error);
      }
    };

    checkOperation();
  });
}

/**
 * Get Redis instance information.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} region - Region name
 * @param {string} name - Instance name
 * @returns {Promise<Object|null>} Instance information or null if not found
 */
async function getInstance(client, project, region, name) {
  try {
    const res = await client.request({
      method: 'GET',
      url: `${API_URL}/projects/${project}/locations/${region}/instances/${name}`,
      headers: {
        Accept: 'application/json',
      },
    });

    if (res.status === 200) {
      return res.data;
    }

    return null;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }

    taskLib.error(`Failed to get instance: ${error.message}`);
    throw error;
  }
}

/**
 * Create a new Redis instance.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} region - Region name
 * @param {string} name - Instance name
 * @returns {Promise<Object>} Operation result
 */
async function createInstance(client, project, region, name) {
  try {
    console.log(`Creating Redis instance ${name}...`);

    const body = {
      displayName: taskLib.getInput('instanceDisplayName', false) || name,
      tier: taskLib.getInput('instanceTier', true),
      memorySizeGb: parseInt(taskLib.getInput('instanceMemory', true), 10),
      redisVersion: taskLib.getInput('instanceRedisVersion', false) || 'REDIS_6_X',
      authEnabled: taskLib.getBoolInput('instanceAuthEnabled', false),
      transitEncryptionMode: taskLib.getInput('instanceTransitEncryption', false) || 'DISABLED',
      connectMode: taskLib.getInput('instanceConnectMode', false) || 'DIRECT_PEERING',
    };

    // Optional fields
    const authorizedNetwork = taskLib.getInput('instanceAuthorizedNetwork', false);
    if (authorizedNetwork) {
      body.authorizedNetwork = authorizedNetwork;
    }

    const reservedIpRange = taskLib.getInput('instanceReservedIpRange', false);
    if (reservedIpRange) {
      body.reservedIpRange = reservedIpRange;
    }

    const alternativeLocationId = taskLib.getInput('instanceAlternativeLocationId', false);
    if (alternativeLocationId) {
      body.alternativeLocationId = alternativeLocationId;
    }

    // Redis configuration
    const redisConfigs = taskLib.getInput('instanceRedisConfigs', false);
    if (redisConfigs) {
      try {
        body.redisConfigs = JSON.parse(redisConfigs);
      } catch (error) {
        taskLib.warning(`Invalid Redis configs JSON: ${error.message}`);
      }
    }

    // Labels
    const labels = taskLib.getInput('gcpLabels', false);
    if (labels) {
      try {
        body.labels = JSON.parse(labels);
      } catch (error) {
        taskLib.warning(`Invalid labels JSON: ${error.message}`);
      }
    }

    const res = await client.request({
      method: 'POST',
      url: `${API_URL}/projects/${project}/locations/${region}/instances`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      params: {
        instanceId: name,
      },
      body: JSON.stringify(body),
    });

    const operation = checkResultAndGetMetadata(res);
    return waitOperation(client, project, region, operation);
  } catch (error) {
    taskLib.error(`Failed to create instance: ${error.message}`);
    throw error;
  }
}

/**
 * Update an existing Redis instance.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} region - Region name
 * @param {string} name - Instance name
 * @param {Object} currentInstance - Current instance properties
 * @returns {Promise<Object>} Operation result
 */
async function updateInstance(client, project, region, name, currentInstance) {
  try {
    console.log(`Updating Redis instance ${name}...`);

    // Build update request body with only the fields that can be updated
    const body = {};
    const updateMask = [];

    // Display name
    const displayName = taskLib.getInput('instanceDisplayName', false);
    if (displayName && displayName !== currentInstance.displayName) {
      body.displayName = displayName;
      updateMask.push('display_name');
    }

    // Memory size
    const memorySizeGb = parseInt(taskLib.getInput('instanceMemory', true), 10);
    if (memorySizeGb !== currentInstance.memorySizeGb) {
      body.memorySizeGb = memorySizeGb;
      updateMask.push('memory_size_gb');
    }

    // Redis configs
    const redisConfigs = taskLib.getInput('instanceRedisConfigs', false);
    if (redisConfigs) {
      try {
        const newConfigs = JSON.parse(redisConfigs);
        const configDiff = deepDiff(currentInstance.redisConfigs || {}, newConfigs);

        if (Object.keys(configDiff || {}).length > 0) {
          body.redisConfigs = newConfigs;
          updateMask.push('redis_configs');
        }
      } catch (error) {
        taskLib.warning(`Invalid Redis configs JSON: ${error.message}`);
      }
    }

    // Labels
    const labels = taskLib.getInput('gcpLabels', false);
    if (labels) {
      try {
        const newLabels = JSON.parse(labels);
        const labelDiff = deepDiff(currentInstance.labels || {}, newLabels);

        if (Object.keys(labelDiff || {}).length > 0) {
          body.labels = newLabels;
          updateMask.push('labels');
        }
      } catch (error) {
        taskLib.warning(`Invalid labels JSON: ${error.message}`);
      }
    }

    if (updateMask.length === 0) {
      console.log('No changes detected, skipping update.');
      return { done: true, response: currentInstance };
    }

    taskLib.debug('Update mask:');
    taskLib.debug(updateMask.join(','));

    body.name = currentInstance.name;

    const res = await client.request({
      method: 'PATCH',
      url: `${API_URL}/projects/${project}/locations/${region}/instances/${name}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      params: {
        updateMask: updateMask.join(','),
      },
      body: JSON.stringify(body),
    });

    const operation = checkResultAndGetMetadata(res);
    return waitOperation(client, project, region, operation);
  } catch (error) {
    taskLib.error(`Failed to update instance: ${error.message}`);
    throw error;
  }
}

/**
 * Delete a Redis instance.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} region - Region name
 * @param {string} name - Instance name
 * @returns {Promise<Object>} Operation result
 */
async function deleteInstance(client, project, region, name) {
  try {
    console.log(`Deleting Redis instance ${name}...`);

    const res = await client.request({
      method: 'DELETE',
      url: `${API_URL}/projects/${project}/locations/${region}/instances/${name}`,
      headers: {
        Accept: 'application/json',
      },
    });

    const operation = checkResultAndGetMetadata(res);
    return waitOperation(client, project, region, operation);
  } catch (error) {
    taskLib.error(`Failed to delete instance: ${error.message}`);
    throw error;
  }
}

/**
 * Failover a Redis instance.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} region - Region name
 * @param {string} name - Instance name
 * @param {string} mode - Failover mode
 * @returns {Promise<Object>} Operation result
 */
async function failover(client, project, region, name, mode) {
  try {
    console.log(`Initiating failover for Redis instance ${name}...`);

    const body = {
      dataProtectionMode: mode || 'LIMITED_DATA_LOSS',
    };

    const res = await client.request({
      method: 'POST',
      url: `${API_URL}/projects/${project}/locations/${region}/instances/${name}:failover`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const operation = checkResultAndGetMetadata(res);
    return waitOperation(client, project, region, operation);
  } catch (error) {
    taskLib.error(`Failed to failover instance: ${error.message}`);
    throw error;
  }
}

/**
 * Upgrade a Redis instance.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} region - Region name
 * @param {string} name - Instance name
 * @param {string} version - Target Redis version
 * @returns {Promise<Object>} Operation result
 */
async function upgrade(client, project, region, name, version) {
  try {
    console.log(`Upgrading Redis instance ${name} to version ${version}...`);

    const body = {
      redisVersion: version,
    };

    const res = await client.request({
      method: 'POST',
      url: `${API_URL}/projects/${project}/locations/${region}/instances/${name}:upgrade`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const operation = checkResultAndGetMetadata(res);
    return waitOperation(client, project, region, operation);
  } catch (error) {
    taskLib.error(`Failed to upgrade instance: ${error.message}`);
    throw error;
  }
}

/**
 * Main execution function.
 */
async function main() {
  let taskSuccess = false;

  try {
    // Get authentication
    const auth = await getAuthenticatedClient([
      'https://www.googleapis.com/auth/cloud-platform',
    ]);

    if (!auth) {
      return;
    }

    // Get operation
    const operation = taskLib.getInput('operation', true);

    // Get basic info
    const region = taskLib.getInput('gcpRegion', true);
    const instanceName = taskLib.getInput('instanceName', true);

    taskLib.debug(`Operation: ${operation}, Region: ${region}, Instance: ${instanceName}`);

    switch (operation) {
      case 'create': {
        let result = null;

        // Check if instance already exists
        console.log('Checking if instance already exists...');
        const existingInstance = await getInstance(auth.client, auth.projectId, region, instanceName);

        if (!existingInstance) {
          console.log(`Instance ${instanceName} not found in ${region}.`);
          result = await createInstance(auth.client, auth.projectId, region, instanceName);
        } else {
          console.log(`Instance ${instanceName} already exists, updating...`);
          result = await updateInstance(auth.client, auth.projectId, region, instanceName, existingInstance);
        }

        // Set output variables
        if (result.response) {
          taskLib.setVariable('InstanceName', result.response.name);
          taskLib.setVariable('InstanceHost', result.response.host);
          taskLib.setVariable('InstancePort', result.response.port?.toString() || '6379');

          if (result.response.authString) {
            taskLib.setVariable('InstanceAuthString', result.response.authString);
          }
        }

        taskSuccess = result.done;
        break;
      }

      case 'delete': {
        const result = await deleteInstance(auth.client, auth.projectId, region, instanceName);
        taskSuccess = result.done;
        break;
      }

      case 'failover': {
        const failoverMode = taskLib.getInput('failoverMode', false) || 'LIMITED_DATA_LOSS';
        const result = await failover(auth.client, auth.projectId, region, instanceName, failoverMode);
        taskSuccess = result.done;
        break;
      }

      case 'upgrade': {
        const redisVersion = taskLib.getInput('upgradeRedisVersion', true);
        const result = await upgrade(auth.client, auth.projectId, region, instanceName, redisVersion);
        taskSuccess = result.done;
        break;
      }

      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }

    // Set common output variable
    taskLib.setVariable('InstanceFullName', `projects/${auth.projectId}/locations/${region}/instances/${instanceName}`);
  } catch (error) {
    console.error(`Task failed: ${error.message}`);
    taskLib.debug(error.stack);
    taskSuccess = false;
  }

  // Set final result
  setTaskResult(taskSuccess, taskSuccess ? 'Task completed successfully!' : 'Task failed!');
}

// Execute main function
main();
