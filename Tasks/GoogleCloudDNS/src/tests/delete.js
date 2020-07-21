/* eslint-disable func-names */
/* eslint-disable object-shorthand */
const tmrm = require('azure-pipelines-task-lib/mock-run');
const path = require('path');

const taskPath = path.join(__dirname, '..', 'main.js');
const tmr = new tmrm.TaskMockRunner(taskPath);

const region = 'us-east1';
const zone = 'nexso-public';
const name = 'dnsunittest.nexso.com.br';

tmr.setAnswers({
  exist: {
    'credentials.json': true,
  },
});

tmr.setInput('authenticationMethod', 'serviceAccount');
tmr.setInput('SCserviceAccount', 'test-runner');
tmr.setInput('operation', 'delete');
tmr.setInput('gcpRegion', region);
tmr.setInput('recordZone', zone);
tmr.setInput('recordName', name);
// tmr.setInput('outputTemplate', 'firstval');
tmr.setInput('recordType', 'A');
tmr.setInput('recordValue', '150.250.175.65');
tmr.setInput('recordTtl', '5');

tmr.run();
