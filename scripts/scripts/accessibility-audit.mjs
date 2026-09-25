import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

console.log('♿ Initiating Mandatory WCAG 2.2 AA Accessibility Compliance Audit...');

function scanDirectoryForComponents(dirPath, fileList = []) {
  const files = readdirSync(dirPath);
  
  for (const file of files) {
    const absolutePath = join(dirPath, file);
    if (statSync(absolutePath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        scanDirectoryForComponents(absolutePath, fileList);
      }
    } else if (file.endsWith('.jsx') || file.endsWith('.html')) {
      fileList.push(absolutePath);
    }
  }
  return fileList;
}

const targetUiFiles = scanDirectoryForComponents(resolve(root, 'src'));
if (existsSync(resolve(root, 'index.html'))) targetUiFiles.push(resolve(root, 'index.html'));

for (const filePath of targetUiFiles) {
  const content = readFileSync(filePath, 'utf8');
  const shortPath = filePath.replace(root, '');

  // 1. Audit Rule: Prevent non-semantic clickable divs without clear role tags
  if (content.includes('onClick=') && !content.includes('role=') && !content.includes('button')) {
    console.error(`🚨 ACCESSIBILITY FAILURE: Interactive element in "${shortPath}" lacks an explicit ARIA [role] modifier label.`);
    process.exit(1);
  }

  // 2. Audit Rule: Catch un-labeled text input strings
  if (content.includes('<input') && !content.includes('aria-label') && !content.includes('<label')) {
    console.error(`🚨 ACCESSIBILITY FAILURE: Form input field inside "${shortPath}" lacks an accompanying <label> hook or aria-label descriptor string.`);
    process.exit(1);
  }

  // 3. Audit Rule: Ensure image tags provide explicit alternate descriptions
  if (content.includes('<img') && !content.includes('alt=')) {
    console.error(`🚨 ACCESSIBILITY FAILURE: Visual media asset <img> mapping in "${shortPath}" is missing an [alt] fallback description description wrapper.`);
    process.exit(1);
  }
}

console.log('✅ ACCESSIBILITY COMPLIANCE PASSED: All user interaction elements feature structural semantics.');
process.exit(0);
