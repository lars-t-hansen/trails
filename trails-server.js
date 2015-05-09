// Copyright 2015 Lars T Hansen.
// Code for Node.js.
//
// After setup this script calls runServer().

const http = require('http');
const fs = require('fs');

//////////////////////////////////////////////////////////////////////
//
// Configuration.

const g_datadir = "/home/lth/trails/";
const g_scheme = "http";
const g_if = "0.0.0.0";
const g_port = 9003;
const g_default = "trails.html";
const g_DEBUG = true;

//////////////////////////////////////////////////////////////////////
//
// Protocol layer.

function runServer() {
    if (!loadUsers())
	return;
    if (g_scheme != "http") {
	console.log("Only http supported");
	process.exit(1);
    }
    http.createServer(requestHandler).listen(g_port, g_if);
    console.log("Server running at http://" + g_if + ":" + g_port + "/");
}

// The protocol is documented in spec.txt.

const user_id = "[a-zA-Z0-9]+";
const uripart = "[-_.!~*'()a-zA-Z0-9]+";
const filename = "[-_a-zA-Z0-9.]+";
const post_trail_re = new RegExp("^\\/trail\\/(" + user_id + ")\\/(" + uripart + ")$");
const resource_re = new RegExp("^\\/r\\/(" + filename + ")$");
const default_re = new RegExp("^\\/?$");
const plot_re = new RegExp("^\\/plot\\/(" + user_id + ")\\/(" + uripart + ")\\?(" + uripart + ")$");

function requestHandler(req, res) {
    try {
	var m, user, passwd, host, params;

	if (g_DEBUG)
	    console.log(req.method + " " + req.url);

	switch (req.method) {
	case "GET":
	    if ((m = req.url.match(resource_re)) && (fn = resourceFile(m[1]))) {
		serveFile(res, fn);
		return;
	    }
	    if (req.url.match(default_re) && (host = req.headers.host)) {
		simpleTextResponse(res, 301, "Moved permanently\nLocation: " + g_scheme + "://" + host + "/r/" + g_default);
		return;
	    }
	    if ((m = req.url.match(plot_re)) && (user = m[1]) && (passwd = decodeURIComponent(m[2])) && (params = decodeURIComponent(m[3]))) {
		if (!checkUser(user, passwd)) {
		    simpleTextResponse(res, 403, "Bad user or password");
		    return;
		}
		servePlot(res, user, params);
		return;
	    }
	    break;
	case "POST":
	    if ((m = req.url.match(post_trail_re)) && (user = m[1]) && (passwd = decodeURIComponent(m[2]))) {
		if (!checkUser(user, passwd)) {
		    simpleTextResponse(res, 403, "Bad user or password");
		    return;
		}
		receiveTrail(req, res, user);
		return;
	    }
	    break;
	}
	simpleTextResponse(res, 404, "Bad request");
    }
    catch (e) {
	serverFailure(req, res);
    }
}

function serverFailure(req, res) {
    try {
	simpleTextResponse(res, 500, "Internal server error - blame the programmer");
    }
    catch (e) {
	try { req.connection.destroy(); } catch (e) { /* Oh well */ }
    }
}

function simpleTextResponse(res, code, message) {
    res.writeHead(code, {"Content-Type": "text/plain"});
    res.end(message);
}

function logError(error) {
    console.log(error);
}

function receiveTrail(req, res, user) {
    var bodyData = "";

    // TODO: error handling on receipt?
    req.on("data", function (data) {
	try {
	    bodyData += data;
	    // 10MB should be plenty, but we'll see.
	    if (bodyData.length > 1e7)
		req.connection.destroy();
	}
	catch (e) { /* Anything useful to do here? */ }
    });

    req.on("end", function () {
	try {
	    if (g_DEBUG) {
		console.log("Received data:")
		console.log("<<<");
		console.log(bodyData.substring(0,Math.min(500,bodyData.length)));
		console.log(">>>");
	    }
	    try {
		var parsed = JSON.parse(bodyData);
	    }
	    catch (e) {
		simpleTextResponse(res, 400, "Malformed data (not JSON)");
		return;
	    }
	    if (!validateTrail(parsed)) {
		simpleTextResponse(res, 400, "Malformed data (bad format)");
		return;
	    }

	    // TODO: store the data!!
	    // TODO: check against existing UUIDs
	    res.writeHead(201, {"Content-Type": "application/json"});
	    res.end(JSON.stringify({ uuid: parsed.uuid }));
	}
	catch (e) {
	    serverFailure(req, res);
	}
    });
}

function validateTrail(t) {
    if (!t || typeof t != "object")
	return false;

    if (!validatePositiveInt(t.version))
	return false;

    switch (t.version) {
    case 1:
	return (typeof t.id == "string" &&
		t.id.match(/^[A-Fa-f0-9]+$/) &&
		typeof t.device == "string" &&
		validateFinite(t.start) &&
		validateFinite(t.end) &&
		0 <= t.start && t.start <= t.end &&
		validateFinite(t.distance) &&
		t.distance >= 0 &&
		(!t.waypoints || validateWaypoints(t.waypoints)) &&
		validateReadings(t.readings));

    case 2:
	return (typeof t.uuid == "string" &&
		t.uuid.match(/^[A-F0-9]{16}$/) &&
		validateDevice(t.device) &&
		validateFinite(t.start) &&
		validateFinite(t.end) &&
		0 <= t.start && t.start <= t.end &&
		validateFinite(t.distance) &&
		t.distance >= 0 &&
		validateType(t.type) &&
		validateWaypoints(t.waypoints) &&
		validateReadings(t.readings));

    default:
	return false;
    }

    function validateType(ty) {
	if (typeof ty != "string")
	    return false;

	switch (ty) {
	case "bike":
	case "walk":
	case "hike":
	case "other":
	    return t.version >= 2;
	default:
	    return false;
	}
    }

    function validateDevice(x) {
	if (!x || typeof x != "object")
	    return false;

	return (typeof x.name == "string" &&
		typeof x.hardware == "string" &&
		typeof x.os == "string" &&
		typeof x.ua == "string");
    }

    function validateWaypoints(ws) {
	return validateDenseArray(ws, validateWaypoint);
    }

    function validateWaypoint(x) {
	if (!x || typeof x != "object")
	    return false;

	return (typeof x.name == "string" &&
		validateLatLon(x.lat) &&
		validateLatLon(x.lon));
    }

    function validateReadings(rs) {
	return validateDenseArray(rs, validateReading);
    }

    function validateReading(x) {
	if (!validateDenseArray(x) || x.length < 2)
	    return false;
	if (!(validateLatLon(x[0]) && validateLatLon(x[1])))
	    return false;
	if (t.version >= 2)
	    if (x.length < 3 || !validateFinite(x[2]) || x[2] < 0)
		return false;
	return true;
    }

    function validateDenseArray(x, predicate) {
	if (!validatePositiveInt(xs.length))
	    return false;
	for ( var i=0 ; i < xs.length ; i++ ) {
	    if (!(i in xs))
		return false;
	    if (predicate !== undefined)
		if (!predicate(xs[i]))
		    return false;
	}
	return true;
    }

    function validateLatLon(x) {
	return validateFinite(x) && x >= -90.0 && x <= 90.0;
    }

    function validatePositiveInt(x) {
	if (!validateFinite(x))
	    return false;
	if (Math.floor(x) != x || x < 0)
	    return false;
	return true;
    }

    function validateFinite(x) {
	return typeof x == "number" && isFinite(x) && !isNaN(x);
    }
}

//////////////////////////////////////////////////////////////////////
//
// Plotting.

// Parameters would probably be the date-uuid strings of the files to
// serve up, perhaps with some keywords supported (all? latest? year?)
// and options on how to plot (initially none).  This would deliver an
// HTML document with SVG.

function servePlot(res, user, parameters) {
    // Implementme
    simpleTextResponse(res, 200, "OK");
}

//////////////////////////////////////////////////////////////////////
//
// File layer.

function resourceFile(base) {
    var fn = g_datadir + "r/" + base;
    console.log("Trying <" + fn + "> " + fs.existsSync(fn));
    return fs.existsSync(fn) ? fn : null;
}

function serveFile(res, filename) {
    var data = fs.readFileSync(filename);
    res.writeHead(200, {"Content-Type": mimeTypeFromName(filename)});
    res.end(data);
}

//////////////////////////////////////////////////////////////////////
//
// Utilities.

if (!String.prototype.endsWith)
    String.prototype.endsWith = function (s) {
	if (s.length > this.length)
	    return false;
	return this.substring(this.length-s.length) == s;
    };

const mimetypes =
    { ".html": "text/html",
      ".css":  "text/css",
      ".txt":  "text/plain",
      ".jpg":  "image/jpeg",
      ".png":  "image/png",
      ".js":   "application/javascript"
    };

const default_mimetype = "application/octet-stream";

function mimeTypeFromName(name) {
    for ( var pattern in mimetypes )
	if (name.endsWith(pattern))
	    return mimetypes[pattern];
    return default_mimetype;
}

//////////////////////////////////////////////////////////////////////
//
// User database.
//
// TODO: Surely there must exist code for this already?

const g_users = [];

// Format of users.dat:
//
//   { version: 1,
//     users:   [{ user: string, passwd: string }] }
//
// where in version 1 the passwords are in plaintext for now.

function loadUsers() {
    try {
	var tmp = JSON.parse(fs.readFileSync(g_datadir + "users.dat"), {encoding:"utf8"});
	if (!tmp || typeof tmp != "object")
	    throw new Error("users.dat: Not an object");
	if (!tmp.hasOwnProperty("version") || tmp.version != 1)
	    throw new Error("users.dat: Bad version");
	if (!tmp.hasOwnProperty("users"))
	    throw new Error("users.dat: Bad format");
	var users = tmp.users;
	if (!(users instanceof Array))
	    throw new Error("users.dat: Users is not an array");
	for ( var i=0 ; i < users.length ; i++ ) {
	    var x = users[i];
	    if (x && typeof x == "object" &&
		x.hasOwnProperty("user") && typeof x.user == "string" &&
		x.hasOwnProperty("passwd") && typeof x.passwd == "string")
	    {
		continue;
	    }
	    throw new Error("users.dat: Not a valid user record @ " + i);
	}
	g_users = tmp.users;
	return true;
    }
    catch (e) {
	logError(e);
	return false;
    }
}

// Return true or false.

function checkUser(user, passwd) {
    for ( var i=0 ; i < g_users.length ; i++ ) {
	var x = g_users[i];
	if (x.user === user) {
	    // TODO: We want the passwords in the DB to be salted and hashed, and
	    // to salt and hash the provided passwd here before comparison.
	    if (x.passwd === passwd)
		return true;
	}
    }
    return false;
}

runServer();
