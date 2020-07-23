/* eslint-disable func-names */
/* eslint-disable object-shorthand */
const tmrm = require('azure-pipelines-task-lib/mock-run');
const path = require('path');

const taskPath = path.join(__dirname, '..', 'main.js');
const tmr = new tmrm.TaskMockRunner(taskPath);

const region = 'us-east1';
const name = 'gcptasktest';
const zipFile = path.join(__dirname, '..', '..', 'example', 'helloworld.zip');

tmr.setAnswers({
  exist: {
    'credentials.json': true,
    [zipFile]: true,
  },
});

tmr.setInput('authenticationMethod', 'serviceAccount');
tmr.setInput('SCserviceAccount', 'test-runner');
tmr.setInput('operation', 'create');
tmr.setInput('gcpRegion', region);
tmr.setInput('funcName', name);
tmr.setInput('funcTrigger', 'https');
tmr.setInput('funcHttpsAnonym', true);
// tmr.setInput('funcBucket', '');
// tmr.setInput('funcTopic', '');
// tmr.setInput('funcEvent', '');
// tmr.setInput('funcEventResource', '');
tmr.setInput('funcDesc', 'Unit tests');
tmr.setInput('funcSourceMode', 'zip');
tmr.setInput('funcSourceZip', zipFile);
// tmr.setInput('funcSourceRepo', '');
// tmr.setInput('funcSourceArchive', '');
tmr.setInput('funcEntryPoint', 'helloHttp');
// tmr.setInput('funcServiceAccount', '');
tmr.setInput('funcRuntime', 'nodejs12');
tmr.setInput('funcTimeout', '60s');
tmr.setInput('funcMemory', '256');
tmr.setInput('funcMaxInstances', '1');
tmr.setInput('funcEnvVars', '');
tmr.setInput('networkMode', 'connector');
// tmr.setInput('funcNetwork', '');
tmr.setInput('funcVpcConnector', '');
tmr.setInput('funcVpcConnectorEgress', 'VPC_CONNECTOR_EGRESS_SETTINGS_UNSPECIFIED');
tmr.setInput('funcVpcConnectorIngress', 'INGRESS_SETTINGS_UNSPECIFIED');
// tmr.setInput('deploySourceMode', '');
// tmr.setInput('deploySourceZip', '');
// tmr.setInput('deploySourceRepo', '');
// tmr.setInput('deploySourceArchive', '');
// tmr.setInput('gcpLabels', '');

tmr.run();
