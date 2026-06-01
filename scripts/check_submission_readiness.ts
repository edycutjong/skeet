import fs from 'fs';
import path from 'path';

const FILES_TO_CHECK = [
  'README.md',
  'DEMO.md',
  'src/index.ts',
  'src/config.json',
  'src/db.ts',
  'src/decide.ts',
  'src/signals.ts',
  'src/risk.ts',
  'src/executor.ts',
  'src/feed.ts',
  'package.json'
];

function checkReadiness() {
  console.log('==================================================');
  console.log('      SKEET SUBMISSION READINESS CHECK            ');
  console.log('==================================================');

  let clean = true;

  for (const file of FILES_TO_CHECK) {
    if (!fs.existsSync(file)) {
      console.warn(`⚠️ Warning: ${file} does not exist yet (skipping)`);
      continue;
    }

    const content = fs.readFileSync(file, 'utf8');
    
    // Look for placeholders: <you>, <placeholder>, [insert here]
    const placeholders = [
      /<you>/i,
      /<placeholder>/i,
      /\[insert\s+here\]/i,
      /TODO/
    ];

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const regex of placeholders) {
        if (regex.test(line)) {
          // Ignore comments in scripts that explain placeholders
          if (file === 'scripts/check_submission_readiness.ts' || line.includes('checkReadiness')) continue;
          
          console.error(`❌ Placeholder violation in ${file}:${(i + 1).toString()}`);
          console.error(`   Line: "${line.trim()}"`);
          clean = false;
        }
      }
    }
  }

  console.log('--------------------------------------------------');
  if (clean) {
    console.log('✅ READINESS CHECK PASSED: No placeholders found!');
    process.exit(0);
  } else {
    console.error('❌ READINESS CHECK FAILED: Please replace all placeholders.');
    process.exit(1);
  }
  console.log('==================================================');
}

checkReadiness();
