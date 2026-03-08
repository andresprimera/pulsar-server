# Staged Changes

```diff
diff --git a/package.json b/package.json
index ef4b365..507a63d 100644
--- a/package.json
+++ b/package.json
@@ -12,6 +12,7 @@
     "start:dev": "npx kill-port 3000 || true && nest start --watch",
     "start:debug": "nest start --debug --watch",
     "start:prod": "node dist/main",
+    "start:worker": "node dist/worker",
     "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --max-warnings=0",
     "lint:fix": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
     "typecheck": "tsc --noEmit",
@@ -28,16 +29,21 @@
     "test:architecture": "jest --config ./test/jest-architecture.json",
     "check:cycles": "madge --circular src --extensions ts --ts-config ./tsconfig.json",
     "review:architecture": "git diff main...HEAD | claude --agent architecture-steward -p 'Review the following git diff for architectural compliance. Output your full review with a Final Verdict.'",
-    "dump:staged": "echo '# Staged Changes\n' > staged-changes.md && echo '```diff' >> staged-changes.md && git diff --cached >> staged-changes.md && echo '```' >> staged-changes.md"
+    "dump:staged": "echo '# Staged Changes\n' > staged-changes.md && echo '```diff' >> staged-changes.md && git diff --cached >> staged-changes.md && echo '```' >> staged-changes.md",
+    "dump:src": "node scripts/dump-src.mjs"
   },
   "dependencies": {
     "@ai-sdk/anthropic": "^3.0.34",
     "@ai-sdk/openai": "^3.0.24",
+    "@nestjs/bullmq": "^10.0.0",
     "@nestjs/common": "^9.0.0",
     "@nestjs/config": "^4.0.2",
     "@nestjs/core": "^9.0.0",
     "@nestjs/mongoose": "^9.2.2",
     "@nestjs/platform-express": "^9.0.0",
+    "@nestjs/schedule": "^4.0.0",
+    "bullmq": "^5.0.0",
+    "ioredis": "^5.3.2",
     "ai": "^6.0.66",
     "class-transformer": "^0.5.1",
     "class-validator": "^0.14.3",
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index 34b4ac5..2d3c546 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -14,6 +14,9 @@ importers:
       '@ai-sdk/openai':
         specifier: ^3.0.24
         version: 3.0.24(zod@4.3.6)
+      '@nestjs/bullmq':
+        specifier: ^10.0.0
+        version: 10.2.3(@nestjs/common@9.4.3(class-transformer@0.5.1)(class-validator@0.14.3)(reflect-metadata@0.1.14)(rxjs@7.8.2))(@nestjs/core@9.4.3)(bullmq@5.70.4)
       '@nestjs/common':
         specifier: ^9.0.0
         version: 9.4.3(class-transformer@0.5.1)(class-validator@0.14.3)(reflect-metadata@0.1.14)(rxjs@7.8.2)
@@ -29,9 +32,15 @@ importers:
       '@nestjs/platform-express':
         specifier: ^9.0.0
         version: 9.4.3(@nestjs/common@9.4.3(class-transformer@0.5.1)(class-validator@0.14.3)(reflect-metadata@0.1.14)(rxjs@7.8.2))(@nestjs/core@9.4.3)
+      '@nestjs/schedule':
+        specifier: ^4.0.0
+        version: 4.1.2(@nestjs/common@9.4.3(class-transformer@0.5.1)(class-validator@0.14.3)(reflect-metadata@0.1.14)(rxjs@7.8.2))(@nestjs/core@9.4.3)
       ai:
         specifier: ^6.0.66
         version: 6.0.66(zod@4.3.6)
+      bullmq:
+        specifier: ^5.0.0
+        version: 5.70.4
       class-transformer:
         specifier: ^0.5.1
         version: 0.5.1
@@ -41,6 +50,9 @@ importers:
       imapflow:
         specifier: ^1.2.9
         version: 1.2.9
+      ioredis:
+        specifier: ^5.3.2
+        version: 5.10.0
       mongoose:
         specifier: ^7.8.8
         version: 7.8.8
@@ -405,6 +417,12 @@ packages:
     resolution: {integrity: sha512-93zYdMES/c1D69yZiKDBj0V24vqNzB/koF26KPaagAfd3P/4gUlh3Dys5ogAK+Exi9QyzlD8x/08Zt7wIKcDcA==}
     deprecated: Use @eslint/object-schema instead
 
+  '@ioredis/commands@1.5.0':
+    resolution: {integrity: sha512-eUgLqrMf8nJkZxT24JvVRrQya1vZkQh8BBeYNwGDqa5I0VUi8ACx7uFvAaLxintokpTenkK6DASvo/bvNbBGow==}
+
+  '@ioredis/commands@1.5.1':
+    resolution: {integrity: sha512-JH8ZL/ywcJyR9MmJ5BNqZllXNZQqQbnVZOqpPQqE1vHiFgAw4NHbvE0FOduNU8IX9babitBT46571OnPTT0Zcw==}
+
   '@istanbuljs/load-nyc-config@1.1.0':
     resolution: {integrity: sha512-VjeHSlIzpv/NyD3N0YuHfXOPDIixcA1q2ZV98wsMqcYlPmv2n3Yb2lYP9XMElnaFVXg5A7YLTeLu6V84uQDjmQ==}
     engines: {node: '>=8'}
@@ -508,9 +526,52 @@ packages:
   '@mongodb-js/saslprep@1.4.5':
     resolution: {integrity: sha512-k64Lbyb7ycCSXHSLzxVdb2xsKGPMvYZfCICXvDsI8Z65CeWQzTEKS4YmGbnqw+U9RBvLPTsB6UCmwkgsDTGWIw==}
 
+  '@msgpackr-extract/msgpackr-extract-darwin-arm64@3.0.3':
+    resolution: {integrity: sha512-QZHtlVgbAdy2zAqNA9Gu1UpIuI8Xvsd1v8ic6B2pZmeFnFcMWiPLfWXh7TVw4eGEZ/C9TH281KwhVoeQUKbyjw==}
+    cpu: [arm64]
+    os: [darwin]
+
+  '@msgpackr-extract/msgpackr-extract-darwin-x64@3.0.3':
+    resolution: {integrity: sha512-mdzd3AVzYKuUmiWOQ8GNhl64/IoFGol569zNRdkLReh6LRLHOXxU4U8eq0JwaD8iFHdVGqSy4IjFL4reoWCDFw==}
+    cpu: [x64]
+    os: [darwin]
+
+  '@msgpackr-extract/msgpackr-extract-linux-arm64@3.0.3':
+    resolution: {integrity: sha512-YxQL+ax0XqBJDZiKimS2XQaf+2wDGVa1enVRGzEvLLVFeqa5kx2bWbtcSXgsxjQB7nRqqIGFIcLteF/sHeVtQg==}
+    cpu: [arm64]
+    os: [linux]
+
+  '@msgpackr-extract/msgpackr-extract-linux-arm@3.0.3':
+    resolution: {integrity: sha512-fg0uy/dG/nZEXfYilKoRe7yALaNmHoYeIoJuJ7KJ+YyU2bvY8vPv27f7UKhGRpY6euFYqEVhxCFZgAUNQBM3nw==}
+    cpu: [arm]
+    os: [linux]
+
+  '@msgpackr-extract/msgpackr-extract-linux-x64@3.0.3':
+    resolution: {integrity: sha512-cvwNfbP07pKUfq1uH+S6KJ7dT9K8WOE4ZiAcsrSes+UY55E/0jLYc+vq+DO7jlmqRb5zAggExKm0H7O/CBaesg==}
+    cpu: [x64]
+    os: [linux]
+
+  '@msgpackr-extract/msgpackr-extract-win32-x64@3.0.3':
+    resolution: {integrity: sha512-x0fWaQtYp4E6sktbsdAqnehxDgEc/VwM7uLsRCYWaiGu0ykYdZPiS8zCWdnjHwyiumousxfBm4SO31eXqwEZhQ==}
+    cpu: [x64]
+    os: [win32]
+
   '@napi-rs/wasm-runtime@0.2.12':
     resolution: {integrity: sha512-ZVWUcfwY4E/yPitQJl481FjFo3K22D6qF0DuFH6Y/nbnE11GY5uguDxZMGXPQ8WQ0128MXQD7TnfHyK4oWoIJQ==}
 
+  '@nestjs/bull-shared@10.2.3':
+    resolution: {integrity: sha512-XcgAjNOgq6b5DVCytxhR5BKiwWo7hsusVeyE7sfFnlXRHeEtIuC2hYWBr/ZAtvL/RH0/O0tqtq0rVl972nbhJw==}
+    peerDependencies:
+      '@nestjs/common': ^8.0.0 || ^9.0.0 || ^10.0.0
+      '@nestjs/core': ^8.0.0 || ^9.0.0 || ^10.0.0
+
+  '@nestjs/bullmq@10.2.3':
+    resolution: {integrity: sha512-Lo4W5kWD61/246Y6H70RNgV73ybfRbZyKKS4CBRDaMELpxgt89O+EgYZUB4pdoNrWH16rKcaT0AoVsB/iDztKg==}
+    peerDependencies:
+      '@nestjs/common': ^8.0.0 || ^9.0.0 || ^10.0.0
+      '@nestjs/core': ^8.0.0 || ^9.0.0 || ^10.0.0
+      bullmq: ^3.0.0 || ^4.0.0 || ^5.0.0
+
   '@nestjs/cli@9.5.0':
     resolution: {integrity: sha512-Z7q+3vNsQSG2d2r2Hl/OOj5EpfjVx3OfnJ9+KuAsOdw1sKLm7+Zc6KbhMFTd/eIvfx82ww3Nk72xdmfPYCulWA==}
     engines: {node: '>= 12.9.0'}
@@ -570,6 +631,12 @@ packages:
       '@nestjs/common': ^9.0.0
       '@nestjs/core': ^9.0.0
 
+  '@nestjs/schedule@4.1.2':
+    resolution: {integrity: sha512-hCTQ1lNjIA5EHxeu8VvQu2Ed2DBLS1GSC6uKPYlBiQe6LL9a7zfE9iVSK+zuK8E2odsApteEBmfAQchc8Hx0Gg==}
+    peerDependencies:
+      '@nestjs/common': ^8.0.0 || ^9.0.0 || ^10.0.0
+      '@nestjs/core': ^8.0.0 || ^9.0.0 || ^10.0.0
+
   '@nestjs/schematics@9.2.0':
     resolution: {integrity: sha512-wHpNJDPzM6XtZUOB3gW0J6mkFCSJilzCM3XrHI1o0C8vZmFE1snbmkIXNyoi1eV0Nxh1BMymcgz5vIMJgQtTqw==}
     peerDependencies:
@@ -725,6 +792,9 @@ packages:
   '@types/json5@0.0.29':
     resolution: {integrity: sha512-dRLjCWHYg4oaA77cxO64oO+7JwCwnIzkZPdrrC71jQmQtlhM556pwKo5bUzqvZndkVbeFLIIi+9TC40JNF5hNQ==}
 
+  '@types/luxon@3.4.2':
+    resolution: {integrity: sha512-TifLZlFudklWlMBfhubvgqTXRzLDI5pCbGa4P8a3wPyUQSW+1xQ5eDsreP9DWHX3tjq1ke96uYG/nwundroWcA==}
+
   '@types/methods@1.1.4':
     resolution: {integrity: sha512-ymXWVrDiCxTBE3+RIrrP533E70eA+9qu7zdWoHuOmGujkYtzf4HQF96b8nwHLqhuf4ykX61IGRIB38CC6/sImQ==}
 
@@ -1287,6 +1357,9 @@ packages:
   buffer@5.7.1:
     resolution: {integrity: sha512-EHcyIPBQ4BSGlvjB16k5KgAJ27CIsHY/2JBmCRReo48y9rQ3MaUzWX3KVlBa4U7MyX02HdVj0K7C3WaB3ju7FQ==}
 
+  bullmq@5.70.4:
+    resolution: {integrity: sha512-S58YT/tGdhc4pEPcIahtZRBR1TcTLpss1UKiXimF+Vy4yZwF38pW2IvhHqs4j4dEbZqDt8oi0jGGN/WYQHbPDg==}
+
   busboy@1.6.0:
     resolution: {integrity: sha512-8SFQbg/0hQ9xy3UNTB0YEnsNBbWfhf7RtnzpL7TkBiTBRfrQ9Fxcnz7VJsleJpyp6rVLvXiuORqjlHi5q+PYuA==}
     engines: {node: '>=10.16.0'}
@@ -1378,6 +1451,10 @@ packages:
     resolution: {integrity: sha512-JQHZ2QMW6l3aH/j6xCqQThY/9OH4D/9ls34cgkUBiEeocRTU04tHfKPBsUK1PqZCUQM7GiA0IIXJSuXHI64Kbg==}
     engines: {node: '>=0.8'}
 
+  cluster-key-slot@1.1.2:
+    resolution: {integrity: sha512-RMr0FhtfXemyinomL4hrWcYJxmX6deFdCxpJzhDttxgO1+bcCnkk+9drydLVDmAMG7NE6aN/fl4F7ucU/90gAA==}
+    engines: {node: '>=0.10.0'}
+
   co@4.6.0:
     resolution: {integrity: sha512-QVb0dM5HvG+uaxitm8wONl7jltx8dqhfU33DcqtOZcLSVIKSDDLDi7+0LbAKiyI8hD9u42m2YxXSkMGWThaecQ==}
     engines: {iojs: '>= 1.0.0', node: '>= 0.12.0'}
@@ -1467,6 +1544,13 @@ packages:
   create-require@1.1.1:
     resolution: {integrity: sha512-dcKFX3jn0MpIaXjisoRvexIJVEKzaq7z2rZKxf+MSr9TkdmHmsU4m2lcLojrj/FHl8mk5VxMmYA+ftRkP/3oKQ==}
 
+  cron-parser@4.9.0:
+    resolution: {integrity: sha512-p0SaNjrHOnQeR8/VnfGbmg9te2kfyYSQ7Sc/j/6DtPL3JQvKxmjO9TSjNFpujqV3vEYYBvNNvXSxzyksBWAx1Q==}
+    engines: {node: '>=12.0.0'}
+
+  cron@3.2.1:
+    resolution: {integrity: sha512-w2n5l49GMmmkBFEsH9FIDhjZ1n1QgTMOCMGuQtOXs5veNiosZmso6bQGuqOJSYAXXrG84WQFVneNk+Yt0Ua9iw==}
+
   cross-spawn@7.0.6:
     resolution: {integrity: sha512-uV2QOWP2nWzsy2aMp8aRibhi9dlzF5Hgh5SHaB9OiTGEyDTiJJyx0uy51QXdyWbtAHNua4XJzUKca3OzKUd3vA==}
     engines: {node: '>= 8'}
@@ -1542,6 +1626,10 @@ packages:
     resolution: {integrity: sha512-ZySD7Nf91aLB0RxL4KGrKHBXl7Eds1DAmEdcoVawXnLD7SDhpNgtuII2aAkg7a7QS41jxPSZ17p4VdGnMHk3MQ==}
     engines: {node: '>=0.4.0'}
 
+  denque@2.1.0:
+    resolution: {integrity: sha512-HVQE3AAb/pxF8fQAoiqpvg9i3evqug3hoiwakOyZAwJm+6vZehbkYXZ0l4JxS+I3QxM97v5aaRNhj8v5oBhekw==}
+    engines: {node: '>=0.10'}
+
   depd@2.0.0:
     resolution: {integrity: sha512-g7nH6P6dyDioJogAAGprGpCtVImJhpPk/roCzdb3fIh61/s/nPsfR6onyMwkCAR/OlC3yBC0lESvUoQEAssIrw==}
     engines: {node: '>= 0.8'}
@@ -1555,6 +1643,10 @@ packages:
     resolution: {integrity: sha512-2sJGJTaXIIaR1w4iJSNoN0hnMY7Gpc/n8D4qSCJw8QqFWXf7cuAgnEHxBpweaVcPevC2l3KpjYCx3NypQQgaJg==}
     engines: {node: '>= 0.8', npm: 1.2.8000 || >= 1.4.16}
 
+  detect-libc@2.1.2:
+    resolution: {integrity: sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==}
+    engines: {node: '>=8'}
+
   detect-newline@3.1.0:
     resolution: {integrity: sha512-TLz+x/vEXm/Y7P7wn1EJFNLxYpUD4TgMosxY6fAVJUnJMbupHBOncxyWUG9OpTaH9EBD7uFI5LfEgmMOc54DsA==}
     engines: {node: '>=8'}
@@ -2229,6 +2321,14 @@ packages:
     resolution: {integrity: sha512-agE4QfB2Lkp9uICn7BAqoscw4SZP9kTE2hxiFI3jBPmXJfdqiahTbUuKGsMoN2GtqL9AxhYioAcVvgsb1HvRbA==}
     engines: {node: '>= 0.10'}
 
+  ioredis@5.10.0:
+    resolution: {integrity: sha512-HVBe9OFuqs+Z6n64q09PQvP1/R4Bm+30PAyyD4wIEqssh3v9L21QjCVk4kRLucMBcDokJTcLjsGeVRlq/nH6DA==}
+    engines: {node: '>=12.22.0'}
+
+  ioredis@5.9.3:
+    resolution: {integrity: sha512-VI5tMCdeoxZWU5vjHWsiE/Su76JGhBvWF1MJnV9ZtGltHk9BmD48oDq8Tj8haZ85aceXZMxLNDQZRVo5QKNgXA==}
+    engines: {node: '>=12.22.0'}
+
   ip-address@10.1.0:
     resolution: {integrity: sha512-XXADHxXmvT9+CRxhXg56LJovE+bmWnEWB78LB83VZTprKTmaC5QfruXocxzTZ2Kl0DNwKuBdlIhjL8LeY8Sf8Q==}
     engines: {node: '>= 12'}
@@ -2651,6 +2751,12 @@ packages:
     resolution: {integrity: sha512-iPZK6eYjbxRu3uB4/WZ3EsEIMJFMqAoopl3R+zuq0UjcAm/MO6KCweDgPfP3elTztoKP3KtnVHxTn2NHBSDVUw==}
     engines: {node: '>=10'}
 
+  lodash.defaults@4.2.0:
+    resolution: {integrity: sha512-qjxPLHd3r5DnsdGacqOMU6pb/avJzdh9tFX2ymgoZE27BmjXrNy/y4LoaiTeAb+O3gL8AfpJGtqfX/ae2leYYQ==}
+
+  lodash.isarguments@3.1.0:
+    resolution: {integrity: sha512-chi4NHZlZqZD18a0imDHnZPrDeBbTtVN7GXMwuGdRH9qotxAjYs3aVLKc7zNOG9eddR5Ksd8rvFEBc9SsggPpg==}
+
   lodash.memoize@4.1.2:
     resolution: {integrity: sha512-t7j+NzmgnQzTAYXcsHYLgimltOV1MXHtlOWf6GjL9Kj8GK5FInw5JotxvbOs+IvV1/Dzo04/fCGfLVs7aXb4Ag==}
 
@@ -2673,6 +2779,14 @@ packages:
   lru-cache@5.1.1:
     resolution: {integrity: sha512-KpNARQA3Iwv+jTA0utUVVbrh+Jlrr1Fv0e56GGzAFOXN7dk/FviaDW8LHmK52DlcH4WP2n6gI8vN1aesBFgo9w==}
 
+  luxon@3.5.0:
+    resolution: {integrity: sha512-rh+Zjr6DNfUYR3bPwJEnuwDdqMbxZW7LOQfUN4B54+Cl+0o5zaU9RJ6bcidfDtC1cWCZXQ+nvX8bf6bAji37QQ==}
+    engines: {node: '>=12'}
+
+  luxon@3.7.2:
+    resolution: {integrity: sha512-vtEhXh/gNjI9Yg1u4jX/0YVPMvxzHuGgCm6tC5kZyb08yjGWGnqAjGJvcXbqQR2P3MyMEFnRbpcdFS6PBcLqew==}
+    engines: {node: '>=12'}
+
   macos-release@2.5.1:
     resolution: {integrity: sha512-DXqXhEM7gW59OjZO8NIjBCz9AQ1BEMrfiOAl4AYByHCtVHRF4KoGNO8mqQeM8lRCtQe/UnJ4imO/d2HdkKsd+A==}
     engines: {node: '>=6'}
@@ -2837,6 +2951,13 @@ packages:
   ms@2.1.3:
     resolution: {integrity: sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==}
 
+  msgpackr-extract@3.0.3:
+    resolution: {integrity: sha512-P0efT1C9jIdVRefqjzOQ9Xml57zpOXnIuS+csaB4MdZbTdmGDLo8XhzBG1N7aO11gKDDkJvBLULeFTo46wwreA==}
+    hasBin: true
+
+  msgpackr@1.11.5:
+    resolution: {integrity: sha512-UjkUHN0yqp9RWKy0Lplhh+wlpdt9oQBYgULZOiFhV3VclSF1JnSQWZ5r9gORQlNYaUKQoR8itv7g7z1xDDuACA==}
+
   multer@1.4.4-lts.1:
     resolution: {integrity: sha512-WeSGziVj6+Z2/MwQo3GvqzgR+9Uc+qt8SwHKh3gvNPiISKfsMfG4SvCOFYlxxgkXt7yIV2i1yczehm0EOKIxIg==}
     engines: {node: '>= 6.0.0'}
@@ -2883,6 +3004,10 @@ packages:
       encoding:
         optional: true
 
+  node-gyp-build-optional-packages@5.2.2:
+    resolution: {integrity: sha512-s+w+rBWnpTMwSFbaE0UXsRlg7hU4FjekKU4eyAih5T8nJuNZT1nNsskXpxmeqSK9UzkBl6UgRlnKc8hz8IEqOw==}
+    hasBin: true
+
   node-int64@0.4.0:
     resolution: {integrity: sha512-O5lz91xSOeoXP6DulyHfllpq+Eg00MWitZIbtPfoSEvqIHdl5gfcY6hYzDWnj0qD5tz52PI08u9qUvSVeUBeHw==}
 
@@ -3192,6 +3317,14 @@ packages:
     resolution: {integrity: sha512-HFM8rkZ+i3zrV+4LQjwQ0W+ez98pApMGM3HUrN04j3CqzPOzl9nmP15Y8YXNm8QHGv/eacOVEjqhmWpkRV0NAw==}
     engines: {node: '>= 0.10'}
 
+  redis-errors@1.2.0:
+    resolution: {integrity: sha512-1qny3OExCf0UvUV/5wpYKf2YwPcOqXzkwKKSmKHiE6ZMQs5heeE/c8eXK+PNllPvmjgAbfnsbpkGZWy8cBpn9w==}
+    engines: {node: '>=4'}
+
+  redis-parser@3.0.0:
+    resolution: {integrity: sha512-DJnGAeenTdpMEH6uAJRK/uiyEIH9WVsUmoLwzudwGJUwZPp80PDBWPHXSAGNPwNvIXAbe7MSUB1zQFugFml66A==}
+    engines: {node: '>=4'}
+
   reflect-metadata@0.1.14:
     resolution: {integrity: sha512-ZhYeb6nRaXCfhnndflDK8qI6ZQ/YcWZCISRAWICW9XYqMUwjZM9Z0DveWX/ABN01oxSHwVxKQmxeYZSsm0jh5A==}
 
@@ -3326,6 +3459,11 @@ packages:
     engines: {node: '>=10'}
     hasBin: true
 
+  semver@7.7.4:
+    resolution: {integrity: sha512-vFKC2IEtQnVhpT78h1Yp8wzwrf8CM+MzKMHGJZfBtzhZNycRFnXsHk6E5TxIkkMsgNS7mdX3AGB7x2QM2di4lA==}
+    engines: {node: '>=10'}
+    hasBin: true
+
   send@0.18.0:
     resolution: {integrity: sha512-qqWzuOjSFOuqPjFe4NOsMLafToQQwBSOEpS+FwEt3A2V3vKubTquT3vmLTQpFgMXp8AlFWFuP1qKaJZOtPpVXg==}
     engines: {node: '>= 0.8.0'}
@@ -3445,6 +3583,9 @@ packages:
     resolution: {integrity: sha512-XlkWvfIm6RmsWtNJx+uqtKLS8eqFbxUg0ZzLXqY0caEy9l7hruX8IpiDnjsLavoBgqCCR71TqWO8MaXYheJ3RQ==}
     engines: {node: '>=10'}
 
+  standard-as-callback@2.1.0:
+    resolution: {integrity: sha512-qoRRSyROncaz1z0mvYqIE4lCd9p2R90i6GxW3uZv5ucSu8tU7B5HXUP1gG8pVZsYNVaXjk8ClXHPttLyxAL48A==}
+
   statuses@2.0.1:
     resolution: {integrity: sha512-RwNA9Z/7PrK06rYLIzFMlaF+l73iwpzsqRIFgbMLbTcLD6cOao82TaWefPXQvB2fOC4AjuYSEndS7N/mTCbkdQ==}
     engines: {node: '>= 0.8'}
@@ -3781,6 +3922,14 @@ packages:
     resolution: {integrity: sha512-pMZTvIkT1d+TFGvDOqodOclx0QWkkgi6Tdoa8gC8ffGAAqz9pzPTZWAybbsHHoED/ztMtkv/VoYTYyShUn81hA==}
     engines: {node: '>= 0.4.0'}
 
+  uuid@11.0.3:
+    resolution: {integrity: sha512-d0z310fCWv5dJwnX1Y/MncBAqGMKEzlBb1AOf7z9K8ALnd0utBX/msg/fA0+sbyN1ihbMsLhrBlnl1ak7Wa0rg==}
+    hasBin: true
+
+  uuid@11.1.0:
+    resolution: {integrity: sha512-0/A9rDy9P7cJ+8w1c9WD9V//9Wj15Ce2MPz8Ri6032usz+NfePxx5AcN3bN+r6ZL6jEo066/yNYB3tn4pQEx+A==}
+    hasBin: true
+
   v8-compile-cache-lib@3.0.1:
     resolution: {integrity: sha512-wa7YjyUGfNZngI/vtK0UHAN+lgDCxBPCylVXGp0zu59Fz5aiGtNXaq3DhIov063MorB+VfufLh3JlF2KdTK3xg==}
 
@@ -4248,6 +4397,10 @@ snapshots:
 
   '@humanwhocodes/object-schema@2.0.3': {}
 
+  '@ioredis/commands@1.5.0': {}
+
+  '@ioredis/commands@1.5.1': {}
+
   '@istanbuljs/load-nyc-config@1.1.0':
     dependencies:
       camelcase: 5.3.1
@@ -4456,6 +4609,24 @@ snapshots:
       sparse-bitfield: 3.0.3
     optional: true
 
+  '@msgpackr-extract/msgpackr-extract-darwin-arm64@3.0.3':
+    optional: true
+
+  '@msgpackr-extract/msgpackr-extract-darwin-x64@3.0.3':
+    optional: true
+
+  '@msgpackr-extract/msgpackr-extract-linux-arm64@3.0.3':
+    optional: true
+
+  '@msgpackr-extract/msgpackr-extract-linux-arm@3.0.3':
+    optional: true
+
+  '@msgpackr-extract/msgpackr-extract-linux-x64@3.0.3':
+    optional: true
+
+  '@msgpackr-extract/msgpackr-extract-win32-x64@3.0.3':
+    optional: true
+
   '@napi-rs/wasm-runtime@0.2.12':
     dependencies:
       '@emnapi/core': 1.8.1
@@ -4463,6 +4634,20 @@ snapshots:
       '@tybys/wasm-util': 0.10.1
     optional: true
 
+  '@nestjs/bull-shared@10.2.3(@nestjs/common@9.4.3(class-transformer@0.5.1)(class-validator@0.14.3)(reflect-metadata@0.1.14)(rxjs@7.8.2))(@nestjs/core@9.4.3)':
+    dependencies:
+      '@nestjs/common': 9.4.3(class-transformer@0.5.1)(class-validator@0.14.3)(reflect-metadata@0.1.14)(rxjs@7.8.2)
+      '@nestjs/core': 9.4.3(@nestjs/common@9.4.3(class-transformer@0.5.1)(class-validator@0.14.3)(reflect-metadata@0.1.14)(rxjs@7.8.2))(@nestjs/platform-express@9.4.3)(reflect-metadata@0.1.14)(rxjs@7.8.2)
+      tslib: 2.8.1
+
+  '@nestjs/bullmq@10.2.3(@nestjs/common@9.4.3(class-transformer@0.5.1)(class-validator@0.14.3)(reflect-metadata@0.1.14)(rxjs@7.8.2))(@nestjs/core@9.4.3)(bullmq@5.70.4)':
+    dependencies:
+      '@nestjs/bull-shared': 10.2.3(@nestjs/common@9.4.3(class-transformer@0.5.1)(class-validator@0.14.3)(reflect-metadata@0.1.14)(rxjs@7.8.2))(@nestjs/core@9.4.3)
+      '@nestjs/common': 9.4.3(class-transformer@0.5.1)(class-validator@0.14.3)(reflect-metadata@0.1.14)(rxjs@7.8.2)
+      '@nestjs/core': 9.4.3(@nestjs/common@9.4.3(class-transformer@0.5.1)(class-validator@0.14.3)(reflect-metadata@0.1.14)(rxjs@7.8.2))(@nestjs/platform-express@9.4.3)(reflect-metadata@0.1.14)(rxjs@7.8.2)
+      bullmq: 5.70.4
+      tslib: 2.8.1
+
   '@nestjs/cli@9.5.0':
     dependencies:
       '@angular-devkit/core': 16.0.1(chokidar@3.5.3)
@@ -4548,6 +4733,13 @@ snapshots:
     transitivePeerDependencies:
       - supports-color
 
+  '@nestjs/schedule@4.1.2(@nestjs/common@9.4.3(class-transformer@0.5.1)(class-validator@0.14.3)(reflect-metadata@0.1.14)(rxjs@7.8.2))(@nestjs/core@9.4.3)':
+    dependencies:
+      '@nestjs/common': 9.4.3(class-transformer@0.5.1)(class-validator@0.14.3)(reflect-metadata@0.1.14)(rxjs@7.8.2)
+      '@nestjs/core': 9.4.3(@nestjs/common@9.4.3(class-transformer@0.5.1)(class-validator@0.14.3)(reflect-metadata@0.1.14)(rxjs@7.8.2))(@nestjs/platform-express@9.4.3)(reflect-metadata@0.1.14)(rxjs@7.8.2)
+      cron: 3.2.1
+      uuid: 11.0.3
+
   '@nestjs/schematics@9.2.0(chokidar@3.5.3)(typescript@4.9.5)':
     dependencies:
       '@angular-devkit/core': 16.0.1(chokidar@3.5.3)
@@ -4731,6 +4923,8 @@ snapshots:
 
   '@types/json5@0.0.29': {}
 
+  '@types/luxon@3.4.2': {}
+
   '@types/methods@1.1.4': {}
 
   '@types/mime@1.3.5': {}
@@ -5405,6 +5599,18 @@ snapshots:
       base64-js: 1.5.1
       ieee754: 1.2.1
 
+  bullmq@5.70.4:
+    dependencies:
+      cron-parser: 4.9.0
+      ioredis: 5.9.3
+      msgpackr: 1.11.5
+      node-abort-controller: 3.1.1
+      semver: 7.7.4
+      tslib: 2.8.1
+      uuid: 11.1.0
+    transitivePeerDependencies:
+      - supports-color
+
   busboy@1.6.0:
     dependencies:
       streamsearch: 1.1.0
@@ -5493,6 +5699,8 @@ snapshots:
 
   clone@1.0.4: {}
 
+  cluster-key-slot@1.1.2: {}
+
   co@4.6.0: {}
 
   collect-v8-coverage@1.0.3: {}
@@ -5576,6 +5784,15 @@ snapshots:
 
   create-require@1.1.1: {}
 
+  cron-parser@4.9.0:
+    dependencies:
+      luxon: 3.7.2
+
+  cron@3.2.1:
+    dependencies:
+      '@types/luxon': 3.4.2
+      luxon: 3.5.0
+
   cross-spawn@7.0.6:
     dependencies:
       path-key: 3.1.1
@@ -5638,6 +5855,8 @@ snapshots:
 
   delayed-stream@1.0.0: {}
 
+  denque@2.1.0: {}
+
   depd@2.0.0: {}
 
   dependency-tree@11.4.0:
@@ -5651,6 +5870,9 @@ snapshots:
 
   destroy@1.2.0: {}
 
+  detect-libc@2.1.2:
+    optional: true
+
   detect-newline@3.1.0: {}
 
   detective-amd@6.0.1:
@@ -6532,6 +6754,34 @@ snapshots:
 
   interpret@1.4.0: {}
 
+  ioredis@5.10.0:
+    dependencies:
+      '@ioredis/commands': 1.5.1
+      cluster-key-slot: 1.1.2
+      debug: 4.4.3
+      denque: 2.1.0
+      lodash.defaults: 4.2.0
+      lodash.isarguments: 3.1.0
+      redis-errors: 1.2.0
+      redis-parser: 3.0.0
+      standard-as-callback: 2.1.0
+    transitivePeerDependencies:
+      - supports-color
+
+  ioredis@5.9.3:
+    dependencies:
+      '@ioredis/commands': 1.5.0
+      cluster-key-slot: 1.1.2
+      debug: 4.4.3
+      denque: 2.1.0
+      lodash.defaults: 4.2.0
+      lodash.isarguments: 3.1.0
+      redis-errors: 1.2.0
+      redis-parser: 3.0.0
+      standard-as-callback: 2.1.0
+    transitivePeerDependencies:
+      - supports-color
+
   ip-address@10.1.0: {}
 
   ipaddr.js@1.9.1: {}
@@ -7117,6 +7367,10 @@ snapshots:
     dependencies:
       p-locate: 5.0.0
 
+  lodash.defaults@4.2.0: {}
+
+  lodash.isarguments@3.1.0: {}
+
   lodash.memoize@4.1.2: {}
 
   lodash.merge@4.6.2: {}
@@ -7136,6 +7390,10 @@ snapshots:
     dependencies:
       yallist: 3.1.1
 
+  luxon@3.5.0: {}
+
+  luxon@3.7.2: {}
+
   macos-release@2.5.1: {}
 
   madge@8.0.0(typescript@5.9.3):
@@ -7286,6 +7544,22 @@ snapshots:
 
   ms@2.1.3: {}
 
+  msgpackr-extract@3.0.3:
+    dependencies:
+      node-gyp-build-optional-packages: 5.2.2
+    optionalDependencies:
+      '@msgpackr-extract/msgpackr-extract-darwin-arm64': 3.0.3
+      '@msgpackr-extract/msgpackr-extract-darwin-x64': 3.0.3
+      '@msgpackr-extract/msgpackr-extract-linux-arm': 3.0.3
+      '@msgpackr-extract/msgpackr-extract-linux-arm64': 3.0.3
+      '@msgpackr-extract/msgpackr-extract-linux-x64': 3.0.3
+      '@msgpackr-extract/msgpackr-extract-win32-x64': 3.0.3
+    optional: true
+
+  msgpackr@1.11.5:
+    optionalDependencies:
+      msgpackr-extract: 3.0.3
+
   multer@1.4.4-lts.1:
     dependencies:
       append-field: 1.0.0
@@ -7320,6 +7594,11 @@ snapshots:
     dependencies:
       whatwg-url: 5.0.0
 
+  node-gyp-build-optional-packages@5.2.2:
+    dependencies:
+      detect-libc: 2.1.2
+    optional: true
+
   node-int64@0.4.0: {}
 
   node-releases@2.0.27: {}
@@ -7652,6 +7931,12 @@ snapshots:
     dependencies:
       resolve: 1.22.11
 
+  redis-errors@1.2.0: {}
+
+  redis-parser@3.0.0:
+    dependencies:
+      redis-errors: 1.2.0
+
   reflect-metadata@0.1.14: {}
 
   reflect.getprototypeof@1.0.10:
@@ -7783,6 +8068,8 @@ snapshots:
 
   semver@7.7.3: {}
 
+  semver@7.7.4: {}
+
   send@0.18.0:
     dependencies:
       debug: 2.6.9
@@ -7930,6 +8217,8 @@ snapshots:
     dependencies:
       escape-string-regexp: 2.0.0
 
+  standard-as-callback@2.1.0: {}
+
   statuses@2.0.1: {}
 
   stop-iteration-iterator@1.1.0:
@@ -8296,6 +8585,10 @@ snapshots:
 
   utils-merge@1.0.1: {}
 
+  uuid@11.0.3: {}
+
+  uuid@11.1.0: {}
+
   v8-compile-cache-lib@3.0.1: {}
 
   v8-to-istanbul@9.3.0:
diff --git a/src/core/orchestrator/billing-generator.service.ts b/src/core/orchestrator/billing-generator.service.ts
index b3f1020..7e7f356 100644
--- a/src/core/orchestrator/billing-generator.service.ts
+++ b/src/core/orchestrator/billing-generator.service.ts
@@ -121,4 +121,29 @@ export class BillingGeneratorService {
 
     return { clientId, periodStart, periodEnd };
   }
+
+  /**
+   * Generates billing records for all clients for their current billing period.
+   * Each client is processed via generateForClient (idempotent). Returns counts.
+   */
+  async generateForAllClients(): Promise<{
+    generated: number;
+    skipped: number;
+  }> {
+    const clients = await this.clientRepository.findAll();
+    let generated = 0;
+    let skipped = 0;
+    for (const client of clients) {
+      const result = await this.generateForClient(String(client._id));
+      if (result) {
+        generated += 1;
+      } else {
+        skipped += 1;
+      }
+    }
+    this.logger.log(
+      `generateForAllClients completed: generated=${generated} skipped=${skipped} total=${clients.length}`,
+    );
+    return { generated, skipped };
+  }
 }
diff --git a/src/core/orchestrator/distributed-lock.service.ts b/src/core/orchestrator/distributed-lock.service.ts
new file mode 100644
index 0000000..aa51257
--- /dev/null
+++ b/src/core/orchestrator/distributed-lock.service.ts
@@ -0,0 +1,30 @@
+import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
+import Redis from 'ioredis';
+import { DistributedLock, RedisLike } from '@shared/lock/distributed-lock.service';
+
+export const REDIS_PROVIDER = 'REDIS';
+
+/**
+ * Nest injectable that provides distributed lock using Redis.
+ * Used for cron safety so only one instance enqueues per schedule.
+ */
+@Injectable()
+export class DistributedLockService implements OnModuleDestroy {
+  private readonly lock: DistributedLock;
+
+  constructor(@Inject(REDIS_PROVIDER) private readonly redis: Redis) {
+    this.lock = new DistributedLock(this.redis as unknown as RedisLike);
+  }
+
+  async acquire(key: string, ttlMs: number): Promise<string | null> {
+    return this.lock.acquire(key, ttlMs);
+  }
+
+  async release(key: string, token: string): Promise<void> {
+    return this.lock.release(key, token);
+  }
+
+  async onModuleDestroy(): Promise<void> {
+    this.redis.disconnect();
+  }
+}
diff --git a/src/core/orchestrator/errors/index.ts b/src/core/orchestrator/errors/index.ts
new file mode 100644
index 0000000..95a3de5
--- /dev/null
+++ b/src/core/orchestrator/errors/index.ts
@@ -0,0 +1 @@
+export * from './job-errors';
diff --git a/src/core/orchestrator/errors/job-errors.ts b/src/core/orchestrator/errors/job-errors.ts
new file mode 100644
index 0000000..e7c6124
--- /dev/null
+++ b/src/core/orchestrator/errors/job-errors.ts
@@ -0,0 +1,35 @@
+import { UnrecoverableError as BullMQUnrecoverableError } from 'bullmq';
+
+/**
+ * Recoverable job error. When thrown, BullMQ will retry according to job options.
+ * Use for transient failures (network, temporary DB errors, rate limits).
+ */
+export class RecoverableJobError extends Error {
+  readonly name = 'RecoverableJobError';
+
+  constructor(message: string, public readonly cause?: unknown) {
+    super(message);
+    Object.setPrototypeOf(this, RecoverableJobError.prototype);
+  }
+}
+
+/**
+ * Permanent job error. When thrown, BullMQ skips retries and fails the job
+ * immediately (maps to BullMQ UnrecoverableError). Use for validation errors,
+ * business rule violations, or known unrecoverable conditions.
+ */
+export class PermanentJobError extends BullMQUnrecoverableError {
+  readonly name = 'PermanentJobError';
+
+  constructor(message: string, public readonly cause?: unknown) {
+    super(message);
+    Object.setPrototypeOf(this, PermanentJobError.prototype);
+  }
+}
+
+/**
+ * Type guard: true if the error should not be retried.
+ */
+export function isPermanentJobError(err: unknown): err is PermanentJobError {
+  return err instanceof PermanentJobError;
+}
diff --git a/src/core/orchestrator/jobs/billing/billing-job.processor.ts b/src/core/orchestrator/jobs/billing/billing-job.processor.ts
new file mode 100644
index 0000000..22d04e7
--- /dev/null
+++ b/src/core/orchestrator/jobs/billing/billing-job.processor.ts
@@ -0,0 +1,130 @@
+import { OnApplicationShutdown, Logger } from '@nestjs/common';
+import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
+import { Job } from 'bullmq';
+import { BillingGeneratorService } from '@orchestrator/billing-generator.service';
+import {
+  BILLING_QUEUE_NAME,
+  BILLING_JOB_GENERATE_ALL,
+  BillingGenerateAllPayload,
+  BillingGenerateAllResult,
+} from '@orchestrator/jobs/contracts/billing-job.contract';
+import { JobMetricsService } from '@orchestrator/observability/job-metrics.service';
+import { QueueHealthService } from '@orchestrator/observability/queue-health.service';
+import { DeadLetterService } from '@orchestrator/observability/dead-letter.service';
+import { PermanentJobError, isPermanentJobError } from '@orchestrator/errors/job-errors';
+import { BILLING_PROCESSOR_OPTIONS } from '@orchestrator/jobs/registry/job-registry';
+
+@Processor(BILLING_QUEUE_NAME, BILLING_PROCESSOR_OPTIONS)
+export class BillingJobProcessor extends WorkerHost implements OnApplicationShutdown {
+  private readonly logger = new Logger(BillingJobProcessor.name);
+
+  constructor(
+    private readonly billingGeneratorService: BillingGeneratorService,
+    private readonly metrics: JobMetricsService,
+    private readonly queueHealth: QueueHealthService,
+    private readonly deadLetter: DeadLetterService,
+  ) {
+    super();
+  }
+
+  async onApplicationShutdown(): Promise<void> {
+    await this.worker.close();
+    this.logger.log('Billing worker closed (graceful shutdown)');
+  }
+
+  @OnWorkerEvent('active')
+  onActive(job: Job<BillingGenerateAllPayload, BillingGenerateAllResult, string>): void {
+    const processedOn = typeof job.processedOn === 'number' ? job.processedOn : undefined;
+    const timestamp = typeof job.timestamp === 'number' ? job.timestamp : undefined;
+    this.metrics.recordJobStarted({
+      queueName: BILLING_QUEUE_NAME,
+      jobName: job.name,
+      jobId: String(job.id),
+      timestamp: timestamp ?? Date.now(),
+      processedOn,
+    });
+    this.logger.log(
+      `Billing job started: id=${job.id} name=${job.name} traceId=${(job.data as BillingGenerateAllPayload).traceId ?? 'n/a'}`,
+    );
+  }
+
+  @OnWorkerEvent('completed')
+  onCompleted(
+    job: Job<BillingGenerateAllPayload, BillingGenerateAllResult, string>,
+    _result: BillingGenerateAllResult,
+  ): void {
+    const durationMs = job.finishedOn != null && job.processedOn != null
+      ? job.finishedOn - job.processedOn
+      : 0;
+    this.metrics.recordJobCompleted({
+      queueName: BILLING_QUEUE_NAME,
+      jobName: job.name,
+      jobId: String(job.id),
+      durationMs,
+      attempt: job.attemptsMade,
+    });
+    this.queueHealth.recordJobCompleted();
+  }
+
+  @OnWorkerEvent('failed')
+  onFailed(
+    job: Job<BillingGenerateAllPayload, BillingGenerateAllResult, string> | undefined,
+    error: Error,
+  ): void {
+    if (job) {
+      this.metrics.recordJobFailed({
+        queueName: BILLING_QUEUE_NAME,
+        jobName: job.name,
+        jobId: String(job.id),
+        attempt: job.attemptsMade,
+      });
+      const attempts = job.opts.attempts ?? 1;
+      if (job.attemptsMade >= attempts) {
+        this.deadLetter.moveToDeadLetter(job, error).catch((dlqErr) => {
+          this.logger.error(
+            `Failed to move job to DLQ: jobId=${job.id} error=${dlqErr instanceof Error ? dlqErr.message : String(dlqErr)}`,
+          );
+        });
+      }
+    }
+    this.logger.error(
+      `Billing job failed (exhausted retries or final failure): jobId=${job?.id} error=${error.message}`,
+    );
+  }
+
+  async process(
+    job: Job<BillingGenerateAllPayload, BillingGenerateAllResult, string>,
+  ): Promise<BillingGenerateAllResult> {
+    if (job.name !== BILLING_JOB_GENERATE_ALL) {
+      this.logger.warn(`Unknown job name: ${job.name}, ignoring`);
+      return { generated: 0, skipped: 0 };
+    }
+    const traceId = job.data.traceId ?? 'n/a';
+    const start = Date.now();
+    try {
+      const result = await this.billingGeneratorService.generateForAllClients();
+      const duration = Date.now() - start;
+      this.logger.log(
+        `Billing job completed: id=${job.id} traceId=${traceId} generated=${result.generated} skipped=${result.skipped} durationMs=${duration}`,
+      );
+      return result;
+    } catch (err) {
+      const duration = Date.now() - start;
+      const message = err instanceof Error ? err.message : String(err);
+      this.logger.error(
+        `Billing job failed: id=${job.id} traceId=${traceId} durationMs=${duration} error=${message}`,
+      );
+      if (isPermanent(err)) {
+        throw new PermanentJobError(message, err);
+      }
+      throw err;
+    }
+  }
+}
+
+function isPermanent(err: unknown): boolean {
+  if (isPermanentJobError(err)) return true;
+  const e = err as { code?: number };
+  if (typeof e?.code === 'number' && e.code === 11000) return true;
+  return false;
+}
diff --git a/src/core/orchestrator/jobs/billing/billing-job.scheduler.ts b/src/core/orchestrator/jobs/billing/billing-job.scheduler.ts
new file mode 100644
index 0000000..c422560
--- /dev/null
+++ b/src/core/orchestrator/jobs/billing/billing-job.scheduler.ts
@@ -0,0 +1,62 @@
+import { Injectable, Logger } from '@nestjs/common';
+import { Cron } from '@nestjs/schedule';
+import { InjectQueue } from '@nestjs/bullmq';
+import { Queue } from 'bullmq';
+import { randomUUID } from 'crypto';
+import { DistributedLockService } from '@orchestrator/distributed-lock.service';
+import {
+  BILLING_QUEUE_NAME,
+  BillingGenerateAllPayload,
+} from '@orchestrator/jobs/contracts/billing-job.contract';
+import { JOB_DEFINITIONS } from '@orchestrator/jobs/registry/job-registry';
+
+const BILLING_CRON_LOCK_KEY = 'pulsar:billing:cron:lock';
+const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes
+
+@Injectable()
+export class BillingJobScheduler {
+  private readonly logger = new Logger(BillingJobScheduler.name);
+
+  constructor(
+    @InjectQueue(BILLING_QUEUE_NAME) private readonly queue: Queue,
+    private readonly lockService: DistributedLockService,
+  ) {}
+
+  /**
+   * Runs on the 1st of every month at 00:00 UTC. Only the instance that acquires
+   * the distributed lock enqueues the job. Runs only in API process (not in worker).
+   */
+  @Cron('0 0 1 * *', { timeZone: 'UTC' })
+  async scheduleBillingJob(): Promise<void> {
+    this.logger.debug('Billing cron tick: attempting to acquire lock');
+    const token = await this.lockService.acquire(BILLING_CRON_LOCK_KEY, LOCK_TTL_MS);
+    if (!token) {
+      this.logger.debug('Billing cron: lock not acquired, skipping enqueue');
+      return;
+    }
+    try {
+      const periodKey = this.getCurrentPeriodKey();
+      const def = JOB_DEFINITIONS.billingGenerateAll;
+      const jobId = `${def.jobIdPrefix}:${periodKey}`;
+      const scheduledAt = new Date().toISOString();
+      const payload: BillingGenerateAllPayload = {
+        traceId: randomUUID(),
+        scheduledAt,
+      };
+      await this.queue.add(def.jobName, payload, {
+        jobId,
+        ...def.defaultOptions,
+      });
+      this.logger.log(`Billing cron: enqueued job ${jobId}`);
+    } finally {
+      await this.lockService.release(BILLING_CRON_LOCK_KEY, token);
+    }
+  }
+
+  private getCurrentPeriodKey(): string {
+    const now = new Date();
+    const year = now.getUTCFullYear();
+    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
+    return `${year}-${month}`;
+  }
+}
diff --git a/src/core/orchestrator/jobs/contracts/billing-job.contract.ts b/src/core/orchestrator/jobs/contracts/billing-job.contract.ts
new file mode 100644
index 0000000..f97a223
--- /dev/null
+++ b/src/core/orchestrator/jobs/contracts/billing-job.contract.ts
@@ -0,0 +1,19 @@
+/**
+ * Typed contracts for billing queue jobs. Prevents payload/result schema drift
+ * between scheduler and processor.
+ */
+
+export const BILLING_QUEUE_NAME = 'billing';
+export const BILLING_JOB_GENERATE_ALL = 'generateAll';
+
+export interface BillingGenerateAllPayload {
+  /** Correlation ID for tracing (UUID). Set by scheduler. */
+  traceId?: string;
+  /** When the job was scheduled (ISO 8601). */
+  scheduledAt: string;
+}
+
+export interface BillingGenerateAllResult {
+  generated: number;
+  skipped: number;
+}
diff --git a/src/core/orchestrator/jobs/contracts/dead-letter.contract.ts b/src/core/orchestrator/jobs/contracts/dead-letter.contract.ts
new file mode 100644
index 0000000..ea29903
--- /dev/null
+++ b/src/core/orchestrator/jobs/contracts/dead-letter.contract.ts
@@ -0,0 +1,13 @@
+/**
+ * Dead-letter queue contract. DLQ jobs store original job metadata for debugging.
+ */
+
+export const BILLING_DLQ_NAME = 'billing-dlq';
+
+export interface DeadLetterPayload {
+  originalJobId: string;
+  jobName: string;
+  payload: unknown;
+  error: string;
+  timestamp: string; // ISO 8601
+}
diff --git a/src/core/orchestrator/jobs/contracts/index.ts b/src/core/orchestrator/jobs/contracts/index.ts
new file mode 100644
index 0000000..3f9f1e3
--- /dev/null
+++ b/src/core/orchestrator/jobs/contracts/index.ts
@@ -0,0 +1,2 @@
+export * from './billing-job.contract';
+export * from './dead-letter.contract';
diff --git a/src/core/orchestrator/jobs/registry/job-registry.ts b/src/core/orchestrator/jobs/registry/job-registry.ts
new file mode 100644
index 0000000..bb81d4f
--- /dev/null
+++ b/src/core/orchestrator/jobs/registry/job-registry.ts
@@ -0,0 +1,42 @@
+import type { JobsOptions } from 'bullmq';
+import {
+  BILLING_QUEUE_NAME,
+  BILLING_JOB_GENERATE_ALL,
+} from '@orchestrator/jobs/contracts/billing-job.contract';
+
+export interface QueueLimiter {
+  max: number;
+  duration: number;
+}
+
+export interface JobDefinition {
+  queueName: string;
+  jobName: string;
+  defaultOptions: JobsOptions;
+  /** Prefix for stable jobId; full id = `${jobIdPrefix}:${periodKey}` or similar */
+  jobIdPrefix: string;
+  /** Optional rate limit: max jobs per duration (ms). */
+  limiter?: QueueLimiter;
+}
+
+export const JOB_DEFINITIONS = {
+  billingGenerateAll: {
+    queueName: BILLING_QUEUE_NAME,
+    jobName: BILLING_JOB_GENERATE_ALL,
+    defaultOptions: {
+      attempts: 3,
+      backoff: { type: 'exponential' as const, delay: 5000 },
+      removeOnComplete: { count: 1000 },
+    },
+    jobIdPrefix: 'billing:generateAll',
+    limiter: { max: 50, duration: 1000 } as QueueLimiter,
+  },
+} as const satisfies Record<string, JobDefinition>;
+
+/** Processor/worker options for billing (concurrency + optional limiter). */
+export const BILLING_PROCESSOR_OPTIONS = {
+  concurrency: 1,
+  limiter: JOB_DEFINITIONS.billingGenerateAll.limiter,
+} as const;
+
+export type JobKey = keyof typeof JOB_DEFINITIONS;
diff --git a/src/core/orchestrator/observability/dead-letter.service.ts b/src/core/orchestrator/observability/dead-letter.service.ts
new file mode 100644
index 0000000..b21a990
--- /dev/null
+++ b/src/core/orchestrator/observability/dead-letter.service.ts
@@ -0,0 +1,37 @@
+import { Injectable, Logger } from '@nestjs/common';
+import { InjectQueue } from '@nestjs/bullmq';
+import { Queue } from 'bullmq';
+import { Job } from 'bullmq';
+import { BILLING_DLQ_NAME, DeadLetterPayload } from '@orchestrator/jobs/contracts/dead-letter.contract';
+
+/**
+ * Moves failed jobs (exhausted retries) to the dead-letter queue with full metadata.
+ */
+@Injectable()
+export class DeadLetterService {
+  private readonly logger = new Logger(DeadLetterService.name);
+
+  constructor(
+    @InjectQueue(BILLING_DLQ_NAME) private readonly dlq: Queue,
+  ) {}
+
+  async moveToDeadLetter(
+    job: Job,
+    error: Error,
+  ): Promise<void> {
+    const payload: DeadLetterPayload = {
+      originalJobId: String(job.id),
+      jobName: job.name,
+      payload: job.data,
+      error: error.message,
+      timestamp: new Date().toISOString(),
+    };
+    await this.dlq.add('dlq', payload, {
+      jobId: `dlq:${job.name}:${job.id}:${Date.now()}`,
+      removeOnComplete: { count: 5000 },
+    });
+    this.logger.log(
+      `Job moved to DLQ: originalJobId=${job.id} jobName=${job.name} error=${error.message}`,
+    );
+  }
+}
diff --git a/src/core/orchestrator/observability/index.ts b/src/core/orchestrator/observability/index.ts
new file mode 100644
index 0000000..ebc6c24
--- /dev/null
+++ b/src/core/orchestrator/observability/index.ts
@@ -0,0 +1,3 @@
+export * from './job-metrics.service';
+export * from './queue-health.service';
+export * from './dead-letter.service';
diff --git a/src/core/orchestrator/observability/job-metrics.service.ts b/src/core/orchestrator/observability/job-metrics.service.ts
new file mode 100644
index 0000000..fb3df86
--- /dev/null
+++ b/src/core/orchestrator/observability/job-metrics.service.ts
@@ -0,0 +1,171 @@
+import { Injectable } from '@nestjs/common';
+
+export interface JobMetricLabels {
+  jobName: string;
+  queueName: string;
+}
+
+export interface JobStartedEvent extends JobMetricLabels {
+  jobId: string;
+  timestamp: number;
+  processedOn?: number;
+}
+
+export interface JobCompletedEvent extends JobMetricLabels {
+  jobId: string;
+  durationMs: number;
+  attempt: number;
+}
+
+export interface JobFailedEvent extends JobMetricLabels {
+  jobId: string;
+  attempt: number;
+}
+
+export interface AutoscalingSignals {
+  queueDepth: number;
+  jobsProcessedPerSecond: number;
+  avgJobDurationMs: number;
+}
+
+/** In-memory counters for queue/job metrics. Used by worker event handlers only. */
+@Injectable()
+export class JobMetricsService {
+  private readonly jobStartedTotal = new Map<string, number>();
+  private readonly jobCompletedTotal = new Map<string, number>();
+  private readonly jobFailedTotal = new Map<string, number>();
+  private readonly jobDurationsMs: number[] = [];
+  private readonly queueLatenciesMs: number[] = [];
+  private readonly completedTimestamps: number[] = [];
+  private readonly activeStarts = new Map<string, { startedAt: number; queueName: string; jobName: string }>();
+  private static readonly MAX_SAMPLES = 1000;
+  private static readonly RATE_WINDOW_MS = 60_000;
+
+  private key(labels: JobMetricLabels): string {
+    return `${labels.queueName}:${labels.jobName}`;
+  }
+
+  private jobKey(jobId: string, queueName: string): string {
+    return `${queueName}:${jobId}`;
+  }
+
+  recordJobStarted(event: JobStartedEvent): void {
+    const k = this.key(event);
+    this.jobStartedTotal.set(k, (this.jobStartedTotal.get(k) ?? 0) + 1);
+    this.activeStarts.set(this.jobKey(event.jobId, event.queueName), {
+      startedAt: Date.now(),
+      queueName: event.queueName,
+      jobName: event.jobName,
+    });
+    if (event.processedOn != null && event.timestamp != null) {
+      const latencyMs = event.processedOn - event.timestamp;
+      this.queueLatenciesMs.push(latencyMs);
+      this.trim(this.queueLatenciesMs);
+    }
+  }
+
+  recordJobCompleted(event: JobCompletedEvent): void {
+    const k = this.key(event);
+    this.jobCompletedTotal.set(k, (this.jobCompletedTotal.get(k) ?? 0) + 1);
+    let durationMs = event.durationMs;
+    const startEntry = this.activeStarts.get(this.jobKey(event.jobId, event.queueName));
+    if (startEntry) {
+      this.activeStarts.delete(this.jobKey(event.jobId, event.queueName));
+      if (durationMs <= 0) durationMs = Date.now() - startEntry.startedAt;
+    }
+    this.jobDurationsMs.push(durationMs);
+    this.trim(this.jobDurationsMs);
+    this.completedTimestamps.push(Date.now());
+    this.trimTimestamps();
+  }
+
+  recordJobFailed(event: JobFailedEvent): void {
+    const k = this.key(event);
+    this.jobFailedTotal.set(k, (this.jobFailedTotal.get(k) ?? 0) + 1);
+  }
+
+  setQueueDepth(queueName: string, depth: number): void {
+    (this as unknown as { _queueDepth: Map<string, number> })._queueDepth ??= new Map();
+    (this as unknown as { _queueDepth: Map<string, number> })._queueDepth.set(queueName, depth);
+  }
+
+  private trim(arr: number[]): void {
+    while (arr.length > JobMetricsService.MAX_SAMPLES) arr.shift();
+  }
+
+  private trimTimestamps(): void {
+    const cutoff = Date.now() - JobMetricsService.RATE_WINDOW_MS;
+    while (
+      this.completedTimestamps.length > 0 &&
+      this.completedTimestamps[0]! < cutoff
+    ) {
+      this.completedTimestamps.shift();
+    }
+  }
+
+  getJobStartedTotal(labels: JobMetricLabels): number {
+    return this.jobStartedTotal.get(this.key(labels)) ?? 0;
+  }
+
+  getJobCompletedTotal(labels: JobMetricLabels): number {
+    return this.jobCompletedTotal.get(this.key(labels)) ?? 0;
+  }
+
+  getJobFailedTotal(labels: JobMetricLabels): number {
+    return this.jobFailedTotal.get(this.key(labels)) ?? 0;
+  }
+
+  getRecentQueueLatencyMs(): number | null {
+    if (this.queueLatenciesMs.length === 0) return null;
+    const sum = this.queueLatenciesMs.reduce((a, b) => a + b, 0);
+    return Math.round(sum / this.queueLatenciesMs.length);
+  }
+
+  getRecentJobDurationMs(): number | null {
+    if (this.jobDurationsMs.length === 0) return null;
+    const sum = this.jobDurationsMs.reduce((a, b) => a + b, 0);
+    return Math.round(sum / this.jobDurationsMs.length);
+  }
+
+  getQueueDepth(queueName: string): number {
+    const m = (this as unknown as { _queueDepth?: Map<string, number> })._queueDepth;
+    return m?.get(queueName) ?? 0;
+  }
+
+  getJobsProcessedPerSecond(): number {
+    this.trimTimestamps();
+    if (this.completedTimestamps.length < 2) return 0;
+    const windowMs =
+      Date.now() - (this.completedTimestamps[0] ?? 0);
+    if (windowMs <= 0) return 0;
+    return this.completedTimestamps.length / (windowMs / 1000);
+  }
+
+  getAutoscalingSignals(queueName: string): AutoscalingSignals {
+    return {
+      queueDepth: this.getQueueDepth(queueName),
+      jobsProcessedPerSecond: this.getJobsProcessedPerSecond(),
+      avgJobDurationMs: this.getRecentJobDurationMs() ?? 0,
+    };
+  }
+
+  /** Snapshot for logging or metrics export (e.g. job_started_total, job_completed_total, etc.). */
+  getSnapshot(queueName: string, jobName: string): {
+    job_started_total: number;
+    job_completed_total: number;
+    job_failed_total: number;
+    job_duration_ms: number | null;
+    queue_latency_ms: number | null;
+    queue_depth: number;
+  } {
+    const labels = { queueName, jobName };
+    return {
+      job_started_total: this.getJobStartedTotal(labels),
+      job_completed_total: this.getJobCompletedTotal(labels),
+      job_failed_total: this.getJobFailedTotal(labels),
+      job_duration_ms: this.getRecentJobDurationMs(),
+      queue_latency_ms: this.getRecentQueueLatencyMs(),
+      queue_depth: this.getQueueDepth(queueName),
+    };
+  }
+}
diff --git a/src/core/orchestrator/observability/queue-health.service.ts b/src/core/orchestrator/observability/queue-health.service.ts
new file mode 100644
index 0000000..5965324
--- /dev/null
+++ b/src/core/orchestrator/observability/queue-health.service.ts
@@ -0,0 +1,102 @@
+import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
+import { InjectQueue } from '@nestjs/bullmq';
+import { Queue } from 'bullmq';
+import { JobMetricsService } from '@orchestrator/observability/job-metrics.service';
+import { BILLING_QUEUE_NAME } from '@orchestrator/jobs/contracts/billing-job.contract';
+
+const HEALTH_CHECK_INTERVAL_MS = 60_000;
+const QUEUE_DEPTH_WARN = 100;
+const OLDEST_JOB_AGE_WARN_MS = 5 * 60 * 1000; // 5 minutes
+const LATENCY_WARN_MS = 30_000; // 30 seconds
+
+/**
+ * Lightweight queue health monitoring. Runs only in worker mode.
+ * Logs warnings for backlog, old jobs, high latency, and worker starvation.
+ */
+@Injectable()
+export class QueueHealthService implements OnModuleInit, OnModuleDestroy {
+  private readonly logger = new Logger(QueueHealthService.name);
+  private intervalId: ReturnType<typeof setInterval> | null = null;
+  private lastCompletedAt: number = 0;
+
+  constructor(
+    @InjectQueue(BILLING_QUEUE_NAME) private readonly queue: Queue,
+    private readonly metrics: JobMetricsService,
+  ) {}
+
+  onModuleInit(): void {
+    if (process.env.WORKER_MODE !== 'true') return;
+    this.intervalId = setInterval(
+      () => this.runHealthCheck(),
+      HEALTH_CHECK_INTERVAL_MS,
+    );
+    this.logger.log('Queue health monitoring started (worker mode)');
+  }
+
+  onModuleDestroy(): void {
+    if (this.intervalId != null) {
+      clearInterval(this.intervalId);
+      this.intervalId = null;
+    }
+  }
+
+  recordJobCompleted(): void {
+    this.lastCompletedAt = Date.now();
+  }
+
+  private async runHealthCheck(): Promise<void> {
+    try {
+      const counts = await this.queue.getJobCounts();
+      const waiting = counts.waiting ?? 0;
+      const active = counts.active ?? 0;
+      const delayed = counts.delayed ?? 0;
+      const total = waiting + active + delayed;
+      this.metrics.setQueueDepth(BILLING_QUEUE_NAME, total);
+
+      if (total >= QUEUE_DEPTH_WARN) {
+        this.logger.warn(
+          `Queue backlog detected: queue=${BILLING_QUEUE_NAME} depth=${total} waiting=${waiting} active=${active} delayed=${delayed}`,
+        );
+      }
+
+      const oldest = await this.getOldestWaitingJobAge();
+      if (oldest != null && oldest > OLDEST_JOB_AGE_WARN_MS) {
+        this.logger.warn(
+          `Oldest job age exceeds threshold: queue=${BILLING_QUEUE_NAME} oldestAgeMs=${oldest} thresholdMs=${OLDEST_JOB_AGE_WARN_MS}`,
+        );
+      }
+
+      const latencyMs = this.metrics.getRecentQueueLatencyMs();
+      if (latencyMs != null && latencyMs > LATENCY_WARN_MS) {
+        this.logger.warn(
+          `Queue latency high: queue=${BILLING_QUEUE_NAME} queue_latency_ms=${latencyMs} thresholdMs=${LATENCY_WARN_MS}`,
+        );
+      }
+
+      const idleMs = Date.now() - this.lastCompletedAt;
+      if (this.lastCompletedAt > 0 && total > 0 && idleMs > HEALTH_CHECK_INTERVAL_MS * 2) {
+        this.logger.warn(
+          `Worker starvation detected: queue=${BILLING_QUEUE_NAME} depth=${total} lastCompletedAgoMs=${idleMs}`,
+        );
+      }
+
+      const signals = this.metrics.getAutoscalingSignals(BILLING_QUEUE_NAME);
+      this.logger.debug(
+        `Queue health: depth=${signals.queueDepth} rate=${signals.jobsProcessedPerSecond.toFixed(2)}/s avgDurationMs=${signals.avgJobDurationMs}`,
+      );
+    } catch (err) {
+      this.logger.error(
+        `Queue health check failed: ${err instanceof Error ? err.message : String(err)}`,
+      );
+    }
+  }
+
+  private async getOldestWaitingJobAge(): Promise<number | null> {
+    const waiting = await this.queue.getWaiting(0, 0);
+    if (waiting.length === 0) return null;
+    const job = waiting[0];
+    const timestamp = job.timestamp ?? job.processedOn;
+    if (timestamp == null) return null;
+    return Date.now() - timestamp;
+  }
+}
diff --git a/src/core/orchestrator/orchestrator.module.ts b/src/core/orchestrator/orchestrator.module.ts
index 15a203a..7be3b29 100644
--- a/src/core/orchestrator/orchestrator.module.ts
+++ b/src/core/orchestrator/orchestrator.module.ts
@@ -1,18 +1,71 @@
 import { Module } from '@nestjs/common';
+import { ConfigModule, ConfigService } from '@nestjs/config';
+import { ScheduleModule } from '@nestjs/schedule';
+import { BullModule } from '@nestjs/bullmq';
+import Redis from 'ioredis';
 import { IncomingMessageOrchestrator } from './incoming-message.orchestrator';
 import { ContactIdentityResolver } from './contact-identity.resolver';
 import { QuotaEnforcementService } from './quota-enforcement.service';
 import { BillingGeneratorService } from './billing-generator.service';
+import { DistributedLockService, REDIS_PROVIDER } from './distributed-lock.service';
+import { BillingJobScheduler } from './jobs/billing/billing-job.scheduler';
+import { BillingJobProcessor } from './jobs/billing/billing-job.processor';
+import { BILLING_QUEUE_NAME } from './jobs/contracts/billing-job.contract';
+import { BILLING_DLQ_NAME } from './jobs/contracts/dead-letter.contract';
+import { JOB_DEFINITIONS } from './jobs/registry/job-registry';
+import { JobMetricsService } from './observability/job-metrics.service';
+import { QueueHealthService } from './observability/queue-health.service';
+import { DeadLetterService } from './observability/dead-letter.service';
 import { AgentModule } from '@agent/agent.module';
 import { DomainModule } from '@domain/domain.module';
 
+const isWorkerMode = process.env.WORKER_MODE === 'true';
+
 @Module({
-  imports: [AgentModule, DomainModule],
+  imports: [
+    AgentModule,
+    DomainModule,
+    ...(isWorkerMode ? [] : [ScheduleModule.forRoot()]),
+    BullModule.forRootAsync({
+      imports: [ConfigModule],
+      useFactory: (configService: ConfigService) => {
+        const uri = configService.get<string>('REDIS_URI') ?? 'redis://localhost:6379';
+        const url = new URL(uri);
+        return {
+          connection: {
+            host: url.hostname,
+            port: url.port ? parseInt(url.port, 10) : 6379,
+            password: url.password || undefined,
+          },
+        };
+      },
+      inject: [ConfigService],
+    }),
+    BullModule.registerQueue({
+      name: BILLING_QUEUE_NAME,
+      defaultJobOptions: JOB_DEFINITIONS.billingGenerateAll.defaultOptions,
+    }),
+    BullModule.registerQueue({
+      name: BILLING_DLQ_NAME,
+      defaultJobOptions: { removeOnComplete: { count: 5000 } },
+    }),
+  ],
   providers: [
+    {
+      provide: REDIS_PROVIDER,
+      useFactory: (configService: ConfigService) => {
+        const uri = configService.get<string>('REDIS_URI') ?? 'redis://localhost:6379';
+        return new Redis(uri);
+      },
+      inject: [ConfigService],
+    },
+    DistributedLockService,
     IncomingMessageOrchestrator,
     ContactIdentityResolver,
     QuotaEnforcementService,
     BillingGeneratorService,
+    JobMetricsService,
+    ...(isWorkerMode ? [QueueHealthService, DeadLetterService, BillingJobProcessor] : [BillingJobScheduler]),
   ],
   exports: [IncomingMessageOrchestrator, BillingGeneratorService],
 })
diff --git a/src/shared/lock/distributed-lock.service.ts b/src/shared/lock/distributed-lock.service.ts
new file mode 100644
index 0000000..0953198
--- /dev/null
+++ b/src/shared/lock/distributed-lock.service.ts
@@ -0,0 +1,53 @@
+/**
+ * Distributed lock using Redis SET key value NX PX ttl.
+ * Intended for cron safety: only one instance acquires and enqueues.
+ * Caller must inject a Redis-compatible client (e.g. from BullMQ or a dedicated connection).
+ */
+
+export interface RedisLike {
+  set(
+    key: string,
+    value: string,
+    ...args: (string | number)[]
+  ): Promise<string | null>;
+  del(key: string): Promise<number>;
+  get(key: string): Promise<string | null>;
+}
+
+export class DistributedLock {
+  constructor(private readonly redis: RedisLike) {}
+
+  /**
+   * Try to acquire a lock. Returns a token if acquired, null otherwise.
+   * Use the token with release() so only the holder can release.
+   */
+  async acquire(key: string, ttlMs: number): Promise<string | null> {
+    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
+    const result = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
+    return result === 'OK' ? token : null;
+  }
+
+  /**
+   * Release the lock only if the current value matches the token (holder check).
+   */
+  async release(key: string, token: string): Promise<void> {
+    const script = `
+      if redis.call("get", KEYS[1]) == ARGV[1] then
+        return redis.call("del", KEYS[1])
+      else
+        return 0
+      end
+    `;
+    const redisWithEval = this.redis as RedisLike & {
+      eval?: (script: string, nkeys: number, ...args: string[]) => Promise<unknown>;
+    };
+    if (typeof redisWithEval.eval === 'function') {
+      await redisWithEval.eval(script, 1, key, token);
+    } else {
+      const current = await this.redis.get(key);
+      if (current === token) {
+        await this.redis.del(key);
+      }
+    }
+  }
+}
diff --git a/src/worker.module.ts b/src/worker.module.ts
new file mode 100644
index 0000000..21a42c4
--- /dev/null
+++ b/src/worker.module.ts
@@ -0,0 +1,17 @@
+import { Module } from '@nestjs/common';
+import { ConfigModule } from '@nestjs/config';
+import { DatabaseModule } from '@persistence/database.module';
+import { OrchestratorModule } from '@orchestrator/orchestrator.module';
+
+/**
+ * Minimal module for the worker process: only persistence and orchestrator.
+ * Used by src/worker.ts so that BullMQ workers run without HTTP or channel modules.
+ */
+@Module({
+  imports: [
+    ConfigModule.forRoot({ isGlobal: true }),
+    DatabaseModule,
+    OrchestratorModule,
+  ],
+})
+export class WorkerModule {}
diff --git a/src/worker.ts b/src/worker.ts
new file mode 100644
index 0000000..082861b
--- /dev/null
+++ b/src/worker.ts
@@ -0,0 +1,27 @@
+import { NestFactory } from '@nestjs/core';
+import { WorkerModule } from './worker.module';
+
+// Ensures OrchestratorModule registers processors only (no cron schedulers).
+process.env.WORKER_MODE = 'true';
+
+/**
+ * Worker process entrypoint. Runs BullMQ queue consumers (e.g. billing job)
+ * without starting the HTTP server. Use: node dist/worker.js (after build)
+ * or ts-node -r tsconfig-paths/register src/worker.ts (dev).
+ *
+ * Graceful shutdown: on SIGTERM/SIGINT workers stop accepting new jobs,
+ * finish the current job, then close Redis connections and exit.
+ */
+async function bootstrap() {
+  const app = await NestFactory.createApplicationContext(WorkerModule, {
+    logger: ['log', 'error', 'warn', 'debug'],
+  });
+  app.enableShutdownHooks();
+  await app.init();
+  // Process stays alive while BullMQ workers are running; no app.listen()
+}
+
+bootstrap().catch((err) => {
+  console.error('Worker bootstrap failed:', err);
+  process.exit(1);
+});
```
