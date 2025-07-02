/**
 * @fileoverview Shared utility functions for Google Cloud Platform tasks
 * @author Gabriel Anderson
 */

import * as taskLib from 'azure-pipelines-task-lib/task';

/**
 * Check a result of a Rest call and fail task when response is not successful.
 *
 * @param {import('gaxios').GaxiosResponse} res The Rest API response
 * @returns {*} The metadata of the operation.
 */
export function checkResultAndGetData(res) {
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
 * Check a result of a Rest call and return metadata for operations.
 *
 * @param {import('gaxios').GaxiosResponse} res The Rest API response
 * @returns {*} The metadata of the operation.
 */
export function checkResultAndGetMetadata(res) {
  taskLib.debug('Result from operation:');
  taskLib.debug(JSON.stringify({
    status: res.status,
    statusText: res.statusText,
    data: res.data,
  }, null, 2));

  if (res.status >= 400 || !res.data) {
    if (res.data && res.data.error) {
      taskLib.error(`${res.data.error.code} - ${res.data.error.message}`);
      if (res.data.error.details) {
        taskLib.debug(res.data.error.details.join('\n'));
      }
    }
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  return res.data;
}

/**
 * Set output variables based on operation result.
 *
 * @param {Object} result The operation result
 */
export function setOutput(result) {
  if (!result) return;

  // Set common output variables
  if (result.name) {
    taskLib.setVariable('FunctionName', result.name);
  }

  if (result.metadata) {
    if (result.metadata.httpsTrigger && result.metadata.httpsTrigger.url) {
      taskLib.setVariable('FunctionUrl', result.metadata.httpsTrigger.url);
    }

    if (result.metadata.versionId) {
      taskLib.setVariable('FunctionVersionId', result.metadata.versionId);
    }
  }

  // Log the operation type
  if (result.type) {
    console.log(`Operation completed: ${result.type}`);
  }
}

/**
 * Parse the value of Parameters Grid input
 *
 * @author Gabriel Anderson
 * @param {string} list The value of the input
 * @returns {object} Key-value
 */
export function parseListInput(list) {
  const result = {};
  if (!list || list.trim() === '') return result;

  const lines = list.split('\n');
  lines.forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine === '') return;

    const separatorIndex = trimmedLine.indexOf('=');
    if (separatorIndex === -1) {
      // No separator, treat as boolean flag
      result[trimmedLine] = true;
    } else {
      const key = trimmedLine.substring(0, separatorIndex).trim();
      const value = trimmedLine.substring(separatorIndex + 1).trim();
      result[key] = value;
    }
  });

  return result;
}

/**
 * Get a list of properties from a deep object.
 *
 * @param {Object} obj The object to get the keys
 * @returns {string[]} The paths of object keys.
 */
export function propertiesToArray(obj) {
  const keys = [];

  function getKeys(object, prefix = '') {
    Object.keys(object).forEach((key) => {
      const currentPath = prefix ? `${prefix}.${key}` : key;

      if (typeof object[key] === 'object' && object[key] !== null && !Array.isArray(object[key])) {
        getKeys(object[key], currentPath);
      } else {
        keys.push(currentPath);
      }
    });
  }

  getKeys(obj);
  return keys;
}

/**
 * Converts an input text to a number
 *
 * @param {String} name Task input name
 * @param {Boolean} [required=false]
 * @returns {Number} The number converted from string or `undefined`
 */
export function getNumberInput(name, required = false) {
  const input = taskLib.getInput(name, required);
  if (!input) return undefined;

  const parsed = parseInt(input, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Input '${name}' must be a valid number, got: ${input}`);
  }

  return parsed;
}

/**
 * Find file with glob patterns
 *
 * @param {String} filepath File Pattern
 * @returns {String[]} List of files found
 */
export function findMatchingFiles(filepath) {
  if (!filepath) return [];

  const files = taskLib.findMatch(process.cwd(), filepath);
  return files || [];
}

/**
 * Set task result based on success/failure
 *
 * @param {boolean} success Whether the task was successful
 * @param {string} [message] Optional message for failure
 */
export function setTaskResult(success, message = '') {
  if (success) {
    taskLib.setResult(taskLib.TaskResult.Succeeded);
  } else {
    taskLib.setResult(taskLib.TaskResult.Failed, message);
  }
}

/**
 * Handle async errors in main function
 *
 * @param {Error} error The error that occurred
 */
export function handleError(error) {
  console.error(`Failed: ${error.message}`);
  taskLib.debug(error.stack || error);
  taskLib.setResult(taskLib.TaskResult.Failed, error.message);
}
