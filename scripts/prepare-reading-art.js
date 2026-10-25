'use strict';
// Offline optimization only. Never invoked by the application or per customer.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const source = process.argv[2];
const files = {
  cheer: 'exec-0eadd4d5-b896-44c2-b0c0-8e28172ee3f3.png',
  greeting: 'exec-d61e85ac-c988-4461-8340-bd8d47522e62.png',
  explain: 'exec-9adf335c-3853-4fcc-9044-e7ff79bd343b.png',
  empathy: 'exec-b48c1c94-ccfa-40b0-82ab-76b5eacc30dd.png',
  thinking: 'exec-a4a549f5-1bff-4eae-8948-259e141b0ab7.png',
  caution: 'exec-4c1fc269-a2ea-4a67-9af7-da367efdb202.png',
  meeting: 'exec-63f22744-ea28-4ca2-9dc8-4b9b17882797.png',
  distance: 'exec-6db59725-97eb-497f-8687-17bf37761dfa.png',
  conversation: 'exec-b9f674ed-073f-48b6-bdc4-afae05b16807.png',
  'new-start': 'exec-86eadb75-dcbe-42fb-955f-ce5e0f29f399.png'
};
(async () => {
  if (!source) throw new Error('Pass the generated image source directory.');
  const output = path.join(__dirname, '../public/love-assets/reading');
  await fs.mkdir(output, {recursive:true});
  for (const [key, file] of Object.entries(files)) {
    const info = await sharp(path.join(source, file)).resize({width:800,withoutEnlargement:true}).webp({quality:84}).toFile(path.join(output, key+'.webp'));
    console.log(key, info.size);
  }
})();
