"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _fs = _interopRequireDefault(require("fs"));

var _azureDevopsNodeApi = require("azure-devops-node-api");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class SecureFileHelpers {
  constructor(collectionUri, credential, proxy, retryCount = 5) {
    const authHandler = (0, _azureDevopsNodeApi.getPersonalAccessTokenHandler)(credential);
    const maxRetries = retryCount && retryCount >= 0 ? retryCount : 5;
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

    this.serverConnection = new _azureDevopsNodeApi.WebApi(collectionUri, authHandler, options);
  }
  /**
   * Download secure file contents to a temporary location for the build
   * @param secureFileId
   */


  downloadSecureFile(secureFileId, tempDownloadPath, ticket, project) {
    var _this = this;

    return _asyncToGenerator(function* () {
      const file = _fs.default.createWriteStream(tempDownloadPath);

      const agentApi = yield _this.serverConnection.getTaskAgentApi();

      if (!ticket) {
        throw new Error(`Download ticket for SecureFileId ${secureFileId} not found.`);
      }

      const stream = (yield agentApi.downloadSecureFile(project, secureFileId, ticket, false)).pipe(file);
      yield new Promise(resolve => {
        stream.on('finish', () => {
          resolve();
        });
      });
      return tempDownloadPath;
    })();
  }

}

var _default = SecureFileHelpers;
exports.default = _default;
