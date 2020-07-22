import fs from 'fs';
import { getPersonalAccessTokenHandler, WebApi } from 'azure-devops-node-api';

class SecureFileHelpers {
  constructor(collectionUri, credential, proxy, retryCount = 5) {
    const authHandler = getPersonalAccessTokenHandler(credential);
    const maxRetries = retryCount && retryCount >= 0 ? retryCount : 5;

    let options = {
      allowRetries: true,
      maxRetries,
    };

    if (proxy) {
      options = {
        ...options,
        proxy,
        ignoreSslError: true,
      };
    }

    this.serverConnection = new WebApi(collectionUri, authHandler, options);
  }

  /**
   * Download secure file contents to a temporary location for the build
   * @param secureFileId
   */
  async downloadSecureFile(secureFileId, tempDownloadPath, ticket, project) {
    const file = fs.createWriteStream(tempDownloadPath);
    const agentApi = await this.serverConnection.getTaskAgentApi();

    if (!ticket) {
      throw new Error(`Download ticket for SecureFileId ${secureFileId} not found.`);
    }

    const stream = (await agentApi.downloadSecureFile(
      project, secureFileId, ticket, false,
    )).pipe(file);

    await new Promise((resolve) => {
      stream.on('finish', () => {
        resolve();
      });
    });

    return tempDownloadPath;
  }
}

export default SecureFileHelpers;
