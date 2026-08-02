// ============================================================
//  Starts the real app.js in the background so the tests can send
//  actual HTTP requests to it. Nothing in app.js had to change to
//  make this work — we just run it the same way `npm start` does.
// ============================================================

const { spawn } = require('child_process');
const path = require('path');

const PORT = Number(process.env.TEST_PORT) || 3100;
const BASE_URL = 'http://127.0.0.1:' + PORT;

const APP_FOLDER = path.join(__dirname, '..', '..');

// ------------------------------------------------------------------
// Safety check.
//
// db.js always calls client.db('foodhub'), so the database name in
// MONGODB_URI is ignored. If someone ran these tests with the Atlas
// URI in their .env, the tests would write to the real database.
// So we only allow a local MongoDB.
// ------------------------------------------------------------------
function checkDatabaseIsSafe(uri) {
    const localHosts = ['localhost', '127.0.0.1', 'mongo:', 'mongo/'];
    let isLocal = false;

    for (const host of localHosts) {
        if (uri.includes(host)) isLocal = true;
    }

    if (!isLocal && process.env.ALLOW_DESTRUCTIVE_TESTS !== '1') {
        throw new Error(
            'These tests write to the "foodhub" database and would damage real data.\n' +
            'Start a local MongoDB first (docker compose up -d mongo) and set:\n' +
            '  MONGODB_URI=mongodb://127.0.0.1:27017/foodhub'
        );
    }
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Keeps asking the server for the stall list until it answers. That
// route needs both Express and MongoDB, so a reply means it is really
// ready, not just listening.
async function waitUntilReady(logs) {
    for (let i = 0; i < 100; i++) {
        try {
            const response = await fetch(BASE_URL + '/api/merchant/available-stalls');
            const body = await response.json();
            if (body.success) return;
        } catch (err) {
            // Not up yet — try again in a moment.
        }
        await wait(200);
    }

    throw new Error('The server did not start within 20 seconds.\n' + logs.join(''));
}

async function startServer() {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/foodhub';
    checkDatabaseIsSafe(uri);

    const logs = [];

    const child = spawn('node', ['app.js'], {
        cwd: APP_FOLDER,
        env: Object.assign({}, process.env, {
            PORT: String(PORT),
            MONGODB_URI: uri,
            SESSION_SECRET: 'test-secret'
        })
    });

    child.stdout.on('data', data => logs.push(data.toString()));
    child.stderr.on('data', data => logs.push(data.toString()));

    await waitUntilReady(logs);

    return {
        url: BASE_URL,
        logs: logs,
        async stop() {
            child.kill();
            await wait(300);
        }
    };
}

module.exports = { startServer, BASE_URL, PORT };
