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

const region = 'us-east1';
const name = 'gcptasktest';

tmr.setInput('authenticationMethod', 'serviceAccount');
tmr.setInput('SCserviceAccount', 'test-runner');
tmr.setInput('operation', 'call');
tmr.setInput('gcpRegion', region);
tmr.setInput('funcName', name);
tmr.setInput('funcCallData', '{"name":"tester"}');

tmr.run();
