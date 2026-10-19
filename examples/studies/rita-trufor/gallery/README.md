# Edit and control gallery

Image licence — All rights reserved. No reuse, commercial or non-commercial, is permitted.
[Image terms](../IMAGE-LICENCE.txt).

Both models analyse the same PNG files, with a maximum edge of 2,048 pixels for HEIC sources. RITA’s code was adapted to allow variable branch and output dimensions, using the same weights and without resizing to 512 × 512. Where required, reflection padding is added on the right and bottom to reach the next multiple of 32, then removed from the final mask.

[Open the interactive gallery](index.html) · [Read the mini-study](../mini-study-rita-trufor.md)

96 edited versions, 138 composite close-ups and 26 sources. The 25 HEIC controls and the before-intervention prototype are also retained. Each close-up contains, from left to right, Before, After and Edited regions. The regions are white, with a black border, on the before image.

After-edit maps: green = correctly detected edited region (TP); red = unedited region incorrectly flagged (FP); blue = missed edited region (FN); dark background = unedited region correctly left unflagged (TN).

## 2022-dsc0663_260522

### Clone stamp · five regions

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-4cd74debcf19efeed106c4f646658b365db2a67a09163d643094e4ef9e86a5a6.webp)](images/asset-4cd74debcf19efeed106c4f646658b365db2a67a09163d643094e4ef9e86a5a6.webp) | [![Edited regions on the original · white with a black border](images/asset-2d2c13b18c5c53e5d930f71d30d47d3af88aceca5902878b282fea2cb9ed1b59.webp)](images/asset-2d2c13b18c5c53e5d930f71d30d47d3af88aceca5902878b282fea2cb9ed1b59.webp) | [![After](images/asset-431c3e4380a5c31cd044d1c292ffd08129bdebfcd97a195422f6bd4a359ec0d1.webp)](images/asset-431c3e4380a5c31cd044d1c292ffd08129bdebfcd97a195422f6bd4a359ec0d1.webp) |


**Region 1 — White vertical metal strip protruding from the foreground slab**

[![Before → After → Edited regions · composite close-up](images/asset-858e57580f20782b6ff5abbbea82c34a4e388e12ad5f0ca47afac5de6d4bd7fa.webp)](images/asset-858e57580f20782b6ff5abbbea82c34a4e388e12ad5f0ca47afac5de6d4bd7fa.webp)

**Region 2 — Small isolated black rectangular mount on the ceiling near the opening**

[![Before → After → Edited regions · composite close-up](images/asset-064301679498ae8e43ae0b11cce594ede0a496147c9d580b83af8c24c155df9c.webp)](images/asset-064301679498ae8e43ae0b11cce594ede0a496147c9d580b83af8c24c155df9c.webp)

**Region 3 — Complete small orange paint spot and its short drip on the right-hand stone wall**

[![Before → After → Edited regions · composite close-up](images/asset-ddcdcb366a5f39f4986ba6e401613590d1e86038f80e6395f957ff46b644cb94.webp)](images/asset-ddcdcb366a5f39f4986ba6e401613590d1e86038f80e6395f957ff46b644cb94.webp)

**Region 4 — Small black painted number12 on the left stone wall**

[![Before → After → Edited regions · composite close-up](images/asset-d3756b0d4ad03d15c27392cc5e169192b6108cfe1fd6f0c91d15a6074d29c930.webp)](images/asset-d3756b0d4ad03d15c27392cc5e169192b6108cfe1fd6f0c91d15a6074d29c930.webp)

**Region 5 — Complete small black check-shaped painted mark on the ceiling**

[![Before → After → Edited regions · composite close-up](images/asset-859a70ad826965bbd24fcfbcffac40cdf8bdbfcf73b62bf3f560b202094e14ec.webp)](images/asset-859a70ad826965bbd24fcfbcffac40cdf8bdbfcf73b62bf3f560b202094e14ec.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-76bcec159a3d7f1ed449d325ec081df2300ffa1d9466cc60419e529025772dee.webp)](images/asset-76bcec159a3d7f1ed449d325ec081df2300ffa1d9466cc60419e529025772dee.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-2a0fc7ac1497b536a9c1a0da74f349ce48b5e3142202bd321976e41797a477c3.webp)](images/asset-2a0fc7ac1497b536a9c1a0da74f349ce48b5e3142202bd321976e41797a477c3.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-9e53894a602726bf2a4d00e431fe98f8220bc129e66b2671d03b296d1a0e9ede.webp).

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-4cd74debcf19efeed106c4f646658b365db2a67a09163d643094e4ef9e86a5a6.webp)](images/asset-4cd74debcf19efeed106c4f646658b365db2a67a09163d643094e4ef9e86a5a6.webp) | [![Edited regions on the original · white with a black border](images/asset-775578778c024b7d41a83e05ccfad0a31946a9731662557e689b27f438df454f.webp)](images/asset-775578778c024b7d41a83e05ccfad0a31946a9731662557e689b27f438df454f.webp) | [![After](images/asset-83110a9457e562d5dcfefe0014a2ad38fcb7c6e59ab2dadce3e116d6001d6b2c.webp)](images/asset-83110a9457e562d5dcfefe0014a2ad38fcb7c6e59ab2dadce3e116d6001d6b2c.webp) |


**Region 1 — White vertical metal strip protruding from the foreground slab**

[![Before → After → Edited regions · composite close-up](images/asset-858e57580f20782b6ff5abbbea82c34a4e388e12ad5f0ca47afac5de6d4bd7fa.webp)](images/asset-858e57580f20782b6ff5abbbea82c34a4e388e12ad5f0ca47afac5de6d4bd7fa.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-f57531894b6992d7476893275e8a6cb572390a3bf4035066fd924fa46f976eb6.webp)](images/asset-f57531894b6992d7476893275e8a6cb572390a3bf4035066fd924fa46f976eb6.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-ca323394e56068e4848000755e6e4c38885dfe672ffdb4076c215294cd659e64.webp)](images/asset-ca323394e56068e4848000755e6e4c38885dfe672ffdb4076c215294cd659e64.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-ecf19081d2d9d31c91a0673813d5577b432a0a7b3a59b60aeb0df7422ae2b6e8.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-4cd74debcf19efeed106c4f646658b365db2a67a09163d643094e4ef9e86a5a6.webp)](images/asset-4cd74debcf19efeed106c4f646658b365db2a67a09163d643094e4ef9e86a5a6.webp) | [![Edited regions on the original · white with a black border](images/asset-bfd8b75ea9d75e6679a5829e04d47475303e66d440511fdcf92241ce33fe3e52.webp)](images/asset-bfd8b75ea9d75e6679a5829e04d47475303e66d440511fdcf92241ce33fe3e52.webp) | [![After](images/asset-75e4827e3a032fb96fbb98b31325bbdd988bbd75ab54ecf1af896145f063835d.webp)](images/asset-75e4827e3a032fb96fbb98b31325bbdd988bbd75ab54ecf1af896145f063835d.webp) |


**Region 1 — White vertical metal strip protruding from the foreground slab**

[![Before → After → Edited regions · composite close-up](images/asset-86822ef57ab82348006922d1677e5dd2834530da59abd757a08ea433f9bd4f8a.webp)](images/asset-86822ef57ab82348006922d1677e5dd2834530da59abd757a08ea433f9bd4f8a.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-8ab00c4a4fece39711ea868753308a47e106a491c6fef5770e62c8e5d1b0f70b.webp)](images/asset-8ab00c4a4fece39711ea868753308a47e106a491c6fef5770e62c8e5d1b0f70b.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-9e8d5b98054133fd43d77145253b0d920ee961f2e09659eb3656f63c28620015.webp)](images/asset-9e8d5b98054133fd43d77145253b0d920ee961f2e09659eb3656f63c28620015.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-46039c3d40c66de1c0d8ff310fea8a84c8b9bfe864f3e36939eb5f6b549b4ae5.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-4cd74debcf19efeed106c4f646658b365db2a67a09163d643094e4ef9e86a5a6.webp)](images/asset-4cd74debcf19efeed106c4f646658b365db2a67a09163d643094e4ef9e86a5a6.webp) | [![Edited regions on the original · white with a black border](images/asset-3b39c634446d3f30637ed7fa08be059f74f8e5ce8161baad5bd8f8ed1610daef.webp)](images/asset-3b39c634446d3f30637ed7fa08be059f74f8e5ce8161baad5bd8f8ed1610daef.webp) | [![After](images/asset-340b64356fb7ab8bb487074f7050b4788d63af2d5657baf7c84cfb3796c0138d.webp)](images/asset-340b64356fb7ab8bb487074f7050b4788d63af2d5657baf7c84cfb3796c0138d.webp) |


**Region 1 — Small protruding black fitting fixed in the upper right corner**

[![Before → After → Edited regions · composite close-up](images/asset-1ddc15d41e6016483e8150ec60b2fbd468bcd2f71b8a6802023f90c0169cf0ed.webp)](images/asset-1ddc15d41e6016483e8150ec60b2fbd468bcd2f71b8a6802023f90c0169cf0ed.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-5e40ce0fe50104c92716d6f80eb21b44a49b66f42b4b442df08e5ee482577148.webp)](images/asset-5e40ce0fe50104c92716d6f80eb21b44a49b66f42b4b442df08e5ee482577148.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-f2ed07b30e5be078b8e88dd3b1e9ddea1f7ff58e7b2e60ba8f8e71788dac8c0a.webp)](images/asset-f2ed07b30e5be078b8e88dd3b1e9ddea1f7ff58e7b2e60ba8f8e71788dac8c0a.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-8a0de32c2cd6a801141a6a158006832894547ccacca7a257e2bba5abe0e0121d.webp).

### Clone stamp and generative AI · mixed version

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-4cd74debcf19efeed106c4f646658b365db2a67a09163d643094e4ef9e86a5a6.webp)](images/asset-4cd74debcf19efeed106c4f646658b365db2a67a09163d643094e4ef9e86a5a6.webp) | [![Edited regions on the original · white with a black border](images/asset-86d45917baa73a7e93ed7b884c068b82fc2c884d3e87ecbb4695ff77479a2c13.webp)](images/asset-86d45917baa73a7e93ed7b884c068b82fc2c884d3e87ecbb4695ff77479a2c13.webp) | [![After](images/asset-37db3b0bfc59628fcaabb1aac08a423f57f9846585c905043e2098d24183d1d0.webp)](images/asset-37db3b0bfc59628fcaabb1aac08a423f57f9846585c905043e2098d24183d1d0.webp) |


**Region 1 — White vertical metal strip protruding from the foreground slab**

[![Before → After → Edited regions · composite close-up](images/asset-86822ef57ab82348006922d1677e5dd2834530da59abd757a08ea433f9bd4f8a.webp)](images/asset-86822ef57ab82348006922d1677e5dd2834530da59abd757a08ea433f9bd4f8a.webp)

**Region 2 — Small protruding black fitting fixed in the upper right corner**

[![Before → After → Edited regions · composite close-up](images/asset-1ddc15d41e6016483e8150ec60b2fbd468bcd2f71b8a6802023f90c0169cf0ed.webp)](images/asset-1ddc15d41e6016483e8150ec60b2fbd468bcd2f71b8a6802023f90c0169cf0ed.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-e9c4edbac377e0a3bc0addcdb10bad955a8b9402e5af53c5f5e5921ab43e9a1d.webp)](images/asset-e9c4edbac377e0a3bc0addcdb10bad955a8b9402e5af53c5f5e5921ab43e9a1d.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-4b24ecfd71bd95e89750713b31cdcc8d5cd513fbe4d29106394e4584bda44e99.webp)](images/asset-4b24ecfd71bd95e89750713b31cdcc8d5cd513fbe4d29106394e4584bda44e99.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-a1d15a9a608b579a4f232211bf3304e659081dbf304f63ddd8cb3cde71e0f569.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-4cd74debcf19efeed106c4f646658b365db2a67a09163d643094e4ef9e86a5a6.webp)](images/asset-4cd74debcf19efeed106c4f646658b365db2a67a09163d643094e4ef9e86a5a6.webp) | [![RITA · flagged area: 6.10%](images/asset-858f339c9981da94dbaff4d3e9173755721a442c217cf2663ec676d0f2ebaff7.webp)](images/asset-858f339c9981da94dbaff4d3e9173755721a442c217cf2663ec676d0f2ebaff7.webp) | [![TruFor · flagged area: 0.61%](images/asset-daecc6c2210b8f25bdfc04684830b79e06948e069457a62f9c2c5bfec3459d03.webp)](images/asset-daecc6c2210b8f25bdfc04684830b79e06948e069457a62f9c2c5bfec3459d03.webp) |

[Official RITA control map · 512 × 512](images/asset-c06c06efcc319bc80a6c9a118529448cdf322eed27326db5463c1b48160533a1.webp).

## 2022-dsc0666_260522

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-a6362ddd29a600cca537a223e319d87e2b6eb43215bb3c2f7c4ba99975c9965a.webp)](images/asset-a6362ddd29a600cca537a223e319d87e2b6eb43215bb3c2f7c4ba99975c9965a.webp) | [![Edited regions on the original · white with a black border](images/asset-04bc1f44af274a6cd7c350722f567da4dcb9ef93feff96a0723ffd793624bbe6.webp)](images/asset-04bc1f44af274a6cd7c350722f567da4dcb9ef93feff96a0723ffd793624bbe6.webp) | [![After](images/asset-d0d494ea0d30d2b4cf5d54d3708042d96244bd88bd8fb7f860c22e6d3fc31b45.webp)](images/asset-d0d494ea0d30d2b4cf5d54d3708042d96244bd88bd8fb7f860c22e6d3fc31b45.webp) |


**Region 1 — Single flat loose stone and its short dark edge on the foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-038b0f7c40b12c84dbac218014721acc5efb7b00b1c307609c5f1decddb833b9.webp)](images/asset-038b0f7c40b12c84dbac218014721acc5efb7b00b1c307609c5f1decddb833b9.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-8fe50197851a2d302fbda77da96ec1e2f2b63d12456052dc0d90bd1f6fd26a6e.webp)](images/asset-8fe50197851a2d302fbda77da96ec1e2f2b63d12456052dc0d90bd1f6fd26a6e.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-6ae63f4a280604c8f5d81df07ea2c9d63c9a35ab1734fa4586d88c3fc84b56e7.webp)](images/asset-6ae63f4a280604c8f5d81df07ea2c9d63c9a35ab1734fa4586d88c3fc84b56e7.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-709ec71ec9e93d4ca7d39cb4fdafe4aea99bacd8c07873ed0bee27e02db25581.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-a6362ddd29a600cca537a223e319d87e2b6eb43215bb3c2f7c4ba99975c9965a.webp)](images/asset-a6362ddd29a600cca537a223e319d87e2b6eb43215bb3c2f7c4ba99975c9965a.webp) | [![Edited regions on the original · white with a black border](images/asset-f5d53c7b5413def85239230eb20d3293e73de08cd804bc97a2a54363d9b2d21b.webp)](images/asset-f5d53c7b5413def85239230eb20d3293e73de08cd804bc97a2a54363d9b2d21b.webp) | [![After](images/asset-765bed1921f01765c416b277061a40e4e18d4646896c7e059390f3df69e675a0.webp)](images/asset-765bed1921f01765c416b277061a40e4e18d4646896c7e059390f3df69e675a0.webp) |


**Region 1 — Single flat loose stone and its short dark edge on the foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-46e309b978e280d37e43c1aed05ba83bcd0992a6f12c9651a7c4d22efb547807.webp)](images/asset-46e309b978e280d37e43c1aed05ba83bcd0992a6f12c9651a7c4d22efb547807.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-3dfc94aaeed5891a46f2e54646599912e922e90777e91f905af12ca80422a49d.webp)](images/asset-3dfc94aaeed5891a46f2e54646599912e922e90777e91f905af12ca80422a49d.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-a2b87825b2290420bc0aad260f6742960430ed9c68202259fcb9a95ee75f8416.webp)](images/asset-a2b87825b2290420bc0aad260f6742960430ed9c68202259fcb9a95ee75f8416.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-da4631a9d0ebacc5a03c7de760646a3f82dc397cb804d7723655e9a2ff8ccfad.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-a6362ddd29a600cca537a223e319d87e2b6eb43215bb3c2f7c4ba99975c9965a.webp)](images/asset-a6362ddd29a600cca537a223e319d87e2b6eb43215bb3c2f7c4ba99975c9965a.webp) | [![Edited regions on the original · white with a black border](images/asset-dad16b0cd2cf281f6be5c88cc6899b434dbf6400b0851231d56e9fe411cc0d4c.webp)](images/asset-dad16b0cd2cf281f6be5c88cc6899b434dbf6400b0851231d56e9fe411cc0d4c.webp) | [![After](images/asset-57eba37dbf0a39d99cf0b32ea30c9868bcce08094a8e043d978a2669177dabcf.webp)](images/asset-57eba37dbf0a39d99cf0b32ea30c9868bcce08094a8e043d978a2669177dabcf.webp) |


**Region 1 — Small isolated beige stone at the lower left of the pile**

[![Before → After → Edited regions · composite close-up](images/asset-b9b2c9cc2a64b98fc3d15743e451ff2f6a9bb8b01205ce2034e9e559b345bc1d.webp)](images/asset-b9b2c9cc2a64b98fc3d15743e451ff2f6a9bb8b01205ce2034e9e559b345bc1d.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-4952dfd12fc2abdf045c4cc7b0e584e93136774816d837a715cd1993bb4de204.webp)](images/asset-4952dfd12fc2abdf045c4cc7b0e584e93136774816d837a715cd1993bb4de204.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-375f5e6daadd91047d21da9476e82ce28d3258b980ab4c71bd7de554e9258771.webp)](images/asset-375f5e6daadd91047d21da9476e82ce28d3258b980ab4c71bd7de554e9258771.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-3bede1a54fd3516d43c69075cd599a979df4788424377ffe47406e7cc2a73146.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-a6362ddd29a600cca537a223e319d87e2b6eb43215bb3c2f7c4ba99975c9965a.webp)](images/asset-a6362ddd29a600cca537a223e319d87e2b6eb43215bb3c2f7c4ba99975c9965a.webp) | [![RITA · flagged area: 16.87%](images/asset-e740745f9f6e0b993455e2fb94a42b11ac0d5318e6cfd221a1613a578b2957d8.webp)](images/asset-e740745f9f6e0b993455e2fb94a42b11ac0d5318e6cfd221a1613a578b2957d8.webp) | [![TruFor · flagged area: 7.39%](images/asset-4961f8ec312d8f37826844779fdb3fc38a87df930a762d0b960f2c7ce9147e7c.webp)](images/asset-4961f8ec312d8f37826844779fdb3fc38a87df930a762d0b960f2c7ce9147e7c.webp) |

[Official RITA control map · 512 × 512](images/asset-376c4fa0686b16a1fed5800f82d4cbc4b38b7ce2a456949c593743dc25d12a0a.webp).

## 2022-dsc0702_260522

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-3ea712867454a601e8ad98d4db01edefaa665a58701c76086c3dbf23bd030d15.webp)](images/asset-3ea712867454a601e8ad98d4db01edefaa665a58701c76086c3dbf23bd030d15.webp) | [![Edited regions on the original · white with a black border](images/asset-6f8a9778db399f29e5077a7737db75b9ae288ef1839c8bac5fbdbf52c02c4fc2.webp)](images/asset-6f8a9778db399f29e5077a7737db75b9ae288ef1839c8bac5fbdbf52c02c4fc2.webp) | [![After](images/asset-66d629354666b374aeccb44865379543fcc919669ed63c8d1bddf9470af8e23c.webp)](images/asset-66d629354666b374aeccb44865379543fcc919669ed63c8d1bddf9470af8e23c.webp) |


**Region 1 — One small black metal fitting hanging from the upper ceiling**

[![Before → After → Edited regions · composite close-up](images/asset-a57add96db77f08b471cc4af03c95a088733c5c6acfd9af8003c7730b63b92d1.webp)](images/asset-a57add96db77f08b471cc4af03c95a088733c5c6acfd9af8003c7730b63b92d1.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-b0816a1ab9dbdd232b98b9e5766f042203ce474e5143f0a9422438ceb70e31e5.webp)](images/asset-b0816a1ab9dbdd232b98b9e5766f042203ce474e5143f0a9422438ceb70e31e5.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-6848de4f2eb30e261764f8e4d24475cbeb07fa8599be25c8f972f9be614e9b47.webp)](images/asset-6848de4f2eb30e261764f8e4d24475cbeb07fa8599be25c8f972f9be614e9b47.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-90abcd0895b669a294bd215c98360b82bab3e5b4026a9d99ecbbb15a8e9e14b3.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-3ea712867454a601e8ad98d4db01edefaa665a58701c76086c3dbf23bd030d15.webp)](images/asset-3ea712867454a601e8ad98d4db01edefaa665a58701c76086c3dbf23bd030d15.webp) | [![Edited regions on the original · white with a black border](images/asset-a7ae278ee3dedab8d256959dc95f7f5d5b26d6220241a82e8e2e5dfe67258c94.webp)](images/asset-a7ae278ee3dedab8d256959dc95f7f5d5b26d6220241a82e8e2e5dfe67258c94.webp) | [![After](images/asset-2e7ccea4e6eb91468bcb1bcff2786b19cfb15bee36cadf7176b369b02ef33a8f.webp)](images/asset-2e7ccea4e6eb91468bcb1bcff2786b19cfb15bee36cadf7176b369b02ef33a8f.webp) |


**Region 1 — One small black metal fitting hanging from the upper ceiling**

[![Before → After → Edited regions · composite close-up](images/asset-929b07226436efe8b51c6a516f2f3b8495089f2fcf667afcde020a75aee5fa11.webp)](images/asset-929b07226436efe8b51c6a516f2f3b8495089f2fcf667afcde020a75aee5fa11.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-ec0b09630bf79d5d77f0369bbf45d16800a44b1598cb52c4c3318263cfaa2eeb.webp)](images/asset-ec0b09630bf79d5d77f0369bbf45d16800a44b1598cb52c4c3318263cfaa2eeb.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-a66a79f66bafa9c8e36565d7dc2704146bb04ef2a6c3f6490a0eab911b557053.webp)](images/asset-a66a79f66bafa9c8e36565d7dc2704146bb04ef2a6c3f6490a0eab911b557053.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-20503588a5b3dd82a9fa56afc0e2c5cd0210ce00223249f399f63080591a02cf.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-3ea712867454a601e8ad98d4db01edefaa665a58701c76086c3dbf23bd030d15.webp)](images/asset-3ea712867454a601e8ad98d4db01edefaa665a58701c76086c3dbf23bd030d15.webp) | [![Edited regions on the original · white with a black border](images/asset-d1b7f5115072f8d75431785619da2b2e473ebe356e6e0fa710822eb61f90bacd.webp)](images/asset-d1b7f5115072f8d75431785619da2b2e473ebe356e6e0fa710822eb61f90bacd.webp) | [![After](images/asset-218f38bc426e9339e6c359e0272cf2946cb38d6660006e6edd8b65882ce347cc.webp)](images/asset-218f38bc426e9339e6c359e0272cf2946cb38d6660006e6edd8b65882ce347cc.webp) |


**Region 1 — Whole person standing sideways on the block**

[![Before → After → Edited regions · composite close-up](images/asset-88c4348404791db8328afc749e8078f2421a994ad39b65513ad77aace1032ace.webp)](images/asset-88c4348404791db8328afc749e8078f2421a994ad39b65513ad77aace1032ace.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-978faf5dd17ac41c3827348e5cf162a022b84bd5d038b8c64ed1d0bb2d2c2bfe.webp)](images/asset-978faf5dd17ac41c3827348e5cf162a022b84bd5d038b8c64ed1d0bb2d2c2bfe.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-db7690eba4f444451a68313e74aa6f24c395ea0a6646c6c83e7456d3f1625fd5.webp)](images/asset-db7690eba4f444451a68313e74aa6f24c395ea0a6646c6c83e7456d3f1625fd5.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-100da4a31c23f2fb3f91dc1fe84fa2acdf05e5c5afb033c95bbf9104334f42ca.webp).

### Generative AI · attempt 2

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-3ea712867454a601e8ad98d4db01edefaa665a58701c76086c3dbf23bd030d15.webp)](images/asset-3ea712867454a601e8ad98d4db01edefaa665a58701c76086c3dbf23bd030d15.webp) | [![Edited regions on the original · white with a black border](images/asset-c3ec2e1406e42aa5d80760ae29c0c5bc630c08f110f0f6e634ece73d5f2b56fd.webp)](images/asset-c3ec2e1406e42aa5d80760ae29c0c5bc630c08f110f0f6e634ece73d5f2b56fd.webp) | [![After](images/asset-048e2453a4e94681cbefc88ff5e51847e91a54cd6e170317a433c7624a784e49.webp)](images/asset-048e2453a4e94681cbefc88ff5e51847e91a54cd6e170317a433c7624a784e49.webp) |


**Region 1 — Whole person standing sideways on the block**

[![Before → After → Edited regions · composite close-up](images/asset-1c5ee81e269e86379033eee04c9b44c232baba38c3f31496af7fd308d752d19f.webp)](images/asset-1c5ee81e269e86379033eee04c9b44c232baba38c3f31496af7fd308d752d19f.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-5a9febfe0d6d9ce9321529ab32879958c778e45195461eb44ee1095750d829fd.webp)](images/asset-5a9febfe0d6d9ce9321529ab32879958c778e45195461eb44ee1095750d829fd.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-95c18c888be8dbf376dfc4606836d840115d9cb88418c261010720e76e4823de.webp)](images/asset-95c18c888be8dbf376dfc4606836d840115d9cb88418c261010720e76e4823de.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-e75a30f22d67e6ae98a147d35fc3bc94f9ebb42e68b6b2ed247b587702586af1.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-3ea712867454a601e8ad98d4db01edefaa665a58701c76086c3dbf23bd030d15.webp)](images/asset-3ea712867454a601e8ad98d4db01edefaa665a58701c76086c3dbf23bd030d15.webp) | [![RITA · flagged area: 8.60%](images/asset-45c34198a28eb7b61c31f4d46389136e202dbf582ddbbf976503a5881c003ce2.webp)](images/asset-45c34198a28eb7b61c31f4d46389136e202dbf582ddbbf976503a5881c003ce2.webp) | [![TruFor · flagged area: 2.57%](images/asset-e80eeef7b374cd27f8bfeabd2af57e2da74b672daa1ad6658a4dfdf06520a0cf.webp)](images/asset-e80eeef7b374cd27f8bfeabd2af57e2da74b672daa1ad6658a4dfdf06520a0cf.webp) |

[Official RITA control map · 512 × 512](images/asset-6b061efaea03a3d435725a89b4357f2dfcb88bac1b2a8c90250c43157ea73e38.webp).

## 2022-dsc0713_260522

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-1142a040a7588f94677f1b4c1cf28e75ea59699e1dc411a7b96702fb0a686d75.webp)](images/asset-1142a040a7588f94677f1b4c1cf28e75ea59699e1dc411a7b96702fb0a686d75.webp) | [![Edited regions on the original · white with a black border](images/asset-27360b8aca56c82d04ef8488fe95f62da331d6871cacd79ad744e0cc40d8cd63.webp)](images/asset-27360b8aca56c82d04ef8488fe95f62da331d6871cacd79ad744e0cc40d8cd63.webp) | [![After](images/asset-d32de7918181f1e6a518af532cceff507267cd424f6c2620816f20c4387320e7.webp)](images/asset-d32de7918181f1e6a518af532cceff507267cd424f6c2620816f20c4387320e7.webp) |


**Region 1 — One black ceiling fitting above the jumping person**

[![Before → After → Edited regions · composite close-up](images/asset-ff890b4efcaae818b4a2b2707debf11b70857c486a5dd0280e6a1a5e6cd6183c.webp)](images/asset-ff890b4efcaae818b4a2b2707debf11b70857c486a5dd0280e6a1a5e6cd6183c.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-66ff6fc01e9f63d36967a8511546a0becf6d09f32a7a19d50f5118b175f51ef2.webp)](images/asset-66ff6fc01e9f63d36967a8511546a0becf6d09f32a7a19d50f5118b175f51ef2.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-ba155220700ba46bea9edc684fb656687cd243713bc325b8519e09bcc9113638.webp)](images/asset-ba155220700ba46bea9edc684fb656687cd243713bc325b8519e09bcc9113638.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-cdf11abff3a3584e51c9ebc5dc59f8ed9bfda89a1572da1d6c94cb37013a4ee3.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-1142a040a7588f94677f1b4c1cf28e75ea59699e1dc411a7b96702fb0a686d75.webp)](images/asset-1142a040a7588f94677f1b4c1cf28e75ea59699e1dc411a7b96702fb0a686d75.webp) | [![Edited regions on the original · white with a black border](images/asset-2f10c4604ee643004f48a6801538501ffa8330eec238b4316b0eec674ed87161.webp)](images/asset-2f10c4604ee643004f48a6801538501ffa8330eec238b4316b0eec674ed87161.webp) | [![After](images/asset-7f8518292f659a66e0b4b34fd29d706062dbcf73707c5ea6856aa86569393bd2.webp)](images/asset-7f8518292f659a66e0b4b34fd29d706062dbcf73707c5ea6856aa86569393bd2.webp) |


**Region 1 — One black ceiling fitting above the jumping person**

[![Before → After → Edited regions · composite close-up](images/asset-f951c0e1464536c808cc74ac93037274a45301fe8f9533a4fca0b92b6e5f47c2.webp)](images/asset-f951c0e1464536c808cc74ac93037274a45301fe8f9533a4fca0b92b6e5f47c2.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-61a725d807ce50dc3458f0ef984a5d8bb348315063453f49fe07b5dc0d743834.webp)](images/asset-61a725d807ce50dc3458f0ef984a5d8bb348315063453f49fe07b5dc0d743834.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-8ca4bb761993fc22efa1f7a5750698386c7e093dde43fc62f4ec778faf60e569.webp)](images/asset-8ca4bb761993fc22efa1f7a5750698386c7e093dde43fc62f4ec778faf60e569.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-c7913a8b738e09759f57ed00f4bc88858e0c2d94bced6c50839955b6664de856.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-1142a040a7588f94677f1b4c1cf28e75ea59699e1dc411a7b96702fb0a686d75.webp)](images/asset-1142a040a7588f94677f1b4c1cf28e75ea59699e1dc411a7b96702fb0a686d75.webp) | [![Edited regions on the original · white with a black border](images/asset-fbcd47993e715430b516db71e6a1677298fd88449d9eae954f2b60a5a07f06bd.webp)](images/asset-fbcd47993e715430b516db71e6a1677298fd88449d9eae954f2b60a5a07f06bd.webp) | [![After](images/asset-4ba84c0651815cbb5aa6627b59a0018b311dbc19c3d41e6c317d53eb93232398.webp)](images/asset-4ba84c0651815cbb5aa6627b59a0018b311dbc19c3d41e6c317d53eb93232398.webp) |


**Region 1 — Whole person mid-jump, seen from behind**

[![Before → After → Edited regions · composite close-up](images/asset-4ee72675725e25cf99a42a6070133e1355e0b9d01463f4ce640810db207e46f8.webp)](images/asset-4ee72675725e25cf99a42a6070133e1355e0b9d01463f4ce640810db207e46f8.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-fed9440f1ce990ce6308e0e602fa61b5b3a9b8ae28045b62266bdc0c752047d2.webp)](images/asset-fed9440f1ce990ce6308e0e602fa61b5b3a9b8ae28045b62266bdc0c752047d2.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-d5848ed789a31e8082702d00692af5479f51e450f7de67f628fb8233d8eb0aee.webp)](images/asset-d5848ed789a31e8082702d00692af5479f51e450f7de67f628fb8233d8eb0aee.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-c1a46c1c5234e2d58ee9425f5b3f379df9eafbe043023e871b33d07d1183a996.webp).

### Generative AI · attempt 2

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-1142a040a7588f94677f1b4c1cf28e75ea59699e1dc411a7b96702fb0a686d75.webp)](images/asset-1142a040a7588f94677f1b4c1cf28e75ea59699e1dc411a7b96702fb0a686d75.webp) | [![Edited regions on the original · white with a black border](images/asset-ac994e331a613bdfbb67fd4119f6dafd01d2d0d0603c623f6cba124e51263602.webp)](images/asset-ac994e331a613bdfbb67fd4119f6dafd01d2d0d0603c623f6cba124e51263602.webp) | [![After](images/asset-6ac5e570a0b2d826e9e4861b249e010e33229b6944de7071a210488cb292703a.webp)](images/asset-6ac5e570a0b2d826e9e4861b249e010e33229b6944de7071a210488cb292703a.webp) |


**Region 1 — Whole person mid-jump, seen from behind**

[![Before → After → Edited regions · composite close-up](images/asset-70e18f977a4fd99ebc15b44f150b81aa6d90775544d6394fe1898ba1107b1a15.webp)](images/asset-70e18f977a4fd99ebc15b44f150b81aa6d90775544d6394fe1898ba1107b1a15.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-a92baf3d868eee11aa495402820eec9a80508622adb082f602f8eeb484e18a5b.webp)](images/asset-a92baf3d868eee11aa495402820eec9a80508622adb082f602f8eeb484e18a5b.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-6fb090dcf811c48cb9fef518bd47db593150217ed1d35336c3b5a6133cbd644d.webp)](images/asset-6fb090dcf811c48cb9fef518bd47db593150217ed1d35336c3b5a6133cbd644d.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-949c99490168422ed4946fb8dbcf83da786395c1af4af7c7f8721ea3bf3a3cf7.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-1142a040a7588f94677f1b4c1cf28e75ea59699e1dc411a7b96702fb0a686d75.webp)](images/asset-1142a040a7588f94677f1b4c1cf28e75ea59699e1dc411a7b96702fb0a686d75.webp) | [![RITA · flagged area: 5.25%](images/asset-153c4de04aa7c874469c384004e0a23c9d08d68a2609b5d9da36b3718cfccc0a.webp)](images/asset-153c4de04aa7c874469c384004e0a23c9d08d68a2609b5d9da36b3718cfccc0a.webp) | [![TruFor · flagged area: 2.05%](images/asset-e282fe34611045efb8ae9331f28543d99806b9bf635fc8fe91dc6da11c9d210d.webp)](images/asset-e282fe34611045efb8ae9331f28543d99806b9bf635fc8fe91dc6da11c9d210d.webp) |

[Official RITA control map · 512 × 512](images/asset-18f941457f72b1cf738db50020ae904a21f705d2bf64ec518c1d3a6ee67ddf8a.webp).

## 2022-dsc0727_260522

### Clone stamp · five regions

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-c7dacc0dc97bbf8599484fa98db64d53a60b7c73cda1f4cb967f4c3de1826596.webp)](images/asset-c7dacc0dc97bbf8599484fa98db64d53a60b7c73cda1f4cb967f4c3de1826596.webp) | [![Edited regions on the original · white with a black border](images/asset-e8a194471e7b52e132937f29dea1cb2f3384a01d7bba3ef8d57ec35ee1f8de06.webp)](images/asset-e8a194471e7b52e132937f29dea1cb2f3384a01d7bba3ef8d57ec35ee1f8de06.webp) | [![After](images/asset-72fdef6f4ffaf6c5d7640e44ad4ffb088e01e877495a77b87bd4b7b475dae615.webp)](images/asset-72fdef6f4ffaf6c5d7640e44ad4ffb088e01e877495a77b87bd4b7b475dae615.webp) |


**Region 1 — Complete small orange-and-white discarded carton on the foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-5ed8f161104f48a51079f0b470faad1bb051beb19984cf66147e8ce29b4b4c59.webp)](images/asset-5ed8f161104f48a51079f0b470faad1bb051beb19984cf66147e8ce29b4b4c59.webp)

**Region 2 — Complete isolated small beige floor stone in the lower right foreground**

[![Before → After → Edited regions · composite close-up](images/asset-39f84783faa540bbb47849b68d10a167c67168fa716afa4f6a1438bbdd3ed078.webp)](images/asset-39f84783faa540bbb47849b68d10a167c67168fa716afa4f6a1438bbdd3ed078.webp)

**Region 3 — Complete small group of red and white discarded packaging by the right wall**

[![Before → After → Edited regions · composite close-up](images/asset-c2716ffb21a60bc12ac934a0d4112b840a2f96c1e06b22db5328931d39a206d1.webp)](images/asset-c2716ffb21a60bc12ac934a0d4112b840a2f96c1e06b22db5328931d39a206d1.webp)

**Region 4 — Complete small black metal fitting on the high ceiling**

[![Before → After → Edited regions · composite close-up](images/asset-a3dc934fe48a263e31297f3022a445dd022b20db33d9e152f3e80cb3a2742220.webp)](images/asset-a3dc934fe48a263e31297f3022a445dd022b20db33d9e152f3e80cb3a2742220.webp)

**Region 5 — Complete small black angular graffiti glyph painted on the left wall**

[![Before → After → Edited regions · composite close-up](images/asset-bea57e05dd2eca4c70d0ee09537f66c6d503e4df6f23099d7a4a7af9e643d954.webp)](images/asset-bea57e05dd2eca4c70d0ee09537f66c6d503e4df6f23099d7a4a7af9e643d954.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-8c18c15750738026e0c739ba8dd6f34befaf86b86fbdc7219c870597513a398d.webp)](images/asset-8c18c15750738026e0c739ba8dd6f34befaf86b86fbdc7219c870597513a398d.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-42d06a656644115de7213c7335c01ae24f2e081ad8067876ee2ce71ea1ff6127.webp)](images/asset-42d06a656644115de7213c7335c01ae24f2e081ad8067876ee2ce71ea1ff6127.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-9585a7ffa976544ff9be22aaed0b1c81e674b8980c021680689bf7c044375492.webp).

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-c7dacc0dc97bbf8599484fa98db64d53a60b7c73cda1f4cb967f4c3de1826596.webp)](images/asset-c7dacc0dc97bbf8599484fa98db64d53a60b7c73cda1f4cb967f4c3de1826596.webp) | [![Edited regions on the original · white with a black border](images/asset-4e15ed9dbe0f22ee2eafaa7fb5906cfa7e73a95b33b8aeeb795b4c10e4375ee7.webp)](images/asset-4e15ed9dbe0f22ee2eafaa7fb5906cfa7e73a95b33b8aeeb795b4c10e4375ee7.webp) | [![After](images/asset-f4287144275a0480cced8f11cf9fe33235b276240e0c2be06f260573e62eb05b.webp)](images/asset-f4287144275a0480cced8f11cf9fe33235b276240e0c2be06f260573e62eb05b.webp) |


**Region 1 — Small orange-and-white discarded drink carton on the foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-5ed8f161104f48a51079f0b470faad1bb051beb19984cf66147e8ce29b4b4c59.webp)](images/asset-5ed8f161104f48a51079f0b470faad1bb051beb19984cf66147e8ce29b4b4c59.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-7db032bb4f665d6ae095102bf9e586c473c1cad59a8a61856e1ea650d57a2260.webp)](images/asset-7db032bb4f665d6ae095102bf9e586c473c1cad59a8a61856e1ea650d57a2260.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-31331de8c91140e0cf22ed5a0c3ad3efa44018f43f75948a044f497e86a79713.webp)](images/asset-31331de8c91140e0cf22ed5a0c3ad3efa44018f43f75948a044f497e86a79713.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-827e57c576b6f3a86efb59f17b258d85f7b276d4fe0817b0a6e8757dbbd75d80.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-c7dacc0dc97bbf8599484fa98db64d53a60b7c73cda1f4cb967f4c3de1826596.webp)](images/asset-c7dacc0dc97bbf8599484fa98db64d53a60b7c73cda1f4cb967f4c3de1826596.webp) | [![Edited regions on the original · white with a black border](images/asset-ab3dfef67e6b4044ab6f04ae32c00ce5a66d918804dcbf9e0fc7fb6d39ac6323.webp)](images/asset-ab3dfef67e6b4044ab6f04ae32c00ce5a66d918804dcbf9e0fc7fb6d39ac6323.webp) | [![After](images/asset-d3b318f745d5138667f5676d2bb026350d975576c9aba42541a2bec7f32e32af.webp)](images/asset-d3b318f745d5138667f5676d2bb026350d975576c9aba42541a2bec7f32e32af.webp) |


**Region 1 — Small orange-and-white discarded drink carton on the foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-f0f8c025c47f484f05fee2e020724cc0a1c7e864d98d6ff02f95c2ad05aff671.webp)](images/asset-f0f8c025c47f484f05fee2e020724cc0a1c7e864d98d6ff02f95c2ad05aff671.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-83d4bf848a0f0d82107eb7b7f968e0c6a7d30a7fd75b871ab33938b314ff72a3.webp)](images/asset-83d4bf848a0f0d82107eb7b7f968e0c6a7d30a7fd75b871ab33938b314ff72a3.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-791b24a84cc11014ca1eb01eda6f74944babea8f67620a403dc76181a1ffdcc8.webp)](images/asset-791b24a84cc11014ca1eb01eda6f74944babea8f67620a403dc76181a1ffdcc8.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-52b6653e334ac3292f7e803e4b88fe155f78ebd9c2f16bc1cf1079bc764c194a.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-c7dacc0dc97bbf8599484fa98db64d53a60b7c73cda1f4cb967f4c3de1826596.webp)](images/asset-c7dacc0dc97bbf8599484fa98db64d53a60b7c73cda1f4cb967f4c3de1826596.webp) | [![Edited regions on the original · white with a black border](images/asset-5733129a347cad3f558abe899d157da7a85af2127221227a69d731f488d348f2.webp)](images/asset-5733129a347cad3f558abe899d157da7a85af2127221227a69d731f488d348f2.webp) | [![After](images/asset-67eeaefbeb039c17ce65788103b8d87dbc96cd935df75df983f75ec5f9d83eed.webp)](images/asset-67eeaefbeb039c17ce65788103b8d87dbc96cd935df75df983f75ec5f9d83eed.webp) |


**Region 1 — White drawing of a head with teeth on the right wall**

[![Before → After → Edited regions · composite close-up](images/asset-a69f3f9f7fef1421f5f70371fb07291e8d37484e45e01cf5b903c902d36e2cd5.webp)](images/asset-a69f3f9f7fef1421f5f70371fb07291e8d37484e45e01cf5b903c902d36e2cd5.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-70f593f23237f382303c0662987eeba82a7593d446b0fc0f4bae1852188b4936.webp)](images/asset-70f593f23237f382303c0662987eeba82a7593d446b0fc0f4bae1852188b4936.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-6ac92fd3ede795c7f0c71af9dcc0e30edffb5a1be4d58f8da76bf31885660c5b.webp)](images/asset-6ac92fd3ede795c7f0c71af9dcc0e30edffb5a1be4d58f8da76bf31885660c5b.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-fd1210630f08e22f3bc2798a68f67ef7137b0ff2821aa9e4c2104c76203c9838.webp).

### Generative AI · attempt 2

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-c7dacc0dc97bbf8599484fa98db64d53a60b7c73cda1f4cb967f4c3de1826596.webp)](images/asset-c7dacc0dc97bbf8599484fa98db64d53a60b7c73cda1f4cb967f4c3de1826596.webp) | [![Edited regions on the original · white with a black border](images/asset-c94ada5da6d28fced0117c044d47a4a3611fc7b6140ceaa91d8d70afdc3b8f21.webp)](images/asset-c94ada5da6d28fced0117c044d47a4a3611fc7b6140ceaa91d8d70afdc3b8f21.webp) | [![After](images/asset-80f7bf237c96921f807934bb20e229bdcf33e9be448883bf9cf7ded8d6e949f4.webp)](images/asset-80f7bf237c96921f807934bb20e229bdcf33e9be448883bf9cf7ded8d6e949f4.webp) |


**Region 1 — White drawing of a head with teeth on the right wall**

[![Before → After → Edited regions · composite close-up](images/asset-ba490686b34045850ef7fabe1e4e75907c93d2b25ee4e67af806d05260c967cf.webp)](images/asset-ba490686b34045850ef7fabe1e4e75907c93d2b25ee4e67af806d05260c967cf.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-9e178170b0ab5ef85764d8a0c61f673b78ed457158cdb0650189fc3c872e460d.webp)](images/asset-9e178170b0ab5ef85764d8a0c61f673b78ed457158cdb0650189fc3c872e460d.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-c105bf70502182c7de323546386571057e64996286766d476a47136e7be8dd84.webp)](images/asset-c105bf70502182c7de323546386571057e64996286766d476a47136e7be8dd84.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-1035e6d9d1fd6a0caa23a435ee63da3ab3f4198e291b255ccab0dd906168a5ef.webp).

### Clone stamp and generative AI · mixed version

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-c7dacc0dc97bbf8599484fa98db64d53a60b7c73cda1f4cb967f4c3de1826596.webp)](images/asset-c7dacc0dc97bbf8599484fa98db64d53a60b7c73cda1f4cb967f4c3de1826596.webp) | [![Edited regions on the original · white with a black border](images/asset-be591b44d88394b70fc4800ca0dc553179745648a8c009577f3e946b6feb82dc.webp)](images/asset-be591b44d88394b70fc4800ca0dc553179745648a8c009577f3e946b6feb82dc.webp) | [![After](images/asset-7a1a32eaffcdeee81d8f0749887e8f54cf3575c29b3117a9631d1621c62ba105.webp)](images/asset-7a1a32eaffcdeee81d8f0749887e8f54cf3575c29b3117a9631d1621c62ba105.webp) |


**Region 1 — Small orange-and-white discarded drink carton on the foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-f0f8c025c47f484f05fee2e020724cc0a1c7e864d98d6ff02f95c2ad05aff671.webp)](images/asset-f0f8c025c47f484f05fee2e020724cc0a1c7e864d98d6ff02f95c2ad05aff671.webp)

**Region 2 — White drawing of a head with teeth on the right wall**

[![Before → After → Edited regions · composite close-up](images/asset-ba490686b34045850ef7fabe1e4e75907c93d2b25ee4e67af806d05260c967cf.webp)](images/asset-ba490686b34045850ef7fabe1e4e75907c93d2b25ee4e67af806d05260c967cf.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-74d73e58018a7e62a6676beb211d8180bf065804a0727f6aa52ee5ca3c100f1e.webp)](images/asset-74d73e58018a7e62a6676beb211d8180bf065804a0727f6aa52ee5ca3c100f1e.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-372b6db3908d62b67dd6ebc8717b73d4c3d449297458d4e36b2f6e3fded287e1.webp)](images/asset-372b6db3908d62b67dd6ebc8717b73d4c3d449297458d4e36b2f6e3fded287e1.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-7184ee6b08a6eb06ed273f986fc32094db251be7281cdd04975bc64b69155fdb.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-c7dacc0dc97bbf8599484fa98db64d53a60b7c73cda1f4cb967f4c3de1826596.webp)](images/asset-c7dacc0dc97bbf8599484fa98db64d53a60b7c73cda1f4cb967f4c3de1826596.webp) | [![RITA · flagged area: 2.71%](images/asset-07fb6b50229ab846c24c230353b85885e2d1636e07cc7c01c530e9d1347c5948.webp)](images/asset-07fb6b50229ab846c24c230353b85885e2d1636e07cc7c01c530e9d1347c5948.webp) | [![TruFor · flagged area: 2.32%](images/asset-75f2e4812500e9963fe403716bc898ddaeed64f48298a26219d1f51859168394.webp)](images/asset-75f2e4812500e9963fe403716bc898ddaeed64f48298a26219d1f51859168394.webp) |

[Official RITA control map · 512 × 512](images/asset-66b6d725e5080142e5690a800b581f8a6c438ed32ca2feeedf20c90eb94f2b8d.webp).

## 2022-dsc0867_260522

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-e42b95e9959bb8a78aa22f1d5aff4cac50bd50a7e8051c259194448655e15f63.webp)](images/asset-e42b95e9959bb8a78aa22f1d5aff4cac50bd50a7e8051c259194448655e15f63.webp) | [![Edited regions on the original · white with a black border](images/asset-5bcc3417b7e069daf72c064cb2f43bab217f2dafe33fb9a05a85187d8069fbe2.webp)](images/asset-5bcc3417b7e069daf72c064cb2f43bab217f2dafe33fb9a05a85187d8069fbe2.webp) | [![After](images/asset-92e6746a5068dc4499b70934a3d1f5dec0f8f84d5a43c9f27f32e6a748cf9d44.webp)](images/asset-92e6746a5068dc4499b70934a3d1f5dec0f8f84d5a43c9f27f32e6a748cf9d44.webp) |


**Region 1 — The complete rightmost rusty hanging rod, including its lower tip and nearby shadow**

[![Before → After → Edited regions · composite close-up](images/asset-95003d7653e81f272225e042e03ef78f5ad40227f2cf3ce8b773a6fcb065941c.webp)](images/asset-95003d7653e81f272225e042e03ef78f5ad40227f2cf3ce8b773a6fcb065941c.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-ea1b2742c2ee649742266697b019ebd73eb52df5860e9aa1f32f0425a2499f08.webp)](images/asset-ea1b2742c2ee649742266697b019ebd73eb52df5860e9aa1f32f0425a2499f08.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-cdc6093344218f83773d5e2445fb814ede7f85ecd0fab87f67ae70441f1ab0bb.webp)](images/asset-cdc6093344218f83773d5e2445fb814ede7f85ecd0fab87f67ae70441f1ab0bb.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-009a790e954a433b480c35fb89ee39d25392aeaa6027133314aa6141262e4c4d.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-e42b95e9959bb8a78aa22f1d5aff4cac50bd50a7e8051c259194448655e15f63.webp)](images/asset-e42b95e9959bb8a78aa22f1d5aff4cac50bd50a7e8051c259194448655e15f63.webp) | [![Edited regions on the original · white with a black border](images/asset-f26684a6feb88188b95c313d636efcd9d23d3b6620b5c15fa72a31d0fab9c83b.webp)](images/asset-f26684a6feb88188b95c313d636efcd9d23d3b6620b5c15fa72a31d0fab9c83b.webp) | [![After](images/asset-3937e33ee1e98efe9aa263d0d08393696104d692abcac363f6b203e311a633f4.webp)](images/asset-3937e33ee1e98efe9aa263d0d08393696104d692abcac363f6b203e311a633f4.webp) |


**Region 1 — The complete rightmost rusty hanging rod, including its lower tip and nearby shadow**

[![Before → After → Edited regions · composite close-up](images/asset-6cf0395de3b71b4e4598a31141d00a338fc63b8af578f5a8708eee370509fef2.webp)](images/asset-6cf0395de3b71b4e4598a31141d00a338fc63b8af578f5a8708eee370509fef2.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-c1d49b65975d45730f806420e68663110ce1be7443e3bd6f92d0942d6692f09b.webp)](images/asset-c1d49b65975d45730f806420e68663110ce1be7443e3bd6f92d0942d6692f09b.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-a91fd8106bb9f85c67e099da4d210ff8eb29aff8ee7e4fee40262a46d223a22a.webp)](images/asset-a91fd8106bb9f85c67e099da4d210ff8eb29aff8ee7e4fee40262a46d223a22a.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-1016310aa04f30b4909a12c0065f2705eea782b033e57b2f8155abe03952b217.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-e42b95e9959bb8a78aa22f1d5aff4cac50bd50a7e8051c259194448655e15f63.webp)](images/asset-e42b95e9959bb8a78aa22f1d5aff4cac50bd50a7e8051c259194448655e15f63.webp) | [![Edited regions on the original · white with a black border](images/asset-2ae0decd613d68b6862bd203e1d6e12e8fe5bc915bf0848082dc478d2a367b9f.webp)](images/asset-2ae0decd613d68b6862bd203e1d6e12e8fe5bc915bf0848082dc478d2a367b9f.webp) | [![After](images/asset-286801c9a6035f1cd45c05630271f4747cdaea98296c138a6da7574a4a40ce49.webp)](images/asset-286801c9a6035f1cd45c05630271f4747cdaea98296c138a6da7574a4a40ce49.webp) |


**Region 1 — Leftmost rusty metal rod and its shadow**

[![Before → After → Edited regions · composite close-up](images/asset-e9095e9d6307fcd6137ce846a8c1e1b4640c13d15896f237626650292c7eec28.webp)](images/asset-e9095e9d6307fcd6137ce846a8c1e1b4640c13d15896f237626650292c7eec28.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-25ad46779272ba4cee544e48b143a2ee27fcf673cc989c06274a60619fa7c078.webp)](images/asset-25ad46779272ba4cee544e48b143a2ee27fcf673cc989c06274a60619fa7c078.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-0e83901f42c98c267d0c340f13d8b96e26c4affbd7be9a876bcb9c12df12d232.webp)](images/asset-0e83901f42c98c267d0c340f13d8b96e26c4affbd7be9a876bcb9c12df12d232.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-c7f6a652ac5d1730e043a9de35dec0357061b5ac9cdf2f2863b47ab6579d7d70.webp).

### Generative AI · attempt 2

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-e42b95e9959bb8a78aa22f1d5aff4cac50bd50a7e8051c259194448655e15f63.webp)](images/asset-e42b95e9959bb8a78aa22f1d5aff4cac50bd50a7e8051c259194448655e15f63.webp) | [![Edited regions on the original · white with a black border](images/asset-b05ce5d5fbd7c7d109ac0369409ebdcb7cec73e825d129e89a5ae8142c0f5d0b.webp)](images/asset-b05ce5d5fbd7c7d109ac0369409ebdcb7cec73e825d129e89a5ae8142c0f5d0b.webp) | [![After](images/asset-3bc2a2baf4fbd971c3f64a740fbb3f3c180910fb08504e8bf9d1f57c1bd2d295.webp)](images/asset-3bc2a2baf4fbd971c3f64a740fbb3f3c180910fb08504e8bf9d1f57c1bd2d295.webp) |


**Region 1 — Leftmost rusty metal rod and its shadow**

[![Before → After → Edited regions · composite close-up](images/asset-a2fa0cbf3819d3f2be5bf6115ce128e2e5a8c32a4dd79d26d98182bfac30ec62.webp)](images/asset-a2fa0cbf3819d3f2be5bf6115ce128e2e5a8c32a4dd79d26d98182bfac30ec62.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-acfc420624add0305011f8ce723964a8f769618682ac13897976ae4f4bf597d5.webp)](images/asset-acfc420624add0305011f8ce723964a8f769618682ac13897976ae4f4bf597d5.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-a389e9c0688c70f1255d00bb36fb2b0396226babcac54e134020dd5e31588633.webp)](images/asset-a389e9c0688c70f1255d00bb36fb2b0396226babcac54e134020dd5e31588633.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-0daf3b1b7fdae00cb0823799d796e33b0da3f7c4bac09da68374b6c0e0b3daff.webp).

### Clone stamp and generative AI · mixed version

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-e42b95e9959bb8a78aa22f1d5aff4cac50bd50a7e8051c259194448655e15f63.webp)](images/asset-e42b95e9959bb8a78aa22f1d5aff4cac50bd50a7e8051c259194448655e15f63.webp) | [![Edited regions on the original · white with a black border](images/asset-8477de47070a91fc6d1bf0f8866b2096926bd21b0f11e65bdccd2b6eb877c6db.webp)](images/asset-8477de47070a91fc6d1bf0f8866b2096926bd21b0f11e65bdccd2b6eb877c6db.webp) | [![After](images/asset-96d1e248d0476846e393516ad24f153c4ba7f946d94e6ddcda33b5faec7725e5.webp)](images/asset-96d1e248d0476846e393516ad24f153c4ba7f946d94e6ddcda33b5faec7725e5.webp) |


**Region 1 — The complete rightmost rusty hanging rod, including its lower tip and nearby shadow**

[![Before → After → Edited regions · composite close-up](images/asset-6cf0395de3b71b4e4598a31141d00a338fc63b8af578f5a8708eee370509fef2.webp)](images/asset-6cf0395de3b71b4e4598a31141d00a338fc63b8af578f5a8708eee370509fef2.webp)

**Region 2 — Leftmost rusty metal rod and its shadow**

[![Before → After → Edited regions · composite close-up](images/asset-a2fa0cbf3819d3f2be5bf6115ce128e2e5a8c32a4dd79d26d98182bfac30ec62.webp)](images/asset-a2fa0cbf3819d3f2be5bf6115ce128e2e5a8c32a4dd79d26d98182bfac30ec62.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-0adc49c44b9de96ca243773958f6fc6a5f0b4e4c4d2d45c5d9102e873209cef7.webp)](images/asset-0adc49c44b9de96ca243773958f6fc6a5f0b4e4c4d2d45c5d9102e873209cef7.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-e99c72cc9968b57f99bd33c2394c351c068115c249049b7d3a5f636a6d7d63d4.webp)](images/asset-e99c72cc9968b57f99bd33c2394c351c068115c249049b7d3a5f636a6d7d63d4.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-7aa504f5487bef8a647e560584909f1a1c230fa804fd2f74ea90fb8040d7dc8c.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-e42b95e9959bb8a78aa22f1d5aff4cac50bd50a7e8051c259194448655e15f63.webp)](images/asset-e42b95e9959bb8a78aa22f1d5aff4cac50bd50a7e8051c259194448655e15f63.webp) | [![RITA · flagged area: 11.36%](images/asset-d4916a7b8c2bcd085199fd62d7379f56b2e998256add39bc0474e5e72d8a9b20.webp)](images/asset-d4916a7b8c2bcd085199fd62d7379f56b2e998256add39bc0474e5e72d8a9b20.webp) | [![TruFor · flagged area: 2.25%](images/asset-394c1a997ebe6e12e14df6ff96f22f77d19f35af3cb8112038a291e5808ae4cd.webp)](images/asset-394c1a997ebe6e12e14df6ff96f22f77d19f35af3cb8112038a291e5808ae4cd.webp) |

[Official RITA control map · 512 × 512](images/asset-6d0840699a2c83e41246600c2c281c7e0294d667a09e7dc24c1406743b179e88.webp).

## 2022-dsc0873_260522

### Clone stamp · five regions

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-06a080b7ebf68ae8d0401c2b45f44eae7411238f70e3998a97da618b48ac4b6a.webp)](images/asset-06a080b7ebf68ae8d0401c2b45f44eae7411238f70e3998a97da618b48ac4b6a.webp) | [![Edited regions on the original · white with a black border](images/asset-6e2a83da6457c7f10a8e9841d90561c0cd05ff11edf8b294d9a2081e52f8d8d3.webp)](images/asset-6e2a83da6457c7f10a8e9841d90561c0cd05ff11edf8b294d9a2081e52f8d8d3.webp) | [![After](images/asset-de3b428d55b50692010d7a401ee18130cc96936480597e8dc10ef95ed66fb26e.webp)](images/asset-de3b428d55b50692010d7a401ee18130cc96936480597e8dc10ef95ed66fb26e.webp) |


**Region 1 — Complete small pale loose stone on the middle foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-7cd14f2ab7bda280532ee6bc2bca4134fbcdf202d262eb0bf97655d553ebe10b.webp)](images/asset-7cd14f2ab7bda280532ee6bc2bca4134fbcdf202d262eb0bf97655d553ebe10b.webp)

**Region 2 — Complete isolated beige loose stone left of the main stone pile**

[![Before → After → Edited regions · composite close-up](images/asset-141558bb2dc792409259ad14f06cb0739162c6d403856c6e4f07ca4d836bd5a0.webp)](images/asset-141558bb2dc792409259ad14f06cb0739162c6d403856c6e4f07ca4d836bd5a0.webp)

**Region 3 — Complete loose pale angular stone on the right of the foreground pile**

[![Before → After → Edited regions · composite close-up](images/asset-5f5f79774d72e27fb2aca29fe17b11f908b1fb4e88adf2d101ae3bc76296f85e.webp)](images/asset-5f5f79774d72e27fb2aca29fe17b11f908b1fb4e88adf2d101ae3bc76296f85e.webp)

**Region 4 — Complete small brown flat fragment on the floor below the main stone pile**

[![Before → After → Edited regions · composite close-up](images/asset-6f57e06f9975fe99cffe1df2f31d646acfd42a0a9fbe6a2c3751c49096b47931.webp)](images/asset-6f57e06f9975fe99cffe1df2f31d646acfd42a0a9fbe6a2c3751c49096b47931.webp)

**Region 5 — Complete small yellow DANY inscription on the far right pillar**

[![Before → After → Edited regions · composite close-up](images/asset-2d816719837bdfaff790f277d72d866ff73753d78bbea13fd66e3c9e1819f91b.webp)](images/asset-2d816719837bdfaff790f277d72d866ff73753d78bbea13fd66e3c9e1819f91b.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-d2f8160b583ff7dd9a374f0d36e6fffcdb92ad654376d38cc43e53005efd2d15.webp)](images/asset-d2f8160b583ff7dd9a374f0d36e6fffcdb92ad654376d38cc43e53005efd2d15.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-760c502ab935ad45686c663c476c8292c900879d0f2801aff01f900ab2dd9b26.webp)](images/asset-760c502ab935ad45686c663c476c8292c900879d0f2801aff01f900ab2dd9b26.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-b553d4679bcb8fc3540ee81ec35db46b76329c1110a6d71ca989e21a276c0df1.webp).

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-06a080b7ebf68ae8d0401c2b45f44eae7411238f70e3998a97da618b48ac4b6a.webp)](images/asset-06a080b7ebf68ae8d0401c2b45f44eae7411238f70e3998a97da618b48ac4b6a.webp) | [![Edited regions on the original · white with a black border](images/asset-95945427b5248c9900cd4a45b22f3efb6babbcb704ced3103f2f1be363ff245d.webp)](images/asset-95945427b5248c9900cd4a45b22f3efb6babbcb704ced3103f2f1be363ff245d.webp) | [![After](images/asset-7b1da797100af91370d451876213694881ee2c37b24d26a4caf3662d30975e4f.webp)](images/asset-7b1da797100af91370d451876213694881ee2c37b24d26a4caf3662d30975e4f.webp) |


**Region 1 — Small pale loose stone isolated on the mid-foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-7cd14f2ab7bda280532ee6bc2bca4134fbcdf202d262eb0bf97655d553ebe10b.webp)](images/asset-7cd14f2ab7bda280532ee6bc2bca4134fbcdf202d262eb0bf97655d553ebe10b.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-ec275f6e27a79088b82fdc589d97362091a59f3860bf7e6636a351e172b9c43d.webp)](images/asset-ec275f6e27a79088b82fdc589d97362091a59f3860bf7e6636a351e172b9c43d.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-caa1fc45628aca15fe16c4d8fd85051bb9d3e2de74f93a28d2cf4293afd35d09.webp)](images/asset-caa1fc45628aca15fe16c4d8fd85051bb9d3e2de74f93a28d2cf4293afd35d09.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-26c1fe36a7eeed22f5d4b7ff23dcbd2092f4ecddd318f62dc9d099b345a7386a.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-06a080b7ebf68ae8d0401c2b45f44eae7411238f70e3998a97da618b48ac4b6a.webp)](images/asset-06a080b7ebf68ae8d0401c2b45f44eae7411238f70e3998a97da618b48ac4b6a.webp) | [![Edited regions on the original · white with a black border](images/asset-0b87204cd59d85533659f424a5b6966346dc69e4bb043c539f2ae7ef82b29df6.webp)](images/asset-0b87204cd59d85533659f424a5b6966346dc69e4bb043c539f2ae7ef82b29df6.webp) | [![After](images/asset-ad3eaf25786e296182f4ec8e69de178f16eb78d7b058462c508e866b2004c623.webp)](images/asset-ad3eaf25786e296182f4ec8e69de178f16eb78d7b058462c508e866b2004c623.webp) |


**Region 1 — Small pale loose stone isolated on the mid-foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-3692bb1f3bffce0ff67b33fb3e322a05864f8fab6e610e98114d5c12a53753e0.webp)](images/asset-3692bb1f3bffce0ff67b33fb3e322a05864f8fab6e610e98114d5c12a53753e0.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-088485fcd0b0b8ffb30910d13e1241768b0f6047ab4e027f53ebaa7feb10c489.webp)](images/asset-088485fcd0b0b8ffb30910d13e1241768b0f6047ab4e027f53ebaa7feb10c489.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-b25d0b4f0c396052a42408d82833eacf12ad0c85b76cec2acc6a24c28ecee897.webp)](images/asset-b25d0b4f0c396052a42408d82833eacf12ad0c85b76cec2acc6a24c28ecee897.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-952baeed7ab133ecc670ec6a8a78fca425bf3cc9a283798bfad3a9e836878172.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-06a080b7ebf68ae8d0401c2b45f44eae7411238f70e3998a97da618b48ac4b6a.webp)](images/asset-06a080b7ebf68ae8d0401c2b45f44eae7411238f70e3998a97da618b48ac4b6a.webp) | [![Edited regions on the original · white with a black border](images/asset-69e2dc65a9cc2f30f006a57b80786046d6d7f630b36d90ec5b98563a60083074.webp)](images/asset-69e2dc65a9cc2f30f006a57b80786046d6d7f630b36d90ec5b98563a60083074.webp) | [![After](images/asset-d9f7648440dc3b4d55c9c0fd6705dae222172ce657cc2408f121939585cc32a9.webp)](images/asset-d9f7648440dc3b4d55c9c0fd6705dae222172ce657cc2408f121939585cc32a9.webp) |


**Region 1 — Large isolated white stone in the foreground, to the right of the small pile**

[![Before → After → Edited regions · composite close-up](images/asset-01e7c3321b7f74a9b148774dd5400fd2982e895836b7386edc24d105b0d94cd6.webp)](images/asset-01e7c3321b7f74a9b148774dd5400fd2982e895836b7386edc24d105b0d94cd6.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-3c7cf8d94d4383cfecfa9c3c4c509c454fc8305248c0012f852c78d62a44fc2f.webp)](images/asset-3c7cf8d94d4383cfecfa9c3c4c509c454fc8305248c0012f852c78d62a44fc2f.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-9ad500259121950c970195b0c87f273df214b2debf201d1cb08e200ea490a64c.webp)](images/asset-9ad500259121950c970195b0c87f273df214b2debf201d1cb08e200ea490a64c.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-bfc83b70c98343d1fd4f60849113529e1addb13fbc3ae24c8eedb96e240eab3b.webp).

### Clone stamp and generative AI · mixed version

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-06a080b7ebf68ae8d0401c2b45f44eae7411238f70e3998a97da618b48ac4b6a.webp)](images/asset-06a080b7ebf68ae8d0401c2b45f44eae7411238f70e3998a97da618b48ac4b6a.webp) | [![Edited regions on the original · white with a black border](images/asset-c705667a0ca070c1536b4c6814fb2595ea51b333e2df466bb91f619ed217eb75.webp)](images/asset-c705667a0ca070c1536b4c6814fb2595ea51b333e2df466bb91f619ed217eb75.webp) | [![After](images/asset-e790385c5cfa7250151bc73b3245a00335b6d9e3b0f02b7439bc973f46f43747.webp)](images/asset-e790385c5cfa7250151bc73b3245a00335b6d9e3b0f02b7439bc973f46f43747.webp) |


**Region 1 — Small pale loose stone isolated on the mid-foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-3692bb1f3bffce0ff67b33fb3e322a05864f8fab6e610e98114d5c12a53753e0.webp)](images/asset-3692bb1f3bffce0ff67b33fb3e322a05864f8fab6e610e98114d5c12a53753e0.webp)

**Region 2 — Large isolated white stone in the foreground, to the right of the small pile**

[![Before → After → Edited regions · composite close-up](images/asset-01e7c3321b7f74a9b148774dd5400fd2982e895836b7386edc24d105b0d94cd6.webp)](images/asset-01e7c3321b7f74a9b148774dd5400fd2982e895836b7386edc24d105b0d94cd6.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-caf1ba0054a3b813ba348f6fd8eb5926162f122c67d44a6407c863a640ab40b7.webp)](images/asset-caf1ba0054a3b813ba348f6fd8eb5926162f122c67d44a6407c863a640ab40b7.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-26b8121fb934cbc63b7f2c92249e816192ef866c46b267c5edcbb4d95d725b41.webp)](images/asset-26b8121fb934cbc63b7f2c92249e816192ef866c46b267c5edcbb4d95d725b41.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-17a608ae2fa0b3cc37f2e2d1af9e3818d8863ec6ead16a89c851cbfb85047f47.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-06a080b7ebf68ae8d0401c2b45f44eae7411238f70e3998a97da618b48ac4b6a.webp)](images/asset-06a080b7ebf68ae8d0401c2b45f44eae7411238f70e3998a97da618b48ac4b6a.webp) | [![RITA · flagged area: 9.60%](images/asset-262ba0ae010d2098b1d1f3e6a889b064440cb8097a00ac55f00af89d8277c35e.webp)](images/asset-262ba0ae010d2098b1d1f3e6a889b064440cb8097a00ac55f00af89d8277c35e.webp) | [![TruFor · flagged area: 2.66%](images/asset-3863a68fa1c3406594cdb43927c6ceb3f4ab00c5dd4fd7d872f14137a104565c.webp)](images/asset-3863a68fa1c3406594cdb43927c6ceb3f4ab00c5dd4fd7d872f14137a104565c.webp) |

[Official RITA control map · 512 × 512](images/asset-cd3aa1504134af37ede1850211aea1ae170f4926ecad8b878a0abc50d12188dd.webp).

## 2022-dsc0880_260522

### Clone stamp · five regions

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-b1d245638a48834c34c720f6c335fd0e461af8a5354f8264336a08242efad271.webp)](images/asset-b1d245638a48834c34c720f6c335fd0e461af8a5354f8264336a08242efad271.webp) | [![Edited regions on the original · white with a black border](images/asset-f1c24d01f17cf199f443c3722ed8f85ae027fce41cbba373754477f517cd03f7.webp)](images/asset-f1c24d01f17cf199f443c3722ed8f85ae027fce41cbba373754477f517cd03f7.webp) | [![After](images/asset-481410509d22a4a0c52c3d443b7f7967a14288d1282ad637cc14bcacc5472c43.webp)](images/asset-481410509d22a4a0c52c3d443b7f7967a14288d1282ad637cc14bcacc5472c43.webp) |


**Region 1 — Round metal cap at the foot of the pillar**

[![Before → After → Edited regions · composite close-up](images/asset-06f7aa818f34bd25131313af605f35cadd5b0c87540880a81345243a1faea43d.webp)](images/asset-06f7aa818f34bd25131313af605f35cadd5b0c87540880a81345243a1faea43d.webp)

**Region 2 — Loose printed paper or tile on the right-hand floor**

[![Before → After → Edited regions · composite close-up](images/asset-f33cb9b49b1d29361f8c3bb14b4e8bee967c925e13278d68bc107aaebb22bbda.webp)](images/asset-f33cb9b49b1d29361f8c3bb14b4e8bee967c925e13278d68bc107aaebb22bbda.webp)

**Region 3 — Small isolated red paint or litter mark on the foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-fd64dbdf1fa3634d95d37c4cb707111e136ff3087f045c23fdb8c2199ecc86e1.webp)](images/asset-fd64dbdf1fa3634d95d37c4cb707111e136ff3087f045c23fdb8c2199ecc86e1.webp)

**Region 4 — Whole isolated orange angular paint mark on the dark left background wall**

[![Before → After → Edited regions · composite close-up](images/asset-6009445741ac36c7eae12ab5572efc6237b65657279dffabf8f7b36058bc2e8a.webp)](images/asset-6009445741ac36c7eae12ab5572efc6237b65657279dffabf8f7b36058bc2e8a.webp)

**Region 5 — Small complete black painted tag high on the pillar**

[![Before → After → Edited regions · composite close-up](images/asset-29edf85c4e31e6c7991c96aad85697c11a80081a27eac0ce775ae7ad972447ac.webp)](images/asset-29edf85c4e31e6c7991c96aad85697c11a80081a27eac0ce775ae7ad972447ac.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-8cab96ba10c12967066b83594e890e4cf48fb00430bb3d1d505847c01e5a7617.webp)](images/asset-8cab96ba10c12967066b83594e890e4cf48fb00430bb3d1d505847c01e5a7617.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-38b838217b0141a74910a0d8e26abfa84e1d97fb776b8423ba7ba5c4a8c9d6a2.webp)](images/asset-38b838217b0141a74910a0d8e26abfa84e1d97fb776b8423ba7ba5c4a8c9d6a2.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-30f5c1ed9363ec518d6aa8611fa745958d3d95bbf18cc89a0ae1f9ef198ee301.webp).

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-b1d245638a48834c34c720f6c335fd0e461af8a5354f8264336a08242efad271.webp)](images/asset-b1d245638a48834c34c720f6c335fd0e461af8a5354f8264336a08242efad271.webp) | [![Edited regions on the original · white with a black border](images/asset-9cfd349d01c62c2f86e8fab38faaf77bf5b7e55da5ac7add029d43a32b0bd4ea.webp)](images/asset-9cfd349d01c62c2f86e8fab38faaf77bf5b7e55da5ac7add029d43a32b0bd4ea.webp) | [![After](images/asset-a11cb207ac399b9997524c50dc29fbc0e7feef1e96dfa63c52360745bb021669.webp)](images/asset-a11cb207ac399b9997524c50dc29fbc0e7feef1e96dfa63c52360745bb021669.webp) |


**Region 1 — Small white pebble on the floor to the right of the pillar**

[![Before → After → Edited regions · composite close-up](images/asset-2bfc68dc6527a063f0e28ee194f122fe983558407d0902b84ea32678e183585b.webp)](images/asset-2bfc68dc6527a063f0e28ee194f122fe983558407d0902b84ea32678e183585b.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-b2a5e37837c595d503b1ee74572f3c3964ee7980b7cd2462c2335f1d944912a8.webp)](images/asset-b2a5e37837c595d503b1ee74572f3c3964ee7980b7cd2462c2335f1d944912a8.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-594bd54ddfb649ce60334afc2fe6c100e942572ac040e00e81efa1595b6e8053.webp)](images/asset-594bd54ddfb649ce60334afc2fe6c100e942572ac040e00e81efa1595b6e8053.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-4c2001e6cf190e7265481117f65aa9b0c5068e8f71914598742a61387fc6a4d2.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-b1d245638a48834c34c720f6c335fd0e461af8a5354f8264336a08242efad271.webp)](images/asset-b1d245638a48834c34c720f6c335fd0e461af8a5354f8264336a08242efad271.webp) | [![Edited regions on the original · white with a black border](images/asset-3e6e6065d524f883be2d3c3f645d440d46416815b9a0d37b006db2c303aba5ea.webp)](images/asset-3e6e6065d524f883be2d3c3f645d440d46416815b9a0d37b006db2c303aba5ea.webp) | [![After](images/asset-23aa66e68070e91edb241d8bd9029b2f5c97674ab7afaa9bd98a7294fba77d53.webp)](images/asset-23aa66e68070e91edb241d8bd9029b2f5c97674ab7afaa9bd98a7294fba77d53.webp) |


**Region 1 — Small white pebble on the floor to the right of the pillar**

[![Before → After → Edited regions · composite close-up](images/asset-f11e7fd72c6eea9693e3a8ab1fd83f83adff5f86a53a0132df0642402f71d8bf.webp)](images/asset-f11e7fd72c6eea9693e3a8ab1fd83f83adff5f86a53a0132df0642402f71d8bf.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-942226d809b438098b0dee3219a22e34cecb83c5ed9e065f331969a67fa57e62.webp)](images/asset-942226d809b438098b0dee3219a22e34cecb83c5ed9e065f331969a67fa57e62.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-70ffd87cbeddcb2b7419747a7db30c2aa8b498bacfa2d1794e7ee48491f98406.webp)](images/asset-70ffd87cbeddcb2b7419747a7db30c2aa8b498bacfa2d1794e7ee48491f98406.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-1fe27cb14e51adc3232d046483cb1e0f6b4ce146d8abd42570c68bd0d74d3b07.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-b1d245638a48834c34c720f6c335fd0e461af8a5354f8264336a08242efad271.webp)](images/asset-b1d245638a48834c34c720f6c335fd0e461af8a5354f8264336a08242efad271.webp) | [![Edited regions on the original · white with a black border](images/asset-e8221a6287fa0f5dd65c9e194425287b8644bab2282b6b6c3e6f3a723122e929.webp)](images/asset-e8221a6287fa0f5dd65c9e194425287b8644bab2282b6b6c3e6f3a723122e929.webp) | [![After](images/asset-89243510ee991b1c73a2739a2d08239d48aff1486f5c2c56a3d1200ed26207a4.webp)](images/asset-89243510ee991b1c73a2739a2d08239d48aff1486f5c2c56a3d1200ed26207a4.webp) |


**Region 1 — Upper red inscription and associated blue strokes on the pillar**

[![Before → After → Edited regions · composite close-up](images/asset-37e834d3f95a5f41d4a70a3b9ebb87180835bbc7062bc456a5f88d32ef0928d3.webp)](images/asset-37e834d3f95a5f41d4a70a3b9ebb87180835bbc7062bc456a5f88d32ef0928d3.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-f7b222286fc52904cd176ca06cfd59b3c8288e63dfcb9d4312fc005a991f15e7.webp)](images/asset-f7b222286fc52904cd176ca06cfd59b3c8288e63dfcb9d4312fc005a991f15e7.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-2f1eea737f3877560242d04e3f8ded8d7fb8d4e0421d0ae7751ad4f9e37149e4.webp)](images/asset-2f1eea737f3877560242d04e3f8ded8d7fb8d4e0421d0ae7751ad4f9e37149e4.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-195f3f35982d6ebef8c02448dc8a3d81d75b1b9c16b19e4f87614acf46dfbda5.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-b1d245638a48834c34c720f6c335fd0e461af8a5354f8264336a08242efad271.webp)](images/asset-b1d245638a48834c34c720f6c335fd0e461af8a5354f8264336a08242efad271.webp) | [![RITA · flagged area: 3.51%](images/asset-f88ad247e384cce2bf74a3a61c317bc41865e481c9f8b6fe73cd0d8cd92754e6.webp)](images/asset-f88ad247e384cce2bf74a3a61c317bc41865e481c9f8b6fe73cd0d8cd92754e6.webp) | [![TruFor · flagged area: 0.55%](images/asset-75bc501e85105c4d565e9c48ebbc652f617c63977afb8d87be70e2aa50aec8be.webp)](images/asset-75bc501e85105c4d565e9c48ebbc652f617c63977afb8d87be70e2aa50aec8be.webp) |

[Official RITA control map · 512 × 512](images/asset-2ea3b824eb3093f5665f7705aa924dd1bb3acfd8617eb5c048f652c9fc8aa59d.webp).

## 2022-dsc0884_260522

### Clone stamp · five regions

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-5208ce24b281b2c21e24039fe8434f4199db444376ea52d15d87df3e9e90b605.webp)](images/asset-5208ce24b281b2c21e24039fe8434f4199db444376ea52d15d87df3e9e90b605.webp) | [![Edited regions on the original · white with a black border](images/asset-4421f1a40ca7d964dbe5cd899449fcc03a4be072f0252e9aa5de9b1e439db4ec.webp)](images/asset-4421f1a40ca7d964dbe5cd899449fcc03a4be072f0252e9aa5de9b1e439db4ec.webp) | [![After](images/asset-718e1e2a3b968d34fd237ac3f44f49b181c1e59f66cb5374dde976c1e5f99554.webp)](images/asset-718e1e2a3b968d34fd237ac3f44f49b181c1e59f66cb5374dde976c1e5f99554.webp) |


**Region 1 — Isolated beige loose stone left of the foreground stone pile**

[![Before → After → Edited regions · composite close-up](images/asset-c17ca9c1296d3fed8859c6f7720d06b29ff43deb80a5526300be802df364ad59.webp)](images/asset-c17ca9c1296d3fed8859c6f7720d06b29ff43deb80a5526300be802df364ad59.webp)

**Region 2 — Flat loose stone on the right foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-cd4daa084d304485fc4277d6fd6f11ed4b00d8fef7910dcdb45cedd65dbe4658.webp)](images/asset-cd4daa084d304485fc4277d6fd6f11ed4b00d8fef7910dcdb45cedd65dbe4658.webp)

**Region 3 — Small purple paint spot on the ceiling**

[![Before → After → Edited regions · composite close-up](images/asset-d09826de947c94a3b672b65ea1553dccd43b2f5b7a9ed66a73183d2e199da6c2.webp)](images/asset-d09826de947c94a3b672b65ea1553dccd43b2f5b7a9ed66a73183d2e199da6c2.webp)

**Region 4 — Complete small black TMT painted inscription on the right wall**

[![Before → After → Edited regions · composite close-up](images/asset-04ecf0ce1ec5a02ae82a2f9b03b5fde77aabcdabea1227b5ac38a70862d56794.webp)](images/asset-04ecf0ce1ec5a02ae82a2f9b03b5fde77aabcdabea1227b5ac38a70862d56794.webp)

**Region 5 — Small complete rusted rectangular litter piece on the foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-9175dcfe3fd0d8aa89b70426fecdf678d15ba6bed08eee5ef17336d1d3d5f2e3.webp)](images/asset-9175dcfe3fd0d8aa89b70426fecdf678d15ba6bed08eee5ef17336d1d3d5f2e3.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-fab2a88e6fca554051aae0ee9fc7b9810dca92cf6a58d38fb9dbec0fb596c7a1.webp)](images/asset-fab2a88e6fca554051aae0ee9fc7b9810dca92cf6a58d38fb9dbec0fb596c7a1.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-4d73b242941178428e6d6ad89b3c23b1094dcf8b281962928ad7de5e1fc5a42c.webp)](images/asset-4d73b242941178428e6d6ad89b3c23b1094dcf8b281962928ad7de5e1fc5a42c.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-2020f2fdc65da4c7118f5861aeb42644639800f82907360a1d3efcc03f813032.webp).

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-5208ce24b281b2c21e24039fe8434f4199db444376ea52d15d87df3e9e90b605.webp)](images/asset-5208ce24b281b2c21e24039fe8434f4199db444376ea52d15d87df3e9e90b605.webp) | [![Edited regions on the original · white with a black border](images/asset-17b5212e6233b07540c1271b023863e5011f24a538ac2a8b65f18599e251f960.webp)](images/asset-17b5212e6233b07540c1271b023863e5011f24a538ac2a8b65f18599e251f960.webp) | [![After](images/asset-95d266226a73dee8590dc7cababe044b3aedca60442532a1989151c120e34c63.webp)](images/asset-95d266226a73dee8590dc7cababe044b3aedca60442532a1989151c120e34c63.webp) |


**Region 1 — Isolated beige loose stone on the floor left of the large foreground stone pile**

[![Before → After → Edited regions · composite close-up](images/asset-f30b90988a92e69a1c140ffc2d9b80ac0f490c61024e41e09793d98f1d84731b.webp)](images/asset-f30b90988a92e69a1c140ffc2d9b80ac0f490c61024e41e09793d98f1d84731b.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-4279c0b86452ebab35eb1ca5cfe89829beab2497c729c12cb56cc02802aac735.webp)](images/asset-4279c0b86452ebab35eb1ca5cfe89829beab2497c729c12cb56cc02802aac735.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-841c3654a6596ff44412f046225510a6bece800790adf485955e8c3b354f5595.webp)](images/asset-841c3654a6596ff44412f046225510a6bece800790adf485955e8c3b354f5595.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-4fa2e4d5836a654812e687784e85d65c9bb28fa3b3ab14c9fcfdf821ab9a377b.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-5208ce24b281b2c21e24039fe8434f4199db444376ea52d15d87df3e9e90b605.webp)](images/asset-5208ce24b281b2c21e24039fe8434f4199db444376ea52d15d87df3e9e90b605.webp) | [![Edited regions on the original · white with a black border](images/asset-2f0a316130fa1a2df1fd3bd09041083724c034f24dbbf668fcece93aeff25fa7.webp)](images/asset-2f0a316130fa1a2df1fd3bd09041083724c034f24dbbf668fcece93aeff25fa7.webp) | [![After](images/asset-e7b742a4a4eec2f8f266827abbc6b92b523b2612e2ffc18f23d1fe38589d1596.webp)](images/asset-e7b742a4a4eec2f8f266827abbc6b92b523b2612e2ffc18f23d1fe38589d1596.webp) |


**Region 1 — Isolated beige loose stone on the floor left of the large foreground stone pile**

[![Before → After → Edited regions · composite close-up](images/asset-b8dc871401da23e8342a54b1ef60f430cf356b5d223b87ad31cbcbbc0d8c50e3.webp)](images/asset-b8dc871401da23e8342a54b1ef60f430cf356b5d223b87ad31cbcbbc0d8c50e3.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-2b6f0b71370ff86d422638e1ce616cd26e21d30b34d55ad44a41040f322111e4.webp)](images/asset-2b6f0b71370ff86d422638e1ce616cd26e21d30b34d55ad44a41040f322111e4.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-2d4dce6f3cc78d097e5c20e594c87070b1180ec2d6d351c43038aa7d0f4dedba.webp)](images/asset-2d4dce6f3cc78d097e5c20e594c87070b1180ec2d6d351c43038aa7d0f4dedba.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-fa92c292ef8e3f446f9a955ee5c79b25f7b9c176a606745e8d5cad044deaa30b.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-5208ce24b281b2c21e24039fe8434f4199db444376ea52d15d87df3e9e90b605.webp)](images/asset-5208ce24b281b2c21e24039fe8434f4199db444376ea52d15d87df3e9e90b605.webp) | [![Edited regions on the original · white with a black border](images/asset-d89e44d38927abecfc3f7c1e66373e5e86e67cc16d666b521108829dc1f9be22.webp)](images/asset-d89e44d38927abecfc3f7c1e66373e5e86e67cc16d666b521108829dc1f9be22.webp) | [![After](images/asset-a518c9b9431c6ac050a5431b537e07cfae6322765f9ea419768def11b4c19128.webp)](images/asset-a518c9b9431c6ac050a5431b537e07cfae6322765f9ea419768def11b4c19128.webp) |


**Region 1 — White Bon Anniv / Nero inscription on the left wall**

[![Before → After → Edited regions · composite close-up](images/asset-87b5b86aea91c03c6982cd5fc056c65ca635f82c0b361f3f045823cd27f2ca6f.webp)](images/asset-87b5b86aea91c03c6982cd5fc056c65ca635f82c0b361f3f045823cd27f2ca6f.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-bc8cb1a37b7729532ee1564d4dc5a02dce6f8c34ef56c792e51ec7b2a97b872a.webp)](images/asset-bc8cb1a37b7729532ee1564d4dc5a02dce6f8c34ef56c792e51ec7b2a97b872a.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-237464406cf261e19e95984ca94f672400ba5504e50ec0ea7633d26ae1183b1e.webp)](images/asset-237464406cf261e19e95984ca94f672400ba5504e50ec0ea7633d26ae1183b1e.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-e3f6066fc16fb0b5dd5d5805de0d48b50cb0224cec7042f21f90a429f193b0e4.webp).

### Clone stamp and generative AI · mixed version

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-5208ce24b281b2c21e24039fe8434f4199db444376ea52d15d87df3e9e90b605.webp)](images/asset-5208ce24b281b2c21e24039fe8434f4199db444376ea52d15d87df3e9e90b605.webp) | [![Edited regions on the original · white with a black border](images/asset-7a9f5066d561310bf40551c6dec3cb04e46c2d6613d39d334e8946c1bb00699a.webp)](images/asset-7a9f5066d561310bf40551c6dec3cb04e46c2d6613d39d334e8946c1bb00699a.webp) | [![After](images/asset-5c2e272bb5c6a3a215afd2732259420ef1d3bb5db257634f0ebe4c6a563c3150.webp)](images/asset-5c2e272bb5c6a3a215afd2732259420ef1d3bb5db257634f0ebe4c6a563c3150.webp) |


**Region 1 — Isolated beige loose stone on the floor left of the large foreground stone pile**

[![Before → After → Edited regions · composite close-up](images/asset-b8dc871401da23e8342a54b1ef60f430cf356b5d223b87ad31cbcbbc0d8c50e3.webp)](images/asset-b8dc871401da23e8342a54b1ef60f430cf356b5d223b87ad31cbcbbc0d8c50e3.webp)

**Region 2 — White Bon Anniv / Nero inscription on the left wall**

[![Before → After → Edited regions · composite close-up](images/asset-87b5b86aea91c03c6982cd5fc056c65ca635f82c0b361f3f045823cd27f2ca6f.webp)](images/asset-87b5b86aea91c03c6982cd5fc056c65ca635f82c0b361f3f045823cd27f2ca6f.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-db710019d0d9694a6ce64626f2c0b382c27d69c743f8310994a58bce6547b2d0.webp)](images/asset-db710019d0d9694a6ce64626f2c0b382c27d69c743f8310994a58bce6547b2d0.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-fe9a3759dac218f6979f3c78e2b317ae5015a3267fd481e0addbf3f5f7b68a91.webp)](images/asset-fe9a3759dac218f6979f3c78e2b317ae5015a3267fd481e0addbf3f5f7b68a91.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-b5b59163cf3139529289c5148a0fdb3e2f67147f931fce784d945e631518ef1c.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-5208ce24b281b2c21e24039fe8434f4199db444376ea52d15d87df3e9e90b605.webp)](images/asset-5208ce24b281b2c21e24039fe8434f4199db444376ea52d15d87df3e9e90b605.webp) | [![RITA · flagged area: 9.54%](images/asset-73307dee483047cd70a5b617e04fbcb78f6b47a2923bacf6f8d6a468557926ab.webp)](images/asset-73307dee483047cd70a5b617e04fbcb78f6b47a2923bacf6f8d6a468557926ab.webp) | [![TruFor · flagged area: 1.78%](images/asset-2273e8ee303209d92d8e0e852d4fb21c6110b46b816aabc77e34bc141a16073d.webp)](images/asset-2273e8ee303209d92d8e0e852d4fb21c6110b46b816aabc77e34bc141a16073d.webp) |

[Official RITA control map · 512 × 512](images/asset-81669262bf842255eecda4903218e6e961d3d205a65e25ea0f82defadec714fe.webp).

## 2022-dsc0890_260522

### Clone stamp · five regions

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-8479af9c3a71af0f8cbf7dead766bf1c42021ea0222af9a3eb882ce591956d3f.webp)](images/asset-8479af9c3a71af0f8cbf7dead766bf1c42021ea0222af9a3eb882ce591956d3f.webp) | [![Edited regions on the original · white with a black border](images/asset-3da8ffae6f0922ae45a7ef4c0f754238a4a9f179cc54461546b1c86bf25c9aa2.webp)](images/asset-3da8ffae6f0922ae45a7ef4c0f754238a4a9f179cc54461546b1c86bf25c9aa2.webp) | [![After](images/asset-2fe966ac14db6a45e55be8c495c5c12338e6610971f0adf0e601135bcae4da33.webp)](images/asset-2fe966ac14db6a45e55be8c495c5c12338e6610971f0adf0e601135bcae4da33.webp) |


**Region 1 — Whole black discarded cloth on the foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-c63e0f0703ec81663c30d2dbfb594a07b91b392ba4ccd86326a9cd43cb49ffa1.webp)](images/asset-c63e0f0703ec81663c30d2dbfb594a07b91b392ba4ccd86326a9cd43cb49ffa1.webp)

**Region 2 — Whole purple pentagram on the light pillar**

[![Before → After → Edited regions · composite close-up](images/asset-b5292a6aec629515ee724ea9ace415c5ba7aff6185a51e1d62b93551ed0e8358.webp)](images/asset-b5292a6aec629515ee724ea9ace415c5ba7aff6185a51e1d62b93551ed0e8358.webp)

**Region 3 — Complete small black painted word on the upper sandbag**

[![Before → After → Edited regions · composite close-up](images/asset-4b58e7dadd55997a9ae52dfd250d66f323144c4dd118cb6221d568fdfd82ec9a.webp)](images/asset-4b58e7dadd55997a9ae52dfd250d66f323144c4dd118cb6221d568fdfd82ec9a.webp)

**Region 4 — Complete red DAMS painted inscription on the lower-right sandbag**

[![Before → After → Edited regions · composite close-up](images/asset-9b51e15f4f981155a857229ce6ab2a397e4ad6f87c4b071cc44c4979080f36e1.webp)](images/asset-9b51e15f4f981155a857229ce6ab2a397e4ad6f87c4b071cc44c4979080f36e1.webp)

**Region 5 — Small discarded blue or silver can at the foot of the pillar**

[![Before → After → Edited regions · composite close-up](images/asset-ea9f10f24ae358ae65f8dcd2a0e318952eff87aeb5913a3f8be95659a79df502.webp)](images/asset-ea9f10f24ae358ae65f8dcd2a0e318952eff87aeb5913a3f8be95659a79df502.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-7af61217595ff375e0657935969d5a02673b69d2d1a5a6b4095c4e35bf2c50ed.webp)](images/asset-7af61217595ff375e0657935969d5a02673b69d2d1a5a6b4095c4e35bf2c50ed.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-7fcbc4a9eaa7759679d7315856612535e3321764467a6877d48022b320e1d99d.webp)](images/asset-7fcbc4a9eaa7759679d7315856612535e3321764467a6877d48022b320e1d99d.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-829c843f3b6724ea5307622d291fcd426c214b92b76440207e0471df72b55a4a.webp).

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-8479af9c3a71af0f8cbf7dead766bf1c42021ea0222af9a3eb882ce591956d3f.webp)](images/asset-8479af9c3a71af0f8cbf7dead766bf1c42021ea0222af9a3eb882ce591956d3f.webp) | [![Edited regions on the original · white with a black border](images/asset-5cdd59e666ed03453d9c84d4b8b83427371281b6e3f1462346fe01c9a547e2b1.webp)](images/asset-5cdd59e666ed03453d9c84d4b8b83427371281b6e3f1462346fe01c9a547e2b1.webp) | [![After](images/asset-de22970135070a1d5f81ddaa0c7ae6a3c0d80ebf8121e6a615006bd1f1d8b87b.webp)](images/asset-de22970135070a1d5f81ddaa0c7ae6a3c0d80ebf8121e6a615006bd1f1d8b87b.webp) |


**Region 1 — Small black discarded cloth or glove on the foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-3e7d5b749013d61d16ff9f3fbcf1fcf990fa7da6e9de1b9d4ac7571453ef64b8.webp)](images/asset-3e7d5b749013d61d16ff9f3fbcf1fcf990fa7da6e9de1b9d4ac7571453ef64b8.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-475d37b0c371a6b22e187abe6dbdb27c2986ee76c9b6ae92a532e7308cce04bb.webp)](images/asset-475d37b0c371a6b22e187abe6dbdb27c2986ee76c9b6ae92a532e7308cce04bb.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-27e95eabb3725fc918f088f63f82181a4b46dcfb1952350aa3a125d05a6c3bab.webp)](images/asset-27e95eabb3725fc918f088f63f82181a4b46dcfb1952350aa3a125d05a6c3bab.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-860944577d467c50dcda73a3acc19d9ee90b12b32d858ca13f84b8390ee004c1.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-8479af9c3a71af0f8cbf7dead766bf1c42021ea0222af9a3eb882ce591956d3f.webp)](images/asset-8479af9c3a71af0f8cbf7dead766bf1c42021ea0222af9a3eb882ce591956d3f.webp) | [![Edited regions on the original · white with a black border](images/asset-51db35ec424956382fc5032968b033ba9db0e6f5b1363499cfdf51d28d0e0ae8.webp)](images/asset-51db35ec424956382fc5032968b033ba9db0e6f5b1363499cfdf51d28d0e0ae8.webp) | [![After](images/asset-c9c01f16fbc8ec7e9574ada547ffb7f6069e1db135d72bd5af902bfb99f1c8b5.webp)](images/asset-c9c01f16fbc8ec7e9574ada547ffb7f6069e1db135d72bd5af902bfb99f1c8b5.webp) |


**Region 1 — Small black discarded cloth or glove on the foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-34bf1f2234fab4215767891151f65f0f62fd2f4eb6fbfa776507a873edf1f844.webp)](images/asset-34bf1f2234fab4215767891151f65f0f62fd2f4eb6fbfa776507a873edf1f844.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-148205fcb282b12d3eb65f47ef37191d2565d828e207fc750fe8e3d03c04ad2d.webp)](images/asset-148205fcb282b12d3eb65f47ef37191d2565d828e207fc750fe8e3d03c04ad2d.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-c993be219280e24af6a9073542dcb0a4ceedd396160f58d14b2d499a27779e6c.webp)](images/asset-c993be219280e24af6a9073542dcb0a4ceedd396160f58d14b2d499a27779e6c.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-c227178c474247e8afd9c41b5b5bb1011897666c147040ea788d4fe5f97fc682.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-8479af9c3a71af0f8cbf7dead766bf1c42021ea0222af9a3eb882ce591956d3f.webp)](images/asset-8479af9c3a71af0f8cbf7dead766bf1c42021ea0222af9a3eb882ce591956d3f.webp) | [![Edited regions on the original · white with a black border](images/asset-69e820d1ad1d6612e1bfe93e0c5181a22ecf7804ed61ae58a759c6a01c289fff.webp)](images/asset-69e820d1ad1d6612e1bfe93e0c5181a22ecf7804ed61ae58a759c6a01c289fff.webp) | [![After](images/asset-dde91f0a01aed77ed11332237903b8027f083ecbacffa94926ef27fba2e3e421.webp)](images/asset-dde91f0a01aed77ed11332237903b8027f083ecbacffa94926ef27fba2e3e421.webp) |


**Region 1 — Purple pentagram on the light face of the pillar**

[![Before → After → Edited regions · composite close-up](images/asset-7e40de7a275879a5c4b3e04ac397b1b524b884edefcfc1ca5db6d2abec139321.webp)](images/asset-7e40de7a275879a5c4b3e04ac397b1b524b884edefcfc1ca5db6d2abec139321.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-3ad0dae73ff3748a7bb573b07374d465050ec686fc4e2de3edf0555f01c7d3bc.webp)](images/asset-3ad0dae73ff3748a7bb573b07374d465050ec686fc4e2de3edf0555f01c7d3bc.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-7ee28b37079c4cfa98c6a085e68ac629bcc20016026b381db3fc7c2a7ffa1814.webp)](images/asset-7ee28b37079c4cfa98c6a085e68ac629bcc20016026b381db3fc7c2a7ffa1814.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-311b3671f47c8d3593d2bdf404b0847f7ecc9c9cb7b8e95e71ff95c9eff10e32.webp).

### Clone stamp and generative AI · mixed version

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-8479af9c3a71af0f8cbf7dead766bf1c42021ea0222af9a3eb882ce591956d3f.webp)](images/asset-8479af9c3a71af0f8cbf7dead766bf1c42021ea0222af9a3eb882ce591956d3f.webp) | [![Edited regions on the original · white with a black border](images/asset-f01791ba10b958d83477854d43610eb42afd298f346a4e32e34b52cd0b3db0c4.webp)](images/asset-f01791ba10b958d83477854d43610eb42afd298f346a4e32e34b52cd0b3db0c4.webp) | [![After](images/asset-b203f2c775048cbca7e511558df95f4a7f57032a045744213633bda8c728f991.webp)](images/asset-b203f2c775048cbca7e511558df95f4a7f57032a045744213633bda8c728f991.webp) |


**Region 1 — Small black discarded cloth or glove on the foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-34bf1f2234fab4215767891151f65f0f62fd2f4eb6fbfa776507a873edf1f844.webp)](images/asset-34bf1f2234fab4215767891151f65f0f62fd2f4eb6fbfa776507a873edf1f844.webp)

**Region 2 — Purple pentagram on the light face of the pillar**

[![Before → After → Edited regions · composite close-up](images/asset-7e40de7a275879a5c4b3e04ac397b1b524b884edefcfc1ca5db6d2abec139321.webp)](images/asset-7e40de7a275879a5c4b3e04ac397b1b524b884edefcfc1ca5db6d2abec139321.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-108f7af027bbbda0a430cb0906632b424a3e05fd652f28cce782a88a59f8a8e2.webp)](images/asset-108f7af027bbbda0a430cb0906632b424a3e05fd652f28cce782a88a59f8a8e2.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-0b69c9f8942b11c419a3f4fa7fb1f73fcf04c55cd9ec5fe8695944332797888c.webp)](images/asset-0b69c9f8942b11c419a3f4fa7fb1f73fcf04c55cd9ec5fe8695944332797888c.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-4e84f20cb1c16c7bd302e1dc32ff0c9adc7af870ccf2c420cce19fdc6ab313a6.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-8479af9c3a71af0f8cbf7dead766bf1c42021ea0222af9a3eb882ce591956d3f.webp)](images/asset-8479af9c3a71af0f8cbf7dead766bf1c42021ea0222af9a3eb882ce591956d3f.webp) | [![RITA · flagged area: 3.71%](images/asset-8a8a046b978431d2c19d199bb34ecc69150dc21f522fc76693b901eda6b299fa.webp)](images/asset-8a8a046b978431d2c19d199bb34ecc69150dc21f522fc76693b901eda6b299fa.webp) | [![TruFor · flagged area: 1.60%](images/asset-0088edeb6d778c0091f35c5795068806f9e831bd73d3572b433623ba9c3e331f.webp)](images/asset-0088edeb6d778c0091f35c5795068806f9e831bd73d3572b433623ba9c3e331f.webp) |

[Official RITA control map · 512 × 512](images/asset-72137d8aba1e026190028c3c64f14589cdc61af47553317b3414e42efaaa2d52.webp).

## 2022-dsc0896_260522

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-4de8b6e78d6cde04a3dc95a710872567178ad294e98f60a2e46648bab224713b.webp)](images/asset-4de8b6e78d6cde04a3dc95a710872567178ad294e98f60a2e46648bab224713b.webp) | [![Edited regions on the original · white with a black border](images/asset-00555b80aaf954c61408455eb0464a122dabf0216e35f8f4a6a6c34350920e87.webp)](images/asset-00555b80aaf954c61408455eb0464a122dabf0216e35f8f4a6a6c34350920e87.webp) | [![After](images/asset-2885eeebf17726675afee561e00b47e3d678a2aea90072030c924239d22b86ee.webp)](images/asset-2885eeebf17726675afee561e00b47e3d678a2aea90072030c924239d22b86ee.webp) |


**Region 1 — Right-hand small black metal stub in a pair on the ceiling**

[![Before → After → Edited regions · composite close-up](images/asset-6085f3a776d3e6d77d6a2ab830d832488e4ed9ae1041da72f3c0788705d41a3c.webp)](images/asset-6085f3a776d3e6d77d6a2ab830d832488e4ed9ae1041da72f3c0788705d41a3c.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-1357460d767a0d43a996d9d3a5908ab24ffdaf19670288264dd39e4d2cb6062b.webp)](images/asset-1357460d767a0d43a996d9d3a5908ab24ffdaf19670288264dd39e4d2cb6062b.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-30391a032a9b2c9d26f64862aed78834c79ebd66ff8faf44f3c6304b0fa3ae45.webp)](images/asset-30391a032a9b2c9d26f64862aed78834c79ebd66ff8faf44f3c6304b0fa3ae45.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-929392e55f9a14a7f7f58551497f25ca60afb610d18a1b4ce0739abfbeafe79b.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-4de8b6e78d6cde04a3dc95a710872567178ad294e98f60a2e46648bab224713b.webp)](images/asset-4de8b6e78d6cde04a3dc95a710872567178ad294e98f60a2e46648bab224713b.webp) | [![Edited regions on the original · white with a black border](images/asset-0eace813b0a77a6e464a83b6e93d0dd198abd7c937f13f1742c437afc057ce88.webp)](images/asset-0eace813b0a77a6e464a83b6e93d0dd198abd7c937f13f1742c437afc057ce88.webp) | [![After](images/asset-a2bad7f573f3b35f68a7f60cd6feeed9289a59d44147e751025c3f1c7bea5a2b.webp)](images/asset-a2bad7f573f3b35f68a7f60cd6feeed9289a59d44147e751025c3f1c7bea5a2b.webp) |


**Region 1 — Right-hand small black metal stub in a pair on the ceiling**

[![Before → After → Edited regions · composite close-up](images/asset-927a472fb4c186c749b344a6f5acd81194dfb377b970190371652bd99a577c93.webp)](images/asset-927a472fb4c186c749b344a6f5acd81194dfb377b970190371652bd99a577c93.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-cf562e615a3bd0eb3346ab54788cc1c13ce3fe9e355ed5ff5eab68bbbb547ac6.webp)](images/asset-cf562e615a3bd0eb3346ab54788cc1c13ce3fe9e355ed5ff5eab68bbbb547ac6.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-9e360f80bd0933492849825c1f7a6fc7c28853532194622a1a076e309f0abef6.webp)](images/asset-9e360f80bd0933492849825c1f7a6fc7c28853532194622a1a076e309f0abef6.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-252e531e7fbbf41cad63bb7c48ed51fb5c000e1ec53dbc3b3fdaf48ba21a9d53.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-4de8b6e78d6cde04a3dc95a710872567178ad294e98f60a2e46648bab224713b.webp)](images/asset-4de8b6e78d6cde04a3dc95a710872567178ad294e98f60a2e46648bab224713b.webp) | [![Edited regions on the original · white with a black border](images/asset-3646b2644c2ed607260fbe4c02342beb0578b22986e087109350b19c017b29bf.webp)](images/asset-3646b2644c2ed607260fbe4c02342beb0578b22986e087109350b19c017b29bf.webp) | [![After](images/asset-c39a097dd4b66fc69f91ef06154971c0a62893d16c06e338d7781a8c3b24e575.webp)](images/asset-c39a097dd4b66fc69f91ef06154971c0a62893d16c06e338d7781a8c3b24e575.webp) |


**Region 1 — Two large loops of black paint on the right wall**

[![Before → After → Edited regions · composite close-up](images/asset-2ce5b8897d239d553b6712d4bafefaf0e36fe666b6688d4b39e9c76091a89608.webp)](images/asset-2ce5b8897d239d553b6712d4bafefaf0e36fe666b6688d4b39e9c76091a89608.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-f91c79287cafd032047f3a293839ceb6d362c81a18e94c9bf33a73ababa212c2.webp)](images/asset-f91c79287cafd032047f3a293839ceb6d362c81a18e94c9bf33a73ababa212c2.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-069996d74b90f9c2d7b50959c441f5894eba8fe75cd963b5beb8956256f0cd3a.webp)](images/asset-069996d74b90f9c2d7b50959c441f5894eba8fe75cd963b5beb8956256f0cd3a.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-d8c05fb397301debdd093788d64048d10af2e7a6529b8633f1cd71b67fdb4049.webp).

### Clone stamp and generative AI · mixed version

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-4de8b6e78d6cde04a3dc95a710872567178ad294e98f60a2e46648bab224713b.webp)](images/asset-4de8b6e78d6cde04a3dc95a710872567178ad294e98f60a2e46648bab224713b.webp) | [![Edited regions on the original · white with a black border](images/asset-7dafdd7c2ff651df56ae0700166674c41c0f2c7fe7c41176966ccd6331edd706.webp)](images/asset-7dafdd7c2ff651df56ae0700166674c41c0f2c7fe7c41176966ccd6331edd706.webp) | [![After](images/asset-23d70b334e5cf3b94499a269f37c5bb461d883694c580d6ec210540b9d0c8e4d.webp)](images/asset-23d70b334e5cf3b94499a269f37c5bb461d883694c580d6ec210540b9d0c8e4d.webp) |


**Region 1 — Right-hand small black metal stub in a pair on the ceiling**

[![Before → After → Edited regions · composite close-up](images/asset-927a472fb4c186c749b344a6f5acd81194dfb377b970190371652bd99a577c93.webp)](images/asset-927a472fb4c186c749b344a6f5acd81194dfb377b970190371652bd99a577c93.webp)

**Region 2 — Two large loops of black paint on the right wall**

[![Before → After → Edited regions · composite close-up](images/asset-2ce5b8897d239d553b6712d4bafefaf0e36fe666b6688d4b39e9c76091a89608.webp)](images/asset-2ce5b8897d239d553b6712d4bafefaf0e36fe666b6688d4b39e9c76091a89608.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-4781df22076a5853b18a3a457aa94a5249e330197dca6c43be8fea0d75a3cd5a.webp)](images/asset-4781df22076a5853b18a3a457aa94a5249e330197dca6c43be8fea0d75a3cd5a.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-fa47914144384e610448178f053e630afdada99eb10fc220bbb9bf9d21c15668.webp)](images/asset-fa47914144384e610448178f053e630afdada99eb10fc220bbb9bf9d21c15668.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-1cd737757224e11a131bf5d65b7656e1d702d669cea9aa482ea9587944353708.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-4de8b6e78d6cde04a3dc95a710872567178ad294e98f60a2e46648bab224713b.webp)](images/asset-4de8b6e78d6cde04a3dc95a710872567178ad294e98f60a2e46648bab224713b.webp) | [![RITA · flagged area: 1.74%](images/asset-669c9e1e246aae8f6e93b1a12c64b2011df8eccc4ee7482f9670a256db0df248.webp)](images/asset-669c9e1e246aae8f6e93b1a12c64b2011df8eccc4ee7482f9670a256db0df248.webp) | [![TruFor · flagged area: 3.04%](images/asset-88b74aedc5bcefce32be8c9fcf77cfc3431c9cf062f87ad0add1484c21a8723c.webp)](images/asset-88b74aedc5bcefce32be8c9fcf77cfc3431c9cf062f87ad0add1484c21a8723c.webp) |

[Official RITA control map · 512 × 512](images/asset-b2b70b01fdb92e70dce75646dd70686a44f9c63ae126e13a258573831dd52eb0.webp).

## 2022-dsc0902_260522

### Clone stamp · five regions

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-1c4e99b0a10de68f836b0fb45619aa5b37346f7e266cf47ec525d53fd8ae797a.webp)](images/asset-1c4e99b0a10de68f836b0fb45619aa5b37346f7e266cf47ec525d53fd8ae797a.webp) | [![Edited regions on the original · white with a black border](images/asset-5236875d74ac540bb21e6df33a685893b8aa87f5a11c3da984434194be532e88.webp)](images/asset-5236875d74ac540bb21e6df33a685893b8aa87f5a11c3da984434194be532e88.webp) | [![After](images/asset-3828272b9d4722d6f940aa73e122ce9a1641b53ce56860eb4d3d2a63fd404d25.webp)](images/asset-3828272b9d4722d6f940aa73e122ce9a1641b53ce56860eb4d3d2a63fd404d25.webp) |


**Region 1 — Whole rusty T-shaped ceiling support**

[![Before → After → Edited regions · composite close-up](images/asset-7ccc4d53ee9754b7c75d00cab86dc37c9f10447d5c5c78d7f446457f98ba1bd3.webp)](images/asset-7ccc4d53ee9754b7c75d00cab86dc37c9f10447d5c5c78d7f446457f98ba1bd3.webp)

**Region 2 — Whole red and white painted X on the front pillar**

[![Before → After → Edited regions · composite close-up](images/asset-3891254bb29105e843e5e99dc974294d0a71df84a69704a45236593001e1490a.webp)](images/asset-3891254bb29105e843e5e99dc974294d0a71df84a69704a45236593001e1490a.webp)

**Region 3 — Small complete blue plastic ring on the left floor**

[![Before → After → Edited regions · composite close-up](images/asset-ee1cf5c6330261db1dd4576250acc68a09b29b8b2074d0eeafd21e201c311411.webp)](images/asset-ee1cf5c6330261db1dd4576250acc68a09b29b8b2074d0eeafd21e201c311411.webp)

**Region 4 — Whole black discarded cloth or glove on the lower-left floor**

[![Before → After → Edited regions · composite close-up](images/asset-772e81a98f7d9e5d6b855da47a6bcd12512a0ea77594948b0393d46214bc1aa0.webp)](images/asset-772e81a98f7d9e5d6b855da47a6bcd12512a0ea77594948b0393d46214bc1aa0.webp)

**Region 5 — Whole thin discarded white strip on the lower foreground floor**

[![Before → After → Edited regions · composite close-up](images/asset-37938134a04f1a8bcc9c279755d6aa5a35c2d6f24a0ab03e894583fe3c398208.webp)](images/asset-37938134a04f1a8bcc9c279755d6aa5a35c2d6f24a0ab03e894583fe3c398208.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-bad2398d20bd2db70aaa4cd773183dd5a618617a44355bd3e2cacade7ca1921c.webp)](images/asset-bad2398d20bd2db70aaa4cd773183dd5a618617a44355bd3e2cacade7ca1921c.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-d2688ce71786a1412d6a450ec6307a1d27330217b88e1e64be1abd1652ad390b.webp)](images/asset-d2688ce71786a1412d6a450ec6307a1d27330217b88e1e64be1abd1652ad390b.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-a352264fc11e01c301906215d4f4c2014ec99ae9d20ecbdab933247d03e7cca8.webp).

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-1c4e99b0a10de68f836b0fb45619aa5b37346f7e266cf47ec525d53fd8ae797a.webp)](images/asset-1c4e99b0a10de68f836b0fb45619aa5b37346f7e266cf47ec525d53fd8ae797a.webp) | [![Edited regions on the original · white with a black border](images/asset-e5140abcd66e74fb3eae156784ae161e13f3ce2f5309397240c58c54d4ec6206.webp)](images/asset-e5140abcd66e74fb3eae156784ae161e13f3ce2f5309397240c58c54d4ec6206.webp) | [![After](images/asset-5aae9952c34108c8f9a97b67d5aebf0c99a1791605d621f9d8ff385cdeae8d4f.webp)](images/asset-5aae9952c34108c8f9a97b67d5aebf0c99a1791605d621f9d8ff385cdeae8d4f.webp) |


**Region 1 — Rusty T-shaped metal bracket projecting from the ceiling**

[![Before → After → Edited regions · composite close-up](images/asset-9c8a771d356feb52b0fb67da09e19500077514933cdca7a0a4a9a9df64dbf04b.webp)](images/asset-9c8a771d356feb52b0fb67da09e19500077514933cdca7a0a4a9a9df64dbf04b.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-dc0389919566cb4f48a697eb7136b9ff0917b7db66e486f5e27849e2468ad623.webp)](images/asset-dc0389919566cb4f48a697eb7136b9ff0917b7db66e486f5e27849e2468ad623.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-74400c0182727424bf8af573ac934e53852da6f8142a8902a067527c3944602f.webp)](images/asset-74400c0182727424bf8af573ac934e53852da6f8142a8902a067527c3944602f.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-66b6a37eed821507151bac869744441b251f54bb6b34fc5e60894aeb962a3a8b.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-1c4e99b0a10de68f836b0fb45619aa5b37346f7e266cf47ec525d53fd8ae797a.webp)](images/asset-1c4e99b0a10de68f836b0fb45619aa5b37346f7e266cf47ec525d53fd8ae797a.webp) | [![Edited regions on the original · white with a black border](images/asset-dcc2d0b564084a84d16509f328f3271c1bd2fe5d857cd30132a49d7ef2e491fc.webp)](images/asset-dcc2d0b564084a84d16509f328f3271c1bd2fe5d857cd30132a49d7ef2e491fc.webp) | [![After](images/asset-eba6b796b390201c125e203c49458ff4e1b8bf8ebd8c8a241b5400902877d4c0.webp)](images/asset-eba6b796b390201c125e203c49458ff4e1b8bf8ebd8c8a241b5400902877d4c0.webp) |


**Region 1 — Rusty T-shaped metal bracket projecting from the ceiling**

[![Before → After → Edited regions · composite close-up](images/asset-ef8df1b9c4b0b5b50d67a9b954cda392cf8468cfd2f720205a8c3e853ef73864.webp)](images/asset-ef8df1b9c4b0b5b50d67a9b954cda392cf8468cfd2f720205a8c3e853ef73864.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-6d873e4b0722ce9c2adbe45c45fabda95cb7f6716f8d3c879bbcde21ad75b838.webp)](images/asset-6d873e4b0722ce9c2adbe45c45fabda95cb7f6716f8d3c879bbcde21ad75b838.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-052a29f45d98528ff0121de837dc929fe68f0d34eb29927df61406c7c2bcb811.webp)](images/asset-052a29f45d98528ff0121de837dc929fe68f0d34eb29927df61406c7c2bcb811.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-4904c236b9bef864e3e97f5a951a563b9a5606ef58bb90a217a7fa688393eb82.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-1c4e99b0a10de68f836b0fb45619aa5b37346f7e266cf47ec525d53fd8ae797a.webp)](images/asset-1c4e99b0a10de68f836b0fb45619aa5b37346f7e266cf47ec525d53fd8ae797a.webp) | [![Edited regions on the original · white with a black border](images/asset-ae2338692722d5136a75cc9d145bb1f6e130066f6fa4e3a8a3904c50e617d4c3.webp)](images/asset-ae2338692722d5136a75cc9d145bb1f6e130066f6fa4e3a8a3904c50e617d4c3.webp) | [![After](images/asset-87c625a2c3e4b2bd167041e5d3c9ccc684b90785d30ad9d46fbf53d4cbb6c3d7.webp)](images/asset-87c625a2c3e4b2bd167041e5d3c9ccc684b90785d30ad9d46fbf53d4cbb6c3d7.webp) |


**Region 1 — Blue drawing of a person on the rear wall on the right**

[![Before → After → Edited regions · composite close-up](images/asset-506605733216c31190a73c57c66e1cecbfe8404ac54ad9f375b007cb67acb62b.webp)](images/asset-506605733216c31190a73c57c66e1cecbfe8404ac54ad9f375b007cb67acb62b.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-770f512f2a7387376513c84c33c39d8f8c137acabe2814803413747e009d1a52.webp)](images/asset-770f512f2a7387376513c84c33c39d8f8c137acabe2814803413747e009d1a52.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-933ea106eeb9a58bdef83aade919dd06e1e29c06068b4b17ef24c6edadf174ec.webp)](images/asset-933ea106eeb9a58bdef83aade919dd06e1e29c06068b4b17ef24c6edadf174ec.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-db605de2af4adcd28da0411e9b52494795d97875bcb820ffd54b5305c6f51e93.webp).

### Generative AI · attempt 2

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-1c4e99b0a10de68f836b0fb45619aa5b37346f7e266cf47ec525d53fd8ae797a.webp)](images/asset-1c4e99b0a10de68f836b0fb45619aa5b37346f7e266cf47ec525d53fd8ae797a.webp) | [![Edited regions on the original · white with a black border](images/asset-34da334a6da075fbc4a17e60f93e3a1a6adeb90ed2b288cba24daa8ec82db22d.webp)](images/asset-34da334a6da075fbc4a17e60f93e3a1a6adeb90ed2b288cba24daa8ec82db22d.webp) | [![After](images/asset-4e2a1e86b4eabe49842008a940c3655ff0cf389b95d0b1756de2b4db39add617.webp)](images/asset-4e2a1e86b4eabe49842008a940c3655ff0cf389b95d0b1756de2b4db39add617.webp) |


**Region 1 — Blue drawing of a person on the rear wall on the right**

[![Before → After → Edited regions · composite close-up](images/asset-ed72284c4255c4ec5135886e45791caa10ad3d9ee3890fd94f9fcba435d26e40.webp)](images/asset-ed72284c4255c4ec5135886e45791caa10ad3d9ee3890fd94f9fcba435d26e40.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-101f8465a11218a06d065bbed153c1594ece3e122b2d7fde6b8809350badb81d.webp)](images/asset-101f8465a11218a06d065bbed153c1594ece3e122b2d7fde6b8809350badb81d.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-45a374361402cfdb13d2d6da9a3fc87e4315d8bc82bcf2378816068ad568ccd1.webp)](images/asset-45a374361402cfdb13d2d6da9a3fc87e4315d8bc82bcf2378816068ad568ccd1.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-e72f728c2f7cd60d458fcf064cce36382a9bc33e8f2c8877616fff06d6f872d1.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-1c4e99b0a10de68f836b0fb45619aa5b37346f7e266cf47ec525d53fd8ae797a.webp)](images/asset-1c4e99b0a10de68f836b0fb45619aa5b37346f7e266cf47ec525d53fd8ae797a.webp) | [![RITA · flagged area: 14.01%](images/asset-535fcd76d556c703c2c773783e8d90d0aab8ab9e29485c3b775c76ae6b2d16c0.webp)](images/asset-535fcd76d556c703c2c773783e8d90d0aab8ab9e29485c3b775c76ae6b2d16c0.webp) | [![TruFor · flagged area: 0.34%](images/asset-42705269ffd8e6b8df65358d1661f214b792aed1600ee4fa29104d32f17aad44.webp)](images/asset-42705269ffd8e6b8df65358d1661f214b792aed1600ee4fa29104d32f17aad44.webp) |

[Official RITA control map · 512 × 512](images/asset-ab06940c0b12ca3980000f15cb41303f4d2ae24c158f4f2ee9264bfa847512b5.webp).

## 2022-dsc7622_310822

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-30a47c9449c66367cdccc9edf36886f45fddd95acddca8669d322d1c4efe3e59.webp)](images/asset-30a47c9449c66367cdccc9edf36886f45fddd95acddca8669d322d1c4efe3e59.webp) | [![Edited regions on the original · white with a black border](images/asset-e9c52ae37802f2498ae16d88f90addf9e97675d674226c9a3dfb5f80794ed161.webp)](images/asset-e9c52ae37802f2498ae16d88f90addf9e97675d674226c9a3dfb5f80794ed161.webp) | [![After](images/asset-536d6e9de4f486d6b58ff9b81d0ffce6c211032d858718aa0d18741cad3c35f0.webp)](images/asset-536d6e9de4f486d6b58ff9b81d0ffce6c211032d858718aa0d18741cad3c35f0.webp) |


**Region 1 — Thin upright bright-green grass blade immediately behind the grasshopper head**

[![Before → After → Edited regions · composite close-up](images/asset-e1370e8cd276cf0ab9c794de78401eafee35f01ee48595880092a28e447365a4.webp)](images/asset-e1370e8cd276cf0ab9c794de78401eafee35f01ee48595880092a28e447365a4.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-88ce2fea6a76b1c59b06c020b9ef98b9c7fe13a1eb7ff5fd1815ab4d61c159ad.webp)](images/asset-88ce2fea6a76b1c59b06c020b9ef98b9c7fe13a1eb7ff5fd1815ab4d61c159ad.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-085b1cc164b3e104f63f9cd58fe4900595785c83ff73c7c6e8ddf1a8e02a3d14.webp)](images/asset-085b1cc164b3e104f63f9cd58fe4900595785c83ff73c7c6e8ddf1a8e02a3d14.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-d1d7ded272011df810492d4d0b6a00cebe4af9324fe478c4b2077ea634e8522b.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-30a47c9449c66367cdccc9edf36886f45fddd95acddca8669d322d1c4efe3e59.webp)](images/asset-30a47c9449c66367cdccc9edf36886f45fddd95acddca8669d322d1c4efe3e59.webp) | [![Edited regions on the original · white with a black border](images/asset-49b35a1e12a0e65e5438ea501d07a8f31fc8e86fbaed686379f9e7acbe4ce5a3.webp)](images/asset-49b35a1e12a0e65e5438ea501d07a8f31fc8e86fbaed686379f9e7acbe4ce5a3.webp) | [![After](images/asset-9b01ce84ade81e292cbe4de91885ba0dce9dd50d015713afec893f39d0bd243f.webp)](images/asset-9b01ce84ade81e292cbe4de91885ba0dce9dd50d015713afec893f39d0bd243f.webp) |


**Region 1 — Thin upright bright-green grass blade immediately behind the grasshopper head**

[![Before → After → Edited regions · composite close-up](images/asset-632075fc329325986da2d5f44658c7c3145dbe838e2d2e4ca517c48e9415a2dd.webp)](images/asset-632075fc329325986da2d5f44658c7c3145dbe838e2d2e4ca517c48e9415a2dd.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-cc1f5c3ae5fe8c5207f2e91405fcd672cd2ff72f1f8728cd5024354b6e399638.webp)](images/asset-cc1f5c3ae5fe8c5207f2e91405fcd672cd2ff72f1f8728cd5024354b6e399638.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-76218ab824e903de05813dc286f5234cd86d0f7573843bfcb5d2e86efc8b51d9.webp)](images/asset-76218ab824e903de05813dc286f5234cd86d0f7573843bfcb5d2e86efc8b51d9.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-ec53f715ba0da5c5e1ac259118ae2a47db838ef14d7c80bec63a3990f6b4cf14.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-30a47c9449c66367cdccc9edf36886f45fddd95acddca8669d322d1c4efe3e59.webp)](images/asset-30a47c9449c66367cdccc9edf36886f45fddd95acddca8669d322d1c4efe3e59.webp) | [![Edited regions on the original · white with a black border](images/asset-036afa4d1e010638234298d9ae764ad6143e4b4b3f9dc9568a7551d961de3e30.webp)](images/asset-036afa4d1e010638234298d9ae764ad6143e4b4b3f9dc9568a7551d961de3e30.webp) | [![After](images/asset-1f92af18628cc5fcb8023f00f3f16e4c182f19f5fadac139b3b78bd14f391ee9.webp)](images/asset-1f92af18628cc5fcb8023f00f3f16e4c182f19f5fadac139b3b78bd14f391ee9.webp) |


**Region 1 — Pale dry vertical stem on the left, throughout its visible extent**

[![Before → After → Edited regions · composite close-up](images/asset-c330428ed3a83942ce8f3c2d4117d0bfe42a0dfd52134c7843766f3d87cbdb23.webp)](images/asset-c330428ed3a83942ce8f3c2d4117d0bfe42a0dfd52134c7843766f3d87cbdb23.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-458d53c917674e873341ed150a74c56802d7dbe96b39c972edf4613e0c2715cb.webp)](images/asset-458d53c917674e873341ed150a74c56802d7dbe96b39c972edf4613e0c2715cb.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-1fa44c2b34e02c439b6a32d451be67b7d52621e0087efb3a21da43b3a8e673ea.webp)](images/asset-1fa44c2b34e02c439b6a32d451be67b7d52621e0087efb3a21da43b3a8e673ea.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-28c8dc5720d9d19ce5d04e00897315fe9e8594e44ac568841d00f1572bec32a4.webp).

### Generative AI · attempt 2

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-30a47c9449c66367cdccc9edf36886f45fddd95acddca8669d322d1c4efe3e59.webp)](images/asset-30a47c9449c66367cdccc9edf36886f45fddd95acddca8669d322d1c4efe3e59.webp) | [![Edited regions on the original · white with a black border](images/asset-5e032a88399e7ff1481fa0438b09255075c88249f4153ceffcf1dca8e1452f43.webp)](images/asset-5e032a88399e7ff1481fa0438b09255075c88249f4153ceffcf1dca8e1452f43.webp) | [![After](images/asset-4b0327ead4bfda0f3d0e48773280093f976683fb62a154b132e94074a44648f8.webp)](images/asset-4b0327ead4bfda0f3d0e48773280093f976683fb62a154b132e94074a44648f8.webp) |


**Region 1 — Pale dry vertical stem on the left, throughout its visible extent**

[![Before → After → Edited regions · composite close-up](images/asset-6e3a5c94d4b84ad4f7e73aa317d9c8c7402f70f04dd400b2c617578e1245b263.webp)](images/asset-6e3a5c94d4b84ad4f7e73aa317d9c8c7402f70f04dd400b2c617578e1245b263.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-5bbd7ee19107af6617be884441d6757ea98e15b801b8276cd2b6c9fae349b9fe.webp)](images/asset-5bbd7ee19107af6617be884441d6757ea98e15b801b8276cd2b6c9fae349b9fe.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-74a4389e102e40ab7d9610944851d034611fb6a0534b1ac4d38675126b8dff5f.webp)](images/asset-74a4389e102e40ab7d9610944851d034611fb6a0534b1ac4d38675126b8dff5f.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-4c904de389a5ea7daf4fd994f7e7068c761d7685732abe856d8783ba1841f116.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-30a47c9449c66367cdccc9edf36886f45fddd95acddca8669d322d1c4efe3e59.webp)](images/asset-30a47c9449c66367cdccc9edf36886f45fddd95acddca8669d322d1c4efe3e59.webp) | [![RITA · flagged area: 1.28%](images/asset-45fe80c228660bbca224cfe906f98538d8de781a51e5ff2dd6d9f456a8182f54.webp)](images/asset-45fe80c228660bbca224cfe906f98538d8de781a51e5ff2dd6d9f456a8182f54.webp) | [![TruFor · flagged area: 1.70%](images/asset-6d674fd15f00b06c2550b9cdecf793e35d8513a14720b1931c602020615467d0.webp)](images/asset-6d674fd15f00b06c2550b9cdecf793e35d8513a14720b1931c602020615467d0.webp) |

[Official RITA control map · 512 × 512](images/asset-982811da45ca57c334b9bdb1ea4a2d90493a80a3eb24529136e844b0dc1f0cb5.webp).

## 2022-dsc7634_310822

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-dc63538b735475cb6946c7cb13c3c1a4fd04e0070c97012c645a3173734e8863.webp)](images/asset-dc63538b735475cb6946c7cb13c3c1a4fd04e0070c97012c645a3173734e8863.webp) | [![Edited regions on the original · white with a black border](images/asset-6e0db5d1f96f69a9cc92b4bbcc70f13cf5f4222791ba3ecb8bd7356438658e4c.webp)](images/asset-6e0db5d1f96f69a9cc92b4bbcc70f13cf5f4222791ba3ecb8bd7356438658e4c.webp) | [![After](images/asset-e85e6038a4396ca36dbbf76bb02db9a9ca8debdd9adff6412b7fe2949654d323.webp)](images/asset-e85e6038a4396ca36dbbf76bb02db9a9ca8debdd9adff6412b7fe2949654d323.webp) |


**Region 1 — Whole grasshopper, including its visible antennae and legs**

[![Before → After → Edited regions · composite close-up](images/asset-2348487b49c6e47e800fd985dc64ac147ac87565a0c5f186f6776c1645957e65.webp)](images/asset-2348487b49c6e47e800fd985dc64ac147ac87565a0c5f186f6776c1645957e65.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-f92986e2ba8ca1820e975246500417ed4220e8f42a911d57606e9d56c4470532.webp)](images/asset-f92986e2ba8ca1820e975246500417ed4220e8f42a911d57606e9d56c4470532.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-aa0830e6e8b0ef5934179516ba26bc6c886f649c71c6b88061be2a8a1184a19c.webp)](images/asset-aa0830e6e8b0ef5934179516ba26bc6c886f649c71c6b88061be2a8a1184a19c.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-4e93ce808678ad5ab441df15bbb08202a5fd673c8b5088edad3d6c990d3ba581.webp).

### Generative AI · attempt 2

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-dc63538b735475cb6946c7cb13c3c1a4fd04e0070c97012c645a3173734e8863.webp)](images/asset-dc63538b735475cb6946c7cb13c3c1a4fd04e0070c97012c645a3173734e8863.webp) | [![Edited regions on the original · white with a black border](images/asset-c5da2d6900344b7968ce779c0233385791a6ed5f247e9c9eff88697dedced4b7.webp)](images/asset-c5da2d6900344b7968ce779c0233385791a6ed5f247e9c9eff88697dedced4b7.webp) | [![After](images/asset-eab9857d40bb57eac7fd0f012f85f8feef7efe529fb8dccd97ac38df60c5cd69.webp)](images/asset-eab9857d40bb57eac7fd0f012f85f8feef7efe529fb8dccd97ac38df60c5cd69.webp) |


**Region 1 — Whole grasshopper, including its visible antennae and legs**

[![Before → After → Edited regions · composite close-up](images/asset-8dcadbde4015b6158ae50fb335c9584db04722c1e69fb2529a5327bab7340706.webp)](images/asset-8dcadbde4015b6158ae50fb335c9584db04722c1e69fb2529a5327bab7340706.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-0f04aa3febd79bc803733de2cc23e2f57f62226dbf99a1fe7384b1cab497ba68.webp)](images/asset-0f04aa3febd79bc803733de2cc23e2f57f62226dbf99a1fe7384b1cab497ba68.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-633c574030edd92d967c96b6f5b879255ff2cbd2a0ac70cd37b2504dc7da60ea.webp)](images/asset-633c574030edd92d967c96b6f5b879255ff2cbd2a0ac70cd37b2504dc7da60ea.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-4da25ef48dba85c5fc104ca3de84bfb124144f99e17c756696d85493d787de2e.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-dc63538b735475cb6946c7cb13c3c1a4fd04e0070c97012c645a3173734e8863.webp)](images/asset-dc63538b735475cb6946c7cb13c3c1a4fd04e0070c97012c645a3173734e8863.webp) | [![RITA · flagged area: 4.24%](images/asset-fdecaa077f2decea476cd0d03622efbb7a4dc69d76e72ca57dd8877a5c6eccad.webp)](images/asset-fdecaa077f2decea476cd0d03622efbb7a4dc69d76e72ca57dd8877a5c6eccad.webp) | [![TruFor · flagged area: 2.24%](images/asset-46200f517ed027e6aca87179c009b6e74070ef127120ede3acc284f4b77d90f2.webp)](images/asset-46200f517ed027e6aca87179c009b6e74070ef127120ede3acc284f4b77d90f2.webp) |

[Official RITA control map · 512 × 512](images/asset-1e33ef62cb872410c4b3958542013544dcc67aaa5b8dbb88a43925fbad182a4c.webp).

## 2022-dsc7637_310822

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-9a05629c04ec127698061632dc0564a871ff9dc9fd0bafbf3cd6359a31ecbd92.webp)](images/asset-9a05629c04ec127698061632dc0564a871ff9dc9fd0bafbf3cd6359a31ecbd92.webp) | [![Edited regions on the original · white with a black border](images/asset-efa047dd61b69f17652f92ea13888c05b67f18fb824aabee9bb828460ed3eca0.webp)](images/asset-efa047dd61b69f17652f92ea13888c05b67f18fb824aabee9bb828460ed3eca0.webp) | [![After](images/asset-a07a4adff08199b5ee7ea6fdc553825c8eeb87813ce12e63636cb16470c98cf0.webp)](images/asset-a07a4adff08199b5ee7ea6fdc553825c8eeb87813ce12e63636cb16470c98cf0.webp) |


**Region 1 — Small brown insect on the dry leaf, including its appendages**

[![Before → After → Edited regions · composite close-up](images/asset-db8c8cd47d18e7be1d7ae5081d2d4c6d8d8fdcfa1e908b85f58c8e973044c72c.webp)](images/asset-db8c8cd47d18e7be1d7ae5081d2d4c6d8d8fdcfa1e908b85f58c8e973044c72c.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-6484ae311ceafaef7ffbee5a72bd96649a6cb8de5f1361948653fe810fc80e99.webp)](images/asset-6484ae311ceafaef7ffbee5a72bd96649a6cb8de5f1361948653fe810fc80e99.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-b69048f78fcce792f7067672413d54e863f53d743d506ea3e76649fbf6289ebf.webp)](images/asset-b69048f78fcce792f7067672413d54e863f53d743d506ea3e76649fbf6289ebf.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-cd10ff353134b69aae26dfdf213653a9e11ecaa2593579d79859fc44bd12e2fa.webp).

### Generative AI · attempt 2

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-9a05629c04ec127698061632dc0564a871ff9dc9fd0bafbf3cd6359a31ecbd92.webp)](images/asset-9a05629c04ec127698061632dc0564a871ff9dc9fd0bafbf3cd6359a31ecbd92.webp) | [![Edited regions on the original · white with a black border](images/asset-a5fc976aa6eba553e5582bcc9ca5d20adcc78955c501122fc2e2f1a8f9251766.webp)](images/asset-a5fc976aa6eba553e5582bcc9ca5d20adcc78955c501122fc2e2f1a8f9251766.webp) | [![After](images/asset-fc5d4ced8d49431376882f9d1710cebb36de30c922aaf2afe264640a658e85e6.webp)](images/asset-fc5d4ced8d49431376882f9d1710cebb36de30c922aaf2afe264640a658e85e6.webp) |


**Region 1 — Small brown insect on the dry leaf, including its appendages**

[![Before → After → Edited regions · composite close-up](images/asset-fe63920d552ae78d2e6dab2517bc40b0f3896ffc558031a644f3ec3570ba8412.webp)](images/asset-fe63920d552ae78d2e6dab2517bc40b0f3896ffc558031a644f3ec3570ba8412.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-0f0dc310382865dcd6c74af01eccdca503373890c1e0595d60a033f335715ea7.webp)](images/asset-0f0dc310382865dcd6c74af01eccdca503373890c1e0595d60a033f335715ea7.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-75940d25df454ae2b1f225cbd52bbeaf48257fa013e679eed9e9941b47b2f985.webp)](images/asset-75940d25df454ae2b1f225cbd52bbeaf48257fa013e679eed9e9941b47b2f985.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-84d4ece3447b259c75f5e148dc9b10ffe0e370330a1aa23af4f53362f5ef9480.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-9a05629c04ec127698061632dc0564a871ff9dc9fd0bafbf3cd6359a31ecbd92.webp)](images/asset-9a05629c04ec127698061632dc0564a871ff9dc9fd0bafbf3cd6359a31ecbd92.webp) | [![RITA · flagged area: 2.96%](images/asset-35fb135de653266a606d92132503de1c11365a72e73a0ef25c3de50a5ae2cb11.webp)](images/asset-35fb135de653266a606d92132503de1c11365a72e73a0ef25c3de50a5ae2cb11.webp) | [![TruFor · flagged area: 15.36%](images/asset-224434c8f60ef74060a3d153359f7788c0c230b14a3d2f127aa76f7d31e2ed8e.webp)](images/asset-224434c8f60ef74060a3d153359f7788c0c230b14a3d2f127aa76f7d31e2ed8e.webp) |

[Official RITA control map · 512 × 512](images/asset-9c80b1898ed6c3a771ff78584506bbbdf58fd686da4f764d97a9a53e7cece06e.webp).

## 2022-dsc7644_310822

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-438f248c0faaf0f5d510322cf0e949021b8124727fd85a1f7d24b1cdd0a42333.webp)](images/asset-438f248c0faaf0f5d510322cf0e949021b8124727fd85a1f7d24b1cdd0a42333.webp) | [![Edited regions on the original · white with a black border](images/asset-5e111c7cfe07c3e8aaab49d2450edd8e7081f532baf7cbee586863b6953ae08a.webp)](images/asset-5e111c7cfe07c3e8aaab49d2450edd8e7081f532baf7cbee586863b6953ae08a.webp) | [![After](images/asset-606fa50a889670be4752103d4654ae6c089c16d3c606453d9ec8f98b083a360f.webp)](images/asset-606fa50a889670be4752103d4654ae6c089c16d3c606453d9ec8f98b083a360f.webp) |


**Region 1 — Small brown insect on the stem, including its long right antenna**

[![Before → After → Edited regions · composite close-up](images/asset-460cdd1f24f48a4c30655b77a83fb5a8154d913023f2198051c7e6199d2ab440.webp)](images/asset-460cdd1f24f48a4c30655b77a83fb5a8154d913023f2198051c7e6199d2ab440.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-f49677c8a20450e491ac85a8133fb0241737bd3c08f87b58ace7c638aa9b7363.webp)](images/asset-f49677c8a20450e491ac85a8133fb0241737bd3c08f87b58ace7c638aa9b7363.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-1fc39eb4fe1bb8612af9d64116180aa92e4ce2684d216cbe4d60729fd197b671.webp)](images/asset-1fc39eb4fe1bb8612af9d64116180aa92e4ce2684d216cbe4d60729fd197b671.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-b583628bd0486e33fc50cb4bc02580006ea45e1f0d3006e4d0d8f56ffa04b71e.webp).

### Generative AI · attempt 2

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-438f248c0faaf0f5d510322cf0e949021b8124727fd85a1f7d24b1cdd0a42333.webp)](images/asset-438f248c0faaf0f5d510322cf0e949021b8124727fd85a1f7d24b1cdd0a42333.webp) | [![Edited regions on the original · white with a black border](images/asset-55b16bf649bf0e844429f2c8db63c1149c058aa914c3cf3d3f4b5cf285fb479c.webp)](images/asset-55b16bf649bf0e844429f2c8db63c1149c058aa914c3cf3d3f4b5cf285fb479c.webp) | [![After](images/asset-c6ff59ac316bfbd868b886b9c871274a0dc3ed756aaa1747765bde5400a7e3e5.webp)](images/asset-c6ff59ac316bfbd868b886b9c871274a0dc3ed756aaa1747765bde5400a7e3e5.webp) |


**Region 1 — Small brown insect on the stem, including its long right antenna**

[![Before → After → Edited regions · composite close-up](images/asset-94fd2c45f79f1f2f382fcbe6fad29afb4c706b007128daa3f3864f1ce8c91785.webp)](images/asset-94fd2c45f79f1f2f382fcbe6fad29afb4c706b007128daa3f3864f1ce8c91785.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-e2b45e3790249c07747138c2d5851fbd5b97882e1e09a0e008a2826af2c253aa.webp)](images/asset-e2b45e3790249c07747138c2d5851fbd5b97882e1e09a0e008a2826af2c253aa.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-450dc33c94d5d97152fd564a6fd132f2680e81c0375131959ef541818950c192.webp)](images/asset-450dc33c94d5d97152fd564a6fd132f2680e81c0375131959ef541818950c192.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-ff90ba3f90d081f2aa750ea32b2ea1548ef0f96c03580a6f8adf090682ae3781.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-438f248c0faaf0f5d510322cf0e949021b8124727fd85a1f7d24b1cdd0a42333.webp)](images/asset-438f248c0faaf0f5d510322cf0e949021b8124727fd85a1f7d24b1cdd0a42333.webp) | [![RITA · flagged area: 18.24%](images/asset-8ab39b186e2494dc4432d0f2f29ecb230ec9e8eb756163f60fce4c98122b4ffa.webp)](images/asset-8ab39b186e2494dc4432d0f2f29ecb230ec9e8eb756163f60fce4c98122b4ffa.webp) | [![TruFor · flagged area: 11.62%](images/asset-eec7db0849215748429882d41814bf0613cac39ed01ef7a96c6260730b86acc8.webp)](images/asset-eec7db0849215748429882d41814bf0613cac39ed01ef7a96c6260730b86acc8.webp) |

[Official RITA control map · 512 × 512](images/asset-b36255ed799eb1a8433c7ba117aafa2e772a5d83b0c4fb9b29655451aa97ca74.webp).

## 2022-dsc7647_310822

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-84ea27a06424a8c796588ed95c00cf099630cff21f33d30299694a3094064fa9.webp)](images/asset-84ea27a06424a8c796588ed95c00cf099630cff21f33d30299694a3094064fa9.webp) | [![Edited regions on the original · white with a black border](images/asset-061f7fa7f5cefc14c58dadb7bdd23e3cb3e5d8a85c3c6ca80e8c09bf5793d3e1.webp)](images/asset-061f7fa7f5cefc14c58dadb7bdd23e3cb3e5d8a85c3c6ca80e8c09bf5793d3e1.webp) | [![After](images/asset-da23e2c355a7fae9445111a4174f7eea107a675bf64abffac003da6e88c7bcdb.webp)](images/asset-da23e2c355a7fae9445111a4174f7eea107a675bf64abffac003da6e88c7bcdb.webp) |


**Region 1 — One complete slender mid-distance pole, to the right of the foreground pole**

[![Before → After → Edited regions · composite close-up](images/asset-768f8335a1566d701dbe2dfaf5db867c83c7f7a33ed0083c1542b9ea74ea5850.webp)](images/asset-768f8335a1566d701dbe2dfaf5db867c83c7f7a33ed0083c1542b9ea74ea5850.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-e1679f14bc41514e0fcb01a3192a0201c1b4bd4c4fa31933b503411fc7171edc.webp)](images/asset-e1679f14bc41514e0fcb01a3192a0201c1b4bd4c4fa31933b503411fc7171edc.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-1aa4914cf3291da5107deee74a8aa42adcdb9485d6e6864d7ff7ea4c8c09caa0.webp)](images/asset-1aa4914cf3291da5107deee74a8aa42adcdb9485d6e6864d7ff7ea4c8c09caa0.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-ad058cf2bdf42c6514dad39714a9987c6d55a34dfb10cef6db23939e50497798.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-84ea27a06424a8c796588ed95c00cf099630cff21f33d30299694a3094064fa9.webp)](images/asset-84ea27a06424a8c796588ed95c00cf099630cff21f33d30299694a3094064fa9.webp) | [![Edited regions on the original · white with a black border](images/asset-91c49d310fbb5fbb1053275dccaa64923588ea06027b3de276ff2a1458822d93.webp)](images/asset-91c49d310fbb5fbb1053275dccaa64923588ea06027b3de276ff2a1458822d93.webp) | [![After](images/asset-22dbc59f2ebf5215e5eddd902ab9a42f3e540cea98c5e26791330b92a802c5db.webp)](images/asset-22dbc59f2ebf5215e5eddd902ab9a42f3e540cea98c5e26791330b92a802c5db.webp) |


**Region 1 — One complete slender mid-distance pole, to the right of the foreground pole**

[![Before → After → Edited regions · composite close-up](images/asset-dc83982e51dd65dcd482529a8efeddfc7e5bb8f73d52e36e66e16de121723ed5.webp)](images/asset-dc83982e51dd65dcd482529a8efeddfc7e5bb8f73d52e36e66e16de121723ed5.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-c7a87ba583b848bad7af62d3c1ca6bf5927b715ce694ee1168df16c7f9358f6d.webp)](images/asset-c7a87ba583b848bad7af62d3c1ca6bf5927b715ce694ee1168df16c7f9358f6d.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-05aa647d65e5bbf3b101aa2eab622768d577d1c14a07afd27304510f4bd18ba9.webp)](images/asset-05aa647d65e5bbf3b101aa2eab622768d577d1c14a07afd27304510f4bd18ba9.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-33da14550c122b0ef1523894de089ddbefe16502c90fd7d06917234eba91bfa4.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-84ea27a06424a8c796588ed95c00cf099630cff21f33d30299694a3094064fa9.webp)](images/asset-84ea27a06424a8c796588ed95c00cf099630cff21f33d30299694a3094064fa9.webp) | [![Edited regions on the original · white with a black border](images/asset-19280c3fed19fd059654f6852177ce8f3f33c8646635319f0b1d6ece3293d10d.webp)](images/asset-19280c3fed19fd059654f6852177ce8f3f33c8646635319f0b1d6ece3293d10d.webp) | [![After](images/asset-4bb742e54fcd7485f1ffd8b03b98dc62a20fed1b6ebe1333f95bfdff490d60fc.webp)](images/asset-4bb742e54fcd7485f1ffd8b03b98dc62a20fed1b6ebe1333f95bfdff490d60fc.webp) |


**Region 1 — Thin foreground pole, from its top to the lower image edge**

[![Before → After → Edited regions · composite close-up](images/asset-142867d95911be165654886cbbecb548cdcb1b98b9cc0cb2545d1900a461356f.webp)](images/asset-142867d95911be165654886cbbecb548cdcb1b98b9cc0cb2545d1900a461356f.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-887ff6e8945b416a24b5bd185174ba1c3c5d81c06b13fe8eddf6d3fc9663eecb.webp)](images/asset-887ff6e8945b416a24b5bd185174ba1c3c5d81c06b13fe8eddf6d3fc9663eecb.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-4d8a4b28279c87574174657501a301739cf8f77dc9af0d22ac8c9a2c113bf46f.webp)](images/asset-4d8a4b28279c87574174657501a301739cf8f77dc9af0d22ac8c9a2c113bf46f.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-c62b639df7765022418620dbfd02ce1222d213943608eadff311aa49522608c0.webp).

### Clone stamp and generative AI · mixed version

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-84ea27a06424a8c796588ed95c00cf099630cff21f33d30299694a3094064fa9.webp)](images/asset-84ea27a06424a8c796588ed95c00cf099630cff21f33d30299694a3094064fa9.webp) | [![Edited regions on the original · white with a black border](images/asset-b66fb859d2ba2a73e7a2f57810033843cd4a73eca39a9fc38ae8b452cc06552b.webp)](images/asset-b66fb859d2ba2a73e7a2f57810033843cd4a73eca39a9fc38ae8b452cc06552b.webp) | [![After](images/asset-821c3d09168c837b3172fcfc2cbaddcbcc171e868038a6f10d3914a8ab9b87b2.webp)](images/asset-821c3d09168c837b3172fcfc2cbaddcbcc171e868038a6f10d3914a8ab9b87b2.webp) |


**Region 1 — One complete slender mid-distance pole, to the right of the foreground pole**

[![Before → After → Edited regions · composite close-up](images/asset-dc83982e51dd65dcd482529a8efeddfc7e5bb8f73d52e36e66e16de121723ed5.webp)](images/asset-dc83982e51dd65dcd482529a8efeddfc7e5bb8f73d52e36e66e16de121723ed5.webp)

**Region 2 — Thin foreground pole, from its top to the lower image edge**

[![Before → After → Edited regions · composite close-up](images/asset-142867d95911be165654886cbbecb548cdcb1b98b9cc0cb2545d1900a461356f.webp)](images/asset-142867d95911be165654886cbbecb548cdcb1b98b9cc0cb2545d1900a461356f.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-0b8a1906f872af2afc8dba8e61d32fca83cccb4d6cdad311af9f37ddc7fca873.webp)](images/asset-0b8a1906f872af2afc8dba8e61d32fca83cccb4d6cdad311af9f37ddc7fca873.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-7871ac7da5f0b56b7ed04986883dccd0739d5b4bf6d8b9e59fc0de01cb1366e4.webp)](images/asset-7871ac7da5f0b56b7ed04986883dccd0739d5b4bf6d8b9e59fc0de01cb1366e4.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-76ffa6dbe3aa657ddbfb0ebdfbcf7187108fc126f3482a3fab661152a71c622e.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-84ea27a06424a8c796588ed95c00cf099630cff21f33d30299694a3094064fa9.webp)](images/asset-84ea27a06424a8c796588ed95c00cf099630cff21f33d30299694a3094064fa9.webp) | [![RITA · flagged area: 3.54%](images/asset-2070b4d8eecd98d362bdcd64abeba6653fe88fa45e7531407b465fe118ed9c0b.webp)](images/asset-2070b4d8eecd98d362bdcd64abeba6653fe88fa45e7531407b465fe118ed9c0b.webp) | [![TruFor · flagged area: 3.82%](images/asset-0e17d9ec5d06a23ccd0254f48d998d990b6878666783eecae8e39cb5e5563929.webp)](images/asset-0e17d9ec5d06a23ccd0254f48d998d990b6878666783eecae8e39cb5e5563929.webp) |

[Official RITA control map · 512 × 512](images/asset-21344b5264495607da45eb7db7d01d586a184b2a1004fba6eb5beb764ac6feae.webp).

## 2022-dsc7653_310822

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-8b97fa874b3b08229a5ea9f2bf373e38f1cc78c23f502dbf8e1395ec76627cf3.webp)](images/asset-8b97fa874b3b08229a5ea9f2bf373e38f1cc78c23f502dbf8e1395ec76627cf3.webp) | [![Edited regions on the original · white with a black border](images/asset-89fd111450537bdf747a2ccdbfdbf470e377dba7cebdb826cbd7514dace8f513.webp)](images/asset-89fd111450537bdf747a2ccdbfdbf470e377dba7cebdb826cbd7514dace8f513.webp) | [![After](images/asset-a4b907161eb7649a453ca21541de6720d0edf7e87eddf07e76443be66653f924.webp)](images/asset-a4b907161eb7649a453ca21541de6720d0edf7e87eddf07e76443be66653f924.webp) |


**Region 1 — Small curled brown seed head above the left portion of the web**

[![Before → After → Edited regions · composite close-up](images/asset-2c718c03a47b9c2a82070ceb604e7e450315c72d3eeb9c8b90c1929b8ab72b69.webp)](images/asset-2c718c03a47b9c2a82070ceb604e7e450315c72d3eeb9c8b90c1929b8ab72b69.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-7933190681dec42b04b9f1b94cb3a833ddb956764308f284bb5abd4f0430ee16.webp)](images/asset-7933190681dec42b04b9f1b94cb3a833ddb956764308f284bb5abd4f0430ee16.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-bb3de2082c432420130e832e0ceaecab10511dab27c7191a92b4fb75edd51eb9.webp)](images/asset-bb3de2082c432420130e832e0ceaecab10511dab27c7191a92b4fb75edd51eb9.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-14424225be306d24a0b4a32b00cd7344aeeb869f9aa122ab563e121d34870954.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-8b97fa874b3b08229a5ea9f2bf373e38f1cc78c23f502dbf8e1395ec76627cf3.webp)](images/asset-8b97fa874b3b08229a5ea9f2bf373e38f1cc78c23f502dbf8e1395ec76627cf3.webp) | [![Edited regions on the original · white with a black border](images/asset-23e448951974cdfc7299968c34f9182378e2887c50adb4be49d8dcd2a9cacd2f.webp)](images/asset-23e448951974cdfc7299968c34f9182378e2887c50adb4be49d8dcd2a9cacd2f.webp) | [![After](images/asset-54a9f3c1f0e5101767332bc13df3657186613bc020230c9b2cba56c1d40867ed.webp)](images/asset-54a9f3c1f0e5101767332bc13df3657186613bc020230c9b2cba56c1d40867ed.webp) |


**Region 1 — Small curled brown seed head above the left portion of the web**

[![Before → After → Edited regions · composite close-up](images/asset-c5157e9d55078e34b4bd06b4ed0c2c0fd31b456c083f3e0e794937b616cd22c9.webp)](images/asset-c5157e9d55078e34b4bd06b4ed0c2c0fd31b456c083f3e0e794937b616cd22c9.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-4bdc7676763a177b5c548c78bab0fdc177a947b22e669e36f80a2ae7287f69a4.webp)](images/asset-4bdc7676763a177b5c548c78bab0fdc177a947b22e669e36f80a2ae7287f69a4.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-1f23c1e11bddb2387261224d112541af2ea44e8b051e792884f81a350d783507.webp)](images/asset-1f23c1e11bddb2387261224d112541af2ea44e8b051e792884f81a350d783507.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-628605c56d4f13a20fe077a9404f97e2d9ef85e444ef2fdc652bef717b914f8a.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-8b97fa874b3b08229a5ea9f2bf373e38f1cc78c23f502dbf8e1395ec76627cf3.webp)](images/asset-8b97fa874b3b08229a5ea9f2bf373e38f1cc78c23f502dbf8e1395ec76627cf3.webp) | [![Edited regions on the original · white with a black border](images/asset-fdfe369317fdecbf54735712b2c8e9ee2013f7d531574f076e22ff71c914cf37.webp)](images/asset-fdfe369317fdecbf54735712b2c8e9ee2013f7d531574f076e22ff71c914cf37.webp) | [![After](images/asset-6f29e582ff4a57926b9a148898f0e0a8661cef8dbcefd81fe30a9591a16ead7b.webp)](images/asset-6f29e582ff4a57926b9a148898f0e0a8661cef8dbcefd81fe30a9591a16ead7b.webp) |


**Region 1 — Brown group of curved seeds at the upper right of the web**

[![Before → After → Edited regions · composite close-up](images/asset-8a0396c2ecca91797df9aa92f102e03ac3e590039e8606ce241bf1d20151e29a.webp)](images/asset-8a0396c2ecca91797df9aa92f102e03ac3e590039e8606ce241bf1d20151e29a.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-2dd7b905c1c72084c30f490d5f92c42cda10aceea49c796036cb211871ff3fbc.webp)](images/asset-2dd7b905c1c72084c30f490d5f92c42cda10aceea49c796036cb211871ff3fbc.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-89a5f08d33521c07107b5e1d0a3c65d352949dd0792cc78d9e6d533443f16f3f.webp)](images/asset-89a5f08d33521c07107b5e1d0a3c65d352949dd0792cc78d9e6d533443f16f3f.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-004c58c8b790d6046f1df2ba682c5f3c01763dbe5e11dbfcba6899389283e492.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-8b97fa874b3b08229a5ea9f2bf373e38f1cc78c23f502dbf8e1395ec76627cf3.webp)](images/asset-8b97fa874b3b08229a5ea9f2bf373e38f1cc78c23f502dbf8e1395ec76627cf3.webp) | [![RITA · flagged area: 3.21%](images/asset-0261d5bfa05b0353057854c424685fbbde175673e69874017b79be0c88638e63.webp)](images/asset-0261d5bfa05b0353057854c424685fbbde175673e69874017b79be0c88638e63.webp) | [![TruFor · flagged area: 1.80%](images/asset-ac1e392bf3721307473149be5c713b24032034f850538573086c698eddf9f464.webp)](images/asset-ac1e392bf3721307473149be5c713b24032034f850538573086c698eddf9f464.webp) |

[Official RITA control map · 512 × 512](images/asset-e3604bf4d0e1cabb7bdf21e827ed4c469c00fb666e4035361ef1d958dd028c10.webp).

## 2023-dsc0016_030223-hd-low_res-width-6000px

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-41dadff08ef505d9335b62de352bf268fbe2d81bb7be3e6c9966b2a75e51fde6.webp)](images/asset-41dadff08ef505d9335b62de352bf268fbe2d81bb7be3e6c9966b2a75e51fde6.webp) | [![Edited regions on the original · white with a black border](images/asset-c78cc628ec66e6f0be0b5ed853e9ae7ee5cf480fea8cc979a460476ca92e1209.webp)](images/asset-c78cc628ec66e6f0be0b5ed853e9ae7ee5cf480fea8cc979a460476ca92e1209.webp) | [![After](images/asset-483c089db3dfd862179f0e3221623c33f1e73047bffb31def7eb425fc4a169fe.webp)](images/asset-483c089db3dfd862179f0e3221623c33f1e73047bffb31def7eb425fc4a169fe.webp) |


**Region 1 — Right-hand recessed screw on the lower foreground wooden window frame**

[![Before → After → Edited regions · composite close-up](images/asset-87d46ac3be8558b8e8d8e008ac42e19ca9219c215272b9f275fbf34d1ec49539.webp)](images/asset-87d46ac3be8558b8e8d8e008ac42e19ca9219c215272b9f275fbf34d1ec49539.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-2c2580b3917079d94ec7f8c55aa5911662acafe340079ef39a7137ae2db86355.webp)](images/asset-2c2580b3917079d94ec7f8c55aa5911662acafe340079ef39a7137ae2db86355.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-ebc4199ffb8c59d3ccd28bee4a449a0bc5bd96dbce89f1ebb84e6c10e03c9614.webp)](images/asset-ebc4199ffb8c59d3ccd28bee4a449a0bc5bd96dbce89f1ebb84e6c10e03c9614.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-356b967833e3628c00b564fac7b36af82d5c34a3aa1e5797eb7a2a8c39bb7471.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-41dadff08ef505d9335b62de352bf268fbe2d81bb7be3e6c9966b2a75e51fde6.webp)](images/asset-41dadff08ef505d9335b62de352bf268fbe2d81bb7be3e6c9966b2a75e51fde6.webp) | [![Edited regions on the original · white with a black border](images/asset-6a2a3272bde13487c15e79e7f22e8fdddfb1698e6502a469daaffc247be160fa.webp)](images/asset-6a2a3272bde13487c15e79e7f22e8fdddfb1698e6502a469daaffc247be160fa.webp) | [![After](images/asset-4eda3a4c7779d855877e481298ca79123d65696740bfa981e5d951c59ed2eb88.webp)](images/asset-4eda3a4c7779d855877e481298ca79123d65696740bfa981e5d951c59ed2eb88.webp) |


**Region 1 — Right-hand recessed screw on the lower foreground wooden window frame**

[![Before → After → Edited regions · composite close-up](images/asset-a3fe6561353f368fdf9b2e666b6cf633ebd32bd2a27e87d34ff409e24d531a20.webp)](images/asset-a3fe6561353f368fdf9b2e666b6cf633ebd32bd2a27e87d34ff409e24d531a20.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-3c5ea94c4dae6c8a2dcaf718f9145dcdd74fe672f52014f248e943bc47111c62.webp)](images/asset-3c5ea94c4dae6c8a2dcaf718f9145dcdd74fe672f52014f248e943bc47111c62.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-bdf5a8f4579c580d9d69ea47cf04210667797c411849b651b2adf153e93c7f04.webp)](images/asset-bdf5a8f4579c580d9d69ea47cf04210667797c411849b651b2adf153e93c7f04.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-8533e92784d42dd9efa7b79d668443aca0d3da1f7b2f88cf2447d369cf0a265a.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-41dadff08ef505d9335b62de352bf268fbe2d81bb7be3e6c9966b2a75e51fde6.webp)](images/asset-41dadff08ef505d9335b62de352bf268fbe2d81bb7be3e6c9966b2a75e51fde6.webp) | [![Edited regions on the original · white with a black border](images/asset-02fd91087fec7328488ba0bddea561fe8db63223c4c2e9b4664086551d47d3b7.webp)](images/asset-02fd91087fec7328488ba0bddea561fe8db63223c4c2e9b4664086551d47d3b7.webp) | [![After](images/asset-3f4e89995439d9613c5b5e5f56e8634208e2a05fd04bddc9f0bd6c50f13f9347.webp)](images/asset-3f4e89995439d9613c5b5e5f56e8634208e2a05fd04bddc9f0bd6c50f13f9347.webp) |


**Region 1 — Small dark screw at the lower left of the wooden frame**

[![Before → After → Edited regions · composite close-up](images/asset-6364109dc31860941dee4200a50497abd74d977cd2adb7a56769b2f1806c66a0.webp)](images/asset-6364109dc31860941dee4200a50497abd74d977cd2adb7a56769b2f1806c66a0.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-c2b437d9fcce299fe493a62267fe8b6557d0baa1bdccd732d4d8dd57d54793ef.webp)](images/asset-c2b437d9fcce299fe493a62267fe8b6557d0baa1bdccd732d4d8dd57d54793ef.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-e7e67943244275920ab6297075135df4bd3e0a749f444f57d71b1f7059305e42.webp)](images/asset-e7e67943244275920ab6297075135df4bd3e0a749f444f57d71b1f7059305e42.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-31e26eac21f5b78c7f17ef1642b1c71df1511802f47ac22573f2b645b3b83cef.webp).

### Clone stamp and generative AI · mixed version

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-41dadff08ef505d9335b62de352bf268fbe2d81bb7be3e6c9966b2a75e51fde6.webp)](images/asset-41dadff08ef505d9335b62de352bf268fbe2d81bb7be3e6c9966b2a75e51fde6.webp) | [![Edited regions on the original · white with a black border](images/asset-8fefddf838de82a84d2eaec9450bff73c45150800e3b36b5b6250a47b07d4edc.webp)](images/asset-8fefddf838de82a84d2eaec9450bff73c45150800e3b36b5b6250a47b07d4edc.webp) | [![After](images/asset-757d3e970089a467ac4916956fcf764863110beb6acf1b49ffaa26d6bd2315df.webp)](images/asset-757d3e970089a467ac4916956fcf764863110beb6acf1b49ffaa26d6bd2315df.webp) |


**Region 1 — Right-hand recessed screw on the lower foreground wooden window frame**

[![Before → After → Edited regions · composite close-up](images/asset-a3fe6561353f368fdf9b2e666b6cf633ebd32bd2a27e87d34ff409e24d531a20.webp)](images/asset-a3fe6561353f368fdf9b2e666b6cf633ebd32bd2a27e87d34ff409e24d531a20.webp)

**Region 2 — Small dark screw at the lower left of the wooden frame**

[![Before → After → Edited regions · composite close-up](images/asset-6364109dc31860941dee4200a50497abd74d977cd2adb7a56769b2f1806c66a0.webp)](images/asset-6364109dc31860941dee4200a50497abd74d977cd2adb7a56769b2f1806c66a0.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-7c04c842fb3ed040a501b55a5ef638baf8178b2b72f729c772acc9cdaad0b29e.webp)](images/asset-7c04c842fb3ed040a501b55a5ef638baf8178b2b72f729c772acc9cdaad0b29e.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-7adedd9586f42b247d3141ece9321694209a2ab6ac6867985e9d64e608665ea4.webp)](images/asset-7adedd9586f42b247d3141ece9321694209a2ab6ac6867985e9d64e608665ea4.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-9ea5c0a97ee724650ae8c3048febcf767eacd2bf6c59864dfd2ac905ec18b389.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-41dadff08ef505d9335b62de352bf268fbe2d81bb7be3e6c9966b2a75e51fde6.webp)](images/asset-41dadff08ef505d9335b62de352bf268fbe2d81bb7be3e6c9966b2a75e51fde6.webp) | [![RITA · flagged area: 2.46%](images/asset-8975132f79af897239918a5b6e63a336fdac5c660d235d59609c72756158a6b0.webp)](images/asset-8975132f79af897239918a5b6e63a336fdac5c660d235d59609c72756158a6b0.webp) | [![TruFor · flagged area: 2.19%](images/asset-5fc1fbbc7f75e59ddf31896cdb32caeb5e52b1e526aca657e3b23fe9a9467002.webp)](images/asset-5fc1fbbc7f75e59ddf31896cdb32caeb5e52b1e526aca657e3b23fe9a9467002.webp) |

[Official RITA control map · 512 × 512](images/asset-d7b81229414bfeb9a0d1ea993ad3b0f4198f39e3573c31a0bac14f9dc805e1e5.webp).

## 2023-dsc0229_260223

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-ff27ae54292ad3559e42ceb7d9f34d063441bc8bb1ff542dc707729a09ae9be1.webp)](images/asset-ff27ae54292ad3559e42ceb7d9f34d063441bc8bb1ff542dc707729a09ae9be1.webp) | [![Edited regions on the original · white with a black border](images/asset-35f270789610dbbe3a3fe2ced288fa6ca8f825a9e8238bd01ede8f7b3d692304.webp)](images/asset-35f270789610dbbe3a3fe2ced288fa6ca8f825a9e8238bd01ede8f7b3d692304.webp) | [![After](images/asset-e6ac67fe70fabc8aabb2835963135e6a1288dd21f0f5204074c14584b1a372fe.webp)](images/asset-e6ac67fe70fabc8aabb2835963135e6a1288dd21f0f5204074c14584b1a372fe.webp) |


**Region 1 — Long thin white element on the right side of the pan base**

[![Before → After → Edited regions · composite close-up](images/asset-fe7f0dcc821d82a96cdd390147dd208d94b8cd542514d1fa4795de19d4fbada0.webp)](images/asset-fe7f0dcc821d82a96cdd390147dd208d94b8cd542514d1fa4795de19d4fbada0.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-949d8fd01c4db784fb3600560aa36f6fffc14f3395f769331c0dd980eeffabe9.webp)](images/asset-949d8fd01c4db784fb3600560aa36f6fffc14f3395f769331c0dd980eeffabe9.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-991079299885aaf2ed385a40aea876e966afab12d6ba09276b25d92a8c87f0e3.webp)](images/asset-991079299885aaf2ed385a40aea876e966afab12d6ba09276b25d92a8c87f0e3.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-b6f5336ad11f53416e3f174b09513b79fd43713bddc9338900be89087172904d.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-ff27ae54292ad3559e42ceb7d9f34d063441bc8bb1ff542dc707729a09ae9be1.webp)](images/asset-ff27ae54292ad3559e42ceb7d9f34d063441bc8bb1ff542dc707729a09ae9be1.webp) | [![RITA · flagged area: 10.75%](images/asset-62c4230e21381c78476626646120535c813ed27179aba5d18cd491541aefcae4.webp)](images/asset-62c4230e21381c78476626646120535c813ed27179aba5d18cd491541aefcae4.webp) | [![TruFor · flagged area: 28.03%](images/asset-14d7af4eda42136663d7b654e6b82edd8cf17864b3393df760ab25f00712c1a0.webp)](images/asset-14d7af4eda42136663d7b654e6b82edd8cf17864b3393df760ab25f00712c1a0.webp) |

[Official RITA control map · 512 × 512](images/asset-8f4d52f142d97d9d21d2dbcf457db647e974fa2eefab0bd8cd6b6ab284175188.webp).

## 2023-dsc0232_260223

### Clone stamp · first attempt retained

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-b23c3050748dd03d2166d5bbe5d9ccad2d936b8c5a76e782f37017edcdf17ed6.webp)](images/asset-b23c3050748dd03d2166d5bbe5d9ccad2d936b8c5a76e782f37017edcdf17ed6.webp) | [![Edited regions on the original · white with a black border](images/asset-2aab6af26185121ea8539c62a217814c2948c64a04fc6c36d65fd17d9f96da19.webp)](images/asset-2aab6af26185121ea8539c62a217814c2948c64a04fc6c36d65fd17d9f96da19.webp) | [![After](images/asset-572f1e62e03b12dae758a57b5b2060e2d5055908413722ed74cbdce7f42d8f2e.webp)](images/asset-572f1e62e03b12dae758a57b5b2060e2d5055908413722ed74cbdce7f42d8f2e.webp) |


**Region 1 — One isolated round water droplet on the bright metal band**

[![Before → After → Edited regions · composite close-up](images/asset-fb67644e40f1ca3c0aed030e4dca72baf941e735dba8a80b6a6b342defd40ff7.webp)](images/asset-fb67644e40f1ca3c0aed030e4dca72baf941e735dba8a80b6a6b342defd40ff7.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-a2280c05ab19bfa4e5e7a9ce160acd6bd0faac6cb31c4a05e94dcf6a1018efe0.webp)](images/asset-a2280c05ab19bfa4e5e7a9ce160acd6bd0faac6cb31c4a05e94dcf6a1018efe0.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-e47c8a06a3260695ea8b47994891e631b12d030f7f5fb7d1d6aab84cb91e80a1.webp)](images/asset-e47c8a06a3260695ea8b47994891e631b12d030f7f5fb7d1d6aab84cb91e80a1.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-5c70b2fe5734513bc175e611a8e3ce88e9b52f1ea824d6c413f83882dcb33c4b.webp).

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-b23c3050748dd03d2166d5bbe5d9ccad2d936b8c5a76e782f37017edcdf17ed6.webp)](images/asset-b23c3050748dd03d2166d5bbe5d9ccad2d936b8c5a76e782f37017edcdf17ed6.webp) | [![Edited regions on the original · white with a black border](images/asset-d7a195e04cf2a8093c15d85d120c5431f4658e6a00c94a682fa243c6adab01e9.webp)](images/asset-d7a195e04cf2a8093c15d85d120c5431f4658e6a00c94a682fa243c6adab01e9.webp) | [![After](images/asset-d278642f4788552acc78e692db104a0460ad480371a7781f8125739dddbe1db6.webp)](images/asset-d278642f4788552acc78e692db104a0460ad480371a7781f8125739dddbe1db6.webp) |


**Region 1 — One isolated round water droplet on the bright metal band**

[![Before → After → Edited regions · composite close-up](images/asset-49e6720f94c7a8d29021be4079a232e9f50514c707004278dabc8a2b7f8519a2.webp)](images/asset-49e6720f94c7a8d29021be4079a232e9f50514c707004278dabc8a2b7f8519a2.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-3ef8a1699a1999409b6b07a536abe66ba6a0d6dafa738b5cd1baf99963828c7a.webp)](images/asset-3ef8a1699a1999409b6b07a536abe66ba6a0d6dafa738b5cd1baf99963828c7a.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-4270d27297b76dd40111ee3d01c22ac043edd4f5b3937e87070418f83f6a4e5e.webp)](images/asset-4270d27297b76dd40111ee3d01c22ac043edd4f5b3937e87070418f83f6a4e5e.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-3c841bed74779fac36943179d5acb9b483c0bac436acc366bfc21cc891070cbe.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-b23c3050748dd03d2166d5bbe5d9ccad2d936b8c5a76e782f37017edcdf17ed6.webp)](images/asset-b23c3050748dd03d2166d5bbe5d9ccad2d936b8c5a76e782f37017edcdf17ed6.webp) | [![Edited regions on the original · white with a black border](images/asset-7893bd0657186d5c6d6feb0885f384b60d85d81ffab9be837fdb640d4b591524.webp)](images/asset-7893bd0657186d5c6d6feb0885f384b60d85d81ffab9be837fdb640d4b591524.webp) | [![After](images/asset-892878d2765374eb99fac0b87774d14a60d1c24c2ccbf137d31fa30ee62e9a54.webp)](images/asset-892878d2765374eb99fac0b87774d14a60d1c24c2ccbf137d31fa30ee62e9a54.webp) |


**Region 1 — One isolated round water droplet on the bright metal band**

[![Before → After → Edited regions · composite close-up](images/asset-e69bf27123d33fb60d461c26cdb82795e004d27272fffdfbab7d37984f506100.webp)](images/asset-e69bf27123d33fb60d461c26cdb82795e004d27272fffdfbab7d37984f506100.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-9a026b47ec67a00766a210e655df26bee93e885cd65015faf22ba9a4e3d47530.webp)](images/asset-9a026b47ec67a00766a210e655df26bee93e885cd65015faf22ba9a4e3d47530.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-5a2e55819e8ddfe017710ea7bae106ec6ef92fa361eedcdf7f4c0013e4a55aca.webp)](images/asset-5a2e55819e8ddfe017710ea7bae106ec6ef92fa361eedcdf7f4c0013e4a55aca.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-cdcdb708fbab9b5e4ca9404bbf3cabcb0761604915e009821e42b28aa220f4f6.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-b23c3050748dd03d2166d5bbe5d9ccad2d936b8c5a76e782f37017edcdf17ed6.webp)](images/asset-b23c3050748dd03d2166d5bbe5d9ccad2d936b8c5a76e782f37017edcdf17ed6.webp) | [![Edited regions on the original · white with a black border](images/asset-ad2bee23c87653ca00758045e3188d365219c7c372e40061513c4c4c4f470981.webp)](images/asset-ad2bee23c87653ca00758045e3188d365219c7c372e40061513c4c4c4f470981.webp) | [![After](images/asset-8322b4b00f91ad7830e65f014a0a10c737cd13789014500dc6492ee4d0995c8c.webp)](images/asset-8322b4b00f91ad7830e65f014a0a10c737cd13789014500dc6492ee4d0995c8c.webp) |


**Region 1 — Small group of white deposits on the lower dark metal region**

[![Before → After → Edited regions · composite close-up](images/asset-99fab8e8ecf87587bda56e7fb5cde9b69f7a9b3bb1695da0cfcca43fdaed400b.webp)](images/asset-99fab8e8ecf87587bda56e7fb5cde9b69f7a9b3bb1695da0cfcca43fdaed400b.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-2cf6575b060400e8d203b36354c3a213ec941505dbc89700eb665fbcf18e105f.webp)](images/asset-2cf6575b060400e8d203b36354c3a213ec941505dbc89700eb665fbcf18e105f.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-9b5174316361828c9ca7823c8efa9aea70269c38863811643b9a0b2528e0889e.webp)](images/asset-9b5174316361828c9ca7823c8efa9aea70269c38863811643b9a0b2528e0889e.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-37ab429788ebcf0a10c4be96cf68a5aac066c41f388a6a4234bc53d22a7f6401.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-b23c3050748dd03d2166d5bbe5d9ccad2d936b8c5a76e782f37017edcdf17ed6.webp)](images/asset-b23c3050748dd03d2166d5bbe5d9ccad2d936b8c5a76e782f37017edcdf17ed6.webp) | [![RITA · flagged area: 3.00%](images/asset-b78786c9ca2ae069e9d1027c1ec5d7b691042c6440b523a7929fe548e2d7d9a4.webp)](images/asset-b78786c9ca2ae069e9d1027c1ec5d7b691042c6440b523a7929fe548e2d7d9a4.webp) | [![TruFor · flagged area: 1.95%](images/asset-b818c3e6f985d21a50c095be3a8b6155db4d7f1e01d4d6cfe9777f244d4320d2.webp)](images/asset-b818c3e6f985d21a50c095be3a8b6155db4d7f1e01d4d6cfe9777f244d4320d2.webp) |

[Official RITA control map · 512 × 512](images/asset-b44ec7515ed8861fdb6ff93e7741b78de3a3f626f186a9bccfb1de4592c96225.webp).

## 2023-dsc0256_260223

### Clone stamp · five regions

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-87b65a87a59eccde66e863af07c1ced3dbb5ab2411b1c1b08b2fe337ebcfc2a7.webp)](images/asset-87b65a87a59eccde66e863af07c1ced3dbb5ab2411b1c1b08b2fe337ebcfc2a7.webp) | [![Edited regions on the original · white with a black border](images/asset-37dc53132e4f6d8a4dd27c1548ff7bdb1d7d20c3dabf71402e3a9ae4401948ab.webp)](images/asset-37dc53132e4f6d8a4dd27c1548ff7bdb1d7d20c3dabf71402e3a9ae4401948ab.webp) | [![After](images/asset-46e29f45366e0d176ec64734ab1f81e964c61736abb993efee184284feb219e2.webp)](images/asset-46e29f45366e0d176ec64734ab1f81e964c61736abb993efee184284feb219e2.webp) |


**Region 1 — Whole small sharp isolated water droplet on the upper-right diagonal band**

[![Before → After → Edited regions · composite close-up](images/asset-1541b6265d656056a34941929103e28100349fcf2543d6ea8d36042475523f4b.webp)](images/asset-1541b6265d656056a34941929103e28100349fcf2543d6ea8d36042475523f4b.webp)

**Region 2 — Whole bright water droplet just right of centre**

[![Before → After → Edited regions · composite close-up](images/asset-ce18bb8ca6968c776422b0efcc77bec99eae234080d788da8d6f97002c2eb494.webp)](images/asset-ce18bb8ca6968c776422b0efcc77bec99eae234080d788da8d6f97002c2eb494.webp)

**Region 3 — Whole large round water droplet on the lower central metal band**

[![Before → After → Edited regions · composite close-up](images/asset-a9c63660456cc48c647520e10dd690a1c0e1fc691e1dc196bf26ba01f8c79dd8.webp)](images/asset-a9c63660456cc48c647520e10dd690a1c0e1fc691e1dc196bf26ba01f8c79dd8.webp)

**Region 4 — Whole bright water droplet on the lower-left diagonal band**

[![Before → After → Edited regions · composite close-up](images/asset-9d383923ac70a277b41491456a9f24be33a1973d09603efb77ec2e421fc3e3c2.webp)](images/asset-9d383923ac70a277b41491456a9f24be33a1973d09603efb77ec2e421fc3e3c2.webp)

**Region 5 — Whole sharp water droplet on the far-left diagonal band**

[![Before → After → Edited regions · composite close-up](images/asset-64c344c013d190c8f1f94c8b1f7a5860a767427558a28a564ce0345bebdf5ab5.webp)](images/asset-64c344c013d190c8f1f94c8b1f7a5860a767427558a28a564ce0345bebdf5ab5.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-c97e6773095c2787a0b755ad6fcc850d74323cd065d6b76a4b7fad54cda8ccaa.webp)](images/asset-c97e6773095c2787a0b755ad6fcc850d74323cd065d6b76a4b7fad54cda8ccaa.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-3ec596b3a4bbcaf5defe7ad6849e17ac4af1e0bcb916fa6124ed9493f665f964.webp)](images/asset-3ec596b3a4bbcaf5defe7ad6849e17ac4af1e0bcb916fa6124ed9493f665f964.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-a4f17d56a39542b4ae090aa7a29b667260d6835bb16443631e6fb419cf62179f.webp).

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-87b65a87a59eccde66e863af07c1ced3dbb5ab2411b1c1b08b2fe337ebcfc2a7.webp)](images/asset-87b65a87a59eccde66e863af07c1ced3dbb5ab2411b1c1b08b2fe337ebcfc2a7.webp) | [![Edited regions on the original · white with a black border](images/asset-5e5fcde1f53d67b5a4c47da66ce0b30bbd9f5856418711d049bfb5d76dcf6d18.webp)](images/asset-5e5fcde1f53d67b5a4c47da66ce0b30bbd9f5856418711d049bfb5d76dcf6d18.webp) | [![After](images/asset-a43e8e4cddb4892bdd8198410bbaea2af83ef2bdea3401849fb0f3117443be46.webp)](images/asset-a43e8e4cddb4892bdd8198410bbaea2af83ef2bdea3401849fb0f3117443be46.webp) |


**Region 1 — Small sharp water droplet below the larger upper-right droplet group**

[![Before → After → Edited regions · composite close-up](images/asset-c120e5ceda3dcdbcc6c9f8eb0d3fe2f40d6884ff241b0b27ca5640c445a0de7a.webp)](images/asset-c120e5ceda3dcdbcc6c9f8eb0d3fe2f40d6884ff241b0b27ca5640c445a0de7a.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-d58a9a803c9bfbcc28acfe36e6ba4cff6213947bbbcf64b1fb654be2494d55d8.webp)](images/asset-d58a9a803c9bfbcc28acfe36e6ba4cff6213947bbbcf64b1fb654be2494d55d8.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-3d8d1fb358639dacf377ef75a352ff91a7d5826ccc8b373b9a42896b48f8162e.webp)](images/asset-3d8d1fb358639dacf377ef75a352ff91a7d5826ccc8b373b9a42896b48f8162e.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-537c65235a386c1c7750b0b4a297492b619440167060cb2f46f733d28be3faa3.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-87b65a87a59eccde66e863af07c1ced3dbb5ab2411b1c1b08b2fe337ebcfc2a7.webp)](images/asset-87b65a87a59eccde66e863af07c1ced3dbb5ab2411b1c1b08b2fe337ebcfc2a7.webp) | [![Edited regions on the original · white with a black border](images/asset-98b8eff033830091504da7d8b139a36d2996e4214e02324af72ac636b5acda59.webp)](images/asset-98b8eff033830091504da7d8b139a36d2996e4214e02324af72ac636b5acda59.webp) | [![After](images/asset-bf22290344516eb6828d635d7c51a2eaaa0117329f6b199bed6e4d987ff1493c.webp)](images/asset-bf22290344516eb6828d635d7c51a2eaaa0117329f6b199bed6e4d987ff1493c.webp) |


**Region 1 — Small sharp water droplet below the larger upper-right droplet group**

[![Before → After → Edited regions · composite close-up](images/asset-562208c29eca7d4bf8231b6e31654e3c7b2cb7ce6e45beeb56f6afe4dc7ae880.webp)](images/asset-562208c29eca7d4bf8231b6e31654e3c7b2cb7ce6e45beeb56f6afe4dc7ae880.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-3b624e4a46bf4bd05beb7b3b13fb8d7e118852fc6d9ae6aab626d54591706a23.webp)](images/asset-3b624e4a46bf4bd05beb7b3b13fb8d7e118852fc6d9ae6aab626d54591706a23.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-282f8f07cbbebb3fe3e90255d36eb2b99b1f06d6deda7569d938a1c4c5fea880.webp)](images/asset-282f8f07cbbebb3fe3e90255d36eb2b99b1f06d6deda7569d938a1c4c5fea880.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-0859184a6956c8604f193ebb000e15341bf51554b15ba015ea3aff88be5ae568.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-87b65a87a59eccde66e863af07c1ced3dbb5ab2411b1c1b08b2fe337ebcfc2a7.webp)](images/asset-87b65a87a59eccde66e863af07c1ced3dbb5ab2411b1c1b08b2fe337ebcfc2a7.webp) | [![Edited regions on the original · white with a black border](images/asset-d6fa63df2684234ae0ee899d40f378b80f73ff8189fbf9b1fa77bf94a33adb3d.webp)](images/asset-d6fa63df2684234ae0ee899d40f378b80f73ff8189fbf9b1fa77bf94a33adb3d.webp) | [![After](images/asset-79f43dd84e13d6c5cdd192d1ec3e073329d29b621b08f8c11d16c1e9a5533aad.webp)](images/asset-79f43dd84e13d6c5cdd192d1ec3e073329d29b621b08f8c11d16c1e9a5533aad.webp) |


**Region 1 — Large sharp droplet near the centre of the bright metal band**

[![Before → After → Edited regions · composite close-up](images/asset-ab1b29f5c81943bd157769ebe8f63613453cd933086ef06a3d089f0fc8ae8e87.webp)](images/asset-ab1b29f5c81943bd157769ebe8f63613453cd933086ef06a3d089f0fc8ae8e87.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-8869c5f3799971dd0bc5b93552b06c7984ee25ec8835305caa6b1405d12c8b5d.webp)](images/asset-8869c5f3799971dd0bc5b93552b06c7984ee25ec8835305caa6b1405d12c8b5d.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-81282eadb6b323fe5bc144bff41fe17f1f230b365a6325cdb7748e1c235e41f2.webp)](images/asset-81282eadb6b323fe5bc144bff41fe17f1f230b365a6325cdb7748e1c235e41f2.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-238952ef47addf4bc519819ea467c502403f29cb07793c2328c609595351e5d5.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-87b65a87a59eccde66e863af07c1ced3dbb5ab2411b1c1b08b2fe337ebcfc2a7.webp)](images/asset-87b65a87a59eccde66e863af07c1ced3dbb5ab2411b1c1b08b2fe337ebcfc2a7.webp) | [![RITA · flagged area: 13.55%](images/asset-ec704c0ef74659872d737da555a386a4a75e6b8838aaea8d1abbf06e407d6361.webp)](images/asset-ec704c0ef74659872d737da555a386a4a75e6b8838aaea8d1abbf06e407d6361.webp) | [![TruFor · flagged area: 1.24%](images/asset-6ebe81100ff09b8338afd915b3d44025d3a4d48cc412926e35e2bc26bc96427e.webp)](images/asset-6ebe81100ff09b8338afd915b3d44025d3a4d48cc412926e35e2bc26bc96427e.webp) |

[Official RITA control map · 512 × 512](images/asset-cdb7bf73f9707de5c416fd84e662db0ee52dc0488221e90c836fe173d3db648e.webp).

## 2023-dsc0277_260223

### Clone stamp · initial candidate retained

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-532c49e683f6e1209a10f78f1e3e8676f575451bfec55aa31281bcf01730a134.webp)](images/asset-532c49e683f6e1209a10f78f1e3e8676f575451bfec55aa31281bcf01730a134.webp) | [![Edited regions on the original · white with a black border](images/asset-639c887337a7ac85a770be9aed8bba522272ed09c4194a8fd0189f4a755ae58d.webp)](images/asset-639c887337a7ac85a770be9aed8bba522272ed09c4194a8fd0189f4a755ae58d.webp) | [![After](images/asset-a75e60f314d4e1efdc29cf8b180377d4062e2c06ce79dd668d18714e3f4b469a.webp)](images/asset-a75e60f314d4e1efdc29cf8b180377d4062e2c06ce79dd668d18714e3f4b469a.webp) |


**Region 1 — Pair of adjacent sharp water droplets on the lower bright metal band**

[![Before → After → Edited regions · composite close-up](images/asset-71c70b372e65c8a76ba2c702065020e5916b7b2cddaa80bc02fa457ead6a9d5a.webp)](images/asset-71c70b372e65c8a76ba2c702065020e5916b7b2cddaa80bc02fa457ead6a9d5a.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-656484c42f53262a58c7c43d4ccaf3057036421efac9c27ef0d4d2238a53d405.webp)](images/asset-656484c42f53262a58c7c43d4ccaf3057036421efac9c27ef0d4d2238a53d405.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-334561b74a1d0780678f84fcd86026f1cb23177feaf7211607286849ff7082fe.webp)](images/asset-334561b74a1d0780678f84fcd86026f1cb23177feaf7211607286849ff7082fe.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-353ffb9c7ad806026439eb87abab2134ee981e7f0ed6b9e1211e849b84d6919b.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-532c49e683f6e1209a10f78f1e3e8676f575451bfec55aa31281bcf01730a134.webp)](images/asset-532c49e683f6e1209a10f78f1e3e8676f575451bfec55aa31281bcf01730a134.webp) | [![Edited regions on the original · white with a black border](images/asset-356aaed21be668e72395345249f0e794a9e314029a1d080dd8a822eb168f78cd.webp)](images/asset-356aaed21be668e72395345249f0e794a9e314029a1d080dd8a822eb168f78cd.webp) | [![After](images/asset-eff42b379de8d1a5b9b1a7bc60a082bb504ebe0f3a04f97078ea71ed027bdaf0.webp)](images/asset-eff42b379de8d1a5b9b1a7bc60a082bb504ebe0f3a04f97078ea71ed027bdaf0.webp) |


**Region 1 — Small group of sharp droplets in the lower right**

[![Before → After → Edited regions · composite close-up](images/asset-f92f938e60cce38a4785560ba8df3f3c2566eaa6e47a43fee47209bd0289b938.webp)](images/asset-f92f938e60cce38a4785560ba8df3f3c2566eaa6e47a43fee47209bd0289b938.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-1d400945bbc1958b6ef53dbcb420728350e51c9b43d3c66d0368bb5957f49ecd.webp)](images/asset-1d400945bbc1958b6ef53dbcb420728350e51c9b43d3c66d0368bb5957f49ecd.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-b49c33c560fa13e1a863b3ca86ced433e872e51e5c13b52d2c6dc9e50882f642.webp)](images/asset-b49c33c560fa13e1a863b3ca86ced433e872e51e5c13b52d2c6dc9e50882f642.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-62175e80868376c64216ebaf6778d545b7cce2326eb967dada3df25e0279eb13.webp).

### Generative AI · attempt 2

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-532c49e683f6e1209a10f78f1e3e8676f575451bfec55aa31281bcf01730a134.webp)](images/asset-532c49e683f6e1209a10f78f1e3e8676f575451bfec55aa31281bcf01730a134.webp) | [![Edited regions on the original · white with a black border](images/asset-fe69bcfc0eea93e9f6a4675f737d36f506860ffe95196d93c54a1b21efc21dfd.webp)](images/asset-fe69bcfc0eea93e9f6a4675f737d36f506860ffe95196d93c54a1b21efc21dfd.webp) | [![After](images/asset-776781cb1a0eaf11adccf6c3ebc9dbf478b0648f197e31bea91c9a680d70a9c9.webp)](images/asset-776781cb1a0eaf11adccf6c3ebc9dbf478b0648f197e31bea91c9a680d70a9c9.webp) |


**Region 1 — Small group of sharp droplets in the lower right**

[![Before → After → Edited regions · composite close-up](images/asset-e3d49aaced3136e5d00d0295faa315100f1afdf6d8df5ca0584f5c908bfca586.webp)](images/asset-e3d49aaced3136e5d00d0295faa315100f1afdf6d8df5ca0584f5c908bfca586.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-1a1f67b67dfe829cd12cb32c789bfaf7572b9459cd94f57f204553aeed31b6f4.webp)](images/asset-1a1f67b67dfe829cd12cb32c789bfaf7572b9459cd94f57f204553aeed31b6f4.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-0e2150ff228708f8d2e0ef5061fc80c69e35fe20b20628991c25e3cab8f7dd49.webp)](images/asset-0e2150ff228708f8d2e0ef5061fc80c69e35fe20b20628991c25e3cab8f7dd49.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-9ef299fc9298c8f3859750626c3dee9ea2b7a7daee699daedb7fb4e8186194e0.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-532c49e683f6e1209a10f78f1e3e8676f575451bfec55aa31281bcf01730a134.webp)](images/asset-532c49e683f6e1209a10f78f1e3e8676f575451bfec55aa31281bcf01730a134.webp) | [![RITA · flagged area: 2.84%](images/asset-7915245ffb81c49dde0c1013fadf277d5d6e5c21c20d4d5586a33ad50cd816bd.webp)](images/asset-7915245ffb81c49dde0c1013fadf277d5d6e5c21c20d4d5586a33ad50cd816bd.webp) | [![TruFor · flagged area: 8.95%](images/asset-69e8a659671cc22ae3da284387480d0bdbf1ab47cfa98834220707f0eb65ceaf.webp)](images/asset-69e8a659671cc22ae3da284387480d0bdbf1ab47cfa98834220707f0eb65ceaf.webp) |

[Official RITA control map · 512 × 512](images/asset-5ebab9dbb77536a32b14cd78c8dbe3a63a35ff0007a16a4619e38b2447505697.webp).

## 2023-dsc0453_260223

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-04d1e83c8a6f4b1bd50445ad101f4f4a22c9ea80651731439db228eb5b366fa2.webp)](images/asset-04d1e83c8a6f4b1bd50445ad101f4f4a22c9ea80651731439db228eb5b366fa2.webp) | [![Edited regions on the original · white with a black border](images/asset-9f82c3e1a6c3a6ad06aaae5eb3b223dfc21221b34bc29771f48ba67e90d747f9.webp)](images/asset-9f82c3e1a6c3a6ad06aaae5eb3b223dfc21221b34bc29771f48ba67e90d747f9.webp) | [![After](images/asset-037945013285c750d3a573bc8ba523c8bc6c8d769018d7e2bdf35c180d7409c9.webp)](images/asset-037945013285c750d3a573bc8ba523c8bc6c8d769018d7e2bdf35c180d7409c9.webp) |


**Region 1 — Main coiled metal object, throughout its visible extent**

[![Before → After → Edited regions · composite close-up](images/asset-0ca8e271a84463b8c2d36b5de7fe2fefed105caf906c4335a0698071de6ef78a.webp)](images/asset-0ca8e271a84463b8c2d36b5de7fe2fefed105caf906c4335a0698071de6ef78a.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-0b1175676ff2f434cb348b980f35bf30566104f8ec588065ab7f526ca34be3b1.webp)](images/asset-0b1175676ff2f434cb348b980f35bf30566104f8ec588065ab7f526ca34be3b1.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-c421cda50a3af110e216b5539ee14d69c459d70b538218b3ff104fe0a3f9c222.webp)](images/asset-c421cda50a3af110e216b5539ee14d69c459d70b538218b3ff104fe0a3f9c222.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-0db92bba9effbe3492a1e472a50356f046e6b41b44e6de6fb060e469a37f2517.webp).

### Generative AI · attempt 2

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-04d1e83c8a6f4b1bd50445ad101f4f4a22c9ea80651731439db228eb5b366fa2.webp)](images/asset-04d1e83c8a6f4b1bd50445ad101f4f4a22c9ea80651731439db228eb5b366fa2.webp) | [![Edited regions on the original · white with a black border](images/asset-9c194f39706ec0f59af1041052280cf60129b1a4a558acf3de5cfdbf0b9fad28.webp)](images/asset-9c194f39706ec0f59af1041052280cf60129b1a4a558acf3de5cfdbf0b9fad28.webp) | [![After](images/asset-d1d6745592b80b2b3b9ed93df742a203cf80aa6b8963d62479b5786e6ca4a1d3.webp)](images/asset-d1d6745592b80b2b3b9ed93df742a203cf80aa6b8963d62479b5786e6ca4a1d3.webp) |


**Region 1 — Main coiled metal object, throughout its visible extent**

[![Before → After → Edited regions · composite close-up](images/asset-a9b961263232dc4099e9ffa26d6a4dbf055f5b1e8393b1d9775112803d439e54.webp)](images/asset-a9b961263232dc4099e9ffa26d6a4dbf055f5b1e8393b1d9775112803d439e54.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-0801e076694fe553d777b60fd50508c8a1692f9269772b119357f7583a5da834.webp)](images/asset-0801e076694fe553d777b60fd50508c8a1692f9269772b119357f7583a5da834.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-a6b2be775c27f3e40fcb2cb8044c831344e1813eb27891ffcaaa72060ba1eb64.webp)](images/asset-a6b2be775c27f3e40fcb2cb8044c831344e1813eb27891ffcaaa72060ba1eb64.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-55fa25757f607b1eecfd646b8855adc9934d10fc28a73c8d523a9abf793213de.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-04d1e83c8a6f4b1bd50445ad101f4f4a22c9ea80651731439db228eb5b366fa2.webp)](images/asset-04d1e83c8a6f4b1bd50445ad101f4f4a22c9ea80651731439db228eb5b366fa2.webp) | [![RITA · flagged area: 20.34%](images/asset-c5a1f2a155a87f028cbbdb2b2671572964c659eaa524af9c6454424886af5edc.webp)](images/asset-c5a1f2a155a87f028cbbdb2b2671572964c659eaa524af9c6454424886af5edc.webp) | [![TruFor · flagged area: 34.09%](images/asset-6ffeab6f96751be3a130f423de057f6075e5c7a65360f559151f1d6781fb32f6.webp)](images/asset-6ffeab6f96751be3a130f423de057f6075e5c7a65360f559151f1d6781fb32f6.webp) |

[Official RITA control map · 512 × 512](images/asset-8c7e19507de740613edbed832faeaa9943f0544272ab17e12fe206db38b167ab.webp).

## 2023-dsc0835_220523

### Raw clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-611f2def7a420267e2477f54ed7e3b6b17d83184fa223c42f9c46ffb2e865358.webp)](images/asset-611f2def7a420267e2477f54ed7e3b6b17d83184fa223c42f9c46ffb2e865358.webp) | [![Edited regions on the original · white with a black border](images/asset-abba8f9b92d1bcb0582a3cda029ba26665b57bb554d6091e0d04643e3d126baf.webp)](images/asset-abba8f9b92d1bcb0582a3cda029ba26665b57bb554d6091e0d04643e3d126baf.webp) | [![After](images/asset-9626c63eb8369da3ea167d7ba268b436f67dd4f6066ecf6df2aabfb443c3d38f.webp)](images/asset-9626c63eb8369da3ea167d7ba268b436f67dd4f6066ecf6df2aabfb443c3d38f.webp) |


**Region 1 — Tiny dark insect on the narrow vertical wooden window frame**

[![Before → After → Edited regions · composite close-up](images/asset-884659a187c37f6db9d2bafc059b5f3965a9e5b33a6a3505e01c269182049c3a.webp)](images/asset-884659a187c37f6db9d2bafc059b5f3965a9e5b33a6a3505e01c269182049c3a.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-a16cdfbd86cdb0869d834eef1641dd837709fd0acbb2de9e0a3f05f80b787384.webp)](images/asset-a16cdfbd86cdb0869d834eef1641dd837709fd0acbb2de9e0a3f05f80b787384.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-0d73ac4a78646d244bd462bbb9c5d17cbadbbf9e224056e32bb7dc080a88f0b6.webp)](images/asset-0d73ac4a78646d244bd462bbb9c5d17cbadbbf9e224056e32bb7dc080a88f0b6.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-a9204cb4bb98604adee49a0313b414199f47976fa7b7ecfdbdc399af1e1ab3eb.webp).

### Clone stamp with Poisson blending

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-611f2def7a420267e2477f54ed7e3b6b17d83184fa223c42f9c46ffb2e865358.webp)](images/asset-611f2def7a420267e2477f54ed7e3b6b17d83184fa223c42f9c46ffb2e865358.webp) | [![Edited regions on the original · white with a black border](images/asset-8b47d0bb3625d4b088ed14b2ce6bc27278f1e7ee8c441617a56444b8ee7a8c01.webp)](images/asset-8b47d0bb3625d4b088ed14b2ce6bc27278f1e7ee8c441617a56444b8ee7a8c01.webp) | [![After](images/asset-4052409a21f2db0d4522aff30d626b01930b6b426ae0b17195696bd112cd0a25.webp)](images/asset-4052409a21f2db0d4522aff30d626b01930b6b426ae0b17195696bd112cd0a25.webp) |


**Region 1 — Tiny dark insect on the narrow vertical wooden window frame**

[![Before → After → Edited regions · composite close-up](images/asset-604b5d77073f3a230e3781f6eeed1d6a074e114ee4a0c493c07b85495ce0bb3f.webp)](images/asset-604b5d77073f3a230e3781f6eeed1d6a074e114ee4a0c493c07b85495ce0bb3f.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-ab962fc3a21d461dc3c20aa32a594a2ad05ff2320d683bd9a1f10f7616a3a26e.webp)](images/asset-ab962fc3a21d461dc3c20aa32a594a2ad05ff2320d683bd9a1f10f7616a3a26e.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-d0ab5f7d03736fb908252bc894d5739a64ce4d7a46db358189a98e00f8366e33.webp)](images/asset-d0ab5f7d03736fb908252bc894d5739a64ce4d7a46db358189a98e00f8366e33.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-900d9d0b8ab47847c13c4fd00dbc2af45a5d7e1894b17e3f9f8f791fe37d615f.webp).

### Generative AI · attempt 1

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-611f2def7a420267e2477f54ed7e3b6b17d83184fa223c42f9c46ffb2e865358.webp)](images/asset-611f2def7a420267e2477f54ed7e3b6b17d83184fa223c42f9c46ffb2e865358.webp) | [![Edited regions on the original · white with a black border](images/asset-45e7397d54cbd26c30cccc69581182450ce0ca2253b464aeda011181ff160e53.webp)](images/asset-45e7397d54cbd26c30cccc69581182450ce0ca2253b464aeda011181ff160e53.webp) | [![After](images/asset-94022c592e2f57f91cab6b33b29eea217c82adca918a383355cb6de9d96481fd.webp)](images/asset-94022c592e2f57f91cab6b33b29eea217c82adca918a383355cb6de9d96481fd.webp) |


**Region 1 — Small round button on the old window frame**

[![Before → After → Edited regions · composite close-up](images/asset-60de766489d981ca568e0360dc837d27929e95c4cac5e5c99f464048b95ff31e.webp)](images/asset-60de766489d981ca568e0360dc837d27929e95c4cac5e5c99f464048b95ff31e.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-b7fca6d2382617bf832d106a6fdf3b39650d4076f638147c5d8eb557f885b186.webp)](images/asset-b7fca6d2382617bf832d106a6fdf3b39650d4076f638147c5d8eb557f885b186.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-392c85794210c8bc6f5e5a55a16154a506065533f6886a6ab7892bed9922bd97.webp)](images/asset-392c85794210c8bc6f5e5a55a16154a506065533f6886a6ab7892bed9922bd97.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-f8299d684224dc68193f2c31e5ef089759807e6771fd2c554308ab4b0cc3b4ac.webp).

### Clone stamp and generative AI · mixed version

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-611f2def7a420267e2477f54ed7e3b6b17d83184fa223c42f9c46ffb2e865358.webp)](images/asset-611f2def7a420267e2477f54ed7e3b6b17d83184fa223c42f9c46ffb2e865358.webp) | [![Edited regions on the original · white with a black border](images/asset-aea6778c54b48f9fad37d7c0df8eea2078c96a91d56c3ec196b4291b89bda047.webp)](images/asset-aea6778c54b48f9fad37d7c0df8eea2078c96a91d56c3ec196b4291b89bda047.webp) | [![After](images/asset-f16a9e8a92cf7fd7647e1870812a2c5abd0af65fc4b474b2b8812f6fa40d7ba6.webp)](images/asset-f16a9e8a92cf7fd7647e1870812a2c5abd0af65fc4b474b2b8812f6fa40d7ba6.webp) |


**Region 1 — Tiny dark insect on the narrow vertical wooden window frame**

[![Before → After → Edited regions · composite close-up](images/asset-604b5d77073f3a230e3781f6eeed1d6a074e114ee4a0c493c07b85495ce0bb3f.webp)](images/asset-604b5d77073f3a230e3781f6eeed1d6a074e114ee4a0c493c07b85495ce0bb3f.webp)

**Region 2 — Small round button on the old window frame**

[![Before → After → Edited regions · composite close-up](images/asset-60de766489d981ca568e0360dc837d27929e95c4cac5e5c99f464048b95ff31e.webp)](images/asset-60de766489d981ca568e0360dc837d27929e95c4cac5e5c99f464048b95ff31e.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-6e2bacd404b47bdd5efda656245feae293ce2074b1e01619a64e92191308049b.webp)](images/asset-6e2bacd404b47bdd5efda656245feae293ce2074b1e01619a64e92191308049b.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-6e1ecc5c1d0cc3f931146bd6b610ef9c3510b559e58374cacd7ef9e9e2cb19ed.webp)](images/asset-6e1ecc5c1d0cc3f931146bd6b610ef9c3510b559e58374cacd7ef9e9e2cb19ed.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-6d277bf6725b9f815e5a20b0e9f1c1396818f0a3719d9473d1072a69c400d403.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-611f2def7a420267e2477f54ed7e3b6b17d83184fa223c42f9c46ffb2e865358.webp)](images/asset-611f2def7a420267e2477f54ed7e3b6b17d83184fa223c42f9c46ffb2e865358.webp) | [![RITA · flagged area: 3.16%](images/asset-a4130403d9a2da9ebaaa5807ebb38f623b0d84976e33abfa97d97fe2ea02913d.webp)](images/asset-a4130403d9a2da9ebaaa5807ebb38f623b0d84976e33abfa97d97fe2ea02913d.webp) | [![TruFor · flagged area: 1.37%](images/asset-adc9c74bcdffa347a3cc00201fb508f3661952281e0ee5d9a2c152216e82cd93.webp)](images/asset-adc9c74bcdffa347a3cc00201fb508f3661952281e0ee5d9a2c152216e82cd93.webp) |

[Official RITA control map · 512 × 512](images/asset-0d99a9418bf2b12cae1cb773cc0d371e1f18cdb5867488a31d3446e53f4eaac3.webp).

## preliminary-dsc3921

### Prototype · clone stamp

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-eae9262f08eea9669794f2aea9f0d86d82361548babe66d3c7eee441add493d5.webp)](images/asset-eae9262f08eea9669794f2aea9f0d86d82361548babe66d3c7eee441add493d5.webp) | [![Edited regions on the original · white with a black border](images/asset-6f459fc9ccaf24e4bf36eca98a6cfa030f1adfb08d2eb03cab85664d3f479952.webp)](images/asset-6f459fc9ccaf24e4bf36eca98a6cfa030f1adfb08d2eb03cab85664d3f479952.webp) | [![After](images/asset-a04370b53a3517dc014984dd5bc5c47784f47df025d0d05d06f303a1f65edf10.webp)](images/asset-a04370b53a3517dc014984dd5bc5c47784f47df025d0d05d06f303a1f65edf10.webp) |


**Region 1 — Edited region**

[![Before → After → Edited regions · composite close-up](images/asset-a8d975d37105d4f3c4a0ba035fa4d76dc007d386f199262188cef03d010b9d0a.webp)](images/asset-a8d975d37105d4f3c4a0ba035fa4d76dc007d386f199262188cef03d010b9d0a.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-4608cf6be924cace5cad9ef86a8ae2813eb5a68adc5c9d4789ce02a6ea550d33.webp)](images/asset-4608cf6be924cace5cad9ef86a8ae2813eb5a68adc5c9d4789ce02a6ea550d33.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-c97985fd2cf6c7b0d2542d6fb74e0adc2bacae401c7c636cdeca105333cbb665.webp)](images/asset-c97985fd2cf6c7b0d2542d6fb74e0adc2bacae401c7c636cdeca105333cbb665.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-c6ed650aa7557dfc1e61c37418c38462ca6db6c32bd9818eac3f3be71c6e37b5.webp).

### Prototype · generative AI

| Before | Edited regions on the original | After |
| --- | --- | --- |
| [![Before](images/asset-eae9262f08eea9669794f2aea9f0d86d82361548babe66d3c7eee441add493d5.webp)](images/asset-eae9262f08eea9669794f2aea9f0d86d82361548babe66d3c7eee441add493d5.webp) | [![Edited regions on the original · white with a black border](images/asset-fab66ce1cdd84ab3eb1388dc64ed2c2696802f31ee8a92ecd505d71140e7f1f1.webp)](images/asset-fab66ce1cdd84ab3eb1388dc64ed2c2696802f31ee8a92ecd505d71140e7f1f1.webp) | [![After](images/asset-787a8b3f7213659a0fc449c013c502cf073e85260811cff827559849db40ceed.webp)](images/asset-787a8b3f7213659a0fc449c013c502cf073e85260811cff827559849db40ceed.webp) |


**Region 1 — Edited region**

[![Before → After → Edited regions · composite close-up](images/asset-7547bb1146b206ae3828aaf7b70bdeb8164d600693e595bb9d8cbc5eb1c12bcc.webp)](images/asset-7547bb1146b206ae3828aaf7b70bdeb8164d600693e595bb9d8cbc5eb1c12bcc.webp)

#### After-edit detection

| RITA | TruFor |
| --- | --- |
| [![RITA · green TP, red FP, blue FN; dark background TN](images/asset-70ad210b3fa238119d2588b3ee1734f8ea5940a86eab45b3e1388fff4b503ee4.webp)](images/asset-70ad210b3fa238119d2588b3ee1734f8ea5940a86eab45b3e1388fff4b503ee4.webp) | [![TruFor · green TP, red FP, blue FN; dark background TN](images/asset-d12a3c84442f72be60d46a25a1ad7dcbe317c3bcb01c40da4007dfc941f21dad.webp)](images/asset-d12a3c84442f72be60d46a25a1ad7dcbe317c3bcb01c40da4007dfc941f21dad.webp) |

Secondary after-edit comparison: [Official RITA · 512 × 512](images/asset-02146561b45233b392a513a7dfb0163ada6eed5bcc252cfdf31abbfae32a735c.webp).

### Before-intervention detection · control

These views show detections on the source before intervention. They are not the results obtained on the edited versions shown above.

| Before | RITA | TruFor |
| --- | --- | --- |
| [![Before any new edit](images/asset-eae9262f08eea9669794f2aea9f0d86d82361548babe66d3c7eee441add493d5.webp)](images/asset-eae9262f08eea9669794f2aea9f0d86d82361548babe66d3c7eee441add493d5.webp) | [![RITA · flagged area: 1.52%](images/asset-b64718260c2fbdd18466bb26d466ab1f123253ad9ed7a3a0f580a498c354d3d5.webp)](images/asset-b64718260c2fbdd18466bb26d466ab1f123253ad9ed7a3a0f580a498c354d3d5.webp) | [![TruFor · flagged area: 0.72%](images/asset-6879a7a9fd23a56e2889f82e7d633e7dcc0f06c0fcce1f1584580c4ab6736fde.webp)](images/asset-6879a7a9fd23a56e2889f82e7d633e7dcc0f06c0fcce1f1584580c4ab6736fde.webp) |

[Official RITA control map · 512 × 512](images/asset-3b40d2938a176254541117b77879247d4aa06476c426322cf4c5073396cfb27c.webp).

---

[Images: all rights reserved. No reuse, commercial or non-commercial, is permitted.](../IMAGE-LICENCE.txt)
