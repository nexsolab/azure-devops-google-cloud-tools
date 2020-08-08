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
tmr.setInput('topicName', 'test');
tmr.setInput('topicKmsKey', '');
tmr.setInput('topicPersistenceRegions', 'us-east1');
// tmr.setInput('xxxxxxx', 'yyyyyy');

tmr.run();
