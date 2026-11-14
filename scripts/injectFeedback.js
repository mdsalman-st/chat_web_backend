import fs from 'fs';
import path from 'path';

const publicDir = 'd:\\nexus\\public';
const files = [
  'student-dashboard.html',
  'test-select.html',
  'test-results.html',
  'dashboard.html',
  'settings.html',
  'analytics.html',
  'tasks.html',
  'notes.html'
];

for (const file of files) {
  const filePath = path.join(publicDir, file);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('feedback.js')) {
    content = content.replace(/<\/body>/i, '  <script src="feedback.js"></script>\n</body>');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Added feedback.js to: ${file}`);
  }
}
console.log('Feedback script injection completed!');
