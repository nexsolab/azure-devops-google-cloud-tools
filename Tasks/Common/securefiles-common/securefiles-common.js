"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var Q = require("q");
var tl = require("azure-pipelines-task-lib/task");
var azure_devops_node_api_1 = require("azure-devops-node-api");
var SecureFileHelpers = /** @class */ (function () {
    function SecureFileHelpers(retryCount) {
        var serverUrl = tl.getVariable('System.TeamFoundationCollectionUri');
        var serverCreds = tl.getEndpointAuthorizationParameter('SYSTEMVSSCONNECTION', 'ACCESSTOKEN', false);
        var authHandler = azure_devops_node_api_1.getPersonalAccessTokenHandler(serverCreds);
        var maxRetries = retryCount && retryCount >= 0 ? retryCount : 5; // Default to 5 if not specified
        tl.debug('Secure file retry count set to: ' + maxRetries);
        var proxy = tl.getHttpProxyConfiguration();
        var options = {
            allowRetries: true,
            maxRetries: maxRetries
        };
        if (proxy) {
            options = __assign(__assign({}, options), { proxy: proxy, ignoreSslError: true });
        }
        ;
        this.serverConnection = new azure_devops_node_api_1.WebApi(serverUrl, authHandler, options);
    }
    /**
     * Download secure file contents to a temporary location for the build
     * @param secureFileId
     */
    SecureFileHelpers.prototype.downloadSecureFile = function (secureFileId) {
        return __awaiter(this, void 0, void 0, function () {
            var tempDownloadPath, file, agentApi, ticket, stream, defer;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        tempDownloadPath = this.getSecureFileTempDownloadPath(secureFileId);
                        tl.debug('Downloading secure file contents to: ' + tempDownloadPath);
                        file = fs.createWriteStream(tempDownloadPath);
                        return [4 /*yield*/, this.serverConnection.getTaskAgentApi()];
                    case 1:
                        agentApi = _a.sent();
                        ticket = tl.getSecureFileTicket(secureFileId);
                        if (!ticket) {
                            // Workaround bug #7491. tl.loc only works if the consuming tasks define the resource string.
                            throw new Error("Download ticket for SecureFileId " + secureFileId + " not found.");
                        }
                        return [4 /*yield*/, agentApi.downloadSecureFile(tl.getVariable('SYSTEM.TEAMPROJECT'), secureFileId, ticket, false)];
                    case 2:
                        stream = (_a.sent()).pipe(file);
                        defer = Q.defer();
                        stream.on('finish', function () {
                            defer.resolve();
                        });
                        return [4 /*yield*/, defer.promise];
                    case 3:
                        _a.sent();
                        tl.debug('Downloaded secure file contents to: ' + tempDownloadPath);
                        return [2 /*return*/, tempDownloadPath];
                }
            });
        });
    };
    /**
     * Delete secure file from the temporary location for the build
     * @param secureFileId
     */
    SecureFileHelpers.prototype.deleteSecureFile = function (secureFileId) {
        var tempDownloadPath = this.getSecureFileTempDownloadPath(secureFileId);
        if (tl.exist(tempDownloadPath)) {
            tl.debug('Deleting secure file at: ' + tempDownloadPath);
            tl.rmRF(tempDownloadPath);
        }
    };
    /**
     * Returns the temporary download location for the secure file
     * @param secureFileId
     */
    SecureFileHelpers.prototype.getSecureFileTempDownloadPath = function (secureFileId) {
        var fileName = tl.getSecureFileName(secureFileId);
        return tl.resolve(tl.getVariable('Agent.TempDirectory'), fileName);
    };
    return SecureFileHelpers;
}());
exports.SecureFileHelpers = SecureFileHelpers;
