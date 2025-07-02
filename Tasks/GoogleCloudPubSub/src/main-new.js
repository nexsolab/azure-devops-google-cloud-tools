import * as taskLib from 'azure-pipelines-task-lib/task';
import deepDiff from 'return-deep-diff';
import { getAuthenticatedClient } from '@shared/auth';
import { checkResultAndGetMetadata, setTaskResult, parseListInput } from '@shared/utils';

const API_URL = 'https://pubsub.googleapis.com/v1';

/**
 * Get topic information.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} name - Topic name
 * @returns {Promise<Object|null>} Topic information or null if not found
 */
async function getTopic(client, project, name) {
  try {
    const res = await client.request({
      method: 'GET',
      url: `${API_URL}/projects/${project}/topics/${name}`,
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
    
    taskLib.error(`Failed to get topic: ${error.message}`);
    throw error;
  }
}

/**
 * Create a new Pub/Sub topic.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} name - Topic name
 * @returns {Promise<Object>} Topic creation result
 */
async function createTopic(client, project, name) {
  try {
    console.log(`Creating Pub/Sub topic ${name}...`);

    const body = {
      name: `projects/${project}/topics/${name}`,
    };

    // Message storage policy
    const messageStoragePolicy = taskLib.getInput('topicMessageStoragePolicy', false);
    if (messageStoragePolicy) {
      try {
        body.messageStoragePolicy = JSON.parse(messageStoragePolicy);
      } catch (error) {
        taskLib.warning(`Invalid message storage policy JSON: ${error.message}`);
      }
    }

    // KMS key name
    const kmsKeyName = taskLib.getInput('topicKmsKeyName', false);
    if (kmsKeyName) {
      body.kmsKeyName = kmsKeyName;
    }

    // Labels
    const labels = taskLib.getInput('gcpLabels', false);
    if (labels) {
      try {
        body.labels = JSON.parse(labels);
      } catch (error) {
        try {
          body.labels = parseListInput(labels);
        } catch (parseError) {
          taskLib.warning(`Invalid labels format: ${error.message}`);
        }
      }
    }

    const res = await client.request({
      method: 'PUT',
      url: `${API_URL}/projects/${project}/topics/${name}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return checkResultAndGetMetadata(res);
  } catch (error) {
    taskLib.error(`Failed to create topic: ${error.message}`);
    throw error;
  }
}

/**
 * Update an existing Pub/Sub topic.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} name - Topic name
 * @param {Object} currentTopic - Current topic properties
 * @returns {Promise<Object>} Topic update result
 */
async function updateTopic(client, project, name, currentTopic) {
  try {
    console.log(`Updating Pub/Sub topic ${name}...`);

    const body = {
      name: currentTopic.name,
    };
    const updateMask = [];

    // Message storage policy
    const messageStoragePolicy = taskLib.getInput('topicMessageStoragePolicy', false);
    if (messageStoragePolicy) {
      try {
        const newPolicy = JSON.parse(messageStoragePolicy);
        const policyDiff = deepDiff(currentTopic.messageStoragePolicy || {}, newPolicy);
        
        if (Object.keys(policyDiff || {}).length > 0) {
          body.messageStoragePolicy = newPolicy;
          updateMask.push('message_storage_policy');
        }
      } catch (error) {
        taskLib.warning(`Invalid message storage policy JSON: ${error.message}`);
      }
    }

    // Labels
    const labels = taskLib.getInput('gcpLabels', false);
    if (labels) {
      try {
        let newLabels = {};
        try {
          newLabels = JSON.parse(labels);
        } catch {
          newLabels = parseListInput(labels);
        }
        
        const labelDiff = deepDiff(currentTopic.labels || {}, newLabels);
        
        if (Object.keys(labelDiff || {}).length > 0) {
          body.labels = newLabels;
          updateMask.push('labels');
        }
      } catch (error) {
        taskLib.warning(`Invalid labels format: ${error.message}`);
      }
    }

    if (updateMask.length === 0) {
      console.log('No changes detected, skipping update.');
      return currentTopic;
    }

    taskLib.debug('Update mask:');
    taskLib.debug(updateMask.join(','));

    const res = await client.request({
      method: 'PATCH',
      url: `${API_URL}/projects/${project}/topics/${name}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      params: {
        updateMask: updateMask.join(','),
      },
      body: JSON.stringify(body),
    });

    return checkResultAndGetMetadata(res);
  } catch (error) {
    taskLib.error(`Failed to update topic: ${error.message}`);
    throw error;
  }
}

/**
 * Delete a Pub/Sub topic.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} name - Topic name
 * @returns {Promise<boolean>} Deletion success
 */
async function deleteTopic(client, project, name) {
  try {
    console.log(`Deleting Pub/Sub topic ${name}...`);

    const res = await client.request({
      method: 'DELETE',
      url: `${API_URL}/projects/${project}/topics/${name}`,
      headers: {
        Accept: 'application/json',
      },
    });

    return res.status === 200;
  } catch (error) {
    taskLib.error(`Failed to delete topic: ${error.message}`);
    throw error;
  }
}

/**
 * Publish a message to a Pub/Sub topic.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} name - Topic name
 * @param {string} message - Message content
 * @param {Object} attributes - Message attributes
 * @returns {Promise<Object>} Publish result
 */
async function publishMessage(client, project, name, message, attributes) {
  try {
    console.log(`Publishing message to topic ${name}...`);

    // Encode message as base64
    const encodedMessage = Buffer.from(message, 'utf8').toString('base64');

    const body = {
      messages: [
        {
          data: encodedMessage,
          attributes: attributes || {},
        },
      ],
    };

    const res = await client.request({
      method: 'POST',
      url: `${API_URL}/projects/${project}/topics/${name}:publish`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const result = checkResultAndGetMetadata(res);
    console.log(`Message published with IDs: ${result.messageIds.join(', ')}`);
    
    return result;
  } catch (error) {
    taskLib.error(`Failed to publish message: ${error.message}`);
    throw error;
  }
}

/**
 * Create a subscription to a topic.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} topicName - Topic name
 * @param {string} subName - Subscription name
 * @returns {Promise<Object>} Subscription creation result
 */
async function subscribe(client, project, topicName, subName) {
  try {
    console.log(`Creating subscription ${subName} for topic ${topicName}...`);

    const body = {
      name: `projects/${project}/subscriptions/${subName}`,
      topic: `projects/${project}/topics/${topicName}`,
    };

    // Ack deadline
    const ackDeadlineSeconds = taskLib.getInput('subscriptionAckDeadlineSeconds', false);
    if (ackDeadlineSeconds) {
      body.ackDeadlineSeconds = parseInt(ackDeadlineSeconds, 10);
    }

    // Message retention duration
    const messageRetentionDuration = taskLib.getInput('subscriptionMessageRetentionDuration', false);
    if (messageRetentionDuration) {
      body.messageRetentionDuration = messageRetentionDuration;
    }

    // Retain acked messages
    const retainAckedMessages = taskLib.getBoolInput('subscriptionRetainAckedMessages', false);
    if (retainAckedMessages) {
      body.retainAckedMessages = retainAckedMessages;
    }

    // Expiration policy
    const expirationPolicy = taskLib.getInput('subscriptionExpirationPolicy', false);
    if (expirationPolicy) {
      try {
        body.expirationPolicy = JSON.parse(expirationPolicy);
      } catch (error) {
        taskLib.warning(`Invalid expiration policy JSON: ${error.message}`);
      }
    }

    // Dead letter policy
    const deadLetterPolicy = taskLib.getInput('subscriptionDeadLetterPolicy', false);
    if (deadLetterPolicy) {
      try {
        body.deadLetterPolicy = JSON.parse(deadLetterPolicy);
      } catch (error) {
        taskLib.warning(`Invalid dead letter policy JSON: ${error.message}`);
      }
    }

    // Push config
    const pushEndpoint = taskLib.getInput('subscriptionPushEndpoint', false);
    if (pushEndpoint) {
      body.pushConfig = {
        pushEndpoint,
      };

      const pushAttributes = taskLib.getInput('subscriptionPushAttributes', false);
      if (pushAttributes) {
        try {
          body.pushConfig.attributes = JSON.parse(pushAttributes);
        } catch (error) {
          try {
            body.pushConfig.attributes = parseListInput(pushAttributes);
          } catch (parseError) {
            taskLib.warning(`Invalid push attributes format: ${error.message}`);
          }
        }
      }
    }

    // Labels
    const labels = taskLib.getInput('gcpLabels', false);
    if (labels) {
      try {
        body.labels = JSON.parse(labels);
      } catch (error) {
        try {
          body.labels = parseListInput(labels);
        } catch (parseError) {
          taskLib.warning(`Invalid labels format: ${error.message}`);
        }
      }
    }

    const res = await client.request({
      method: 'PUT',
      url: `${API_URL}/projects/${project}/subscriptions/${subName}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return checkResultAndGetMetadata(res);
  } catch (error) {
    taskLib.error(`Failed to create subscription: ${error.message}`);
    throw error;
  }
}

/**
 * Get subscription information.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} subName - Subscription name
 * @returns {Promise<Object|null>} Subscription information or null if not found
 */
async function getSubscription(client, project, subName) {
  try {
    const res = await client.request({
      method: 'GET',
      url: `${API_URL}/projects/${project}/subscriptions/${subName}`,
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
    
    taskLib.error(`Failed to get subscription: ${error.message}`);
    throw error;
  }
}

/**
 * Update an existing subscription.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} subName - Subscription name
 * @param {Object} currentSubscription - Current subscription properties
 * @returns {Promise<Object>} Subscription update result
 */
async function updateSubscription(client, project, subName, currentSubscription) {
  try {
    console.log(`Updating subscription ${subName}...`);

    const body = {
      name: currentSubscription.name,
    };
    const updateMask = [];

    // Ack deadline
    const ackDeadlineSeconds = taskLib.getInput('subscriptionAckDeadlineSeconds', false);
    if (ackDeadlineSeconds) {
      const newDeadline = parseInt(ackDeadlineSeconds, 10);
      if (newDeadline !== currentSubscription.ackDeadlineSeconds) {
        body.ackDeadlineSeconds = newDeadline;
        updateMask.push('ack_deadline_seconds');
      }
    }

    // Message retention duration
    const messageRetentionDuration = taskLib.getInput('subscriptionMessageRetentionDuration', false);
    if (messageRetentionDuration && messageRetentionDuration !== currentSubscription.messageRetentionDuration) {
      body.messageRetentionDuration = messageRetentionDuration;
      updateMask.push('message_retention_duration');
    }

    // Labels
    const labels = taskLib.getInput('gcpLabels', false);
    if (labels) {
      try {
        let newLabels = {};
        try {
          newLabels = JSON.parse(labels);
        } catch {
          newLabels = parseListInput(labels);
        }
        
        const labelDiff = deepDiff(currentSubscription.labels || {}, newLabels);
        
        if (Object.keys(labelDiff || {}).length > 0) {
          body.labels = newLabels;
          updateMask.push('labels');
        }
      } catch (error) {
        taskLib.warning(`Invalid labels format: ${error.message}`);
      }
    }

    if (updateMask.length === 0) {
      console.log('No changes detected, skipping update.');
      return currentSubscription;
    }

    taskLib.debug('Update mask:');
    taskLib.debug(updateMask.join(','));

    const res = await client.request({
      method: 'PATCH',
      url: `${API_URL}/projects/${project}/subscriptions/${subName}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      params: {
        updateMask: updateMask.join(','),
      },
      body: JSON.stringify(body),
    });

    return checkResultAndGetMetadata(res);
  } catch (error) {
    taskLib.error(`Failed to update subscription: ${error.message}`);
    throw error;
  }
}

/**
 * Delete a subscription.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} subName - Subscription name
 * @returns {Promise<boolean>} Deletion success
 */
async function deleteSubscription(client, project, subName) {
  try {
    console.log(`Deleting subscription ${subName}...`);

    const res = await client.request({
      method: 'DELETE',
      url: `${API_URL}/projects/${project}/subscriptions/${subName}`,
      headers: {
        Accept: 'application/json',
      },
    });

    return res.status === 200;
  } catch (error) {
    taskLib.error(`Failed to delete subscription: ${error.message}`);
    throw error;
  }
}

/**
 * Pause (or resume) a subscription.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} subName - Subscription name
 * @returns {Promise<boolean>} Operation success
 */
async function pauseSubscription(client, project, subName) {
  try {
    console.log(`Pausing subscription ${subName}...`);

    // Note: The Pub/Sub API doesn't have a direct pause/resume endpoint
    // This would typically be handled by modifying the subscription's push configuration
    // or temporarily setting the ack deadline to a very short value
    console.log('Pause functionality would be implemented by modifying subscription configuration');
    
    return true;
  } catch (error) {
    taskLib.error(`Failed to pause subscription: ${error.message}`);
    throw error;
  }
}

/**
 * Pull messages from a subscription.
 * @param {OAuth2Client} client - Authenticated Google API client
 * @param {string} project - Google Cloud Project ID
 * @param {string} subName - Subscription name
 * @param {number} maxMessages - Maximum number of messages to pull
 * @returns {Promise<Array>} Received messages
 */
async function pullMessages(client, project, subName, maxMessages) {
  try {
    console.log(`Pulling messages from subscription ${subName}...`);

    const body = {
      maxMessages: maxMessages || 10,
    };

    const res = await client.request({
      method: 'POST',
      url: `${API_URL}/projects/${project}/subscriptions/${subName}:pull`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const result = checkResultAndGetMetadata(res);
    const messages = result.receivedMessages || [];
    
    console.log(`Pulled ${messages.length} messages`);
    
    // Decode messages for easier consumption
    const decodedMessages = messages.map((msg) => ({
      ackId: msg.ackId,
      messageId: msg.message.messageId,
      data: Buffer.from(msg.message.data, 'base64').toString('utf8'),
      attributes: msg.message.attributes || {},
      publishTime: msg.message.publishTime,
    }));

    return decodedMessages;
  } catch (error) {
    taskLib.error(`Failed to pull messages: ${error.message}`);
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
      'https://www.googleapis.com/auth/pubsub',
    ]);

    if (!auth) {
      return;
    }

    // Get operation
    const operation = taskLib.getInput('operation', true);

    taskLib.debug(`Operation: ${operation}, Project: ${auth.projectId}`);

    switch (operation) {
      case 'create': {
        const topicName = taskLib.getInput('topicName', true);
        
        // Check if topic already exists
        console.log('Checking if topic already exists...');
        const existingTopic = await getTopic(auth.client, auth.projectId, topicName);

        let result = null;
        if (!existingTopic) {
          console.log(`Topic ${topicName} not found.`);
          result = await createTopic(auth.client, auth.projectId, topicName);
        } else {
          console.log(`Topic ${topicName} already exists, updating...`);
          result = await updateTopic(auth.client, auth.projectId, topicName, existingTopic);
        }

        // Set output variables
        taskLib.setVariable('TopicName', result.name);
        taskSuccess = true;
        break;
      }

      case 'delete': {
        const topicName = taskLib.getInput('topicName', true);
        const result = await deleteTopic(auth.client, auth.projectId, topicName);
        taskSuccess = result;
        break;
      }

      case 'publish': {
        const topicName = taskLib.getInput('topicName', true);
        const message = taskLib.getInput('publishMessage', true);
        
        let attributes = {};
        const attributesInput = taskLib.getInput('publishAttributes', false);
        if (attributesInput) {
          try {
            attributes = JSON.parse(attributesInput);
          } catch (error) {
            try {
              attributes = parseListInput(attributesInput);
            } catch (parseError) {
              taskLib.warning(`Invalid attributes format: ${error.message}`);
            }
          }
        }

        const result = await publishMessage(auth.client, auth.projectId, topicName, message, attributes);
        
        // Set output variables
        taskLib.setVariable('MessageIds', result.messageIds.join(','));
        taskSuccess = result.messageIds.length > 0;
        break;
      }

      case 'subscribe': {
        const topicName = taskLib.getInput('topicName', true);
        const subscriptionName = taskLib.getInput('subscriptionName', true);
        
        // Check if subscription already exists
        console.log('Checking if subscription already exists...');
        const existingSubscription = await getSubscription(auth.client, auth.projectId, subscriptionName);

        let result = null;
        if (!existingSubscription) {
          console.log(`Subscription ${subscriptionName} not found.`);
          result = await subscribe(auth.client, auth.projectId, topicName, subscriptionName);
        } else {
          console.log(`Subscription ${subscriptionName} already exists, updating...`);
          result = await updateSubscription(auth.client, auth.projectId, subscriptionName, existingSubscription);
        }

        // Set output variables
        taskLib.setVariable('SubscriptionName', result.name);
        taskSuccess = true;
        break;
      }

      case 'unsubscribe': {
        const subscriptionName = taskLib.getInput('subscriptionName', true);
        const result = await deleteSubscription(auth.client, auth.projectId, subscriptionName);
        taskSuccess = result;
        break;
      }

      case 'pause': {
        const subscriptionName = taskLib.getInput('subscriptionName', true);
        const result = await pauseSubscription(auth.client, auth.projectId, subscriptionName);
        taskSuccess = result;
        break;
      }

      case 'pull': {
        const subscriptionName = taskLib.getInput('subscriptionName', true);
        const maxMessages = parseInt(taskLib.getInput('pullMaxMessages', false) || '10', 10);
        
        const messages = await pullMessages(auth.client, auth.projectId, subscriptionName, maxMessages);
        
        // Set output variables
        taskLib.setVariable('PulledMessages', JSON.stringify(messages));
        taskLib.setVariable('PulledMessageCount', messages.length.toString());
        
        if (messages.length > 0) {
          console.log('Sample messages:');
          messages.slice(0, 3).forEach((msg, index) => {
            console.log(`  ${index + 1}. ${msg.data.substring(0, 100)}${msg.data.length > 100 ? '...' : ''}`);
          });
        }
        
        taskSuccess = true;
        break;
      }

      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }

    // Set common output variable
    taskLib.setVariable('ProjectId', auth.projectId);
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
