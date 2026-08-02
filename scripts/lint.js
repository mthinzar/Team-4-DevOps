// ============================================================
//  Simple checks that run before the tests.
//
//    1. Every .js file has no syntax errors.
//    2. Every .ejs template can be built. At the moment a typo in
//       a template only shows up when someone opens that page.
//    3. Nobody has committed a .env file.
//
//  Run with: npm run lint
// ============================================================

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..');
const SKIP = ['node_modules', '.git', 'images', 'coverage'];

let problems = 0;

// Collects every file with the given ending, looking inside folders too.
function findFiles(folder, ending, found) {
    found = found || [];

    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
        if (SKIP.includes(item.name)) continue;

        const fullPath = path.join(folder, item.name);

        if (item.isDirectory()) {
            findFiles(fullPath, ending, found);
        } else if (item.name.endsWith(ending)) {
            found.push(fullPath);
        }
    }

    return found;
}

function showProblem(file, message) {
    problems = problems + 1;
    console.error('  X ' + path.relative(ROOT, file));
    console.error('    ' + String(message).split('\n')[0]);
}

// ---- 1. JavaScript files ------------------------------------------

console.log('Checking JavaScript files...');
const jsFiles = findFiles(ROOT, '.js');

for (const file of jsFiles) {
    try {
        execFileSync('node', ['--check', file], { stdio: 'pipe' });
    } catch (err) {
        showProblem(file, err.stderr.toString());
    }
}
console.log('  ' + jsFiles.length + ' file(s) checked');

// ---- 2. EJS templates -----------------------------------------------

console.log('Checking EJS templates...');
const ejsFiles = findFiles(path.join(ROOT, 'views'), '.ejs');

for (const file of ejsFiles) {
    try {
        ejs.compile(fs.readFileSync(file, 'utf8'), { filename: file });
    } catch (err) {
        showProblem(file, err.message);
    }
}
console.log('  ' + ejsFiles.length + ' template(s) checked');

// ---- 3. Secrets ------------------------------------------------------

console.log('Checking for committed secrets...');
const secretFiles = ['.env', '.env.local', '.env.production'];

for (const name of secretFiles) {
    if (fs.existsSync(path.join(ROOT, name))) {
        problems = problems + 1;
        console.error('  X ' + name + ' must never be committed');
    }
}

const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
if (!gitignore.includes('.env')) {
    problems = problems + 1;
    console.error('  X .gitignore does not list .env');
}
console.log('  done');

// ---- Result -------------------------------------------------------------

if (problems > 0) {
    console.error('\nLint failed: ' + problems + ' problem(s) found.');
    process.exit(1);
}

console.log('\nLint passed.');
