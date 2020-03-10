import tmrm = require('azure-pipelines-task-lib/mock-run');
import assert = require('assert');
import path = require('path');

let taskPath = path.join(__dirname, '..', 'gcloudcli.js');
let tmr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

tmr.setInput('versionSpec', '>=280.0.0');
tmr.setInput('checkLatest', 'true');

//Create tool-lib mock
tmr.registerMock('azure-pipelines-tool-lib/tool', {
  isExplicitVersion: function () {
    return false;
  },
  evaluateVersions: function (versions: string[], versionSpec) {
    const invalidVersions = versions.filter(v => !/^\d+\.\d+\.\d+$/.test(v));
    assert(invalidVersions.length === 0, "Invalid versions passed to evaluateVersions");
    return "283.0.0";
  },
  cleanVersion: function (version: string) {
    return version.replace(/^v/i, "");
  },
  findLocalTool: function (toolName, versionSpec) {
    assert(versionSpec === "v283.0.0", "Version returned should begin with 'v'");
    return "/path/to/gcloud";
  },
  prependPath(toolPath) {
    return;
  }
});

tmr.registerMock('typed-rest-client/RestClient', {
  RestClient: function () {
    return {
      get: async function (url, options) {
        if (url.indexOf('auth.docker.io') >= 0) {
          return {
            result: {
              "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsIng1YyI6WyJNSUlDK1RDQ0FwK2dBd0lCQWdJQkFEQUtCZ2dxaGtqT1BRUURBakJHTVVRd1FnWURWUVFERXpzeVYwNVpPbFZMUzFJNlJFMUVVanBTU1U5Rk9reEhOa0U2UTFWWVZEcE5SbFZNT2tZelNFVTZOVkF5VlRwTFNqTkdPa05CTmxrNlNrbEVVVEFlRncweU1EQXhNRFl5TURVeE1UUmFGdzB5TVRBeE1qVXlNRFV4TVRSYU1FWXhSREJDQmdOVkJBTVRPMVZCVVRjNldGTk9VenBVUjFRek9rRTBXbFU2U1RWSFN6cFNOalJaT2xkRFNFTTZWMVpTU3pwTlNUTlNPa3RZVFRjNlNGZFRNenBDVmxwYU1JSUJJakFOQmdrcWhraUc5dzBCQVFFRkFBT0NBUThBTUlJQkNnS0NBUUVBcnh5Mm9uSDBTWHh4a1JCZG9wWDFWc1VuQVovOUpZR3JNSXlrelJuMTRsd1A1SkVmK1hNNUFORW1NLzBYOFJyNUlIN2VTWFV6K1lWaFVucVNKc3lPUi9xd3BTeFdLWUxxVnB1blFOWThIazdmRnlvN0l0bXgxajZ1dnRtVmFibFFPTEZJMUJNVnY2Y3IxVjV3RlZRYWc3SnhkRUFSZWtaR1M5eDlIcnM1NVdxb0lSK29GRGwxVVRjNlBFSjZVWGdwYmhXWHZoU0RPaXBPcUlYdHZkdHJoWFFpd204Y3EyczF0TEQzZzg2WmRYVFg3UDFFZkxFOG1jMEh4anBGNkdiNWxHZFhjdjU5cC9SMzEva0xlL09wRHNnVWJxMEFvd3Bsc1lLb0dlSmdVNDJaZG45SFZGUVFRcEtGTFBNK1pQN0R2ZmVGMWNIWFhGblI1TkpFU1Z1bFRRSURBUUFCbzRHeU1JR3ZNQTRHQTFVZER3RUIvd1FFQXdJSGdEQVBCZ05WSFNVRUNEQUdCZ1JWSFNVQU1FUUdBMVVkRGdROUJEdFZRVkUzT2xoVFRsTTZWRWRVTXpwQk5GcFZPa2sxUjBzNlVqWTBXVHBYUTBoRE9sZFdVa3M2VFVrelVqcExXRTAzT2toWFV6TTZRbFphV2pCR0JnTlZIU01FUHpBOWdEc3lWMDVaT2xWTFMxSTZSRTFFVWpwU1NVOUZPa3hITmtFNlExVllWRHBOUmxWTU9rWXpTRVU2TlZBeVZUcExTak5HT2tOQk5sazZTa2xFVVRBS0JnZ3Foa2pPUFFRREFnTklBREJGQWlFQXl5SEpJU1RZc1p2ZVZyNWE1YzZ4MjhrQ2U5M2w1QndQVGRUTk9SaFB0c0VDSURMR3pYdUxuekRqTCtzcWRkOU5FbkRuMnZ2UFBWVk1NLzhDQW1EaTVudnMiXX0.eyJhY2Nlc3MiOlt7InR5cGUiOiJyZXBvc2l0b3J5IiwibmFtZSI6Imdvb2dsZS9jbG91ZC1zZGsiLCJhY3Rpb25zIjpbInB1bGwiXX1dLCJhdWQiOiJyZWdpc3RyeS5kb2NrZXIuaW8iLCJleHAiOjE1ODM3MTA2NzEsImlhdCI6MTU4MzcxMDM3MSwiaXNzIjoiYXV0aC5kb2NrZXIuaW8iLCJqdGkiOiJvOUQwOWRFQXI0TjdtbWRnSldQMyIsIm5iZiI6MTU4MzcxMDA3MSwic3ViIjoiIn0.Qq8kJBIaL7NpLDz6BvDyo6CEs93PP6LsHHwCfVGBLXoBpx381QNttGVe4oWbA8p-JhxaIKMRiCqlCsCQGAMtp9a-R8ltkLKmDMDo7XHa9u5aPBGFuHvrkYBfCjX3anXmzCodz8Ccoq8QJN5tS1fx5th-DCsQClalLNTB_kNr-fod4eGUNQ4wGRn91gm3iJJx7y6IDpeHCBu01FOM2nDhFD37u_r5ceWf0ASD-6nRb91AjYhDHuS5rrOZ9fFkfOfhNVe_1hoW8G3ROn6fWqGnupnZFJXOBQsVf7U5Ql6TgJiDJGqPDCzmn0YVzqnVQ92HatU0j3B38DpbPXxgEEM2Hw",
              "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsIng1YyI6WyJNSUlDK1RDQ0FwK2dBd0lCQWdJQkFEQUtCZ2dxaGtqT1BRUURBakJHTVVRd1FnWURWUVFERXpzeVYwNVpPbFZMUzFJNlJFMUVVanBTU1U5Rk9reEhOa0U2UTFWWVZEcE5SbFZNT2tZelNFVTZOVkF5VlRwTFNqTkdPa05CTmxrNlNrbEVVVEFlRncweU1EQXhNRFl5TURVeE1UUmFGdzB5TVRBeE1qVXlNRFV4TVRSYU1FWXhSREJDQmdOVkJBTVRPMVZCVVRjNldGTk9VenBVUjFRek9rRTBXbFU2U1RWSFN6cFNOalJaT2xkRFNFTTZWMVpTU3pwTlNUTlNPa3RZVFRjNlNGZFRNenBDVmxwYU1JSUJJakFOQmdrcWhraUc5dzBCQVFFRkFBT0NBUThBTUlJQkNnS0NBUUVBcnh5Mm9uSDBTWHh4a1JCZG9wWDFWc1VuQVovOUpZR3JNSXlrelJuMTRsd1A1SkVmK1hNNUFORW1NLzBYOFJyNUlIN2VTWFV6K1lWaFVucVNKc3lPUi9xd3BTeFdLWUxxVnB1blFOWThIazdmRnlvN0l0bXgxajZ1dnRtVmFibFFPTEZJMUJNVnY2Y3IxVjV3RlZRYWc3SnhkRUFSZWtaR1M5eDlIcnM1NVdxb0lSK29GRGwxVVRjNlBFSjZVWGdwYmhXWHZoU0RPaXBPcUlYdHZkdHJoWFFpd204Y3EyczF0TEQzZzg2WmRYVFg3UDFFZkxFOG1jMEh4anBGNkdiNWxHZFhjdjU5cC9SMzEva0xlL09wRHNnVWJxMEFvd3Bsc1lLb0dlSmdVNDJaZG45SFZGUVFRcEtGTFBNK1pQN0R2ZmVGMWNIWFhGblI1TkpFU1Z1bFRRSURBUUFCbzRHeU1JR3ZNQTRHQTFVZER3RUIvd1FFQXdJSGdEQVBCZ05WSFNVRUNEQUdCZ1JWSFNVQU1FUUdBMVVkRGdROUJEdFZRVkUzT2xoVFRsTTZWRWRVTXpwQk5GcFZPa2sxUjBzNlVqWTBXVHBYUTBoRE9sZFdVa3M2VFVrelVqcExXRTAzT2toWFV6TTZRbFphV2pCR0JnTlZIU01FUHpBOWdEc3lWMDVaT2xWTFMxSTZSRTFFVWpwU1NVOUZPa3hITmtFNlExVllWRHBOUmxWTU9rWXpTRVU2TlZBeVZUcExTak5HT2tOQk5sazZTa2xFVVRBS0JnZ3Foa2pPUFFRREFnTklBREJGQWlFQXl5SEpJU1RZc1p2ZVZyNWE1YzZ4MjhrQ2U5M2w1QndQVGRUTk9SaFB0c0VDSURMR3pYdUxuekRqTCtzcWRkOU5FbkRuMnZ2UFBWVk1NLzhDQW1EaTVudnMiXX0.eyJhY2Nlc3MiOlt7InR5cGUiOiJyZXBvc2l0b3J5IiwibmFtZSI6Imdvb2dsZS9jbG91ZC1zZGsiLCJhY3Rpb25zIjpbInB1bGwiXX1dLCJhdWQiOiJyZWdpc3RyeS5kb2NrZXIuaW8iLCJleHAiOjE1ODM3MTA2NzEsImlhdCI6MTU4MzcxMDM3MSwiaXNzIjoiYXV0aC5kb2NrZXIuaW8iLCJqdGkiOiJvOUQwOWRFQXI0TjdtbWRnSldQMyIsIm5iZiI6MTU4MzcxMDA3MSwic3ViIjoiIn0.Qq8kJBIaL7NpLDz6BvDyo6CEs93PP6LsHHwCfVGBLXoBpx381QNttGVe4oWbA8p-JhxaIKMRiCqlCsCQGAMtp9a-R8ltkLKmDMDo7XHa9u5aPBGFuHvrkYBfCjX3anXmzCodz8Ccoq8QJN5tS1fx5th-DCsQClalLNTB_kNr-fod4eGUNQ4wGRn91gm3iJJx7y6IDpeHCBu01FOM2nDhFD37u_r5ceWf0ASD-6nRb91AjYhDHuS5rrOZ9fFkfOfhNVe_1hoW8G3ROn6fWqGnupnZFJXOBQsVf7U5Ql6TgJiDJGqPDCzmn0YVzqnVQ92HatU0j3B38DpbPXxgEEM2Hw",
              "expires_in": 300,
              "issued_at": "2020-03-08T23:32:51.872342947Z"
            }
          };

        } else {
          return {
            result: {
              "schemaVersion": 1,
              "name": "google/cloud-sdk",
              "tag": "latest",
              "architecture": "amd64",
              "fsLayers": [{
                  "blobSum": "sha256:a3ed95caeb02ffe68cdd9fd84406680ae93d633cb16422d00e8a7c22955b46d4"
                },
                {
                  "blobSum": "sha256:ab47ee931d31553de470e33a09efbfb3127038e15174f9d7ea041ededd522227"
                },
                {
                  "blobSum": "sha256:b1bbf0df15f4049e0b07ccda216711aa1eb249c331cf37654f2c30e3b5bef6a5"
                },
                {
                  "blobSum": "sha256:a3ed95caeb02ffe68cdd9fd84406680ae93d633cb16422d00e8a7c22955b46d4"
                },
                {
                  "blobSum": "sha256:a3ed95caeb02ffe68cdd9fd84406680ae93d633cb16422d00e8a7c22955b46d4"
                },
                {
                  "blobSum": "sha256:a3ed95caeb02ffe68cdd9fd84406680ae93d633cb16422d00e8a7c22955b46d4"
                },
                {
                  "blobSum": "sha256:a3ed95caeb02ffe68cdd9fd84406680ae93d633cb16422d00e8a7c22955b46d4"
                },
                {
                  "blobSum": "sha256:a3ed95caeb02ffe68cdd9fd84406680ae93d633cb16422d00e8a7c22955b46d4"
                },
                {
                  "blobSum": "sha256:50e431f790939a2f924af65084cc9d39c3d3fb9ad2d57d183b7eadf86ea46992"
                }
              ],
              "history": [{
                  "v1Compatibility": "{\"architecture\":\"amd64\",\"config\":{\"Hostname\":\"\",\"Domainname\":\"\",\"User\":\"\",\"AttachStdin\":false,\"AttachStdout\":false,\"AttachStderr\":false,\"Tty\":false,\"OpenStdin\":false,\"StdinOnce\":false,\"Env\":[\"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/google-cloud-sdk/bin/\",\"CLOUD_SDK_VERSION=283.0.0\",\"CLOUDSDK_PYTHON=python3\"],\"Cmd\":[\"bash\"],\"ArgsEscaped\":true,\"Image\":\"sha256:fa84a076360bfb143ab8ef5dffe61c00c9ab4921fe7164b1ca14f1c4a8aca09e\",\"Volumes\":{\"/root/.config\":{},\"/root/.kube\":{}},\"WorkingDir\":\"\",\"Entrypoint\":null,\"OnBuild\":null,\"Labels\":null},\"container\":\"79be5629e5708825a2a5180d27191381ebca21ae49e75453c2403735a8370ba9\",\"container_config\":{\"Hostname\":\"79be5629e570\",\"Domainname\":\"\",\"User\":\"\",\"AttachStdin\":false,\"AttachStdout\":false,\"AttachStderr\":false,\"Tty\":false,\"OpenStdin\":false,\"StdinOnce\":false,\"Env\":[\"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/google-cloud-sdk/bin/\",\"CLOUD_SDK_VERSION=283.0.0\",\"CLOUDSDK_PYTHON=python3\"],\"Cmd\":[\"/bin/sh\",\"-c\",\"#(nop) \",\"VOLUME [/root/.config /root/.kube]\"],\"ArgsEscaped\":true,\"Image\":\"sha256:fa84a076360bfb143ab8ef5dffe61c00c9ab4921fe7164b1ca14f1c4a8aca09e\",\"Volumes\":{\"/root/.config\":{},\"/root/.kube\":{}},\"WorkingDir\":\"\",\"Entrypoint\":null,\"OnBuild\":null,\"Labels\":{}},\"created\":\"2020-03-03T17:25:12.944252311Z\",\"docker_version\":\"18.09.3\",\"id\":\"c13b80379539ad408ad4efff2a2e59ad4cf5ff50d349d7ee3914ecae7b6b4664\",\"os\":\"linux\",\"parent\":\"3dd9bc250002d87f74b22cc8689e96aee8698fbc851a7a0ecc38184aae1c1b04\",\"throwaway\":true}"
                },
                {
                  "v1Compatibility": "{\"id\":\"3dd9bc250002d87f74b22cc8689e96aee8698fbc851a7a0ecc38184aae1c1b04\",\"parent\":\"70727003885d542bd4b682975c34fc3b0d0babb2b6a5ff6c68065e8ea5cad57c\",\"created\":\"2020-03-03T17:25:05.485855026Z\",\"container_config\":{\"Cmd\":[\"/bin/sh -c apt-get -qqy update \\u0026\\u0026 apt-get install -qqy         curl         gcc         python3-dev         python3-pip         apt-transport-https         lsb-release         openssh-client         git         make         gnupg \\u0026\\u0026     pip3 install -U crcmod \\u0026\\u0026     echo 'deb http://deb.debian.org/debian/ sid main' \\u003e\\u003e /etc/apt/sources.list \\u0026\\u0026     export CLOUD_SDK_REPO=\\\"cloud-sdk-$(lsb_release -c -s)\\\" \\u0026\\u0026     echo \\\"deb https://packages.cloud.google.com/apt $CLOUD_SDK_REPO main\\\" \\u003e /etc/apt/sources.list.d/google-cloud-sdk.list \\u0026\\u0026     curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add - \\u0026\\u0026     apt-get update \\u0026\\u0026     apt-get install -y google-cloud-sdk=${CLOUD_SDK_VERSION}-0         google-cloud-sdk-app-engine-python=${CLOUD_SDK_VERSION}-0         google-cloud-sdk-app-engine-python-extras=${CLOUD_SDK_VERSION}-0         google-cloud-sdk-app-engine-java=${CLOUD_SDK_VERSION}-0         google-cloud-sdk-app-engine-go=${CLOUD_SDK_VERSION}-0         google-cloud-sdk-datalab=${CLOUD_SDK_VERSION}-0         google-cloud-sdk-datastore-emulator=${CLOUD_SDK_VERSION}-0         google-cloud-sdk-pubsub-emulator=${CLOUD_SDK_VERSION}-0         google-cloud-sdk-bigtable-emulator=${CLOUD_SDK_VERSION}-0         google-cloud-sdk-cbt=${CLOUD_SDK_VERSION}-0         kubectl \\u0026\\u0026     gcloud --version \\u0026\\u0026     docker --version \\u0026\\u0026 kubectl version --client\"]}}"
                },
                {
                  "v1Compatibility": "{\"id\":\"70727003885d542bd4b682975c34fc3b0d0babb2b6a5ff6c68065e8ea5cad57c\",\"parent\":\"1ddfcd9f4085c7cae5e6880d6431588343e3ba7e7d41945b0330f6a02820c654\",\"created\":\"2020-03-03T17:15:39.126871868Z\",\"container_config\":{\"Cmd\":[\"/bin/sh -c #(nop) COPY file:831ca7e1e64d7b3b22d22430599828bfba0541250be460c9b4177fd7f616d836 in /usr/local/bin/docker \"]}}"
                },
                {
                  "v1Compatibility": "{\"id\":\"1ddfcd9f4085c7cae5e6880d6431588343e3ba7e7d41945b0330f6a02820c654\",\"parent\":\"61e797b0b319c5db04d3556efccfc4e034950257a67e173e0cf96ec8006f2fcd\",\"created\":\"2020-03-03T17:15:37.344347184Z\",\"container_config\":{\"Cmd\":[\"/bin/sh -c #(nop)  ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/google-cloud-sdk/bin/\"]},\"throwaway\":true}"
                },
                {
                  "v1Compatibility": "{\"id\":\"61e797b0b319c5db04d3556efccfc4e034950257a67e173e0cf96ec8006f2fcd\",\"parent\":\"33656863e33eddc5bb166bb9d10735b597a1463a9902d971526b740cb364feda\",\"created\":\"2020-03-03T17:15:36.955737714Z\",\"container_config\":{\"Cmd\":[\"/bin/sh -c #(nop)  ENV CLOUDSDK_PYTHON=python3\"]},\"throwaway\":true}"
                },
                {
                  "v1Compatibility": "{\"id\":\"33656863e33eddc5bb166bb9d10735b597a1463a9902d971526b740cb364feda\",\"parent\":\"572a351a7ba6588fb81787ede30fabfccd0e20c713cb81f7a83d6ae224a0cb55\",\"created\":\"2020-03-03T17:15:36.5319751Z\",\"container_config\":{\"Cmd\":[\"/bin/sh -c #(nop)  ENV CLOUD_SDK_VERSION=283.0.0\"]},\"throwaway\":true}"
                },
                {
                  "v1Compatibility": "{\"id\":\"572a351a7ba6588fb81787ede30fabfccd0e20c713cb81f7a83d6ae224a0cb55\",\"parent\":\"cd0abdaf2beb4c4443f9ef921f0f8e2caed92f301a2b347343cd6ab977b78b7c\",\"created\":\"2020-03-03T17:15:36.151342938Z\",\"container_config\":{\"Cmd\":[\"/bin/sh -c #(nop)  ARG CLOUD_SDK_VERSION=283.0.0\"]},\"throwaway\":true}"
                },
                {
                  "v1Compatibility": "{\"id\":\"cd0abdaf2beb4c4443f9ef921f0f8e2caed92f301a2b347343cd6ab977b78b7c\",\"parent\":\"e58128e8636d221e0a8c5a39ae0d103678802e08cf35f732c07b79bafb7d292c\",\"created\":\"2020-02-26T00:37:07.767689361Z\",\"container_config\":{\"Cmd\":[\"/bin/sh -c #(nop)  CMD [\\\"bash\\\"]\"]},\"throwaway\":true}"
                },
                {
                  "v1Compatibility": "{\"id\":\"e58128e8636d221e0a8c5a39ae0d103678802e08cf35f732c07b79bafb7d292c\",\"created\":\"2020-02-26T00:37:07.47238776Z\",\"container_config\":{\"Cmd\":[\"/bin/sh -c #(nop) ADD file:e05e45c33042db4ec7f71a5952d65ee8cb3786dcd76fa7a990f48a2def1344e2 in / \"]}}"
                }
              ],
              "signatures": [{
                "header": {
                  "jwk": {
                    "crv": "P-256",
                    "kid": "BV3F:2LTM:2LIK:BWQD:FSWW:EU72:LEY2:6XF4:DRPB:W5OX:NFJM:DKIS",
                    "kty": "EC",
                    "x": "b0gfe2eCesPUq9GM_A94IPPt6aFMocj9mE1s31eDFOw",
                    "y": "Kh9aSNz0MJ8ztzBCoM5b1CPf_xZwd7NJVPYs6_vfiAs"
                  },
                  "alg": "ES256"
                },
                "signature": "T-gNw8q5Uuyhn-xMhAmwnTmHQAPnjAAX9zfn5iPPIHZLnI55FbqkRk5eHsKfQ-jg6l8Hg7iZjIPWDnEk9eeYqg",
                "protected": "eyJmb3JtYXRMZW5ndGgiOjcyMjcsImZvcm1hdFRhaWwiOiJDbjAiLCJ0aW1lIjoiMjAyMC0wMy0wOFQyMzozNDoyOVoifQ"
              }]
            }
          };
        }
      }
    }
  }
});

tmr.run();