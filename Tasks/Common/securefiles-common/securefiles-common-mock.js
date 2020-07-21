"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const tl = require("azure-pipelines-task-lib/task");
class SecureFileHelpers {
    constructor(retryCount) {
        tl.debug('Mock SecureFileHelpers constructor');
        if (retryCount) {
            tl.debug('Mock SecureFileHelpers retry count set to: ' + retryCount);
        }
        else {
            tl.debug('Mock SecureFileHelpers retry count not set.');
        }
    }
    downloadSecureFile(secureFileId) {
        return __awaiter(this, void 0, void 0, function* () {
            tl.debug('Mock downloadSecureFile with id = ' + secureFileId);
            const fileName = `${secureFileId}${SecureFileHelpers.fileExtension}`;
            const tempDownloadPath = `/build/temp/${fileName}`;
            return tempDownloadPath;
        });
    }
    deleteSecureFile(secureFileId) {
        tl.debug('Mock deleteSecureFile with id = ' + secureFileId);
    }
    static setFileExtension(extension) {
        this.fileExtension = extension;
    }
}
exports.SecureFileHelpers = SecureFileHelpers;
SecureFileHelpers.fileExtension = ".filename";
