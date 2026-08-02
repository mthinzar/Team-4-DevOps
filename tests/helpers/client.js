// ============================================================
//  A small helper for talking to the running app.
//
//  fetch() does not remember cookies, and every page in this app
//  uses a session cookie, so we store it ourselves. One client =
//  one browser. Make two clients and you have two different users
//  logged in at the same time.
// ============================================================

const { BASE_URL } = require('./server');

function createClient() {
    const cookies = {};

    function saveCookies(response) {
        for (const cookie of response.headers.getSetCookie()) {
            const pair = cookie.split(';')[0];
            const equals = pair.indexOf('=');
            const name = pair.slice(0, equals);
            cookies[name] = pair.slice(equals + 1);
        }
    }

    function cookieHeader() {
        const names = Object.keys(cookies);
        const parts = names.map(name => name + '=' + cookies[name]);
        return parts.join('; ');
    }

    async function send(method, url, options) {
        options = options || {};

        const settings = {
            method: method,
            headers: {},
            redirect: 'manual'   // we want to SEE the redirect, not follow it
        };

        if (options.json) {
            settings.headers['Content-Type'] = 'application/json';
            settings.body = JSON.stringify(options.json);
        }
        if (options.form) {
            settings.body = options.form;   // fetch adds the multipart header
        }
        if (Object.keys(cookies).length > 0) {
            settings.headers.Cookie = cookieHeader();
        }

        const response = await fetch(BASE_URL + url, settings);
        saveCookies(response);

        const text = await response.text();
        let body = null;
        try {
            body = JSON.parse(text);
        } catch (err) {
            body = null;   // an HTML page, not JSON
        }

        return {
            status: response.status,
            location: response.headers.get('location'),
            setCookie: response.headers.getSetCookie(),
            text: text,
            body: body
        };
    }

    // ---- Logins ----------------------------------------------------

    async function loginAsCustomer(phone, name) {
        const sent = await send('POST', '/auth/send-code', { json: { phone, name } });
        const code = sent.body.devCode;
        return send('POST', '/auth/verify', { json: { phone, name, code } });
    }

    async function loginAsMerchant(email, password) {
        return send('POST', '/merchant/login', { json: { email, password } });
    }

    async function loginAsAdmin(adminId, password) {
        return send('POST', '/admin/login', { json: { adminId, password } });
    }

    return {
        get: (url, options) => send('GET', url, options),
        post: (url, options) => send('POST', url, options),
        loginAsCustomer: loginAsCustomer,
        loginAsMerchant: loginAsMerchant,
        loginAsAdmin: loginAsAdmin,
        sessionId: () => cookies['connect.sid'] || ''
    };
}

module.exports = { createClient };
