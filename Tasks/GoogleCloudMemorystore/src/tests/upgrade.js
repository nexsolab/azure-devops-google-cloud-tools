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
tmr.setInput('operation', 'upgrade');
tmr.setInput('gcpRegion', 'us-east1');
tmr.setInput('instanceName', 'gcptoolsredis');
tmr.setInput('redisVersion', 'REDIS50');
tmr.setInput('waitOperation', true);

tmr.run();
