// Experimental identities established by the native checkpoint conversion and
// browser candidate report. Not an announcement that all nine models are ported.
export const SEGMENTATION_MODELS = Object.freeze({
  'mgcfdn-vig':Object.freeze({
  "id": "mgcfdn-vig-native-order-v1",
  "variant": "MGCFDN VIG 16\u00d716",
  "family": "vig",
  "side": 256,
  "kind": "sigmoid",
  "bytes": 507,
  "sha256": "5ea0f37330567c601ccfb9a7dcd45bbf2dcda0f2405cb60e66a74ed6f980639a",
  "checkpointSha256": "63996d687b29e49f5c78f8f055395bb196ce37e31f1918817c2f197a88f1e7e6",
  "backbone": {
    "file": "backbone.json",
    "bytes": 186358,
    "sha256": "22c5cf4f797722b5cde861e3f2857f7ceb4f165bd5952fd7ae8d36aa678a2418"
  },
  "tail": {
    "file": "tail.onnx",
    "bytes": 28780877,
    "sha256": "606b6d93a54142cf469fccd023b2200dfe755b190e5527c58c25aa61b847f57f"
  },
  "gpu": Object.freeze({
    "id": "mgcfdn-vig-native-order-v1",
    "bytes": 507,
    "sha256": "5ea0f37330567c601ccfb9a7dcd45bbf2dcda0f2405cb60e66a74ed6f980639a",
    "sharedAssets": true,
    "minimumResidentBytes": 623213543,
    "status": "experimental-hybrid-corpus"
  }),
  "status": "experimental-cpu-corpus",
  "cpuContinuousBitExact": false
}),
  'mgcfdn-tnt': Object.freeze({
    "id": "mgcfdn-tnt-native-order-v1",
    "variant": "MGCFDN TNT 16×16",
    "family": "tnt",
    "side": 256,
    "kind": "sigmoid",
    "bytes": 507,
    "sha256": "27e4a64f492e0c161c9d50a850bf6e57ba3365e3e7633075bbba4a1edf4c75e3",
    "checkpointSha256": "c83f0d1a2840ebfdfafbf5c7ed842f8b5756c8975a6e6aff18cf73f95fbba56e",
    "gpu": Object.freeze({
        "id": "mgcfdn-tnt-native-order-v1",
        "bytes": 507,
        "sha256": "27e4a64f492e0c161c9d50a850bf6e57ba3365e3e7633075bbba4a1edf4c75e3",
        "sharedAssets": true,
        "minimumResidentBytes": 623212592,
        "status": "experimental-hybrid-corpus"
    }),
    "backbone": {
        "file": "backbone.json",
        "bytes": 113507,
        "sha256": "6270c09edca590d59fe922dd740999ec7f4dde867ac507bc84cbf8b46cc99fa4"
    },
    "tail": {
        "file": "tail.onnx",
        "bytes": 28780560,
        "sha256": "0972f12d0ce15c58d1dcd0aa992ca28b3ddb46afeacaf8c9d15dc5419ba5f55b"
    },
    "status": "experimental-cpu-corpus",
    "cpuContinuousBitExact": false
}),
  'mgcfdn-effnet': Object.freeze({
    id: 'mgcfdn-effnet-native-mean-e132aa38d8c2', variant: 'MGCFDN EffNet 16×16',
    side: 256, kind: 'sigmoid', bytes: 74209401,
    sha256: 'e132aa38d8c2726e1e6bc4a2e2a9760b24901757b938580f00742ea25ce569fe',
    checkpointSha256: '98b7fc9dbe935c7840799acd8273bec6f27dd7d7f33761b5090918e2be988773',
    gpu: Object.freeze({id: 'mgcfdn-effnet-native-mean-e132aa38d8c2', bytes: 74209401,
      sha256: 'e132aa38d8c2726e1e6bc4a2e2a9760b24901757b938580f00742ea25ce569fe',
      sharedAssets: true, status: 'experimental-hybrid-corpus',
      numericalParity: 'Continuous probabilities differ; the paired-spots native corpus has one threshold-crossing mask pixel. Explicit CPU remains available. See MGCF-ORT-GPU.md.'}),
    status: 'experimental-cpu-corpus', cpuContinuousBitExact: false
  }),
  'mgcfdn-st': Object.freeze({
    id: 'mgcfdn-st-native-mean-d7b577b68f86', variant: 'MGCFDN source/cible',
    side: 256, kind: 'softmax', bytes: 89592572,
    sha256: 'd7b577b68f862a43d12959291e93ecd2143d0feb4723efeb56f2bd7f941cba6d',
    checkpointSha256: '95fa449ba33a4718b66ddcbe948ddc57abdfb34594c43bf47e49515bc63cec98',
    gpu: Object.freeze({id:'mgcfdn-st-gpu-split-v1',bytes:1602,
      sha256:'94bd9ac8162eb86bd16c3edc09433f7077a4788706b5e8640137f8d8b2a65090',
      cpuSha256:'d7b577b68f862a43d12959291e93ecd2143d0feb4723efeb56f2bd7f941cba6d',
      splitGraph:true,assetBytes:89895559,bridgeBytes:12288024,
      stageBackends:Object.freeze(['webgpu','wasm']),preferCpuAtConcurrentZones:3,status:'experimental-hybrid-corpus'}),
    status: 'experimental-cpu-corpus', cpuContinuousBitExact: false
  }),
  'mgcfdn-mpdn': Object.freeze({
    id: 'mgcfdn-mpdn-16-d90097900a00', variant: 'MGCFDN MPDN 16×16',
    side: 256, kind: 'sigmoid', bytes: 24005734,
    sha256: 'd90097900a0005e19f7240ee1fd6c1f05b6ebf6fac2bc553ba2ccc01d6a5195b',
    checkpointSha256: '9cea785aaba1612c55218f52c6bbe8c1419f3a1065b368066e8e3869a194e6ee',
    gpu: Object.freeze({id: 'mgcfdn-mpdn-gpu-concat-179a4275466a', bytes: 24006373, sha256: '179a4275466aecae1e2a9d1cb5eea044eb4bd8198e87386b3fb88ba8d388ae39', status: 'experimental-hybrid-corpus'}),
    status: 'experimental-cpu-corpus', cpuContinuousBitExact: false
  }),
  'mgcfdn-16': Object.freeze({
    "id": "mgcfdn-16-81efce16baa7",
    "variant": "MGCFDN 16×16",
    "side": 256,
    "kind": "sigmoid",
    "bytes": 89049900,
    "sha256": "81efce16baa78f0383fa822918fd51f0a3843163756c6d16421065175c1d7a90",
    "checkpointSha256": "d2657fac0191c54da090b8d0e44e24519bd9722b5b2b4b18fbe17cf00a7e4e65",
    "gpu": Object.freeze({
      "id": "mgcfdn-16-81efce16baa7", "bytes": 89049900,
      "sha256": "81efce16baa78f0383fa822918fd51f0a3843163756c6d16421065175c1d7a90",
      "sharedAssets": true, "status": "experimental-hybrid-corpus"
    }),
    "status": "experimental-cpu-corpus",
    "cpuContinuousBitExact": false
}),
  'mgcfdn': Object.freeze({
    "id": "mgcfdn-8b99302269be",
    "variant": "MGCFDN",
    "side": 256,
    "kind": "sigmoid",
    "bytes": 89060850,
    "sha256": "8b99302269be19e214139b533e198f85169c3821a637a89ff93f6ab0c720b44e",
    "checkpointSha256": "53920b1cefe1e8c1e8c78dfe2f43e80251529d9e5ccc7be31f899a636357f563",
    "gpu": Object.freeze({id:'mgcfdn-gpu-split-v1',bytes:1597,
      sha256:'cb88c2132a178ef411625c004d4509c4f0361f699cf606dc33cf3ce6d82d1402',
      cpuSha256:'8b99302269be19e214139b533e198f85169c3821a637a89ff93f6ab0c720b44e',
      splitGraph:true,assetBytes:89182861,bridgeBytes:12288024,
      stageBackends:Object.freeze(['webgpu','webgpu']),probabilityTolerance:1e-3,
      numericalParity:'Continuous probabilities can differ beyond1e-4; declared verification tolerance1e-3, with native corpus mask differences measured separately. Explicit CPU remains available. See MGCF-SPLIT-GPU.md.',
      status:'experimental-hybrid-corpus'}),
    "status": "experimental-cpu-corpus",
    "cpuContinuousBitExact": false
})
,
  'cmseg-generalization': Object.freeze({
    "id": "cmseg-generalization-native512-backbone-v2",
    "bytes": 885,
    "sha256": "5971bb653cecd0c6f9672bed99c2f694151ed9b50693501642ca66213b820c2c",
    "assetBytes": 12010557,
    "gpu": Object.freeze({
        "id": "cmseg-generalization-native512-backbone-v2",
        "bytes": 885,
        "sha256": "5971bb653cecd0c6f9672bed99c2f694151ed9b50693501642ca66213b820c2c",
        "sharedAssets": true,
        "residentCorrelation": true,
        "minimumResidentBytes": 805306368,
        "status": "experimental-hybrid-corpus"
    }),
    "backbone": {
        "file": "backbone.json",
        "bytes": 123659,
        "sha256": "229eb4777e368f0350afdf3e1f96e290227dd85d4dc7b814c6ed51ef71d5e025"
    },
    "checkpointSha256": "a3351ae664fca9780c3ca56db708fe3fdc74878c07327dfdd6ed75f14537454b",
    "correlation": [
        {
            "name": "corr24",
            "topk": 24,
            "alpha": 5.115073204040527
        },
        {
            "name": "corr32",
            "topk": 32,
            "alpha": 5.133166313171387
        },
        {
            "name": "corr96",
            "topk": 96,
            "alpha": 5.1324782371521
        }
    ],
    "variant": "CMSeg-Net generalization",
    "family": "cmseg",
    "side": 512,
    "kind": "sigmoid",
    "status": "experimental-cpu-corpus",
    "cpuContinuousBitExact": false
}),
  'cmseg-addnoise': Object.freeze({
    "id": "cmseg-addnoise-native512-bounded-v1",
    "bytes": 987,
    "sha256": "699c450495030f6dcb8b03bfa5d6fbcb0835763af9e31f20a05aa42856e2908a",
    "assetBytes": 21243915,
    "gpu": Object.freeze({
        "id": "cmseg-addnoise-native512-bounded-v1",
        "bytes": 987,
        "sha256": "699c450495030f6dcb8b03bfa5d6fbcb0835763af9e31f20a05aa42856e2908a",
        "sharedAssets": true,
        "correlationGpuOnly": true,
        "minimumResidentBytes": 805306368,
        "status": "experimental-hybrid-corpus"
    }),
    "checkpointSha256": "0f549f213e67712791e2778f4df005532dabd563a9fea3bafc851d4d449fb1ba",
    "correlation": [
        {
            "name": "corr24",
            "topk": 24,
            "alpha": 5.177468776702881
        },
        {
            "name": "corr32",
            "topk": 32,
            "alpha": 5.210790634155273
        },
        {
            "name": "corr96",
            "topk": 96,
            "alpha": 5.214969158172607
        }
    ],
    "variant": "CMSeg-Net addnoise",
    "family": "cmseg",
    "side": 512,
    "kind": "sigmoid",
    "status": "experimental-cpu-corpus",
    "cpuContinuousBitExact": false
})
});
for (const model of Object.values(SEGMENTATION_MODELS)) if (model.correlation) {model.correlation.forEach(Object.freeze); Object.freeze(model.correlation);}

for(const model of Object.values(SEGMENTATION_MODELS))if(model.backbone)Object.freeze(model.backbone);

for(const model of Object.values(SEGMENTATION_MODELS))if(model.tail)Object.freeze(model.tail);
