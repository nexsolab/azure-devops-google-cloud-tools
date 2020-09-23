/* eslint-disable func-names */
/* eslint-disable object-shorthand */
const tmrm = require('azure-pipelines-task-lib/mock-run');
const path = require('path');

const taskPath = path.join(__dirname, '..', 'main.js');
const tmr = new tmrm.TaskMockRunner(taskPath);

tmr.setAnswers({
  exist: {
    'credentials.json': true,
    'certificate.crt': true,
    'private.key': true,
  },
});

// Fill this fields
const dns = 'sub.example.com';

tmr.setInput('authenticationMethod', 'serviceAccount');
tmr.setInput('SCserviceAccount', 'test-runner');
tmr.setInput('operation', 'create');
tmr.setInput('gcpRegion', 'us-east1');
// tmr.setInput('gcpLabels', '');
// tmr.setInput('appServingStatus', 'serving');
// tmr.setInput('appCookieExp', '86400s');
// tmr.setInput('appGCRDomain', '');
// tmr.setInput('appAuthDomain', '');
// tmr.setInput('appDatabase', '');
// tmr.setInput('appOptimizedOS', true);
// tmr.setInput('appIap', true);
// tmr.setInput('appIapClientId', '');
// tmr.setInput('appIapClientSecret', '');
tmr.setInput('appCustomDNS', true);
tmr.setInput('appCustomCert', true);
tmr.setInput('certificateName', 'cert-test');
tmr.setInput('certificateSource', 'path');
// tmr.setInput('certificateSecure', '');
tmr.setInput('certificatePath', '**/certificate.crt');
// tmr.setInput('certificateRaw', '');
// tmr.setInput('certificateKeySecure', '');
tmr.setInput('certificateKeyPath', '**/*.key');
// tmr.setInput('certificateKeyRaw', '');
tmr.setInput('certificateDeployMode', 'complete');
tmr.setInput('customDns', dns);
tmr.setInput('customDnsAssociate', true);
tmr.setInput('waitOperation', true);
// tmr.setInput('xxxxxxx', 'yyyyyy');

tmr.run();
