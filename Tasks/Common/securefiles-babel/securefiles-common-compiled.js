"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _fs = _interopRequireDefault(require("fs"));

var tl = _interopRequireWildcard(require("azure-pipelines-task-lib/task"));

var _azureDevopsNodeApi = require("azure-devops-node-api");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class SecureFileHelpers {
  constructor(retryCount) {
    const serverUrl = tl.getVariable('System.TeamFoundationCollectionUri');
    const serverCreds = tl.getEndpointAuthorizationParameter('SYSTEMVSSCONNECTION', 'ACCESSTOKEN', false);
    const authHandler = (0, _azureDevopsNodeApi.getPersonalAccessTokenHandler)(serverCreds); // Default to 5 if not specified

    const maxRetries = retryCount && retryCount >= 0 ? retryCount : 5;
    tl.debug(`Secure file retry count set to: ${maxRetries}`);
    const proxy = tl.getHttpProxyConfiguration();
    let options = {
      allowRetries: true,
      maxRetries
    };

    if (proxy) {
      options = _objectSpread(_objectSpread({}, options), {}, {
        proxy,
        ignoreSslError: true
      });
    }

    this.serverConnection = new _azureDevopsNodeApi.WebApi(serverUrl, authHandler, options);
  }
  /**
   * Download secure file contents to a temporary location for the build
   * @param secureFileId
   */


  downloadSecureFile(secureFileId) {
    var _this = this;

    return _asyncToGenerator(function* () {
      const tempDownloadPath = _this.getSecureFileTempDownloadPath(secureFileId);

      tl.debug(`Downloading secure file contents to: ${tempDownloadPath}`);

      const file = _fs.default.createWriteStream(tempDownloadPath);

      const agentApi = yield _this.serverConnection.getTaskAgentApi();
      const ticket = tl.getSecureFileTicket(secureFileId);

      if (!ticket) {
        // Workaround bug #7491. tl.loc only works if the consuming tasks define the resource string.
        throw new Error(`Download ticket for SecureFileId ${secureFileId} not found.`);
      }

      const stream = (yield agentApi.downloadSecureFile(tl.getVariable('SYSTEM.TEAMPROJECT'), secureFileId, ticket, false)).pipe(file);
      yield new Promise(resolve => {
        stream.on('finish', () => {
          tl.debug(`Downloaded secure file contents to: ${tempDownloadPath}`);
          resolve();
        });
      });
      return tempDownloadPath;
    })();
  }
  /**
   * Delete secure file from the temporary location for the build
   * @param secureFileId
   */


  deleteSecureFile(secureFileId) {
    const tempDownloadPath = this.getSecureFileTempDownloadPath(secureFileId);

    if (tl.exist(tempDownloadPath)) {
      tl.debug(`Deleting secure file at: ${tempDownloadPath}`);
      tl.rmRF(tempDownloadPath);
    }
  }
  /**
   * Returns the temporary download location for the secure file
   * @param secureFileId
   */
  // eslint-disable-next-line class-methods-use-this


  getSecureFileTempDownloadPath(secureFileId) {
    const fileName = tl.getSecureFileName(secureFileId);
    return tl.resolve(tl.getVariable('Agent.TempDirectory'), fileName);
  }

}

var _default = SecureFileHelpers;
exports.default = _default;
