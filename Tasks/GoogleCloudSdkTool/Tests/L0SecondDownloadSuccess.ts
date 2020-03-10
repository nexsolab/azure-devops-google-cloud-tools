import ma = require('azure-pipelines-task-lib/mock-answer');
import tmrm = require('azure-pipelines-task-lib/mock-run');
import os = require('os');
import path = require('path');

let taskPath = path.join(__dirname, '..', 'gcloudcli.js');
let tmr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

tmr.setInput('versionSpec', '280.0.0');
tmr.setInput('checkLatest', 'false');

let a: ma.TaskLibAnswers = <ma.TaskLibAnswers>{
    "assertAgent": {
        "2.115.1": true
    }};
tmr.setAnswers(a);


//Create assertAgent and getVariable mocks
const tl = require('azure-pipelines-task-lib/mock-task');
const tlClone = Object.assign({}, tl);
tlClone.getVariable = function(variable: string) {
    if (variable.toLowerCase() == 'agent.tempdirectory') {
        return 'temp';
    }
    return null;
};
tlClone.assertAgent = function(variable: string) {
    return;
};
tmr.registerMock('azure-pipelines-task-lib/mock-task', tlClone);

//Create tool-lib mock
tmr.registerMock('azure-pipelines-tool-lib/tool', {
    isExplicitVersion: function(versionSpec) {
        return false;
    },
    findLocalTool: function(toolName, versionSpec) {
        if (toolName != 'gcloud') { 
            throw new Error('Searching for wrong tool');
        }
        return false;
    },
    evaluateVersions: function(versions, versionSpec) {
        let version: string;
        for (let i = versions.length - 1; i >= 0; i--) {
            let potential: string = versions[i];
            let satisfied: boolean = potential === 'v280.0.0';
            if (satisfied) {
                version = potential;
                break;
            }
        }
        return version;
    },
    cleanVersion: function(version) {
        return '280.0.0';
    },
    downloadTool(url) {
        if (url === `https://storage.googleapis.com/cloud-sdk-release/google-cloud-sdk-280.0.0-windows-${os.arch()}.zip` ||
            url === `https://storage.googleapis.com/cloud-sdk-release/google-cloud-sdk-280.0.0-${os.platform()}-${os.arch()}.tar.gz`) {
            let err = new Error();
            err['httpStatusCode'] = 404;
            throw err;
        }
        else if (url === `https://storage.googleapis.com/cloud-sdk-release/google-cloud-sdk-280.0.0-windows-${os.arch()}/node.exe`) {
            return 'exe_loc';
        }
        else if (url === `https://storage.googleapis.com/cloud-sdk-release/google-cloud-sdk-280.0.0-windows-${os.arch()}/node.lib`) {
            return 'exe_lib';
        }
        else {
            throw new Error('Incorrect URL');
        }
    },
    extract7z(downloadPath, extPath, _7zPath) {
        return 'extPath';
    },
    extractTar(downloadPath, extPath, _7zPath) {
        return 'extPath';
    },
    cacheDir(dir, tool, version) {
        return 'path to tool';
    },
    prependPath(toolPath) {
        return;
    }
});

tmr.run();