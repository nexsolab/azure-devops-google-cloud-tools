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
tmr.setInput('operation', 'update');
tmr.setInput('appCookieExp', '1209600s');
tmr.setInput('appAuthDomain', 'gmail.com');
tmr.setInput('appCustomDNS', false);
tmr.setInput('appCustomCert', false);
// tmr.setInput('certificateName', 'cert-test');
// tmr.setInput('certificateSource', 'path');
// tmr.setInput('certificateSecure', '');
// tmr.setInput('certificatePath', '');
// tmr.setInput('certificateRaw', '');
// tmr.setInput('certificateKeySecure', '');
// tmr.setInput('certificateKeyPath', '');
// tmr.setInput('certificateKeyRaw', '');
// tmr.setInput('certificateDeployMode', 'complete');
// tmr.setInput('customDns', dns);
// tmr.setInput('customDnsAssociate', true);
tmr.setInput('waitOperation', true);

tmr.run();
