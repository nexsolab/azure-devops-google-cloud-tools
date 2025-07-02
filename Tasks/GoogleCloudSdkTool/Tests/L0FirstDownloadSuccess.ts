import ma = require('azure-pipelines-task-lib/mock-answer');
import tmrm = require('azure-pipelines-task-lib/mock-run');
import os = require('os');
import path = require('path');

const taskPath = path.join(__dirname, '..', 'gcloudcli.js');
const tmr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

tmr.setInput('versionSpec', '283.0.0');
tmr.setInput('checkLatest', 'false');

const a: ma.TaskLibAnswers = <ma.TaskLibAnswers>{
  assertAgent: {
    '2.115.1': true,
  },
};
tmr.setAnswers(a);

// Create assertAgent and getVariable mocks
const tl = require('azure-pipelines-task-lib/mock-task');

const tlClone = { ...tl };
tlClone.getVariable = function (variable: string) {
  if (variable.toLowerCase() == 'agent.tempdirectory') {
    return 'temp';
  }
  return null;
};
tlClone.assertAgent = function (variable: string) {

};
tmr.registerMock('azure-pipelines-task-lib/mock-task', tlClone);

// Create tool-lib mock
tmr.registerMock('azure-pipelines-tool-lib/tool', {
  isExplicitVersion(versionSpec) {
    return false;
  },
  findLocalTool(toolName, versionSpec) {
    if (toolName != 'gcloud') {
      throw new Error('Searching for wrong tool');
    }
    return false;
  },
  evaluateVersions(versions, versionSpec) {
    let version: string;
    for (let i = versions.length - 1; i >= 0; i--) {
      const potential: string = versions[i];
      const satisfied: boolean = potential === 'v283.0.0';
      if (satisfied) {
        version = potential;
        break;
      }
    }
    return version;
  },
  cleanVersion(version) {
    return '283.0.0';
  },
  downloadTool(url) {
    const arch = os.arch() === 'x64' ? 'x86_64' : 'x86';
    if (url === `https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-sdk-283.0.0-windows-${arch}.zip`
            || url === `https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-sdk-283.0.0-${os.platform()}-${arch}.tar.gz`) {
      return 'location';
    }

    throw new Error(`Incorrect URL ${url} for ${os.platform()}-${arch}`);
  },
  extractZip(downloadPath, extPath) {
    return 'extPath';
  },
  extractTar(downloadPath, extPath, _7zPath) {
    return 'extPath';
  },
  cacheDir(dir, tool, version) {
    return 'path to tool';
  },
  prependPath(toolPath) {

  },
});

tmr.run();
