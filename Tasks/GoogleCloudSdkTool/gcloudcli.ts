import * as taskLib from 'azure-pipelines-task-lib/task';
import * as toolLib from 'azure-pipelines-tool-lib/tool';
import * as restm from 'typed-rest-client/RestClient';
import * as os from 'os';
import * as path from 'path';

let osPlat: string = os.platform();
let osArch: string = getArch();
// Google uses x64 as x86_64
if (osArch === 'x64') osArch = 'x86_64';

async function run() {
    try {
        let versionSpec = taskLib.getInput('versionSpec', true);
        let checkLatest: boolean = taskLib.getBoolInput('checkLatest', false);
        await getCloudSdk(versionSpec, checkLatest);
    }
    catch (error) {
        taskLib.setResult(taskLib.TaskResult.Failed, error.message);
    }
}

//
// Cloud SDK CLI versions interface
// see https://console.cloud.google.com/storage/browser/cloud-sdk-release
//
interface IDocketManifestHistory {
  v1Compatibility: string
}

interface IDocketManifest {
  schemaVersion: number,
  name: string,
  tag: string,
  architecture: string,
  history: IDocketManifestHistory[]
}

interface IDocketAuth {
  token: string,
  access_token: string,
  expires_in: number,
  issued_at: string
}

async function getCloudSdk(versionSpec: string, checkLatest: boolean) {
    if (toolLib.isExplicitVersion(versionSpec)) {
        checkLatest = false; // check latest doesn't make sense when explicit version
    }

    // check cache
    let toolPath: string;
    if (!checkLatest) {
        toolPath = toolLib.findLocalTool('gcloud', versionSpec);
    }

    if (!toolPath) {
        let version: string;
        if (toolLib.isExplicitVersion(versionSpec)) {
            // version to download
            version = versionSpec;
        }
        else {
            // query nodejs.org for a matching version
            version = await queryLatestMatch(versionSpec);
            if (!version) {
                throw new Error(`Unable to find Cloud SDK version '${versionSpec}' for platform ${osPlat} and architecture ${osArch}.`);
            }

            // check cache
            toolPath = toolLib.findLocalTool('gcloud', version)
        }

        if (!toolPath) {
            // download, extract, cache
            toolPath = await acquireCloudSdk(version);
        }
    }

    //
    // a tool installer initimately knows details about the layout of that tool
    // for example, node binary is in the bin folder after the extract on Mac/Linux.
    // layouts could change by version, by platform etc... but that's the tool installers job
    //
    if (osPlat != 'win32') {
        toolPath = path.join(toolPath, 'bin');
    }

    //
    // prepend the tools path. instructs the agent to prepend for future tasks
    //
    toolLib.prependPath(toolPath);
}

async function queryLatestMatch(versionSpec: string): Promise<string> {
  // get the manifest from Docker Hub
  const rest: restm.RestClient = new restm.RestClient('vsts-gcloud-tool');
  
  // authenticate
  const dockerAuthUrl: string = 'https://auth.docker.io/token?service=registry.docker.io&scope=repository:google/cloud-sdk:pull';
  const authentication: IDocketAuth = (await rest.get<IDocketAuth>(dockerAuthUrl)).result;
  const token: string = 'Bearer ' + authentication.token;
  
  // get manifest
  const docketManifestUrl: string = 'https://registry-1.docker.io/v2/google/cloud-sdk/manifests/latest';
  const manifest: IDocketManifest = (await rest.get<IDocketManifest>(docketManifestUrl, {
      additionalHeaders: {
          'Authorization': token
      }
  })).result;
  const json: any = JSON.parse(manifest.history[0].v1Compatibility);
  const envVar: string[] = json.config.Env[1].split('=');
  const version: string = envVar[1];
  
  return version;
}

async function acquireCloudSdk(version: string): Promise<string> {
    //
    // Download - a tool installer intimately knows how to get the tool (and construct urls)
    //
    version = toolLib.cleanVersion(version);
    
    const baseUrl: string = 'https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/';
    let dataFileName: string;
    switch (osPlat) {
        case "linux": dataFileName = "linux-" + osArch + '.tar.gz'; break;
        case "darwin": dataFileName = "darwin-" + osArch + '.tar.gz'; break;
        case "win32": dataFileName = "windows-" + osArch + '.zip'; break;
        default: throw new Error(`Unexpected OS '${osPlat}'`);
    }

    // https://storage.googleapis.com/cloud-sdk-release/google-cloud-sdk-283.0.0-linux-x86_64.tar.gz
    let downloadUrl = baseUrl + 'google-cloud-sdk-' + version + '-' + dataFileName;
    let downloadPath: string = await toolLib.downloadTool(downloadUrl);
    
    //
    // Extract
    //
    let extPath: string;
    if (osPlat == 'win32') {
        taskLib.assertAgent('2.115.0');
        extPath = taskLib.getVariable('Agent.TempDirectory');
        
        if (!extPath) {
            throw new Error('Expected Agent.TempDirectory to be set');
        }

        extPath = await toolLib.extractZip(downloadPath, extPath);
    }
    else {
        extPath = await toolLib.extractTar(downloadPath);
    }

    //
    // Install into the local tool cache - node extracts with a root folder that matches the fileName downloaded
    //
    let toolRoot = path.join(extPath, 'google-cloud-sdk');
    return await toolLib.cacheDir(toolRoot, 'gcloud', version);
}

function getArch(): string {
    let arch: string = os.arch();
    if (arch === 'ia32') {
        arch = 'x86';
    }
    return arch;
}

run();
