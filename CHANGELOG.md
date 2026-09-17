# Changelog

## [0.6.2](https://github.com/Go2Engle/CriProx/compare/v0.6.1...v0.6.2) (2026-09-17)


### Bug Fixes

* **export:** avoid artwork lookup for size-check sheets ([#29](https://github.com/Go2Engle/CriProx/issues/29)) ([2c481ce](https://github.com/Go2Engle/CriProx/commit/2c481ce49d791a9d8f16fa7955a1a0a9e742e7e9))

## [0.6.1](https://github.com/Go2Engle/CriProx/compare/v0.6.0...v0.6.1) (2026-09-17)


### Bug Fixes

* **macos:** avoid Documents access on startup ([#28](https://github.com/Go2Engle/CriProx/issues/28)) ([4d9a628](https://github.com/Go2Engle/CriProx/commit/4d9a628dfae990161c08871c604fcb36d2245fbd))
* **release:** restore unsigned macOS builds ([#26](https://github.com/Go2Engle/CriProx/issues/26)) ([4ce8491](https://github.com/Go2Engle/CriProx/commit/4ce849139db3cc3b4dcfbaf15605ddd20049cf21))

## [0.6.0](https://github.com/Go2Engle/CriProx/compare/v0.5.0...v0.6.0) (2026-09-17)


### Features

* **print:** support double-sided card backs ([fba8d06](https://github.com/Go2Engle/CriProx/commit/fba8d062605e8ff6d3012982118216708fc32cc7))
* **print:** support double-sided card backs ([ea2c0e7](https://github.com/Go2Engle/CriProx/commit/ea2c0e7ddb7a0cb2dacaef481f4aef68f02241e9))


### Bug Fixes

* **cards:** use 2.5 mm MTG corner radius ([51e71b7](https://github.com/Go2Engle/CriProx/commit/51e71b754be89b29e8ec74ce47f895cde784a8b0))
* **cards:** use 2.5 mm MTG corner radius ([45ee272](https://github.com/Go2Engle/CriProx/commit/45ee272388772b40980a805bc60d5e22d9a6ef4a))
* **macos:** persist document folder permission across launches ([#25](https://github.com/Go2Engle/CriProx/issues/25)) ([4510708](https://github.com/Go2Engle/CriProx/commit/4510708980ea370d0934cb80027586a423071637))
* **printing:** save registered PDFs without browser rasterization ([33abdb6](https://github.com/Go2Engle/CriProx/commit/33abdb6f0dec948bba8f79bd7b8b53c0577c582a))
* **print:** remove quality-reducing direct printing ([0e05388](https://github.com/Go2Engle/CriProx/commit/0e053886489a2145d8d24022c0cb71f0b5d95595))

## [0.5.0](https://github.com/Go2Engle/CriProx/compare/v0.4.0...v0.5.0) (2026-09-15)


### Features

* add local project library ([16bddf2](https://github.com/Go2Engle/CriProx/commit/16bddf287624af6de0ea406170b6dcf269d764d7))
* add single-card catalog search ([8de0c12](https://github.com/Go2Engle/CriProx/commit/8de0c12facab90724599d48181f457c442c6f502))
* **cards:** add single-card catalog search ([0d8e2e6](https://github.com/Go2Engle/CriProx/commit/0d8e2e6999789585795aa4eecab03d9cd7df1cdd))
* **import:** add Moxfield and Archidekt deck links ([0ce2afc](https://github.com/Go2Engle/CriProx/commit/0ce2afc10e85590208d714c7cca2f2217a3a5124))
* **import:** add Moxfield and Archidekt deck links ([b07da8c](https://github.com/Go2Engle/CriProx/commit/b07da8c4aa053510bb7acd098101ae13566715ba))
* **projects:** add local project library ([20d3fb6](https://github.com/Go2Engle/CriProx/commit/20d3fb618fbd4287ae7c465aa26c3239b29cc713))


### Bug Fixes

* **cards:** allow artwork selection per card copy ([0e51612](https://github.com/Go2Engle/CriProx/commit/0e51612188fcdf78ff74193bb63bc151996a4f80))
* **cards:** allow artwork selection per card copy ([7afa64c](https://github.com/Go2Engle/CriProx/commit/7afa64ccb1f9f18812966b4859d0001a043ff0a4))
* **projects:** prevent file read race conditions ([d83dd41](https://github.com/Go2Engle/CriProx/commit/d83dd417e5dc789eaa138b62ef051351faa2b184))

## [0.4.0](https://github.com/Go2Engle/CriProx/compare/v0.3.0...v0.4.0) (2026-09-14)


### Features

* **guide:** add print workflow video walkthroughs ([bdcbe49](https://github.com/Go2Engle/CriProx/commit/bdcbe49184091f8fd2d9ca93f1f1e5c01742ccda))
* **guide:** add print workflow video walkthroughs ([90e25ac](https://github.com/Go2Engle/CriProx/commit/90e25ac60e4e13e39845766d668f59505265fd7b))

## [0.3.0](https://github.com/Go2Engle/CriProx/compare/v0.2.1...v0.3.0) (2026-09-14)


### Features

* **layout:** add experimental seven-card Letter profile ([e5a307b](https://github.com/Go2Engle/CriProx/commit/e5a307bef0db71684c3c1fe3fb31e0662be3fe7e))
* **layout:** add experimental seven-card Letter workflow ([24b7428](https://github.com/Go2Engle/CriProx/commit/24b74284a81cfc0135a6a1492eff23949b9eb811))
* **layout:** increase seven-card spacing ([2a1dcf9](https://github.com/Go2Engle/CriProx/commit/2a1dcf967587249a58f08268ffb67749c1152ef3))
* **layout:** simplify sheet and bleed controls ([2a18a4c](https://github.com/Go2Engle/CriProx/commit/2a18a4c802d995390a87df797055f1120857fdf6))


### Bug Fixes

* **layout:** restore proven seven-card spacing ([b783738](https://github.com/Go2Engle/CriProx/commit/b783738ae18a1dab15fef77e0a07e2e697c19988))
* **print:** download setup template as PNG ([aa443b4](https://github.com/Go2Engle/CriProx/commit/aa443b40d8e2d3d6df9b7f0ef0320baa42e5a3fa))
* **settings:** disable playtest label by default ([cb70b19](https://github.com/Go2Engle/CriProx/commit/cb70b19a9a7e6f9be8888306d0503ba8ec671585))

## [0.2.1](https://github.com/Go2Engle/CriProx/compare/v0.2.0...v0.2.1) (2026-09-13)


### Bug Fixes

* **release:** preserve tags for draft releases ([e443eb0](https://github.com/Go2Engle/CriProx/commit/e443eb08c8c107e45ee78978feba6dc679fe7515))
* **release:** provide repository context for uploads ([afa11cc](https://github.com/Go2Engle/CriProx/commit/afa11cc49fc1636d9952c5f05e28a2ffe1def370))

## [0.2.0](https://github.com/Go2Engle/CriProx/compare/v0.1.0...v0.2.0) (2026-09-13)

### Features

- **release:** automate cross-platform desktop releases ([43e1625](https://github.com/Go2Engle/CriProx/commit/43e16256594fde3aeb2d8a53dd801382840ecdd8))
