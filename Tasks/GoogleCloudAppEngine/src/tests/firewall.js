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
tmr.setInput('operation', 'firewall');
tmr.setInput('fwRange', '192.18.0.1/24');
tmr.setInput('fwPriority', '100000');
tmr.setInput('fwAction', 'ALLOW');
tmr.setInput('fwDescription', 'integrated-tests');

tmr.run();
