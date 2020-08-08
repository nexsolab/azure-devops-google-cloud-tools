/* eslint-disable func-names */
/* eslint-disable object-shorthand */
const tmrm = require('azure-pipelines-task-lib/mock-run');
const path = require('path');

const taskPath = path.join(__dirname, '..', 'main.js');
const tmr = new tmrm.TaskMockRunner(taskPath);

tmr.setAnswers({
  exist: {
    'credentials.json': true,
  },
});

const endpointUrl = 'https://example.com';

tmr.setInput('authenticationMethod', 'serviceAccount');
tmr.setInput('SCserviceAccount', 'test-runner');
tmr.setInput('operation', 'subscribe');
tmr.setInput('topicName', 'test');

tmr.setInput('subName', 'subtest');
// tmr.setInput('subAckDeadlineSeconds', '10');
// tmr.setInput('subMessageOrdering', false);
// tmr.setInput('subVpcSC', false);
// tmr.setInput('subFilter', '');
tmr.setInput('subMechanism', 'auto');
tmr.setInput('subAutoLargeVolume', false);
tmr.setInput('subAutoThroughput', false);
tmr.setInput('subAutoMultiple', true);
tmr.setInput('subAutoServerless', true);
tmr.setInput('subAutoPublic', 'push');
tmr.setInput('subAutoFlowControl', 'push');
tmr.setInput('subPushEndpoint', endpointUrl);
tmr.setInput('subPushAuth', false);
tmr.setInput('subPushServiceAccountEmail', 'yyyyyy');
// tmr.setInput('subPushAudience', 'example.com');
// tmr.setInput('subPushAttributes', '');
// tmr.setInput('subRetainAcked', false);
// tmr.setInput('subMessageRetentionDuration', '7');
// tmr.setInput('subMessageRetentionDurationUnit', 'd');
// tmr.setInput('subExpires', true);
// tmr.setInput('subExpirationTtl', '31');
// tmr.setInput('subDeadLetter', false);
// tmr.setInput('subDeadLetterTopic', '');
// tmr.setInput('subDeadLetterAttempts', '5');
// tmr.setInput('subRetryMinBackoff', '10');
// tmr.setInput('subRetryMaxBackoff', '600');

tmr.setInput('subMaxMessages', 'yyyyyy');

tmr.run();
