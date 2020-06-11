const diff = require('return-deep-diff');

function propertiesToArray(obj) {
  const isObject = (val) => typeof val === 'object' && !Array.isArray(val);

  const addDelimiter = (a, b) => (a ? `${a}.${b}` : b);

  // eslint-disable-next-line no-shadow
  const paths = (obj = {}, head = '') => Object.entries(obj)
    .reduce((product, [key, value]) => {
      const fullPath = addDelimiter(head, key);
      return isObject(value)
        ? product.concat(paths(value, fullPath))
        : product.concat(fullPath);
    }, []);

  return paths(obj);
}

const o = {
  "name": "projects/categorias/locations/us-east1/functions/marcas",
  "httpsTrigger": {
    "url": "https://us-east1-categorias.cloudfunctions.net/marcas"
  },
  "status": "ACTIVE",
  "entryPoint": "api",
  "timeout": "15s",
  "availableMemoryMb": 128,
  "serviceAccountEmail": "categorias@appspot.gserviceaccount.com",
  "updateTime": "2019-11-24T14:15:02.729Z",
  "versionId": "4",
  "labels": {
    "deployment-tool": "console-cloud"
  },
  "sourceUploadUrl": "https://storage.googleapis.com/gcf-upload-us-east1-f39be79b-1c8c-4975-82f1-c7015dc5497a/8db53747-f533-4321-8c60-280d7fb613fc.zip?GoogleAccessId=service-347162163714@gcf-admin-robot.iam.gserviceaccount.com&Expires=1574606670&Signature=asANxN%2Bb8aKlbQzbaQ9aGlL6%2F6DKT9jTQ1FooUCdruMm%2FOMbh4aBQQPMsDl8TolT1H93Hlh%2BGEpnVEO9fncEamikdHIhh3Og3IT5Ubu4yiqLwYhT4vcLfe8qD2upOUXg7a01ffl%2FTDUQszx6%2FnRDybRuJgSlC9MSdbOnmxy%2FV%2FD%2BzwZnn0sbrGVQzdU6uoIXHYmqHGEUsD1zRe2aMrxItewy4bnkPsGCuNoTM4U7zaejQnz5JZjOxgyxhy6x44EU5w291jq448NV%2BxVbYD1jNe%2BsDj%2BTx%2BJmHpQKTDjRH8qYDy2b5rANnQH9oHWP4Vz5zvcJ%2BeQLz0KTCzRwhXJ0qA%3D%3D",
  "environmentVariables": {
    "COMPANY": "teste123",
    "MONGO_URL": "mongodb://gcpfunc:ZYdTTk3D8HCrnxoh@nx-b2b-banca-produtos-shard-00-00-vjwsm.gcp.mongodb.net:27017,nx-b2b-banca-produtos-shard-00-01-vjwsm.gcp.mongodb.net:27017,nx-b2b-banca-produtos-shard-00-02-vjwsm.gcp.mongodb.net:27017/test?ssl=true&replicaSet=nx-b2b-banca-produtos-shard-0&authSource=admin&retryWrites=true&w=majority"
  },
  "runtime": "nodejs10",
  "maxInstances": 5,
  "vpcConnector": "nx-b2b-vpc-conn-produtos",
  "vpcConnectorEgressSettings": "PRIVATE_RANGES_ONLY",
  "ingressSettings": "ALLOW_ALL"
};

const n = {"availableMemoryMb":256,"environmentVariables":{"Banco":"ConnString"},"maxInstances":1,"name":"marcas","runtime":"nodejs12","timeout":"60s","vpcConnector":"nx-b2b-vpc-conn","vpcConnectorEgressSettings":"ALL_TRAFFIC","labels":{"env":"dev"}};

console.log(diff(o, n, true));
console.log('Sem true:');
console.log(diff(o, n));
console.info(propertiesToArray(diff(o, n)).join(','));
