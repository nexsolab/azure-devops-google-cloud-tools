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

tmr.setInput('authenticationMethod', 'serviceAccount');
tmr.setInput('SCserviceAccount', 'test-runner');
tmr.setInput('operation', 'create');
tmr.setInput('gcpRegion', 'us-east1');
// tmr.setInput('gcpLabels', '');
tmr.setInput('instanceName', 'gcptoolsredis');
tmr.setInput('instanceDisplayName', 'GCP Tools Redis Test');
tmr.setInput('instanceTier', 'BASIC');
tmr.setInput('instanceMemorySize', '1');
tmr.setInput('instanceNetwork', '');
tmr.setInput('instanceConnectMode', 'DIRECT');
// tmr.setInput('instanceZone', '');
// tmr.setInput('instanceAlternativeZone', '');
// tmr.setInput('instanceIpRange', '');
tmr.setInput('redisVersion', 'REDIS40');
tmr.setInput('redisMaxMemoryPolicy', 'volatile-lru');
// tmr.setInput('redisNotifyEvents', '');
tmr.setInput('redisActiveDefrag', false);
tmr.setInput('redisLfuDecayTime', '1');
tmr.setInput('redisLfuLogFactor', '10');
tmr.setInput('redisStreamMaxBytes', '4096');
tmr.setInput('redisStreamMaxEntries', '100');
tmr.setInput('waitOperation', true);
// tmr.setInput('xxxxxxx', 'yyyyyy');

tmr.run();
