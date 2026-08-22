import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const ROOT = realpathSync.native(resolve(import.meta.dirname, '..'))
const EVIDENCE_PATH = 'docs/gates/EQUORA_v57.61.0_MULTI_BROKER_MB3_EVIDENCE.json'
const MANIFEST_PATH = 'docs/gates/EQUORA_v57.61.0_MULTI_BROKER_MB3_MANIFEST.sha256'
const VALIDATOR_PATH = 'scripts/validate-multibroker-mb3-manifest.mjs'
const BASELINE = '618a6e62600bb98ee8c70d53942bfbab3a8778e1'

const CANDIDATE_SCOPE = Object.freeze([
  'docs/architecture/EQUORA_v57.61.0_MULTI_BROKER_MB3_IMPLEMENTATION_CONTRACT.md',
  EVIDENCE_PATH,
  MANIFEST_PATH,
  'lib/server/broker-multibroker-persistence.ts',
  VALIDATOR_PATH,
  'supabase/schema-patch-v57.61.0-multibroker-mb3.sql',
  'tests/multibroker-core-contracts.test.ts',
  'tests/multibroker-persistence-contracts.test.ts',
  'tests/sql/multibroker-mb3-test-lib.ps1',
  'tests/sql/multibroker-mb3.integration.sql',
  'tests/sql/run-multibroker-mb3-compatibility.ps1',
  'tests/sql/run-multibroker-mb3-concurrency.ps1',
  'tests/sql/run-multibroker-mb3-drift.ps1',
  'tests/sql/run-multibroker-mb3-fresh.ps1',
  'tests/sql/run-multibroker-mb3-partial-failure.ps1',
  'tests/sql/run-multibroker-mb3-upgrade.ps1',
])

const MANIFEST_INPUTS = Object.freeze(CANDIDATE_SCOPE.filter((path) => path !== MANIFEST_PATH))
const REQUIRED_ATTEMPTS = Object.freeze([
  'mb3-final-sql-fresh-001',
  'mb3-final-sql-upgrade-001',
  'mb3-final-sql-compatibility-001',
  'mb3-final-sql-partial-failure-001',
  'mb3-final-sql-drift-001',
  'mb3-final-sql-concurrency-001',
  'mb3-final-targeted-001',
  'mb3-final-typecheck-001',
  'mb3-final-full-test-001',
  'mb3-final-release-check-001',
  'mb3-final-build-001',
  'mb3-remediation1-final-sql-fresh-001',
  'mb3-remediation1-final-sql-upgrade-001',
  'mb3-remediation1-final-sql-compatibility-001',
  'mb3-remediation1-final-sql-partial-failure-001',
  'mb3-remediation1-final-sql-drift-001',
  'mb3-remediation1-final-sql-concurrency-001',
  'mb3-remediation1-final-targeted-001',
  'mb3-remediation1-final-typecheck-001',
  'mb3-remediation1-final-full-test-001',
  'mb3-remediation1-final-release-check-001',
  'mb3-remediation1-final-build-001',
  'mb3-remediation2-final-sql-fresh-001',
  'mb3-remediation2-final-sql-upgrade-001',
  'mb3-remediation2-final-sql-compatibility-001',
  'mb3-remediation2-final-sql-partial-failure-001',
  'mb3-remediation2-final-sql-drift-001',
  'mb3-remediation2-final-sql-concurrency-001',
  'mb3-remediation2-final-targeted-001',
  'mb3-remediation2-final-typecheck-001',
  'mb3-remediation3-final-sql-fresh-001',
  'mb3-remediation3-final-sql-upgrade-001',
  'mb3-remediation3-final-sql-compatibility-001',
  'mb3-remediation3-final-sql-partial-failure-001',
  'mb3-remediation3-final-sql-drift-001',
  'mb3-remediation3-final-sql-concurrency-001',
  'mb3-remediation3-final-targeted-001',
  'mb3-remediation3-final-typecheck-001',
  'mb3-remediation3-final-full-test-001',
  'mb3-remediation3-final-release-check-001',
  'mb3-remediation3-final-build-001',
  'mb3-remediation4-final-sql-fresh-001',
  'mb3-remediation4-final-sql-upgrade-001',
  'mb3-remediation4-final-sql-compatibility-001',
  'mb3-remediation4-final-sql-partial-failure-001',
  'mb3-remediation4-final-sql-drift-001',
  'mb3-remediation4-final-sql-concurrency-001',
  'mb3-remediation4-final-targeted-001',
  'mb3-remediation4-final-typecheck-001',
  'mb3-remediation4-final-full-test-001',
  'mb3-remediation4-final-release-check-001',
  'mb3-remediation4-final-build-001',
  'mb3-remediation5-final-sql-fresh-001',
  'mb3-remediation5-final-sql-upgrade-001',
  'mb3-remediation5-final-sql-compatibility-001',
  'mb3-remediation5-final-sql-partial-failure-001',
  'mb3-remediation5-final-sql-drift-001',
  'mb3-remediation5-final-sql-concurrency-001',
  'mb3-remediation5-final-targeted-001',
  'mb3-remediation5-final-typecheck-001',
  'mb3-remediation5-final-full-test-001',
  'mb3-remediation5-final-release-check-001',
  'mb3-remediation5-final-build-001',
  'mb3-remediation6-final-sql-fresh-003',
  'mb3-remediation6-final-sql-upgrade-001',
  'mb3-remediation6-final-sql-compatibility-001',
  'mb3-remediation6-final-sql-partial-failure-001',
  'mb3-remediation6-final-sql-drift-001',
  'mb3-remediation6-final-sql-concurrency-001',
  'mb3-remediation6-final-targeted-001',
  'mb3-remediation6-final-typecheck-001',
  'mb3-remediation6-final-full-test-001',
  'mb3-remediation6-final-release-check-001',
  'mb3-remediation6-final-build-004',
  'mb3-remediation7-final-sql-fresh-001',
  'mb3-remediation7-final-sql-upgrade-001',
  'mb3-remediation7-final-sql-compatibility-001',
  'mb3-remediation7-final-sql-partial-failure-001',
  'mb3-remediation7-final-sql-drift-001',
  'mb3-remediation7-final-sql-concurrency-001',
  'mb3-remediation7-final-targeted-001',
  'mb3-remediation7-final-typecheck-001',
  'mb3-remediation7-final-full-test-001',
  'mb3-remediation7-final-release-check-001',
  'mb3-remediation7-final-build-001',
  'mb3-remediation8-final-targeted-001',
  'mb3-remediation8-final-typecheck-001',
  'mb3-remediation8-final-full-test-001',
  'mb3-remediation8-final-release-check-001',
  'mb3-remediation8-final-build-002',
  'mb3-remediation9-final-sql-fresh-003',
  'mb3-remediation9-final-sql-upgrade-001',
  'mb3-remediation9-final-sql-compatibility-001',
  'mb3-remediation9-final-sql-partial-failure-001',
  'mb3-remediation9-final-sql-drift-001',
  'mb3-remediation9-final-sql-concurrency-001',
  'mb3-remediation9-final-typecheck-002',
  'mb3-remediation9-final-targeted-003',
  'mb3-remediation9-final-full-test-002',
  'mb3-remediation9-final-release-check-002',
  'mb3-remediation9-final-build-002',
])

const INITIAL_REVIEW_SNAPSHOT = Object.freeze([
  'acf4e71920f86c5378e056fb5314b2e0ab475e42e0608ef4a2969c32444f5591',
  '145ec4d570dff6e9dd50a3d9452e470de385e5f7cb7750f4995fc57e48277588',
  'f7d81d610a159c1e50ab8f23b9208f9ca03c709c520415ea2597a19f73cae8aa',
  '2f049d790bec335421039b87749a8f633d23e8b856a19670e824cc4b38249341',
  '08648bc80652407dfc4bb01fa4ca5c7ee82f6639f3285b0dd772441601f8205a',
  '69cd3069efb55a4f2636bd463fd7b12e8c255ebe5d9e72fa2f89e92b675bbd6d',
  '81f5774d406f32ff63931e341dcbb3fa923b31f8771a9f043b3dbb6aa46b4dcc',
  '7e6ea6c5893550a32c789279a4e34ca8d6d947ad87e8db900abd9821733b0d28',
  'a3d6d672a4f9059e15824c1bfe480583b1d91e298412a8db8289b803781c05df',
  '6c8355c8711299c3fe427d71814a3e4d0bd77e90a1f42152050d4b78f83c6eda',
  '034fe0cee1d3d30306dd00060a511787c4ff79ff1aabd92eeb221209f9045830',
  '40ba382272df83c732866b1ed7cf86e157d823d3abc4cb4fbe402c99571e47a3',
  '3a5d34605f4b5e14536d6d8b6a85e5c8a443f0c4108708367da0de3d4640eabd',
  '1edb297ee8f8147fd733e1c055c246c74c491a358fbf449a24ac14d5e5e80d65',
  'abb62382f9908bc293844cdfea3eff5c5fa69a2dd2ff3f7124d0b9bf4e909646',
])

const REQUIRED_INITIAL_REVIEWS = Object.freeze({
  'mb3-initial-a3-001': Object.freeze({ p2: 4, findings: Object.freeze([
    'A3-MB3-001', 'A3-MB3-002', 'A3-MB3-003', 'A3-MB3-004',
  ]) }),
  'mb3-initial-a4-001': Object.freeze({ p2: 5, findings: Object.freeze([
    'A4-MB3-001', 'A4-MB3-002', 'A4-MB3-003', 'A4-MB3-004', 'A4-MB3-005',
  ]) }),
  'mb3-initial-a5-001': Object.freeze({ p2: 5, findings: Object.freeze([
    'A5-MB3-001', 'A5-MB3-002', 'A5-MB3-003', 'A5-MB3-004', 'A5-MB3-005',
  ]) }),
})

const REMEDIATION1_REVIEW_SNAPSHOT = Object.freeze([
  '693e8e83c285b9055bb124ab210fc82ea68aeabb372a1b2d02a21b5c2d36be07',
  '6c4801c94e5060a529da9597ee42504bbc67f4de45d8891e98f67203b99ba136',
  'aaa77fe0247208d324ef889fd61fbebb7006c142b2d654342f7119d04034f68e',
  '1927d243270af419659315b85c7bcf97ad906ce34eedda711aa347b932a7feb4',
  '9733b2f71da11f6caa1c15dd22bead7c4b61af2ba0258f1d1f84724cc7bb85cb',
  '424f7aba8d102e9e47cabd234f30a44e9a9e22928785ff79cdee81f14d86a86f',
  'b416d4c52ca445fb462b3ad8a7d7090d6b569733fad5abb62b8e9c4911b52292',
  'a45733b4b8b741b219a59e4f54bd812e81ac6f3ddff399f5d74387b0bfdf9137',
  '18e3f85d7a904a5506dafbd22902518f08ecc46720fd935bda94690bbb406310',
  '6c8355c8711299c3fe427d71814a3e4d0bd77e90a1f42152050d4b78f83c6eda',
  '3cad642c270d5dfd5b7dbb5869c7bf3eaea0a36b69fc008e8e3f7a6e6dd1d598',
  '373adb84d7af29f313fa2280e08b467241851d5409d0d427d105b214745b2300',
  '3a5d34605f4b5e14536d6d8b6a85e5c8a443f0c4108708367da0de3d4640eabd',
  '1edb297ee8f8147fd733e1c055c246c74c491a358fbf449a24ac14d5e5e80d65',
  'abb62382f9908bc293844cdfea3eff5c5fa69a2dd2ff3f7124d0b9bf4e909646',
])

const REQUIRED_REMEDIATION1_REVIEWS = Object.freeze({
  'mb3-remediation1-a3-001': Object.freeze({
    result: 'pass', counts: Object.freeze({ p0: 0, p1: 0, p2: 0, p3: 0 }),
    findings: Object.freeze([]),
  }),
  'mb3-remediation1-a4-001': Object.freeze({
    result: 'no_pass', counts: Object.freeze({ p0: 0, p1: 0, p2: 2, p3: 1 }),
    findings: Object.freeze(['A4-MB3-R1-001', 'A4-MB3-R1-002', 'A4-MB3-R1-003']),
  }),
  'mb3-remediation1-a5-001': Object.freeze({
    result: 'pass_with_p3', counts: Object.freeze({ p0: 0, p1: 0, p2: 0, p3: 1 }),
    findings: Object.freeze(['A5-MB3-R1-001']),
  }),
})

const REMEDIATION3_REVIEW_SNAPSHOT = Object.freeze([
  '5601419d9551f528c0e26b408c723e8a3bbd46f58e587493cac74f9cbc8e5f70',
  '499fbcc1940efb45c86dd1f912910d6a7dc39815fc9f6b2f795cf70076956fb8',
  '0a667454847389fdbf245fb013bacd6dc419d15297a4ac1f252aea6e1be73c2e',
  '1927d243270af419659315b85c7bcf97ad906ce34eedda711aa347b932a7feb4',
  'a13f9c54c3a015c5ba40cfb98c70b00ff7d3c2e7f1fd8709e6c1a5bd0aaf5f21',
  'b6f158e6c744eca2803567287badacfbe72ea1fb81dc6e37b29d4cef5fa53c6b',
  '2f6ad40b63ff77087a6059aae1bd4ff00c0e9e42512e7e79d1acb75309f9f3d1',
  '1c61f35315e61267b93c83f9cb6aeacc66aee39db380bf9e9e043778d62fc59a',
  'a45733b4b8b741b219a59e4f54bd812e81ac6f3ddff399f5d74387b0bfdf9137',
  '18e3f85d7a904a5506dafbd22902518f08ecc46720fd935bda94690bbb406310',
  '6c8355c8711299c3fe427d71814a3e4d0bd77e90a1f42152050d4b78f83c6eda',
  'c1b65135ae04618b5b512b65db4540eef6ea7179a51147337ca394aad4795ec3',
  'af3d89571d97df2533a957554ed131bed253a5c64b285c40abbbe2258e95d4ab',
  '3a5d34605f4b5e14536d6d8b6a85e5c8a443f0c4108708367da0de3d4640eabd',
  '1edb297ee8f8147fd733e1c055c246c74c491a358fbf449a24ac14d5e5e80d65',
  'abb62382f9908bc293844cdfea3eff5c5fa69a2dd2ff3f7124d0b9bf4e909646',
])

const REQUIRED_REMEDIATION3_REVIEWS = Object.freeze({
  'mb3-remediation3-a3-001': Object.freeze({
    result: 'no_pass', counts: Object.freeze({ p0: 0, p1: 0, p2: 1, p3: 0 }),
    findings: Object.freeze(['A3-MB3-R3-001']),
  }),
  'mb3-remediation3-a4-001': Object.freeze({
    result: 'no_pass', counts: Object.freeze({ p0: 0, p1: 0, p2: 3, p3: 0 }),
    findings: Object.freeze(['A4-MB3-R3-001', 'A4-MB3-R3-002', 'A4-MB3-R3-003']),
  }),
  'mb3-remediation3-a5-001': Object.freeze({
    result: 'pass_with_p3', counts: Object.freeze({ p0: 0, p1: 0, p2: 0, p3: 2 }),
    findings: Object.freeze(['A5-MB3-R3-001', 'A5-MB3-R3-002']),
  }),
})

const REMEDIATION4_REVIEW_SNAPSHOT = Object.freeze([
  '95782614933fb474a9fb8e07839add2b4d025d78a80afb9373e72ab273b0ae2d',
  '7f3223f260ccf5f84061a47858d25d6b0b9978ca2bf473c9a010cb321368aebd',
  '4974a6165a59d571329ef8fcbd4923afafbf49f3767a052345371678f965d324',
  '1927d243270af419659315b85c7bcf97ad906ce34eedda711aa347b932a7feb4',
  '4b399d2c633df5392131d3485bee0c6df92cf33998be799bf32e6b0eb449c767',
  'e4ef3755c272d09e2447872316aeb32e93cf2a4df58314f44012e9f3506c43e0',
  '2f6ad40b63ff77087a6059aae1bd4ff00c0e9e42512e7e79d1acb75309f9f3d1',
  'aa4e6656cdaa19748db9396df8d89e370c5af61e6124f36b21520347e9b67146',
  'a45733b4b8b741b219a59e4f54bd812e81ac6f3ddff399f5d74387b0bfdf9137',
  '18e3f85d7a904a5506dafbd22902518f08ecc46720fd935bda94690bbb406310',
  '6c8355c8711299c3fe427d71814a3e4d0bd77e90a1f42152050d4b78f83c6eda',
  '0e6dcbc3c19d0cee78c03350f70178eb76c29967024b49086cf5006f1e0454e7',
  '8b9bcb8181777c8354bf8ee587000e5aedd07e19386683e1e47a8043e655f793',
  '3a5d34605f4b5e14536d6d8b6a85e5c8a443f0c4108708367da0de3d4640eabd',
  '1edb297ee8f8147fd733e1c055c246c74c491a358fbf449a24ac14d5e5e80d65',
  'abb62382f9908bc293844cdfea3eff5c5fa69a2dd2ff3f7124d0b9bf4e909646',
])

const REQUIRED_REMEDIATION4_REVIEWS = Object.freeze({
  'mb3-remediation4-a3-001': Object.freeze({
    result: 'no_pass', counts: Object.freeze({ p0: 0, p1: 0, p2: 1, p3: 0 }),
    findings: Object.freeze(['A3-MB3-R4-001']),
  }),
  'mb3-remediation4-a4-001': Object.freeze({
    result: 'no_pass', counts: Object.freeze({ p0: 0, p1: 0, p2: 2, p3: 1 }),
    findings: Object.freeze(['A4-MB3-R4-001', 'A4-MB3-R4-002', 'A4-MB3-R4-003']),
  }),
  'mb3-remediation4-a5-001': Object.freeze({
    result: 'pass_with_p3', counts: Object.freeze({ p0: 0, p1: 0, p2: 0, p3: 1 }),
    findings: Object.freeze(['A5-MB3-R4-001']),
  }),
})

const REMEDIATION5_REVIEW_SNAPSHOT = Object.freeze([
  'b0e08a150718a9d18e24d4a88ea7624c246245a1ea545adca8f3ebc8ea510ef7',
  'e0749c25d00f174b080b19e1fdaa54a5bce92f6a94afc4dbc9657a5a73c15437',
  'e3df5653293114a2b47a513c40473ea4c15e2781d4cbedc99159d75338ca5175',
  '1927d243270af419659315b85c7bcf97ad906ce34eedda711aa347b932a7feb4',
  'bf6ddc8aff07ca991055e6660fdf69ca472cb91883865be4fce7069e2e237c90',
  'ddd83e66d6055b362e1364f37528d345b7e7d38ea1a95de1c2b86d1e33efab9d',
  '2f6ad40b63ff77087a6059aae1bd4ff00c0e9e42512e7e79d1acb75309f9f3d1',
  '0df835aeb510641ed55d371fd24b8551cf0fbfcf7b326bdc4d6f617aae42565b',
  'a45733b4b8b741b219a59e4f54bd812e81ac6f3ddff399f5d74387b0bfdf9137',
  '18e3f85d7a904a5506dafbd22902518f08ecc46720fd935bda94690bbb406310',
  '6c8355c8711299c3fe427d71814a3e4d0bd77e90a1f42152050d4b78f83c6eda',
  '1e3c990082a5a0036c5a16d49e8fc30dacc970be626689c0e2d2baebb9cb496f',
  'e6b4405f815404a3769a891b9d284ef688e90d6435d7f4fbf16f14f7d8fb3507',
  '3a5d34605f4b5e14536d6d8b6a85e5c8a443f0c4108708367da0de3d4640eabd',
  '1edb297ee8f8147fd733e1c055c246c74c491a358fbf449a24ac14d5e5e80d65',
  'abb62382f9908bc293844cdfea3eff5c5fa69a2dd2ff3f7124d0b9bf4e909646',
])

const REQUIRED_REMEDIATION5_REVIEWS = Object.freeze({
  'mb3-remediation5-a3-001': Object.freeze({
    result: 'pass', counts: Object.freeze({ p0: 0, p1: 0, p2: 0, p3: 0 }),
    findings: Object.freeze([]),
  }),
  'mb3-remediation5-a4-001': Object.freeze({
    result: 'no_pass', counts: Object.freeze({ p0: 0, p1: 0, p2: 1, p3: 0 }),
    findings: Object.freeze(['A4-MB3-R5-001']),
  }),
  'mb3-remediation5-a5-001': Object.freeze({
    result: 'pass', counts: Object.freeze({ p0: 0, p1: 0, p2: 0, p3: 0 }),
    findings: Object.freeze([]),
  }),
})

const REMEDIATION6_REVIEW_SNAPSHOT = Object.freeze([
  '03a0d62e100b2b54429a9319075ac8e83fb9bac7a80602abb035be31ce4a9b0a',
  '4adddcbd71ae2e9c8e69580021cb6a4c12bcce1add3621af7d9d96ad748f05aa',
  '59ee8d6b9fb79ffda702cd9d312616c837ca605060ef37a916a6baa795a002f2',
  '1927d243270af419659315b85c7bcf97ad906ce34eedda711aa347b932a7feb4',
  'de39df373e8a98313fef80cc772abb4558ce299bdfc09c43fdd3b8382200bf79',
  '3d65ee73d15ff8bd8c879dc0ebd70b8d325496653cdc40ceb379ca913da4ad08',
  '2f6ad40b63ff77087a6059aae1bd4ff00c0e9e42512e7e79d1acb75309f9f3d1',
  '857d712260b1d035bbc65ea99d4967cf4f7d7ed178eac3f5b0fb72a15197290a',
  'a45733b4b8b741b219a59e4f54bd812e81ac6f3ddff399f5d74387b0bfdf9137',
  '18e3f85d7a904a5506dafbd22902518f08ecc46720fd935bda94690bbb406310',
  '6c8355c8711299c3fe427d71814a3e4d0bd77e90a1f42152050d4b78f83c6eda',
  'cffd790ca8b2120eec2a0bbce551304bcb02599b77538b3eeb1489834c398563',
  'e6b4405f815404a3769a891b9d284ef688e90d6435d7f4fbf16f14f7d8fb3507',
  '3a5d34605f4b5e14536d6d8b6a85e5c8a443f0c4108708367da0de3d4640eabd',
  '1edb297ee8f8147fd733e1c055c246c74c491a358fbf449a24ac14d5e5e80d65',
  'abb62382f9908bc293844cdfea3eff5c5fa69a2dd2ff3f7124d0b9bf4e909646',
])

const REQUIRED_REMEDIATION6_REVIEWS = Object.freeze({
  'mb3-remediation6-a3-001': Object.freeze({
    result: 'pass', counts: Object.freeze({ p0: 0, p1: 0, p2: 0, p3: 0 }),
    findings: Object.freeze([]),
  }),
  'mb3-remediation6-a4-001': Object.freeze({
    result: 'no_pass', counts: Object.freeze({ p0: 0, p1: 0, p2: 1, p3: 0 }),
    findings: Object.freeze(['A4-MB3-R6-001']),
  }),
  'mb3-remediation6-a5-001': Object.freeze({
    result: 'no_pass', counts: Object.freeze({ p0: 0, p1: 0, p2: 1, p3: 1 }),
    findings: Object.freeze(['A5-MB3-R6-001', 'A5-MB3-R6-002']),
  }),
})

const REMEDIATION8_REVIEW_SNAPSHOT = Object.freeze([
  '77aa3a3c4fb93a533c453861da25c1c60d8a896f956002048b4acbd4db902457',
  '3511a006e2ddc0c9da7d6eb1456458ba73437631f4be1990f69dfc308ee7e0a6',
  '4726d64f0fa97b51a656e9c36f64d826b8d0da6e04816ff2b3f6215a23570a42',
  'ffa66a0cda7beecc8e23b89a6fefb09c866df9e34935e5260b8d2d08c3b67482',
  '6580239ab93a9cd6c0758fa9e14378b8b436a6abc20edb8d0e138f4625240534',
  '0cb5d1de674e43155a7d1c09f5ecba8534a29a6b801759a7fa7cd143bba69c8f',
  '2f6ad40b63ff77087a6059aae1bd4ff00c0e9e42512e7e79d1acb75309f9f3d1',
  'd8784506f723ad51e2b3acb3e83f188e041c214f23e72f853ef4796156457a92',
  'a45733b4b8b741b219a59e4f54bd812e81ac6f3ddff399f5d74387b0bfdf9137',
  '7deebfa0b000430c04180675e7acc872baebfabf85f0bfe3d93408c5c54352be',
  '52943e85a7cf7a282a492d06dc03ccb84d7126acb6546cb9fd88a4a4eac9f2d4',
  '882b4f8bf017b50f0fd7eeb7518208683df8b3797f0aed7e3110459871dd4d57',
  'e6b4405f815404a3769a891b9d284ef688e90d6435d7f4fbf16f14f7d8fb3507',
  'ed2c3330534ddad635c4fd3dea360f25a2328c5a7d26277a314564d2b733584f',
  'd726d3bbf78f7d52e42b394a951471389d6523456766a3966b6748e73f7d0d66',
  '91ec4a3aa57fb4d29d78a9b391ed251b2b1399cd29b9b096c16a68ec87a67883',
])

const REQUIRED_REMEDIATION8_REVIEWS = Object.freeze({
  'mb3-remediation8-a3-001': Object.freeze({
    result: 'pass', counts: Object.freeze({ p0: 0, p1: 0, p2: 0, p3: 0 }),
    findings: Object.freeze([]),
  }),
  'mb3-remediation8-a4-001': Object.freeze({
    result: 'no_pass', counts: Object.freeze({ p0: 0, p1: 0, p2: 1, p3: 0 }),
    findings: Object.freeze(['A4-MB3-R8-001']),
  }),
  'mb3-remediation8-a5-001': Object.freeze({
    result: 'pass_with_p3', counts: Object.freeze({ p0: 0, p1: 0, p2: 0, p3: 1 }),
    findings: Object.freeze(['A5-MB3-R7-001']),
  }),
})

function fail(message) {
  throw new Error(`MB3_MANIFEST_INVALID: ${message}`)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function canonicalBytes(bytes, label) {
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    fail(`${label} is not valid UTF-8`)
  }
  if (text.charCodeAt(0) === 0xfeff) fail(`${label} contains a UTF-8 BOM`)
  return Buffer.from(text.replace(/\r\n?/g, '\n'), 'utf8')
}

function assertPath(path) {
  if (
    typeof path !== 'string' || path.length === 0 || isAbsolute(path)
    || path.includes('\\') || path.includes(':')
    || path.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) fail(`unsafe path: ${String(path)}`)
}

function withinRoot(absolutePath) {
  const rel = relative(ROOT, absolutePath)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

function readStable(path) {
  assertPath(path)
  const absolutePath = join(ROOT, ...path.split('/'))
  let cursor = ROOT
  for (const part of path.split('/')) {
    cursor = join(cursor, part)
    const stat = lstatSync(cursor)
    if (stat.isSymbolicLink()) fail(`${path} traverses a symlink or junction`)
  }
  const realPath = realpathSync.native(absolutePath)
  if (!withinRoot(realPath)) fail(`${path} resolves outside the repository`)
  const before = lstatSync(absolutePath)
  const noFollow = constants.O_NOFOLLOW ?? 0
  const fd = openSync(absolutePath, constants.O_RDONLY | noFollow)
  try {
    const openedBefore = fstatSync(fd)
    const bytes = readFileSync(fd)
    const openedAfter = fstatSync(fd)
    const after = lstatSync(absolutePath)
    for (const [left, right, field] of [
      [before.dev, after.dev, 'device'], [before.ino, after.ino, 'inode'],
      [before.size, after.size, 'size'], [before.mtimeMs, after.mtimeMs, 'mtime'],
      [openedBefore.dev, openedAfter.dev, 'opened device'],
      [openedBefore.ino, openedAfter.ino, 'opened inode'],
      [openedBefore.size, openedAfter.size, 'opened size'],
      [openedBefore.mtimeMs, openedAfter.mtimeMs, 'opened mtime'],
    ]) if (left !== right) fail(`${path} changed during read (${field})`)
    if (before.dev !== openedBefore.dev || before.ino !== openedBefore.ino) {
      fail(`${path} changed between path validation and open`)
    }
    return bytes
  } finally {
    closeSync(fd)
  }
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b, 'en'))
}

function exactSet(actual, expected, label) {
  const left = sorted(actual)
  const right = sorted(expected)
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    fail(`${label} mismatch; actual=${JSON.stringify(left)} expected=${JSON.stringify(right)}`)
  }
}

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) fail(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`)
  return result.stdout
}

function candidateStatusPaths() {
  const raw = git(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  const entries = raw.split('\0').filter(Boolean)
  const paths = []
  for (const entry of entries) {
    const status = entry.slice(0, 2)
    if (status.includes('R') || status.includes('C')) fail('renamed/copied candidate paths are not supported')
    const path = entry.slice(3)
    assertPath(path)
    paths.push(path)
  }
  return paths
}

function committedCandidatePaths(head) {
  if (head === BASELINE) return []
  if (git(['merge-base', head, BASELINE]).trim() !== BASELINE) {
    fail('HEAD is not descended from the evidence baseline')
  }
  const raw = git(['diff', '--no-renames', '--name-only', '-z', BASELINE, head])
  return raw.split('\0').filter(Boolean).map((path) => {
    assertPath(path)
    return path
  })
}

function ticks100ns(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{7})Z$/.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute, second, fraction] = match
  const epochMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
  const date = new Date(epochMs)
  if (
    date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month)
    || date.getUTCDate() !== Number(day) || date.getUTCHours() !== Number(hour)
    || date.getUTCMinutes() !== Number(minute) || date.getUTCSeconds() !== Number(second)
  ) return null
  return BigInt(epochMs / 1000) * BigInt(10_000_000) + BigInt(fraction)
}

function parseManifest() {
  const text = canonicalBytes(readStable(MANIFEST_PATH), MANIFEST_PATH).toString('utf8')
  if (!text.endsWith('\n')) fail('manifest must end with LF')
  const entries = new Map()
  for (const line of text.slice(0, -1).split('\n')) {
    const match = /^lf:([a-f0-9]{64})  ([1-9][0-9]*|0)  ([A-Za-z0-9._/-]+)$/.exec(line)
    if (!match) fail(`malformed manifest line: ${line}`)
    const [, hash, bytes, path] = match
    assertPath(path)
    if (entries.has(path)) fail(`duplicate manifest path: ${path}`)
    entries.set(path, { hash, bytes: Number(bytes) })
  }
  exactSet(entries.keys(), MANIFEST_INPUTS, 'manifest input closure')
  return entries
}

function parseEvidence() {
  const canonical = canonicalBytes(readStable(EVIDENCE_PATH), EVIDENCE_PATH)
  let evidence
  try { evidence = JSON.parse(canonical.toString('utf8')) } catch { fail('evidence is not valid JSON') }
  if (evidence.schema_version !== 'equora_mb3_evidence_v1') fail('unexpected evidence schema')
  if (evidence.phase !== 'MB3' || evidence.mb3_gate !== 'not_yet_passed') fail('MB3 gate boundary widened')
  if (evidence.phase_status !== 'local_final_gates_passed_independent_review_pending') fail('unexpected phase status')
  if (evidence.baseline?.head !== BASELINE || evidence.baseline?.origin_main !== BASELINE) fail('baseline mismatch')
  if (evidence.authority_boundaries?.runtime_mode !== 'off') fail('runtime mode is not off')
  for (const key of [
    'production_write_authorized', 'supabase_write_authorized', 'broker_request_authorized',
    'credential_access_authorized', 'cron_authorized', 'capture_authorized',
    'normalization_authorized', 'reconciliation_authorized', 'approval_authorized',
    'import_authorized', 'merge_authorized',
  ]) if (evidence.authority_boundaries?.[key] !== false) fail(`authority boundary widened: ${key}`)
  exactSet(evidence.candidate_scope ?? [], CANDIDATE_SCOPE, 'evidence candidate scope')
  if (evidence.manifest_contract?.entry_count !== MANIFEST_INPUTS.length) fail('manifest entry-count claim mismatch')
  if (evidence.local_audit?.status !== 'not_run_no_external_advisory_call') fail('local audit claim mismatch')

  const attempts = evidence.final_gate_attempts
  if (!Array.isArray(attempts)) fail('final_gate_attempts missing')
  exactSet(attempts.map((entry) => entry.attempt_id), REQUIRED_ATTEMPTS, 'required gate attempts')
  const ids = new Set()
  let latest = null
  for (const attempt of attempts) {
    if (ids.has(attempt.attempt_id)) fail(`duplicate attempt id: ${attempt.attempt_id}`)
    ids.add(attempt.attempt_id)
    if (attempt.exit_code !== 0 || attempt.result !== 'pass') fail(`non-pass final attempt: ${attempt.attempt_id}`)
    if (attempt.transcript_policy !== 'mb3_canonical_gate_transcript_v1') fail(`wrong transcript policy: ${attempt.attempt_id}`)
    const hasText = typeof attempt.canonical_transcript === 'string'
    const hasBase64 = typeof attempt.canonical_transcript_base64 === 'string'
    if (hasText === hasBase64) fail(`attempt must have exactly one transcript encoding: ${attempt.attempt_id}`)
    let transcript
    if (hasText) {
      let transcriptText = attempt.canonical_transcript
      if (attempt.canonical_transcript_insert_before_summary !== undefined) {
      if (typeof attempt.canonical_transcript_insert_before_summary !== 'string') {
        fail(`invalid transcript insert: ${attempt.attempt_id}`)
      }
      const marker = '\n\n Test Files'
      if (transcriptText.split(marker).length !== 2) fail(`ambiguous transcript insert marker: ${attempt.attempt_id}`)
        transcriptText = transcriptText.replace(
          marker,
          `${attempt.canonical_transcript_insert_before_summary}${marker}`,
        )
      }
      transcript = Buffer.from(transcriptText, 'utf8')
    } else {
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(attempt.canonical_transcript_base64)) {
        fail(`non-canonical base64 transcript: ${attempt.attempt_id}`)
      }
      transcript = Buffer.from(attempt.canonical_transcript_base64, 'base64')
      if (transcript.toString('base64') !== attempt.canonical_transcript_base64) {
        fail(`base64 transcript roundtrip mismatch: ${attempt.attempt_id}`)
      }
    }
    if (transcript.length !== attempt.stdout_stderr_utf8_bytes || sha256(transcript) !== attempt.stdout_stderr_sha256) {
      fail(`transcript binding mismatch: ${attempt.attempt_id}`)
    }
    const start = ticks100ns(attempt.started_at_utc)
    const end = ticks100ns(attempt.ended_at_utc)
    if (start === null || end === null || start > end) fail(`invalid attempt chronology: ${attempt.attempt_id}`)
    if (latest !== null && start < latest) fail(`overlapping/non-sequential final attempt: ${attempt.attempt_id}`)
    latest = end
  }
  const generated = ticks100ns(evidence.generated_at_utc)
  if (generated === null || latest === null || generated < latest) fail('generated_at_utc predates final evidence')

  const byId = new Map(attempts.map((entry) => [entry.attempt_id, entry]))
  if (byId.get('mb3-final-targeted-001')?.result_counts?.tests !== 41) fail('initial targeted test count mismatch')
  if (byId.get('mb3-final-full-test-001')?.result_counts?.tests !== 498) fail('initial full test count mismatch')
  if (byId.get('mb3-remediation1-final-targeted-001')?.result_counts?.tests !== 44) fail('remediation targeted test count mismatch')
  if (byId.get('mb3-remediation1-final-full-test-001')?.result_counts?.tests !== 501) fail('remediation full test count mismatch')
  if (byId.get('mb3-remediation1-final-build-001')?.result_counts?.static_pages !== 3) fail('remediation build count mismatch')
  if (byId.get('mb3-remediation2-final-targeted-001')?.result_counts?.tests !== 46) fail('remediation2 targeted test count mismatch')
  if (byId.get('mb3-remediation3-final-targeted-001')?.result_counts?.tests !== 46) fail('remediation3 targeted test count mismatch')
  if (byId.get('mb3-remediation3-final-full-test-001')?.result_counts?.tests !== 503) fail('remediation3 full test count mismatch')
  if (byId.get('mb3-remediation3-final-build-001')?.result_counts?.static_pages !== 3) fail('remediation3 build count mismatch')
  if (byId.get('mb3-remediation4-final-targeted-001')?.result_counts?.tests !== 48) fail('remediation4 targeted test count mismatch')
  if (byId.get('mb3-remediation4-final-full-test-001')?.result_counts?.tests !== 505) fail('remediation4 full test count mismatch')
  if (byId.get('mb3-remediation4-final-build-001')?.result_counts?.static_pages !== 3) fail('remediation4 build count mismatch')
  if (byId.get('mb3-remediation5-final-targeted-001')?.result_counts?.tests !== 48) fail('remediation5 targeted test count mismatch')
  if (byId.get('mb3-remediation5-final-full-test-001')?.result_counts?.tests !== 505) fail('remediation5 full test count mismatch')
  if (byId.get('mb3-remediation5-final-build-001')?.result_counts?.static_pages !== 3) fail('remediation5 build count mismatch')
  if (byId.get('mb3-remediation6-final-targeted-001')?.result_counts?.tests !== 48) fail('remediation6 targeted test count mismatch')
  if (byId.get('mb3-remediation6-final-full-test-001')?.result_counts?.tests !== 505) fail('remediation6 full test count mismatch')
  if (byId.get('mb3-remediation6-final-build-004')?.result_counts?.static_pages !== 3) fail('remediation6 build count mismatch')
  if (byId.get('mb3-remediation6-final-sql-concurrency-001')?.result_counts?.global_id_guard_rejections !== 3) {
    fail('remediation6 global identifier guard count mismatch')
  }
  if (byId.get('mb3-remediation7-final-targeted-001')?.result_counts?.tests !== 50) fail('remediation7 targeted test count mismatch')
  if (byId.get('mb3-remediation7-final-full-test-001')?.result_counts?.tests !== 507) fail('remediation7 full test count mismatch')
  if (byId.get('mb3-remediation7-final-build-001')?.result_counts?.static_pages !== 3) fail('remediation7 build count mismatch')
  if (byId.get('mb3-remediation7-final-sql-concurrency-001')?.result_counts?.foreign_key_wait_rejections !== 2) {
    fail('remediation7 foreign-key wait rejection count mismatch')
  }
  if (byId.get('mb3-remediation8-final-targeted-001')?.result_counts?.tests !== 51) fail('remediation8 targeted test count mismatch')
  if (byId.get('mb3-remediation8-final-full-test-001')?.result_counts?.tests !== 508) fail('remediation8 full test count mismatch')
  if (byId.get('mb3-remediation8-final-build-002')?.result_counts?.static_pages !== 3) fail('remediation8 build count mismatch')
  if (byId.get('mb3-remediation9-final-targeted-003')?.result_counts?.tests !== 51) fail('remediation9 targeted test count mismatch')
  if (byId.get('mb3-remediation9-final-full-test-002')?.result_counts?.tests !== 508) fail('remediation9 full test count mismatch')
  if (byId.get('mb3-remediation9-final-build-002')?.result_counts?.static_pages !== 3) fail('remediation9 build count mismatch')
  for (const id of REQUIRED_ATTEMPTS.filter(
    (value) => value.startsWith('mb3-remediation') && value.includes('-final-sql-'),
  )) {
    const transcript = Buffer.from(byId.get(id).canonical_transcript_base64, 'base64').toString('utf8')
    for (const fragment of [
      'dockerContext=desktop-linux',
      'imageDigest=sha256:95d92e9563121189086690a4b7f8f2b711a4809a2499f45592199aae68ebae5f',
      'networkMode=none',
      'postgresVersion=17.6',
      'MB3 cluster cleanup PASS: test database removed; MB3 memberships and roles absent.',
    ]) if (!transcript.includes(fragment)) fail(`SQL attestation/cleanup claim missing in ${id}`)
  }

  const reviews = evidence.independent_review_history
  if (!Array.isArray(reviews)) fail('independent review history missing')
  exactSet(
    reviews.map((review) => review.review_id),
    [
      ...Object.keys(REQUIRED_INITIAL_REVIEWS),
      ...Object.keys(REQUIRED_REMEDIATION1_REVIEWS),
      ...Object.keys(REQUIRED_REMEDIATION3_REVIEWS),
      ...Object.keys(REQUIRED_REMEDIATION4_REVIEWS),
      ...Object.keys(REQUIRED_REMEDIATION5_REVIEWS),
      ...Object.keys(REQUIRED_REMEDIATION6_REVIEWS),
      ...Object.keys(REQUIRED_REMEDIATION8_REVIEWS),
    ],
    'independent review history',
  )
  for (const review of reviews.filter((entry) => REQUIRED_INITIAL_REVIEWS[entry.review_id])) {
    const expected = REQUIRED_INITIAL_REVIEWS[review.review_id]
    if (review.result !== 'no_pass') fail(`initial review result drift: ${review.review_id}`)
    if (JSON.stringify(review.severity_counts) !== JSON.stringify({ p0: 0, p1: 0, p2: expected.p2, p3: 0 })) {
      fail(`initial review severity drift: ${review.review_id}`)
    }
    exactSet(review.finding_ids ?? [], expected.findings, `initial review findings ${review.review_id}`)
    if (JSON.stringify(review.snapshot_canonical_sha256) !== JSON.stringify(INITIAL_REVIEW_SNAPSHOT)) {
      fail(`initial review snapshot drift: ${review.review_id}`)
    }
  }
  for (const review of reviews.filter((entry) => REQUIRED_REMEDIATION1_REVIEWS[entry.review_id])) {
    const expected = REQUIRED_REMEDIATION1_REVIEWS[review.review_id]
    if (review.result !== expected.result) fail(`remediation1 review result drift: ${review.review_id}`)
    if (JSON.stringify(review.severity_counts) !== JSON.stringify(expected.counts)) {
      fail(`remediation1 review severity drift: ${review.review_id}`)
    }
    exactSet(review.finding_ids ?? [], expected.findings, `remediation1 review findings ${review.review_id}`)
    if (JSON.stringify(review.snapshot_canonical_sha256) !== JSON.stringify(REMEDIATION1_REVIEW_SNAPSHOT)) {
      fail(`remediation1 review snapshot drift: ${review.review_id}`)
    }
  }
  for (const review of reviews.filter((entry) => REQUIRED_REMEDIATION3_REVIEWS[entry.review_id])) {
    const expected = REQUIRED_REMEDIATION3_REVIEWS[review.review_id]
    if (review.result !== expected.result) fail(`remediation3 review result drift: ${review.review_id}`)
    if (JSON.stringify(review.severity_counts) !== JSON.stringify(expected.counts)) {
      fail(`remediation3 review severity drift: ${review.review_id}`)
    }
    exactSet(review.finding_ids ?? [], expected.findings, `remediation3 review findings ${review.review_id}`)
    if (JSON.stringify(review.snapshot_canonical_sha256) !== JSON.stringify(REMEDIATION3_REVIEW_SNAPSHOT)) {
      fail(`remediation3 review snapshot drift: ${review.review_id}`)
    }
  }
  for (const review of reviews.filter((entry) => REQUIRED_REMEDIATION4_REVIEWS[entry.review_id])) {
    const expected = REQUIRED_REMEDIATION4_REVIEWS[review.review_id]
    if (review.result !== expected.result) fail(`remediation4 review result drift: ${review.review_id}`)
    if (JSON.stringify(review.severity_counts) !== JSON.stringify(expected.counts)) {
      fail(`remediation4 review severity drift: ${review.review_id}`)
    }
    exactSet(review.finding_ids ?? [], expected.findings, `remediation4 review findings ${review.review_id}`)
    if (JSON.stringify(review.snapshot_canonical_sha256) !== JSON.stringify(REMEDIATION4_REVIEW_SNAPSHOT)) {
      fail(`remediation4 review snapshot drift: ${review.review_id}`)
    }
  }
  for (const review of reviews.filter((entry) => REQUIRED_REMEDIATION5_REVIEWS[entry.review_id])) {
    const expected = REQUIRED_REMEDIATION5_REVIEWS[review.review_id]
    if (review.result !== expected.result) fail(`remediation5 review result drift: ${review.review_id}`)
    if (JSON.stringify(review.severity_counts) !== JSON.stringify(expected.counts)) {
      fail(`remediation5 review severity drift: ${review.review_id}`)
    }
    exactSet(review.finding_ids ?? [], expected.findings, `remediation5 review findings ${review.review_id}`)
    if (JSON.stringify(review.snapshot_canonical_sha256) !== JSON.stringify(REMEDIATION5_REVIEW_SNAPSHOT)) {
      fail(`remediation5 review snapshot drift: ${review.review_id}`)
    }
  }
  for (const review of reviews.filter((entry) => REQUIRED_REMEDIATION6_REVIEWS[entry.review_id])) {
    const expected = REQUIRED_REMEDIATION6_REVIEWS[review.review_id]
    if (review.result !== expected.result) fail(`remediation6 review result drift: ${review.review_id}`)
    if (JSON.stringify(review.severity_counts) !== JSON.stringify(expected.counts)) {
      fail(`remediation6 review severity drift: ${review.review_id}`)
    }
    exactSet(review.finding_ids ?? [], expected.findings, `remediation6 review findings ${review.review_id}`)
    if (JSON.stringify(review.snapshot_canonical_sha256) !== JSON.stringify(REMEDIATION6_REVIEW_SNAPSHOT)) {
      fail(`remediation6 review snapshot drift: ${review.review_id}`)
    }
  }
  for (const review of reviews.filter((entry) => REQUIRED_REMEDIATION8_REVIEWS[entry.review_id])) {
    const expected = REQUIRED_REMEDIATION8_REVIEWS[review.review_id]
    if (review.result !== expected.result) fail(`remediation8 review result drift: ${review.review_id}`)
    if (JSON.stringify(review.severity_counts) !== JSON.stringify(expected.counts)) {
      fail(`remediation8 review severity drift: ${review.review_id}`)
    }
    exactSet(review.finding_ids ?? [], expected.findings, `remediation8 review findings ${review.review_id}`)
    if (JSON.stringify(review.snapshot_canonical_sha256) !== JSON.stringify(REMEDIATION8_REVIEW_SNAPSHOT)) {
      fail(`remediation8 review snapshot drift: ${review.review_id}`)
    }
  }
  if (evidence.remediation_history?.length !== 9
    || evidence.remediation_history[0]?.remediation_id !== 'MB3-REM-001'
    || evidence.remediation_history[0]?.status !== 'implemented_local_gates_passed_independent_rereview_completed_with_a4_no_pass'
    || evidence.remediation_history[1]?.remediation_id !== 'MB3-REM-002'
    || evidence.remediation_history[1]?.status !== 'implemented_partial_final_gates_full_suite_timeout'
    || evidence.remediation_history[2]?.remediation_id !== 'MB3-REM-003'
    || evidence.remediation_history[2]?.status !== 'scope_expanded_local_final_gates_passed_independent_rereview_completed_with_a3_a4_no_pass'
    || evidence.remediation_history[3]?.remediation_id !== 'MB3-REM-004'
    || evidence.remediation_history[3]?.status !== 'implemented_local_final_gates_passed_independent_rereview_completed_with_a3_a4_no_pass'
    || evidence.remediation_history[4]?.remediation_id !== 'MB3-REM-005'
    || evidence.remediation_history[4]?.status !== 'implemented_local_final_gates_passed_independent_rereview_completed_with_a4_no_pass'
    || evidence.remediation_history[5]?.remediation_id !== 'MB3-REM-006'
    || evidence.remediation_history[5]?.status !== 'implemented_local_final_gates_passed_independent_rereview_completed_with_a4_a5_no_pass'
    || evidence.remediation_history[6]?.remediation_id !== 'MB3-REM-007'
    || evidence.remediation_history[6]?.status !== 'implemented_local_final_gates_passed_independent_rereview_pending'
    || evidence.remediation_history[7]?.remediation_id !== 'MB3-REM-008'
    || evidence.remediation_history[7]?.status !== 'implemented_local_final_gates_passed_independent_rereview_pending'
    || evidence.remediation_history[8]?.remediation_id !== 'MB3-REM-009'
    || evidence.remediation_history[8]?.status !== 'implemented_local_final_gates_passed_independent_rereview_pending') {
    fail('MB3 remediation history mismatch')
  }
  return { evidence, canonical }
}

const manifest = parseManifest()
const { evidence } = parseEvidence()
const head = git(['rev-parse', 'HEAD']).trim()
exactSet(
  new Set([...candidateStatusPaths(), ...committedCandidatePaths(head)]),
  CANDIDATE_SCOPE,
  'Git candidate scope',
)
if (git(['rev-parse', 'origin/main']).trim() !== BASELINE) fail('origin/main moved from baseline')
if (git(['merge-base', head, 'origin/main']).trim() !== BASELINE) fail('merge-base mismatch')

for (const [path, expected] of manifest) {
  const bytes = canonicalBytes(readStable(path), path)
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.hash) {
    fail(`manifest mismatch: ${path}`)
  }
}

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /https?:\/\/[^\s/:]+:[^\s/@]+@/,
]
for (const path of MANIFEST_INPUTS) {
  const text = canonicalBytes(readStable(path), path).toString('utf8')
  const sanitized = text.replaceAll('https://user:pass@fixture.invalid', '')
  if (secretPatterns.some((pattern) => pattern.test(sanitized))) fail(`secret-like value in ${path}`)
}

console.log(`MB3 manifest PASS: ${manifest.size}/${MANIFEST_INPUTS.length} canonical inputs; ${evidence.final_gate_attempts.length}/${REQUIRED_ATTEMPTS.length} final gates; runtime off; no external authority.`)
